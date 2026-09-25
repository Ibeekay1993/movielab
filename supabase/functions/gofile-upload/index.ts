import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-movielab-title-id, x-movielab-episode-id, x-movielab-rights-status, x-movielab-quality, x-movielab-filename, x-movielab-mime-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Authentication required");

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("Authentication required");

  const { data: allowed, error } = await admin.rpc("is_movielab_admin_for_user", {
    p_user_id: user.id,
  });

  if (error || !allowed) throw new Error("MovieLab CMS permission required");
  return user;
}

function safeHeader(value: string | null, fallback: string) {
  const clean = (value ?? "").replace(/[\r\n]/g, "").trim();
  return clean.slice(0, 240) || fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  try {
    const user = await requireAdmin(req);
    const token = Deno.env.get("GOFILE_API_TOKEN");
    if (!token) return json({ ok: false, error: "GoFile storage is not configured" }, 503);

    const contentType = req.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
      return json({ ok: false, error: "Expected multipart/form-data" }, 400);
    }

    const titleId = req.headers.get("x-movielab-title-id");
    const episodeId = req.headers.get("x-movielab-episode-id");
    const rightsStatus = safeHeader(req.headers.get("x-movielab-rights-status"), "unknown");
    const qualityLabel = safeHeader(req.headers.get("x-movielab-quality"), "source");
    const filename = safeHeader(req.headers.get("x-movielab-filename"), "MovieLab media");
    const mimeType = safeHeader(req.headers.get("x-movielab-mime-type"), "video/mp4");

    if ((!titleId && !episodeId) || (titleId && episodeId)) {
      return json({ ok: false, error: "Provide exactly one of title_id or episode_id" }, 400);
    }

    if (!["unknown", "authorized", "licensed"].includes(rightsStatus)) {
      return json({ ok: false, error: "Invalid rights_status" }, 400);
    }

    // The multipart body is streamed directly to GoFile. MovieLab does not buffer
    // the video in the Edge Function and the GoFile token never reaches the browser.
    const uploadResponse = await fetch("https://upload.gofile.io/uploadfile", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": contentType,
      },
      body: req.body,
    });

    const uploadPayload = await uploadResponse.json().catch(() => null);
    if (!uploadResponse.ok || uploadPayload?.status !== "ok") {
      return json({
        ok: false,
        error: "GoFile upload failed",
        provider_error: uploadPayload?.status ?? "unknown",
      }, 502);
    }

    const data = uploadPayload.data ?? {};
    const providerAssetId = String(data.fileId ?? data.id ?? "");
    const downloadPage = typeof data.downloadPage === "string" ? data.downloadPage : null;

    if (!providerAssetId) {
      return json({ ok: false, error: "GoFile returned no file ID" }, 502);
    }

    // Direct links are a GoFile Premium API feature. If unavailable, the asset
    // remains recorded but is not exposed as playable media.
    let playbackUrl: string | null = null;
    let directLinkId: string | null = null;
    const allowedDomain = Deno.env.get("GOFILE_ALLOWED_DOMAIN") ?? "moviescan.netlify.app";

    const directResponse = await fetch(
      "https://api.gofile.io/contents/" + encodeURIComponent(providerAssetId) + "/directlinks",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domainsAllowed: [allowedDomain] }),
      },
    );

    const directPayload = await directResponse.json().catch(() => null);
    if (directResponse.ok && directPayload?.status === "ok") {
      playbackUrl = typeof directPayload.data?.directLink === "string"
        ? directPayload.data.directLink
        : null;
      directLinkId = typeof directPayload.data?.id === "string"
        ? directPayload.data.id
        : null;
    }

    const { data: asset, error } = await admin
      .from("media_assets")
      .insert({
        title_id: titleId || null,
        episode_id: episodeId || null,
        provider_type: "gofile",
        provider_asset_id: providerAssetId,
        playback_id: directLinkId,
        playback_url: playbackUrl,
        quality_label: qualityLabel,
        mime_type: mimeType,
        processing_status: playbackUrl ? "ready" : "processing",
        rights_status: rightsStatus,
        source_name: "GoFile",
        active: Boolean(playbackUrl && rightsStatus !== "unknown"),
        metadata: {
          filename,
          download_page: downloadPage,
          uploaded_by: user.id,
          allowed_domain: allowedDomain,
        },
      })
      .select("id,provider_asset_id,playback_url,processing_status,rights_status,active")
      .single();

    if (error) throw error;

    await admin.from("media_ingestion_jobs").insert({
      media_asset_id: asset.id,
      source_type: "upload",
      source_ref: providerAssetId,
      status: playbackUrl ? "ready" : "processing",
      completed_at: playbackUrl ? new Date().toISOString() : null,
    });

    return json({
      ok: true,
      asset,
      download_page: downloadPage,
      direct_link_created: Boolean(playbackUrl),
      message: playbackUrl
        ? "GoFile upload complete and playback link created."
        : "GoFile upload complete. A direct playback link could not be created; check the GoFile plan/API configuration.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Authentication|permission/i.test(message) ? 401 : 500;
    return json({ ok: false, error: message }, status);
  }
});

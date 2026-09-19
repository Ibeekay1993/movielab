import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
  const { data: allowed, error } = await supabase.rpc("is_movielab_admin_for_user", { p_user_id: user.id });
  if (error || !allowed) throw new Error("MovieLab CMS permission required");
  return user;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  try {
    const user = await requireAdmin(req);
    const body = await req.json();
    const filename = String(body.filename ?? "MovieLab upload").slice(0, 240);
    const titleId = body.title_id ? String(body.title_id) : null;
    const episodeId = body.episode_id ? String(body.episode_id) : null;
    const rightsStatus = String(body.rights_status ?? "unknown");
    if (!titleId && !episodeId) return json({ ok:false, error:"title_id or episode_id is required" }, 400);
    if (!["unknown","authorized","licensed","expired","blocked"].includes(rightsStatus)) return json({ok:false,error:"Invalid rights_status"},400);
    if (rightsStatus === "blocked" || rightsStatus === "expired") return json({ok:false,error:"This media cannot be uploaded for playback"},400);

    const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const token = Deno.env.get("CLOUDFLARE_STREAM_TOKEN");
    if (!account || !token) return json({ok:false,error:"Cloudflare Stream is not configured"},503);

    const form = new FormData();
    form.append("maxDurationSeconds", String(body.max_duration_seconds ?? 14400));
    form.append("meta", JSON.stringify({ filename, title_id:titleId, episode_id:episodeId, uploaded_by:user.id }));

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream/direct_upload`, {
      method:"POST",
      headers:{ Authorization:`Bearer ${token}` },
      body:form,
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) return json({ok:false,error:"Cloudflare Stream direct upload creation failed"},502);

    const uid = String(payload.result.uid);
    const { data: asset, error } = await supabase.from("media_assets").insert({
      title_id:titleId,
      episode_id:episodeId,
      provider_type:"cloudflare_stream",
      provider_asset_id:uid,
      source_name:"MovieLab CMS upload",
      processing_status:"uploading",
      rights_status:rightsStatus,
      active:false,
      metadata:{filename, uploaded_by:user.id},
    }).select("id,provider_asset_id,processing_status,rights_status").single();
    if (error) throw error;

    await supabase.from("media_ingestion_jobs").insert({
      media_asset_id:asset.id,
      source_type:"upload",
      source_ref:uid,
      status:"uploading",
    });

    return json({ok:true, upload_url:payload.result.uploadURL, asset});
  } catch (error) {
    const status = String(error).includes("Authentication") || String(error).includes("permission") ? 401 : 500;
    return json({ok:false,error:error instanceof Error ? error.message : String(error)},status);
  }
});

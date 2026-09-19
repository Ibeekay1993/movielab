import { createClient } from "jsr:@supabase/supabase-js@2";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; type?: string; username?: string };
    text?: string;
    caption?: string;
    document?: { file_id?: string; file_name?: string; mime_type?: string };
    video?: { file_id?: string; file_name?: string; mime_type?: string };
  };
  channel_post?: {
    message_id?: number;
    chat?: { id?: number; type?: string; username?: string };
    text?: string;
    caption?: string;
    document?: { file_id?: string; file_name?: string; mime_type?: string };
    video?: { file_id?: string; file_name?: string; mime_type?: string };
  };
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-telegram-bot-api-secret-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const update = (await req.json()) as TelegramUpdate;
  const post = update.message ?? update.channel_post;
  if (!post) return json({ ok: true, ignored: true });

  const sourceName = post.chat?.username
    ? `telegram:${post.chat.username}`
    : `telegram:${post.chat?.id ?? "unknown"}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .upsert({ name: sourceName, type: "telegram", status: "active" }, { onConflict: "name" })
    .select("id")
    .single();

  if (sourceError) return json({ error: sourceError.message }, 500);

  const payload = {
    update_id: update.update_id ?? null,
    chat: post.chat ?? null,
    message_id: post.message_id ?? null,
    text: post.text ?? post.caption ?? null,
    media: post.document ?? post.video ?? null,
    received_at: new Date().toISOString(),
  };

  const externalId = update.update_id != null
    ? String(update.update_id)
    : `${post.chat?.id ?? "unknown"}:${post.message_id ?? crypto.randomUUID()}`;

  const { error } = await supabase.from("ingestion_jobs").upsert({
    source_id: source.id,
    external_id: externalId,
    payload,
    status: "queued",
    available_at: new Date().toISOString(),
  }, { onConflict: "source_id,external_id" });

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, queued: true });
});

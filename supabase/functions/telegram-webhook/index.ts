import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TelegramMessage = {
  message_id?: number;
  chat?: { id?: number; type?: string; title?: string; username?: string };
  caption?: string;
  video?: { file_id?: string; file_unique_id?: string; file_size?: number; duration?: number; width?: number; height?: number; mime_type?: string; file_name?: string };
  document?: { file_id?: string; file_unique_id?: string; file_size?: number; mime_type?: string; file_name?: string };
};

type TelegramUpdate = {
  update_id?: number;
  channel_post?: TelegramMessage;
  message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function mediaFromMessage(message: TelegramMessage) {
  if (message.video) return { kind: "video", media: message.video };
  if (message.document?.mime_type?.startsWith("video/")) return { kind: "document", media: message.document };
  return null;
}

function chatType(type?: string) {
  if (type === "channel") return "channel";
  if (type === "group") return "group";
  if (type === "supergroup") return "supergroup";
  return null;
}

function messageUrl(chat: TelegramMessage["chat"], messageId: number) {
  if (!chat?.username) return null;
  return `https://t.me/${chat.username}/${messageId}`;
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const update = await req.json() as TelegramUpdate;
  const message = update.channel_post ?? update.message ?? update.edited_channel_post ?? update.edited_message;
  const media = message ? mediaFromMessage(message) : null;
  const type = chatType(message?.chat?.type);

  if (!message?.chat?.id || !message.message_id || !type || !media) {
    return Response.json({ ok: true, ignored: true });
  }

  const chatId = message.chat.id;
  const { data: channel, error: channelError } = await supabase
    .from("telegram_channels")
    .select("id,status,permission_confirmed")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (channelError) return Response.json({ ok: false, error: channelError.message }, { status: 500 });

  // A source must be explicitly registered and permission-confirmed before ingestion.
  if (!channel || channel.status !== "active" || !channel.permission_confirmed) {
    return Response.json({ ok: true, ignored: true, reason: "source_not_authorized" });
  }

  const m = media.media as Record<string, unknown>;
  const { data: inserted, error } = await supabase.from("telegram_media").upsert({
    channel_id: channel.id,
    telegram_message_id: message.message_id,
    telegram_file_id: m.file_id ?? null,
    telegram_file_unique_id: m.file_unique_id ?? null,
    media_kind: media.kind,
    file_name: m.file_name ?? null,
    mime_type: m.mime_type ?? null,
    file_size: m.file_size ?? null,
    duration_seconds: m.duration ?? null,
    width: m.width ?? null,
    height: m.height ?? null,
    caption: message.caption ?? null,
    message_url: messageUrl(message.chat, message.message_id),
    source_message: update,
    ingestion_status: "queued",
  }, { onConflict: "channel_id,telegram_message_id" })
  .select("id")
  .single();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await supabase.from("telegram_ingestion_jobs").upsert({
    telegram_media_id: inserted.id,
    status: "queued",
    available_at: new Date().toISOString(),
  }, { onConflict: "telegram_media_id" });

  await supabase.from("telegram_channels")
    .update({ last_event_at: new Date().toISOString() })
    .eq("id", channel.id);

  // Best-effort immediate processing. The queue remains durable if the processor is unavailable.
  const processorUrl = Deno.env.get("TELEGRAM_PROCESSOR_URL");
  const processorSecret = Deno.env.get("TELEGRAM_PROCESSOR_SECRET");
  if (processorUrl) {
    try {
      await fetch(processorUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(processorSecret ? { "x-movielab-processor-secret": processorSecret } : {}),
        },
        body: JSON.stringify({ trigger: "telegram-webhook", media_id: inserted.id }),
      });
    } catch {
      // The queued job remains available for a scheduled retry.
    }
  }

  return Response.json({ ok: true, media_id: inserted.id });
});

const cors = { "content-type":"application/json" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed",{status:405});
  const { webhook_url, secret_token } = await req.json();
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return Response.json({ok:false,error:"TELEGRAM_BOT_TOKEN is not configured"},{status:500});
  if (!webhook_url || !secret_token) return Response.json({ok:false,error:"webhook_url and secret_token are required"},{status:400});
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({url:webhook_url,secret_token,allowed_updates:["message","channel_post","edited_message","edited_channel_post"],drop_pending_updates:false})
  });
  const body = await res.text();
  return new Response(body,{status:res.status,headers:cors});
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TMDB_BASE = "https://api.themoviedb.org/3";

function cleanTitle(input: string) {
  return input
    .replace(/\.(mkv|mp4|avi|mov|webm)$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b(2160p|4k|1080p|720p|480p|web[- ]?dl|webrip|bluray|brrip|hdr|x264|x265|hevc|aac|10bit)\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEpisode(input: string) {
  const m = input.match(/\bS(\d{1,2})(?:E|[-x])?(\d{1,3})\b/i) ?? input.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

function parseYear(input: string) {
  const m = input.match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : null;
}

async function classifyWithAI(raw: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const prompt = `Identify the movie or TV episode represented by this Telegram filename/caption. Return ONLY JSON with keys: title, year, type, season, episode, confidence. type must be movie or series. Do not invent a title. If uncertain, lower confidence.\n\nINPUT: ${raw}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini classification failed: ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/^\\s*\`\`\`json\\s*/i, "").replace(/\`\`\`\\s*$/,"").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !parsed.type) return null;
    return {
      title: String(parsed.title),
      year: parsed.year ? Number(parsed.year) : null,
      type: parsed.type === "series" ? "series" : "movie",
      season: parsed.season ? Number(parsed.season) : null,
      episode: parsed.episode ? Number(parsed.episode) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    };
  } catch {
    return null;
  }
}

async function tmdbSearch(query: string, year: number | null) {
  const key = Deno.env.get("TMDB_API_KEY");
  if (!key) return null;
  const endpoint = `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const json = await res.json();
  const candidates = (json.results ?? []).filter((x: any) => x.media_type === "movie" || x.media_type === "tv");
  if (!candidates.length) return null;
  const scored = candidates.map((x: any) => {
    const date = x.release_date ?? x.first_air_date ?? "";
    const candidateYear = date ? Number(String(date).slice(0,4)) : null;
    const yearScore = year && candidateYear ? (year === candidateYear ? 0.25 : 0) : 0.08;
    const popularity = Math.min(Number(x.popularity ?? 0) / 100, 0.08);
    return { x, score: 0.67 + yearScore + popularity };
  }).sort((a: any,b: any)=>b.score-a.score);
  return scored[0];
}

async function ensureTitle(match: any) {
  const isMovie = match.x.media_type === "movie";
  const name = match.x.title ?? match.x.name;
  const date = match.x.release_date ?? match.x.first_air_date ?? null;
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") + (date ? `-${String(date).slice(0,4)}` : "");
  const { data: existing } = await supabase.from("titles").select("id").eq("metadata_provider","tmdb").eq("metadata_provider_id",String(match.x.id)).maybeSingle();
  if (existing) return existing.id;
  const detailRes = await fetch(`${TMDB_BASE}/${isMovie?"movie":"tv"}/${match.x.id}?api_key=${encodeURIComponent(Deno.env.get("TMDB_API_KEY")!)}`);
  if (!detailRes.ok) throw new Error(`TMDB detail failed: ${detailRes.status}`);
  const detail = await detailRes.json();
  const { data, error } = await supabase.from("titles").insert({
    slug, title:name, original_title:detail.original_title ?? detail.original_name ?? null,
    overview:detail.overview ?? null, release_date:date, runtime_minutes:detail.runtime ?? detail.episode_run_time?.[0] ?? null,
    content_rating:null, poster_url:detail.poster_path ? `https://image.tmdb.org/t/p/w780${detail.poster_path}` : null,
    backdrop_url:detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
    type:isMovie?"movie":"series", status:"draft", original_language:detail.original_language ?? null,
    country_of_origin:(detail.production_countries ?? []).map((c:any)=>c.iso_3166_1).filter(Boolean),
    metadata_provider:"tmdb", metadata_provider_id:String(match.x.id)
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const expectedSecret = Deno.env.get("TELEGRAM_PROCESSOR_SECRET");
  if (expectedSecret && req.headers.get("x-movielab-processor-secret") !== expectedSecret) return Response.json({ok:false,error:"Unauthorized"},{status:401});
  const workerId = crypto.randomUUID();
  const { data: job, error: claimError } = await supabase.rpc("claim_telegram_ingestion_job", { worker_id: workerId });
  if (claimError || !job?.id) return Response.json({ ok:true, processed:false });
  try {
    const { data: media, error } = await supabase.from("telegram_media").select("*").eq("id", job.telegram_media_id).single();
    if (error || !media) throw error ?? new Error("Media not found");

    const raw = [media.file_name, media.caption].filter(Boolean).join(" ");
    const extractedTitle = cleanTitle(raw);
    const parsedEpisode = parseEpisode(raw);
    const parsedYear = parseYear(raw);
    const ai = await classifyWithAI(raw);
    const aiTitle = ai?.title ?? extractedTitle;
    const episode = ai?.season && ai?.episode ? { season: ai.season, episode: ai.episode } : parsedEpisode;
    const year = ai?.year ?? parsedYear;
    const match = await tmdbSearch(aiTitle, year);

    if (!match) {
      await supabase.from("telegram_media").update({ ingestion_status:"review", extracted_title:extractedTitle, extracted_year:year, extracted_season:episode?.season ?? null, extracted_episode:episode?.episode ?? null, match_confidence:0 }).eq("id",media.id);
      await supabase.from("telegram_ingestion_jobs").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",job.id);
      return Response.json({ok:true,status:"review",reason:"no_metadata_match"});
    }

    const confidence = Math.min(0.99, ai?.confidence ? (0.65 * ai.confidence + 0.35 * match.score) : match.score);
    const titleId = await ensureTitle(match);

    await supabase.from("telegram_media").update({
      ingestion_status: confidence >= 0.98 ? "matched" : "review",
      extracted_title: aiTitle,
      extracted_year: year,
      extracted_season: episode?.season ?? null,
      extracted_episode: episode?.episode ?? null,
      title_id:titleId,
      match_confidence:confidence
    }).eq("id",media.id);

    await supabase.from("telegram_ingestion_jobs").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",job.id);
    return Response.json({ok:true,status:confidence >= 0.98 ? "matched":"review",title_id:titleId,confidence});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("telegram_ingestion_jobs").update({status:"failed",error_message:message}).eq("id",job.id);
    await supabase.from("telegram_media").update({ingestion_status:"failed",error_message:message}).eq("id",job.telegram_media_id);
    return Response.json({ok:false,error:message},{status:500});
  }
});

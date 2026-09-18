import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
  const m = input.match(/\bS(\d{1,2})E(\d{1,3})\b/i) ?? input.match(/\b(\d{1,2})x(\d{1,3})\b/i);
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
  const prompt = `Identify the movie or TV episode represented by this filename/caption. Return ONLY JSON with keys title, year, type, season, episode, confidence. type must be movie or series. Never invent a title; lower confidence when uncertain. INPUT: ${raw}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}]}),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text.replace(/^\s*```json\s*/i,"").replace(/```\s*$/,"").trim());
    if (!parsed.title || !parsed.type) return null;
    return {
      title:String(parsed.title), year:parsed.year ? Number(parsed.year) : null,
      type:parsed.type === "series" ? "series" : "movie",
      season:parsed.season ? Number(parsed.season) : null,
      episode:parsed.episode ? Number(parsed.episode) : null,
      confidence:Math.max(0,Math.min(1,Number(parsed.confidence ?? 0))),
    };
  } catch { return null; }
}

async function tmdbSearch(query:string, year:number|null) {
  const key=Deno.env.get("TMDB_API_KEY"); if(!key) return [];
  const params=new URLSearchParams({api_key:key,query,include_adult:"false"});
  const res=await fetch(`https://api.themoviedb.org/3/search/multi?${params}`);
  if(!res.ok) return [];
  const data=await res.json();
  return (data.results ?? []).filter((x:any)=>x.media_type==="movie"||x.media_type==="tv").slice(0,8).map((x:any)=>({
    provider:"tmdb", externalId:String(x.id), media:x,
    type:x.media_type==="tv"?"series":"movie",
    name:x.title??x.name, year:(x.release_date??x.first_air_date)?.slice(0,4) ? Number((x.release_date??x.first_air_date).slice(0,4)) : null,
    score:scoreCandidate(x.name??x.title, x.release_date??x.first_air_date, query, year) + 0.05,
  }));
}

async function tvmazeSearch(query:string, year:number|null) {
  const res=await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,{headers:{"user-agent":"MovieLab/1.0"}});
  if(!res.ok) return [];
  const data=await res.json();
  return (data ?? []).slice(0,8).map((item:any)=>({
    provider:"tvmaze", externalId:String(item.show?.id), media:item.show,
    type:"series", name:item.show?.name, year:item.show?.premiered?.slice(0,4) ? Number(item.show.premiered.slice(0,4)) : null,
    score:scoreCandidate(item.show?.name,item.show?.premiered,query,year),
  }));
}

function scoreCandidate(name:string,date:string|undefined,query:string,year:number|null) {
  const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const a=normalize(name??""), b=normalize(query);
  const exact=a===b ? 0.28 : a.includes(b)||b.includes(a) ? 0.18 : 0.08;
  const candidateYear=date ? Number(date.slice(0,4)) : null;
  const yearScore=year&&candidateYear ? (year===candidateYear ? 0.18 : Math.max(0,0.08-Math.min(0.08,Math.abs(year-candidateYear)*0.02))) : 0.04;
  return Math.min(0.94,0.48+exact+yearScore);
}

async function ensureTitle(candidate:any) {
  const {data:existing}=await supabase.from("titles").select("id").eq("metadata_provider",candidate.provider).eq("metadata_provider_id",candidate.externalId).maybeSingle();
  if(existing) return existing.id;

  let title=candidate.name;
  let overview=null, poster=null, backdrop=null, releaseDate=null, runtime=null, originalTitle=null, language=null, countries:string[]=[];
  if(candidate.provider==="tmdb") {
    const key=Deno.env.get("TMDB_API_KEY");
    if(!key) throw new Error("TMDB_API_KEY is required for a TMDB candidate");
    const mediaType=candidate.type==="movie"?"movie":"tv";
    const res=await fetch(`https://api.themoviedb.org/3/${mediaType}/${candidate.externalId}?api_key=${encodeURIComponent(key)}`);
    if(!res.ok) throw new Error(`TMDB detail failed: ${res.status}`);
    const d=await res.json();
    title=d.title??d.name??title; overview=d.overview??null; releaseDate=d.release_date??d.first_air_date??null;
    runtime=d.runtime??d.episode_run_time?.[0]??null; originalTitle=d.original_title??d.original_name??null; language=d.original_language??null;
    poster=d.poster_path?`https://image.tmdb.org/t/p/w780${d.poster_path}`:null;
    backdrop=d.backdrop_path?`https://image.tmdb.org/t/p/w1280${d.backdrop_path}`:null;
    countries=(d.production_countries??[]).map((c:any)=>c.iso_3166_1).filter(Boolean);
    for(const genre of d.genres??[]) {
      const slug=String(genre.name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      const {data:g}=await supabase.from("genres").upsert({name:genre.name,slug},{onConflict:"slug"}).select("id").single();
      if(g) await supabase.from("title_genres").upsert({title_id:undefined,genre_id:g.id},{onConflict:"title_id,genre_id"}).catch(()=>{});
    }
  } else {
    const d=candidate.media;
    title=d?.name??title; overview=d?.summary?.replace(/<[^>]+>/g," ")??null; releaseDate=d?.premiered??null;
    runtime=d?.runtime??null; originalTitle=d?.name??title; language=d?.language??null;
    poster=d?.image?.original??d?.image?.medium??null; backdrop=d?.image?.original??null;
    countries=(d?.network?.country?.code?[d.network.country.code]:[]).filter(Boolean);
  }

  const slug=String(title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+`-${candidate.externalId}`;
  const {data, error}=await supabase.from("titles").insert({
    slug,title,original_title:originalTitle,overview,release_date:releaseDate,runtime_minutes:runtime,
    content_rating:null,poster_url:poster,backdrop_url:backdrop,type:candidate.type,status:"draft",
    original_language:language,country_of_origin:countries,metadata_provider:candidate.provider,metadata_provider_id:candidate.externalId
  }).select("id").single();
  if(error) throw error;

  if(candidate.provider==="tmdb") {
    const key=Deno.env.get("TMDB_API_KEY");
    const res=key?await fetch(`https://api.themoviedb.org/3/${candidate.type==="movie"?"movie":"tv"}/${candidate.externalId}?api_key=${encodeURIComponent(key)}`):null;
    const d=res?.ok?await res.json():null;
    for(const genre of d?.genres??[]) {
      const slug=String(genre.name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      const {data:g}=await supabase.from("genres").upsert({name:genre.name,slug},{onConflict:"slug"}).select("id").single();
      if(g) await supabase.from("title_genres").upsert({title_id:data.id,genre_id:g.id},{onConflict:"title_id,genre_id"});
    }
  }

  const {data:p}=await supabase.from("metadata_providers").select("id").eq("provider_key",candidate.provider).maybeSingle();
  if(p) await supabase.from("title_metadata_sources").upsert({
    title_id:data.id,provider_id:p.id,external_id:candidate.externalId,
    source_url:candidate.provider==="tmdb"?`https://www.themoviedb.org/${candidate.type==="movie"?"movie":"tv"}/${candidate.externalId}`:candidate.media?.url??null,
    raw_metadata:candidate.media??{}
  },{onConflict:"provider_id,external_id"});
  return data.id;
}

async function ensureEpisode(titleId:string, episode:{season:number;episode:number}, media:any) {
  const {data:season,error:se}=await supabase.from("seasons").upsert({series_id:titleId,season_number:episode.season},{onConflict:"series_id,season_number"}).select("id").single();
  if(se) throw se;
  const {data:ep,error:ee}=await supabase.from("episodes").upsert({
    season_id:season.id,episode_number:episode.episode,title:media.extracted_title??`Episode ${episode.episode}`,
    runtime_minutes:media.duration_seconds?Math.round(media.duration_seconds/60):null
  },{onConflict:"season_id,episode_number"}).select("id").single();
  if(ee) throw ee;
  return ep.id;
}

Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({ok:false,error:"Method Not Allowed"},405);
  const expected=Deno.env.get("TELEGRAM_PROCESSOR_SECRET");
  if(expected&&req.headers.get("x-movielab-processor-secret")!==expected) return json({ok:false,error:"Unauthorized"},401);
  const workerId=crypto.randomUUID();
  const {data:job,error:claimError}=await supabase.rpc("claim_telegram_ingestion_job",{worker_id:workerId});
  if(claimError||!job?.id) return json({ok:true,processed:false});
  try {
    const {data:media,error}=await supabase.from("telegram_media").select("*").eq("id",job.telegram_media_id).single();
    if(error||!media) throw error??new Error("Media not found");
    const raw=[media.file_name,media.caption].filter(Boolean).join(" ");
    const extractedTitle=cleanTitle(raw);
    const parsedEpisode=parseEpisode(raw), parsedYear=parseYear(raw), ai=await classifyWithAI(raw);
    const query=ai?.title??extractedTitle, year=ai?.year??parsedYear;
    const episode=ai?.season&&ai?.episode?{season:ai.season,episode:ai.episode}:parsedEpisode;
    const candidates=[...(await tmdbSearch(query,year)),...(await tvmazeSearch(query,year))].sort((a,b)=>b.score-a.score);
    const best=candidates[0];

    if(!best||best.score<0.70) {
      await supabase.from("telegram_media").update({ingestion_status:"review",extracted_title:query,extracted_year:year,extracted_season:episode?.season??null,extracted_episode:episode?.episode??null,match_confidence:best?.score??0}).eq("id",media.id);
      await supabase.from("telegram_ingestion_jobs").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",job.id);
      return json({ok:true,status:"review",reason:"no_high_confidence_metadata_match"});
    }

    const confidence=Math.min(0.99,ai?.confidence?0.55*ai.confidence+0.45*best.score:best.score);
    const titleId=await ensureTitle(best);
    const episodeId=episode&&best.type==="series"?await ensureEpisode(titleId,episode,{extracted_title:query,duration_seconds:media.duration_seconds}):null;
    const {data:source}=await supabase.from("telegram_channels").select("auto_publish").eq("id",media.channel_id).single();

    -- Placeholder: a Telegram file is metadata-matched here. It is not made publicly playable
    -- until an authorized media delivery adapter creates a ready media_asset and rights check passes.
    const nextStatus=source?.auto_publish&&confidence>=0.98?"matched":confidence>=0.90?"matched":"review";
    await supabase.from("telegram_media").update({
      ingestion_status:nextStatus,extracted_title:query,extracted_year:year,
      extracted_season:episode?.season??null,extracted_episode:episode?.episode??null,
      title_id:titleId,episode_id:episodeId,match_confidence:confidence
    }).eq("id",media.id);
    await supabase.from("telegram_ingestion_jobs").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",job.id);
    return json({ok:true,status:nextStatus,title_id:titleId,episode_id:episodeId,provider:best.provider,confidence});
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    await supabase.from("telegram_ingestion_jobs").update({status:"failed",error_message:message}).eq("id",job.id);
    await supabase.from("telegram_media").update({ingestion_status:"failed",error_message:message}).eq("id",job.telegram_media_id);
    return json({ok:false,error:message},500);
  }
});
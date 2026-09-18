import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function tmdbSearch(query: string) {
  const key = Deno.env.get("TMDB_API_KEY");
  if (!key) throw new Error("TMDB_API_KEY is not configured");
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`,
  );
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  return res.json();
}

async function tvmazeSearch(query: string) {
  const res = await fetch(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
    { headers: { "user-agent": "MovieLab/1.0" } },
  );
  if (!res.ok) throw new Error(`TVmaze search failed: ${res.status}`);
  return res.json();
}

async function omdbSearch(query: string, year?: string) {
  const key = Deno.env.get("OMDB_API_KEY");
  if (!key) return { configured: false, data: [] };

  const params = new URLSearchParams({
    apikey: key,
    s: query,
    type: "movie",
    ...(year ? { y: year } : {}),
  });
  const res = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
  if (!res.ok) throw new Error(`OMDb search failed: ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") return { configured: true, data: [], error: data.Error };
  return { configured: true, data: data.Search ?? [] };
}

async function watchmodeSources(providerTitleId: string, territory: string) {
  const key = Deno.env.get("WATCHMODE_API_KEY");
  if (!key) return { configured: false, data: null };

  const res = await fetch(
    `https://api.watchmode.com/v1/title/${encodeURIComponent(providerTitleId)}/sources/?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(territory)}`,
  );
  if (!res.ok) throw new Error(`Watchmode sources failed: ${res.status}`);
  return { configured: true, data: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const secret = Deno.env.get("METADATA_SYNC_SECRET");
  if (secret && req.headers.get("x-movielab-admin-secret") !== secret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const query = String(body.query ?? "").trim();
    const year = body.year ? String(body.year) : undefined;
    const territory = String(body.territory ?? "NG").toUpperCase();

    if (action === "search") {
      if (!query) return json({ ok: false, error: "query is required" }, 400);

      const [tmdb, tvmaze, omdb] = await Promise.allSettled([
        tmdbSearch(query),
        tvmazeSearch(query),
        omdbSearch(query, year),
      ]);

      return json({
        ok: true,
        results: {
          tmdb: tmdb.status === "fulfilled" ? tmdb.value.results ?? [] : [],
          tvmaze: tvmaze.status === "fulfilled" ? tvmaze.value : [],
          omdb: omdb.status === "fulfilled" ? omdb.value : { configured: false, data: [] },
        },
      });
    }

    if (action === "watchmode_sources") {
      const providerTitleId = String(body.provider_title_id ?? "");
      if (!providerTitleId) {
        return json({ ok: false, error: "provider_title_id is required" }, 400);
      }

      return json({
        ok: true,
        provider: "watchmode",
        territory,
        ...(await watchmodeSources(providerTitleId, territory)),
      });
    }

    return json({ ok: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

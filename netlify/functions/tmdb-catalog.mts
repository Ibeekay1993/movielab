const TMDB_BASE = "https://api.themoviedb.org/3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=900, s-maxage=900",
    },
  });
}

async function tmdb(path: string, token: string) {
  const response = await fetch(`${TMDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return response.json();
}

export default async function handler(req: Request) {
  if (req.method !== "GET") return json({ error: "GET required" }, 405);

  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token) return json({ error: "TMDB_API_READ_ACCESS_TOKEN is not configured" }, 503);

  try {
    const [trending, popularMovies, popularTv, nowPlaying, upcoming, onAir, movieGenres, tvGenres] =
      await Promise.all([
        tmdb("/trending/all/week?language=en-US", token),
        tmdb("/movie/popular?language=en-US&page=1", token),
        tmdb("/tv/popular?language=en-US&page=1", token),
        tmdb("/movie/now_playing?language=en-US&page=1", token),
        tmdb("/movie/upcoming?language=en-US&page=1", token),
        tmdb("/tv/on_the_air?language=en-US&page=1", token),
        tmdb("/genre/movie/list?language=en-US", token),
        tmdb("/genre/tv/list?language=en-US", token),
      ]);

    const genres = new Map<number, string>();
    for (const genre of [...(movieGenres.genres ?? []), ...(tvGenres.genres ?? [])]) {
      genres.set(genre.id, genre.name);
    }

    const seen = new Set<string>();
    const results: any[] = [];

    const add = (items: any[], featured = false) => {
      for (const item of items ?? []) {
        const mediaType = item.media_type ?? (item.first_air_date != null ? "tv" : "movie");
        const key = `${mediaType}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          ...item,
          media_type: mediaType,
          genre_names: (item.genre_ids ?? []).map((id: number) => genres.get(id)).filter(Boolean),
          featured,
        });
      }
    };

    add(trending.results, true);
    add(popularMovies.results);
    add(popularTv.results);
    add(nowPlaying.results);
    add(upcoming.results);
    add(onAir.results);

    return json({
      source: "tmdb",
      generated_at: new Date().toISOString(),
      results: results.slice(0, 120),
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "TMDB source failed",
    }, 502);
  }
}

export const config = {
  path: "/api/tmdb-catalog",
};

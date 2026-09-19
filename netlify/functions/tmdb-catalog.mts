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
    const [
      trending, popularMovies, popularTv, nowPlaying, upcoming, onAir,
      actionMovies, dramaMovies, comedyMovies, romanceMovies, thrillerMovies,
      animationMovies, animationTv, nigerianMovies, nigerianTv,
      movieGenres, tvGenres,
    ] = await Promise.all([
      tmdb("/trending/all/week?language=en-US", token),
      tmdb("/movie/popular?language=en-US&page=1&region=NG", token),
      tmdb("/tv/popular?language=en-US&page=1", token),
      tmdb("/movie/now_playing?language=en-US&page=1&region=NG", token),
      tmdb("/movie/upcoming?language=en-US&page=1&region=NG", token),
      tmdb("/tv/on_the_air?language=en-US&page=1", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=28", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=18", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=35", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=10749", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=53", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_genres=16", token),
      tmdb("/discover/tv?language=en-US&page=1&sort_by=popularity.desc&with_genres=16", token),
      tmdb("/discover/movie?language=en-US&page=1&sort_by=popularity.desc&with_origin_country=NG", token),
      tmdb("/discover/tv?language=en-US&page=1&sort_by=popularity.desc&with_origin_country=NG", token),
      tmdb("/genre/movie/list?language=en-US", token),
      tmdb("/genre/tv/list?language=en-US", token),
    ]);

    const genres = new Map<number, string>();
    for (const genre of [...(movieGenres.genres ?? []), ...(tvGenres.genres ?? [])]) {
      genres.set(genre.id, genre.name);
    }

    const mapItems = (items: any[], mediaType?: "movie" | "tv") =>
      (items ?? []).map((item: any) => {
        const resolvedType = mediaType ?? item.media_type ?? (item.first_air_date != null ? "tv" : "movie");
        return {
          ...item,
          media_type: resolvedType,
          genre_names: (item.genre_ids ?? []).map((id: number) => genres.get(id)).filter(Boolean),
        };
      });

    const collections = {
      trending: mapItems(trending.results),
      popularMovies: mapItems(popularMovies.results, "movie"),
      popularTv: mapItems(popularTv.results, "tv"),
      nowPlaying: mapItems(nowPlaying.results, "movie"),
      upcoming: mapItems(upcoming.results, "movie"),
      onAir: mapItems(onAir.results, "tv"),
      actionMovies: mapItems(actionMovies.results, "movie"),
      dramaMovies: mapItems(dramaMovies.results, "movie"),
      comedyMovies: mapItems(comedyMovies.results, "movie"),
      romanceMovies: mapItems(romanceMovies.results, "movie"),
      thrillerMovies: mapItems(thrillerMovies.results, "movie"),
      animation: [...mapItems(animationMovies.results, "movie"), ...mapItems(animationTv.results, "tv")],
      nigerian: [...mapItems(nigerianMovies.results, "movie"), ...mapItems(nigerianTv.results, "tv")],
    };

    const seen = new Set<string>();
    const results: any[] = [];
    for (const items of Object.values(collections)) {
      for (const item of items) {
        const key = `${item.media_type}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(item);
      }
    }

    return json({
      source: "tmdb",
      generated_at: new Date().toISOString(),
      collections,
      results: results.slice(0, 500),
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

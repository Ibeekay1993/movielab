import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { catalog as fallbackCatalog } from "../data/catalog";
import { supabase } from "./supabase";
import type { Availability, Title } from "../types/catalog";

type CatalogContextValue = { catalog: Title[]; loading: boolean; error: string | null };
const CatalogContext = createContext<CatalogContextValue>({ catalog: [], loading: true, error: null });

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function mapRow(row: any): Title {
  const genres = (row.title_genres ?? []).map((item: any) => item.genres?.name).filter(Boolean);
  const seasons = (row.seasons ?? []).sort((a: any, b: any) => a.season_number - b.season_number).map((season: any) => ({
    number: season.season_number,
    episodes: (season.episodes ?? []).sort((a: any, b: any) => a.episode_number - b.episode_number).map((episode: any) => ({
      id: episode.id, number: episode.episode_number, title: episode.title,
      runtimeMinutes: episode.runtime_minutes ?? 0, overview: episode.overview ?? undefined,
    })),
  }));
  return {
    id: row.id, slug: row.slug, title: row.title, year: row.year ?? 0, rating: row.rating ?? "NR",
    runtimeMinutes: row.runtime_minutes ?? undefined, genre: genres, type: row.type,
    overview: row.overview ?? "", posterUrl: row.poster_url ?? "", backdropUrl: row.backdrop_url ?? "",
    featured: Boolean(row.featured), country: row.countries ?? [], language: row.languages ?? [],
    match: row.match ?? undefined, availability: [], seasons: seasons.length ? seasons : undefined,
    tmdbId: row.tmdb_id ?? undefined,
  };
}

function mapTmdbRow(row: any): Title {
  const isSeries = row.media_type === "tv" || row.first_air_date != null;
  const title = isSeries ? row.name : row.title;
  const date = isSeries ? row.first_air_date : row.release_date;
  const availability: Availability = {
    provider: "TMDB",
    kind: "external",
    territory: "GLOBAL",
    label: "Metadata",
    url: `https://www.themoviedb.org/${isSeries ? "tv" : "movie"}/${row.id}`,
  };
  return {
    id: `tmdb-${row.id}-${isSeries ? "tv" : "movie"}`,
    slug: `tmdb-${row.id}-${isSeries ? "tv" : "movie"}`,
    title: title ?? "Untitled",
    year: date ? Number(String(date).slice(0, 4)) : 0,
    rating: row.vote_average ? row.vote_average.toFixed(1) : "NR",
    genre: row.genre_names ?? [],
    type: isSeries ? "series" : "movie",
    overview: row.overview ?? "",
    posterUrl: row.poster_path ? `${TMDB_IMAGE_BASE}/w500${row.poster_path}` : "",
    backdropUrl: row.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${row.backdrop_path}` : "",
    featured: Boolean(row.featured),
    country: row.origin_country ?? [],
    language: row.original_language ? [row.original_language] : [],
    match: row.vote_average ? Math.round(row.vote_average * 10) : undefined,
    availability: [availability],
    tmdbId: Number(row.id),
  };
}

function mergeCatalog(primary: Title[], tmdb: Title[]) {
  const merged = new Map<string, Title>();
  for (const item of primary) merged.set(item.tmdbId ? `tmdb:${item.tmdbId}:${item.type}` : `title:${item.slug}`, item);
  for (const item of tmdb) {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}:${item.type}` : `title:${item.slug}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}

async function fetchTmdbCatalog(): Promise<Title[]> {
  const response = await fetch("/api/tmdb-catalog");
  if (!response.ok) throw new Error(`TMDB source returned HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.results) ? payload.results.map(mapTmdbRow) : [];
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Title[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    let cancelled = false;

    async function load() {
      let databaseCatalog: Title[] = [];
      let tmdbCatalog: Title[] = [];

      if (client) {
        const { data, error: queryError } = await client.from("titles")
          .select("*, title_genres(genres(*)), seasons(*, episodes(*))")
          .eq("status", "published")
          .order("featured", { ascending: false })
          .order("created_at", { ascending: false });

        if (queryError) setError(queryError.message);
        if (data?.length) databaseCatalog = data.map(mapRow);
      }

      try {
        tmdbCatalog = await fetchTmdbCatalog();
      } catch (tmdbError) {
        if (!databaseCatalog.length) setError(tmdbError instanceof Error ? tmdbError.message : "TMDB source unavailable");
      }

      if (cancelled) return;
      const merged = mergeCatalog(databaseCatalog, tmdbCatalog);
      const allowDemoFallback = import.meta.env.VITE_APP_ENV !== "production";
      setCatalog(merged.length ? merged : (allowDemoFallback ? fallbackCatalog : []));
      if (!merged.length && !allowDemoFallback) setError("No production catalogue is available yet.");
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return <CatalogContext.Provider value={{ catalog, loading, error }}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}

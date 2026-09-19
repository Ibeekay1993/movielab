import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { catalog as fallbackCatalog } from "../data/catalog";
import { supabase } from "./supabase";
import type { Availability, Title } from "../types/catalog";

export type CatalogCollection = Record<string, Title[]>;
type CatalogContextValue = {
  catalog: Title[];
  collections: CatalogCollection;
  loading: boolean;
  error: string | null;
};
const CatalogContext = createContext<CatalogContextValue>({
  catalog: [], collections: {}, loading: true, error: null
});

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function firstMediaUrl(value: any): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const direct = [
    value.playback_url, value.playbackUrl, value.hls_url, value.hlsUrl,
    value.manifest_url, value.manifestUrl, value.media_url, value.mediaUrl,
    value.stream_url, value.streamUrl,
  ].find(item => typeof item === "string" && item.trim());
  if (direct) return direct;
  for (const key of ["sources", "source", "media", "media_asset", "media_assets", "playback"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const url = firstMediaUrl(item);
        if (url) return url;
      }
    } else {
      const url = firstMediaUrl(nested);
      if (url) return url;
    }
  }
  return undefined;
}

function mapRow(row: any): Title {
  const genres = (row.title_genres ?? []).map((item: any) => item.genres?.name).filter(Boolean);
  const seasons = (row.seasons ?? []).sort((a: any, b: any) => a.season_number - b.season_number).map((season: any) => ({
    number: season.season_number,
    episodes: (season.episodes ?? []).sort((a: any, b: any) => a.episode_number - b.episode_number).map((episode: any) => ({
      id: episode.id, number: episode.episode_number, title: episode.title,
      runtimeMinutes: episode.runtime_minutes ?? 0, overview: episode.overview ?? undefined,
      playbackUrl: firstMediaUrl(episode),
    })),
  }));
  const mediaUrl = firstMediaUrl(row);
  return {
    id: row.id, slug: row.slug, title: row.title, year: row.year ?? 0, rating: row.rating ?? "NR",
    runtimeMinutes: row.runtime_minutes ?? undefined, genre: genres, type: row.type,
    overview: row.overview ?? "", posterUrl: row.poster_url ?? "", backdropUrl: row.backdrop_url ?? "",
    featured: Boolean(row.featured), country: row.countries ?? [], language: row.languages ?? [],
    match: row.match ?? undefined,
    availability: mediaUrl ? [{ provider: "MovieLab", kind: "movielab" as const, territory: "GLOBAL", label: "MovieLab Player", url: mediaUrl }] : [],
    seasons: seasons.length ? seasons : undefined,
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

async function fetchTmdbCatalog(): Promise<{ catalog: Title[]; collections: CatalogCollection }> {
  const response = await fetch("/api/tmdb-catalog");
  if (!response.ok) throw new Error(`TMDB source returned HTTP ${response.status}`);
  const payload = await response.json();
  const collections: CatalogCollection = {};
  for (const [key, rows] of Object.entries(payload.collections ?? {})) {
    collections[key] = Array.isArray(rows) ? rows.map(mapTmdbRow) : [];
  }
  const catalog = Array.isArray(payload.results) ? payload.results.map(mapTmdbRow) : [];
  return { catalog, collections };
}

function normalizeCollections(collections: CatalogCollection, databaseCatalog: Title[]) {
  const byKey = new Map<string, Title>();
  for (const item of databaseCatalog) {
    if (item.tmdbId) byKey.set(`tmdb:${item.tmdbId}:${item.type}`, item);
  }
  return Object.fromEntries(
    Object.entries(collections).map(([key, items]) => [
      key,
      items.map(item => byKey.get(`tmdb:${item.tmdbId}:${item.type}`) ?? item),
    ]),
  );
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Title[]>([]);
  const [collections, setCollections] = useState<CatalogCollection>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    let cancelled = false;

    async function load() {
      let databaseCatalog: Title[] = [];
      let tmdbCatalog: Title[] = [];
      let tmdbCollections: CatalogCollection = {};

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
        const tmdb = await fetchTmdbCatalog();
        tmdbCatalog = tmdb.catalog;
        tmdbCollections = tmdb.collections;
      } catch (tmdbError) {
        if (!databaseCatalog.length) setError(tmdbError instanceof Error ? tmdbError.message : "TMDB source unavailable");
      }

      if (cancelled) return;
      const merged = mergeCatalog(databaseCatalog, tmdbCatalog);
      const allowDemoFallback = import.meta.env.VITE_APP_ENV !== "production";
      setCatalog(merged.length ? merged : (allowDemoFallback ? fallbackCatalog : []));
      setCollections(normalizeCollections(tmdbCollections, databaseCatalog));
      if (!merged.length && !allowDemoFallback) setError("No production catalogue is available yet.");
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return <CatalogContext.Provider value={{ catalog, collections, loading, error }}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { catalog as fallbackCatalog } from "../data/catalog";
import { supabase } from "./supabase";
import type { Title } from "../types/catalog";

type CatalogContextValue = { catalog: Title[]; loading: boolean; error: string | null };
const CatalogContext = createContext<CatalogContextValue>({ catalog: fallbackCatalog, loading: false, error: null });

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
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    async function load(supabaseClient: NonNullable<typeof supabase>) {
      const { data, error: queryError } = await supabaseClient.from("titles")
        .select("*, title_genres(genres(*)), seasons(*, episodes(*))")
        .eq("status", "published")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setCatalog(data?.length ? data.map(mapRow) : fallbackCatalog);
      setLoading(false);
    }

    load(client);
    return () => {
      cancelled = true;
    };
  }, []);

  return <CatalogContext.Provider value={{ catalog, loading, error }}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}

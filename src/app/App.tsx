import { useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Clock3, Info, Play, Plus, Search, Sparkles, House, Clapperboard, Tv2,
  X, Check, Film, UserCircle2, Flame, Languages, ArrowUpRight, Menu, Moon, Bot, TrendingUp, Drama, Laugh, Heart, Ghost, LayoutGrid
} from "lucide-react";
import { CatalogProvider, useCatalog } from "../lib/catalog-context";
import { findTitle, formatRuntime, searchTitles } from "../lib/catalog";
import type { Title } from "../types/catalog";
import MediaLibrary from "../pages/MediaLibrary";

function Header({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [openSearch, setOpenSearch] = useState(Boolean(initial));
  function submit(value = query) { const q = value.trim(); if (q) navigate("/search?q=" + encodeURIComponent(q)); }
  const primary = [
    { label: "Home", to: "/" }, { label: "TV Shows", to: "/tv-shows" },
    { label: "Movies", to: "/movies" }, { label: "Midnight", to: "/midnight" },
    { label: "Animation", to: "/animation" },
  ];
  return <header className="header">
    <button className="menu-button" onClick={onMenu} aria-label="Open MovieLab menu"><Menu size={20}/></button>
    <Link className="brand" to="/" aria-label="MovieLab home"><span>◈</span>MOVIELAB</Link>
    <nav className="desktop-nav" aria-label="Primary navigation">{primary.map(item => <Link key={item.to} className={location.pathname === item.to ? "active" : ""} to={item.to}>{item.label}</Link>)}</nav>
    <div className={"header-search " + (openSearch ? "open" : "")}>
      <button className="icon-button search-toggle" onClick={() => setOpenSearch(v => !v)} aria-label="Search"><Search size={18}/></button>
      {openSearch && <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Titles, people, genres..." aria-label="Search MovieLab"/>}
      {openSearch && query && <button className="search-clear" onClick={() => {setQuery(""); setOpenSearch(false); navigate("/")}} aria-label="Clear search"><X size={16}/></button>}
    </div>
    <Link className="header-list" to="/my-list">My List</Link>
    <button className="language-button" aria-label="Language"><Languages size={16}/><span>EN</span></button>
    <button className="profile-button" aria-label="Profile"><UserCircle2 size={28}/></button>
  </header>;
}
const sidebarGroups = [
  { label: "Browse", items: [
    { label: "Home", to: "/", icon: House }, { label: "Movies", to: "/movies", icon: Clapperboard },
    { label: "TV Shows", to: "/tv-shows", icon: Tv2 }, { label: "Midnight", to: "/midnight", icon: Moon },
    { label: "Animation", to: "/animation", icon: Bot },
  ]},
  { label: "Genres", items: [
    { label: "Action", to: "/search?q=Action", icon: TrendingUp }, { label: "Drama", to: "/search?q=Drama", icon: Drama },
    { label: "Comedy", to: "/search?q=Comedy", icon: Laugh }, { label: "Romance", to: "/search?q=Romance", icon: Heart },
    { label: "Thriller", to: "/search?q=Thriller", icon: Ghost }, { label: "Nollywood", to: "/nigerian-cinema", icon: Sparkles },
  ]},
  { label: "Collections", items: [
    { label: "New & Trending", to: "/coming-soon", icon: Flame }, { label: "My List", to: "/my-list", icon: Plus },
  ]},
];
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  return <>
    <button className={"sidebar-scrim " + (open ? "visible" : "")} onClick={onClose} aria-label="Close menu"/>
    <aside className={"sidebar " + (open ? "open" : "")} aria-label="MovieLab catalogue menu">
      <div className="sidebar-inner">
        <div className="sidebar-top"><span>Browse MovieLab</span><button onClick={onClose} aria-label="Close menu"><X size={17}/></button></div>
        {sidebarGroups.map(group => <section className="sidebar-group" key={group.label}>
          <div className="sidebar-label">{group.label}</div>
          <nav>{group.items.map(item => {
            const Icon = item.icon;
            const active = item.to === "/" ? location.pathname === "/" : location.pathname === item.to;
            return <Link key={item.to} className={active ? "active" : ""} to={item.to} onClick={onClose}><Icon size={16}/><span>{item.label}</span></Link>;
          })}</nav>
        </section>)}
        <div className="sidebar-footer"><Link to="/cms/media" onClick={onClose}><LayoutGrid size={15}/> Media Library</Link></div>
      </div>
    </aside>
  </>;
}

function Card({ title, rank }: { title: Title; rank?: number }) {
  return (
    <Link className={`card ${rank ? "ranked-card" : ""}`} to={`/title/${title.slug}`}>
      {rank && <span className="rank-number">{rank}</span>}
      <div className="poster">
        {title.posterUrl ? <img src={title.posterUrl} alt="" loading="lazy"/> : <div className="poster-fallback"><Film size={28}/><span>{title.title}</span></div>}
        <div className="poster-gradient"/>
        <div className="card-topline"><span>{title.type === "series" ? "SERIES" : "MOVIE"}</span>{title.featured && <span className="featured-dot"><Flame size={11} fill="currentColor"/></span>}</div>
        <div className="card-copy"><strong>{title.title}</strong><span>{title.year} · {title.genre.slice(0,2).join(" · ")}</span></div>
        <div className="card-hover"><span className="hover-play"><Play size={16} fill="currentColor"/></span><span>View details</span></div>
        {title.availability.some(a => a.kind === "movielab") && <span className="card-play"><Play size={13} fill="currentColor"/></span>}
      </div>
    </Link>
  );
}

function Rail({ title, subtitle, titles, ranked = false, href }: { title: string; subtitle?: string; titles: Title[]; ranked?: boolean; href?: string }) {
  const [offset, setOffset] = useState(0);
  if (!titles.length) return null;
  return (
    <section className="rail-section">
      <div className="rail-heading">
        <div className="rail-heading-copy"><div className="rail-title-line"><h2>{title}</h2>{href && <Link className="rail-more" to={href}>View all <ArrowUpRight size={13}/></Link>}</div>{subtitle && <p>{subtitle}</p>}</div>
        <div className="rail-controls">
          <button className="rail-arrow" onClick={() => setOffset(Math.max(0, offset - 1))} aria-label="Previous"><ChevronLeft size={18}/></button>
          <button className="rail-arrow" onClick={() => setOffset(offset + 1)} aria-label="Next"><ChevronRight size={18}/></button>
        </div>
      </div>
      <div className="rail-viewport"><div className="rail" style={{ transform: `translateX(-${offset * 210}px)` }}>{titles.map((t, i) => <Card key={t.id} title={t} rank={ranked ? i + 1 : undefined}/>)}</div></div>
    </section>
  );
}

function Hero({ title }: { title: Title }) {
  return (
    <section className="hero">
      {title.backdropUrl ? <img className="hero-image" src={title.backdropUrl} alt=""/> : <div className="hero-image hero-fallback"/>}
      <div className="hero-vignette"/>
      <div className="hero-content">
        <div className="eyebrow"><Sparkles size={14}/> Featured on MovieLab</div>
        <h1>{title.title}</h1>
        <div className="hero-meta"><span>{title.year}</span><i/> <span>{title.rating}</span><i/> <span>{formatRuntime(title.runtimeMinutes)}</span><i/> <span>{title.genre.slice(0,3).join(" · ")}</span></div>
        <p>{title.overview}</p>
        <div className="hero-stats"><span><strong>{title.match ?? 90}%</strong> Match</span><span>{title.tmdbId ? "TMDB metadata" : "MovieLab catalogue"}</span><span>HD</span></div>
        <div className="actions">
          <Link className="button button-light" to={`/title/${title.slug}`}><Play size={18} fill="currentColor"/> Play</Link>
          <Link className="button button-glass" to={`/title/${title.slug}`}><Info size={18}/> More Info</Link>
        </div>
      </div>
    </section>
  );
}

function CollectionRail({ title, titles, href, ranked = false }: { title: string; titles: Title[]; href?: string; ranked?: boolean }) {
  return <Rail title={title} titles={titles.slice(0, 18)} ranked={ranked} href={href}/>;
}

function Home() {
  const { catalog, collections } = useCatalog();
  const featured = catalog.find(t => t.featured) ?? catalog[0];
  if (!featured) return <main className="page empty catalogue-state"><div className="catalogue-loader"><span/><span/><span/></div><h1>Loading MovieLab</h1><p>Connecting to the live catalogue.</p></main>;

  const collection = (key: string) => collections[key] ?? [];
  const sections = [
    { title: "Trending this week", titles: collection("trending"), href: "/coming-soon", ranked: true },
    { title: "Popular Series", titles: collection("popularTv"), href: "/tv-shows" },
    { title: "Popular Movies", titles: collection("popularMovies"), href: "/movies" },
    { title: "Now Playing", titles: collection("nowPlaying") },
    { title: "Nollywood", titles: collection("nigerian"), href: "/nigerian-cinema" },
    { title: "Action", titles: collection("actionMovies") },
    { title: "Drama", titles: collection("dramaMovies") },
    { title: "Comedy", titles: collection("comedyMovies") },
    { title: "Romance", titles: collection("romanceMovies") },
    { title: "Animation", titles: collection("animation"), href: "/animation" },
    { title: "Coming Soon", titles: collection("upcoming"), href: "/coming-soon" },
  ];

  return <>
    <Hero title={featured}/>
    <main className="home-content">
      {sections.map(section => section.titles.length > 0 && (
        <CollectionRail key={section.title} {...section}/>
      ))}
    </main>
  </>;
}

type CollectionKey = "home" | "movies" | "tv-shows" | "midnight" | "animation" | "nigerian";

function getCollection(catalog: Title[], collection: CollectionKey) {
  if (collection === "movies") return catalog.filter(t => t.type === "movie");
  if (collection === "tv-shows") return catalog.filter(t => t.type === "series");
  if (collection === "animation") return catalog.filter(t => t.genre.some(g => ["animation", "anime"].includes(g.toLowerCase())));
  if (collection === "midnight") return catalog.filter(t => t.genre.some(g => ["horror", "thriller", "crime", "mystery"].includes(g.toLowerCase())));
  if (collection === "nigerian") return catalog.filter(t => t.country.some(c => c.toLowerCase() === "nigeria" || c.toLowerCase() === "ng"));
  return catalog;
}
function Listing({ collection, title, description }: { collection: CollectionKey; title: string; description: string }) {
  const { catalog } = useCatalog();
  const titles = getCollection(catalog, collection);
  const byGenre = (genres: string[]) => titles.filter(t => t.genre.some(g => genres.includes(g.toLowerCase())));
  const sections = [
    { title: "Popular", titles }, { title: "Latest", titles: [...titles].sort((a, b) => b.year - a.year) },
    { title: "Action", titles: byGenre(["action"]) }, { title: "Drama", titles: byGenre(["drama"]) },
    { title: "Comedy", titles: byGenre(["comedy"]) }, { title: "Romance", titles: byGenre(["romance"]) },
    { title: "Thriller", titles: byGenre(["thriller"]) },
    { title: "Nollywood", titles: titles.filter(t => t.country.some(c => c.toLowerCase() === "nigeria")) },
  ].filter(section => section.titles.length);
  return <main className="catalogue-page">
    <div className="catalogue-header"><div><span className="eyebrow plain">MovieLab Catalogue</span><h1>{title}</h1><p>{description}</p></div><span className="filter-pill">{titles.length} {titles.length === 1 ? "title" : "titles"}</span></div>
    <div className="catalogue-sections">{sections.map((section, i) => <CollectionRail key={section.title} title={section.title} titles={section.titles} ranked={i === 0 && collection !== "home"}/>)}</div>
    {!titles.length && <div className="empty catalogue-empty"><Film size={38}/><h2>No titles yet</h2><p>MovieLab will show this collection as catalogue data is added.</p></div>}
  </main>;
}

function SearchPage() {
  const { catalog } = useCatalog();
  const { search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  const results = useMemo(() => searchTitles(catalog, query), [catalog, query]);
  return <main className="page"><div className="page-head"><div><span className="eyebrow plain">Discovery</span><h1>Search</h1><p>{results.length} results for “{query}”</p></div></div>{results.length ? <div className="grid">{results.map(t => <Card key={t.id} title={t}/>)}</div> : <div className="empty"><Search size={38}/><h2>No titles found</h2><p>Try another title, actor, genre or country.</p></div>}</main>;
}

function PlaybackFrame({ src, title }: { src: string; title: string }) {
  return <div className="playback-frame" aria-label={title}>
    <iframe
      src={src}
      title={title}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </div>;
}

function TitlePage() {
  const { catalog } = useCatalog();
  const { slug = "" } = useParams();
  const title = findTitle(catalog, slug);
  const [listed, setListed] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  if (!title) return <main className="page empty"><h1>Title not found</h1><Link className="button button-light" to="/">Back home</Link></main>;

  const playable = Boolean(title.tmdbId);
  const selectedSeasonData = title.seasons?.find(season => season.number === selectedSeason) ?? title.seasons?.[0];
  const episodes = selectedSeasonData?.episodes ?? [];
  const effectiveEpisode = episodes.find(episode => episode.number === selectedEpisode)?.number ?? episodes[0]?.number ?? selectedEpisode;

  async function startPlayback(season = selectedSeason, episode = effectiveEpisode) {
    if (!title) {
      setPlaybackError("This title could not be resolved.");
      return;
    }
    if (!title.tmdbId) {
      setPlaybackError("This title does not have a TMDB ID, so playback cannot be resolved yet.");
      return;
    }

    setPlaybackLoading(true);
    setPlaybackError(null);
    try {
      const params = new URLSearchParams({
        tmdbId: String(title.tmdbId),
        type: title.type === "series" ? "tv" : "movie",
      });
      if (title.type === "series") {
        params.set("season", String(season));
        params.set("episode", String(episode));
      }

      const response = await fetch("/api/playback?" + params.toString());
      const payload = await response.json();
      if (!response.ok || typeof payload.embedUrl !== "string") {
        throw new Error(payload.error ?? "Playback provider is unavailable.");
      }

      setPlaybackUrl(payload.embedUrl);
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : "Playback provider is unavailable.");
    } finally {
      setPlaybackLoading(false);
    }
  }

  function selectEpisode(number: number) {
    setSelectedEpisode(number);
    setPlaybackUrl(null);
    void startPlayback(selectedSeason, number);
  }

  return <main className="title-page">
    <section className="detail-hero">
      {title.backdropUrl ? <img src={title.backdropUrl} alt=""/> : <div className="hero-fallback"/>}<div className="detail-vignette"/>
      <div className="detail-content"><Link className="back-link" to="/"><ChevronLeft size={17}/> Back</Link><span className="eyebrow plain">{title.type === "series" ? "Series" : "Movie"}</span><h1>{title.title}</h1><div className="hero-meta"><span>{title.year}</span><i/><span>{title.rating}</span>{title.runtimeMinutes && <><i/><span>{formatRuntime(title.runtimeMinutes)}</span></>}<i/><span>{title.genre.join(" · ")}</span></div><p>{title.overview}</p><div className="actions">{playable && <button className="button button-light" onClick={() => void startPlayback()} disabled={playbackLoading}>{playbackLoading ? "Loading player…" : <><Play size={18} fill="currentColor"/> Watch now</>}</button>}<button className="button button-glass" onClick={() => setListed(v => !v)}>{listed ? <Check size={18}/> : <Plus size={18}/>} {listed ? "In My List" : "My List"}</button></div></div>
    </section>

    <section className="detail-body">
      <div>
        {playbackError && <div className="playback-error" role="alert">{playbackError}</div>}
        {playbackUrl && <div className="playback-panel"><div className="section-title"><div><span className="eyebrow plain">Now playing</span><h2>{title.title}</h2></div><button className="button button-glass playback-close" onClick={() => setPlaybackUrl(null)}>Close player</button></div><PlaybackFrame src={playbackUrl} title={title.title}/></div>}

        {title.seasons && <div className="episodes-panel"><div className="section-title"><div><span className="eyebrow plain">Episodes</span><h2>Season {selectedSeason}</h2></div>{title.seasons.length > 1 ? <select className="season-select" value={selectedSeason} onChange={event => { setSelectedSeason(Number(event.target.value)); setSelectedEpisode(1); setPlaybackUrl(null); }} aria-label="Select season">{title.seasons.map(season => <option key={season.number} value={season.number}>Season {season.number}</option>)}</select> : <span className="season-select">Season 1</span>}</div>{episodes.map(e => <button className="episode-row" key={e.id} onClick={() => selectEpisode(e.number)}><span className="episode-number">{String(e.number).padStart(2,"0")}</span><span className="episode-thumb"><Film size={20}/></span><span className="episode-info"><strong>{e.title}</strong><span><Clock3 size={13}/> {formatRuntime(e.runtimeMinutes)}</span><p>{e.overview ?? "Episode details will appear as catalogue metadata is enriched."}</p></span><span className="episode-play" aria-hidden="true"><Play size={15} fill="currentColor"/></span></button>)}</div>}
      </div>

      <aside className="details-aside"><div className="info-card"><span>MovieLab match</span><strong>{title.match ?? 0}%</strong><div className="match-bar"><i style={{width: `${title.match ?? 0}%`}}/></div></div><div className="info-card"><span>Metadata source</span><strong>{title.tmdbId ? "TMDB" : "MovieLab"}</strong><small>{title.tmdbId ? "TMDB metadata is connected to NexStream playback." : "This title needs a TMDB identity before playback can be resolved."}</small></div></aside>
    </section>
  </main>;
}

function MyList() { return <main className="page empty"><div className="empty-icon"><Plus size={28}/></div><h1>Your List</h1><p>Save movies and series here for later.</p><Link className="button button-light" to="/movies">Browse movies</Link></main>; }

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  return <CatalogProvider><div className="app">
    <Header onMenu={() => setSidebarOpen(true)}/><Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}/>
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/movies" element={<Listing collection="movies" title="Movies" description="The MovieLab movie catalogue, organised for quick browsing."/>}/>
      <Route path="/tv-shows" element={<Listing collection="tv-shows" title="TV Shows" description="Series, seasons and episodes across the MovieLab catalogue."/>}/>
      <Route path="/series" element={<Listing collection="tv-shows" title="TV Shows" description="Series, seasons and episodes across the MovieLab catalogue."/>}/>
      <Route path="/midnight" element={<Listing collection="midnight" title="Midnight" description="Dark, tense and after-hours viewing from the MovieLab catalogue."/>}/>
      <Route path="/animation" element={<Listing collection="animation" title="Animation" description="Animated films and series in one dedicated MovieLab destination."/>}/>
      <Route path="/nigerian-cinema" element={<Listing collection="nigerian" title="Nigerian Cinema" description="Nigerian films and series from the MovieLab catalogue."/>}/>
      <Route path="/coming-soon" element={<Listing collection="home" title="New & Trending" description="Recently added and currently highlighted MovieLab titles."/>}/>
      <Route path="/search" element={<SearchPage/>}/><Route path="/title/:slug" element={<TitlePage/>}/><Route path="/my-list" element={<MyList/>}/><Route path="/cms/media" element={<MediaLibrary/>}/>
      <Route path="*" element={<main className="page empty"><h1>Page not found</h1><Link className="button button-light" to="/">Return home</Link></main>}/>
    </Routes>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <Link to="/" className={location.pathname === "/" ? "active" : ""}><House size={18}/><span>Home</span></Link>
      <Link to="/movies"><Clapperboard size={18}/><span>Movies</span></Link>
      <Link to="/tv-shows"><Tv2 size={18}/><span>TV Shows</span></Link>
      <Link to="/animation"><Bot size={18}/><span>Animation</span></Link>
      <button onClick={() => setSidebarOpen(true)}><Menu size={18}/><span>Menu</span></button>
    </nav>
  </div></CatalogProvider>;
}

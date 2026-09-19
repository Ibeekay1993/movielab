import { useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Clock3, Info, Play, Plus, Search, Sparkles, House, Clapperboard, Tv2, UserRound,
  X, Check, Film, UserCircle2, Flame, Languages, SlidersHorizontal, ArrowUpRight
} from "lucide-react";
import { CatalogProvider, useCatalog } from "../lib/catalog-context";
import { findTitle, formatRuntime, searchTitles } from "../lib/catalog";
import type { Title } from "../types/catalog";
import MediaLibrary from "../pages/MediaLibrary";

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [openSearch, setOpenSearch] = useState(Boolean(initial));

  function submit(value = query) {
    const q = value.trim();
    if (q) navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <header className="header">
      <Link className="brand" to="/" aria-label="MovieLab home"><span>◈</span>MOVIELAB</Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        <Link className={location.pathname === "/" ? "active" : ""} to="/">Home</Link>
        <Link to="/movies">Movies</Link>
        <Link to="/series">Series</Link>
        <Link to="/nigerian-cinema">Nigerian</Link>
        <Link to="/coming-soon">New & Trending</Link>
      </nav>
      <div className={`header-search ${openSearch ? "open" : ""}`}>
        <button className="icon-button search-toggle" onClick={() => setOpenSearch(v => !v)} aria-label="Search"><Search size={18}/></button>
        {openSearch && <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Titles, people, genres..." aria-label="Search MovieLab"/>}
        {openSearch && query && <button className="search-clear" onClick={() => {setQuery(""); submit("")}} aria-label="Clear search"><X size={16}/></button>}
      </div>
      <Link className="header-list" to="/my-list">My List</Link>
      <button className="language-button" aria-label="Language"><Languages size={16}/><span>EN</span></button>
      <button className="profile-button" aria-label="Profile"><UserCircle2 size={28}/></button>
    </header>
  );
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
        <div className="hero-stats"><span><strong>{title.match ?? 90}%</strong> Match</span><span>MovieLab Original</span><span>HD</span></div>
        <div className="actions">
          <Link className="button button-light" to={`/title/${title.slug}`}><Play size={18} fill="currentColor"/> Play</Link>
          <Link className="button button-glass" to={`/title/${title.slug}`}><Info size={18}/> More Info</Link>
        </div>
      </div>
    </section>
  );
}

function DiscoveryBar() {
  const categories = ["Action", "Drama", "Comedy", "Romance", "Thriller", "K-Drama", "Nollywood", "Anime"];
  return <section className="discovery-bar" aria-label="Browse categories">
    <div className="discovery-inner">
      <div className="discovery-label"><SlidersHorizontal size={15}/> Browse</div>
      <div className="category-chips">
        {categories.map(category => <Link key={category} className="category-chip" to={`/search?q=${encodeURIComponent(category)}`}>{category}</Link>)}
      </div>
    </div>
  </section>;
}

function Home() {
  const { catalog } = useCatalog();
  const featured = catalog.find(t => t.featured) ?? catalog[0];
  const movies = catalog.filter(t => t.type === "movie");
  const series = catalog.filter(t => t.type === "series");
  const nigeria = catalog.filter(t => t.country.some(c => c.toLowerCase() === "nigeria"));
  return <><Hero title={featured}/><DiscoveryBar/><main className="home-content">
    <Rail title="Continue Watching" subtitle="Pick up where you left off" titles={catalog.slice(0,4)} href="/my-list"/>
    <Rail title="Trending in Nigeria" subtitle="What people are watching now" titles={nigeria.length ? nigeria : catalog} href="/nigerian-cinema"/>
    <Rail title="Top 10 on MovieLab" subtitle="The titles getting the most attention" titles={catalog} ranked/>
    <Rail title="Nigerian Cinema" subtitle="Stories from home and across Africa" titles={nigeria.length ? nigeria : movies} href="/nigerian-cinema"/>
    <Rail title="Popular Movies" titles={movies} href="/movies"/>
    <Rail title="Popular Series" titles={series} href="/series"/>
  </main></>;
}

function Listing({ type, title }: { type: "movie" | "series"; title?: string }) {
  const { catalog } = useCatalog();
  const titles = type === "movie" ? catalog.filter(t => t.type === "movie") : catalog.filter(t => t.type === "series");
  return <main className="page"><div className="page-head"><div><span className="eyebrow plain">{type === "movie" ? "MovieLab Cinema" : "Binge-worthy television"}</span><h1>{title ?? (type === "movie" ? "Movies" : "Series")}</h1><p>Explore the MovieLab catalogue.</p></div><div className="filter-pill">{titles.length} titles</div></div><div className="grid">{titles.map(t => <Card key={t.id} title={t}/>)}</div></main>;
}

function SearchPage() {
  const { catalog } = useCatalog();
  const { search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  const results = useMemo(() => searchTitles(catalog, query), [query]);
  return <main className="page"><div className="page-head"><div><span className="eyebrow plain">Discovery</span><h1>Search</h1><p>{results.length} results for “{query}”</p></div></div>{results.length ? <div className="grid">{results.map(t => <Card key={t.id} title={t}/>)}</div> : <div className="empty"><Search size={38}/><h2>No titles found</h2><p>Try another title, actor, genre or country.</p></div>}</main>;
}

function TitlePage() {
  const { catalog } = useCatalog();
  const { slug = "" } = useParams();
  const title = findTitle(catalog, slug);
  const [listed, setListed] = useState(false);
  if (!title) return <main className="page empty"><h1>Title not found</h1><Link className="button button-light" to="/">Back home</Link></main>;
  const playable = title.availability.some(a => a.kind === "movielab");
  return <main className="title-page">
    <section className="detail-hero">
      {title.backdropUrl ? <img src={title.backdropUrl} alt=""/> : <div className="hero-fallback"/>}<div className="detail-vignette"/>
      <div className="detail-content"><Link className="back-link" to="/"><ChevronLeft size={17}/> Back</Link><span className="eyebrow plain">{title.type === "series" ? "Series" : "Movie"}</span><h1>{title.title}</h1><div className="hero-meta"><span>{title.year}</span><i/><span>{title.rating}</span>{title.runtimeMinutes && <><i/><span>{formatRuntime(title.runtimeMinutes)}</span></>}<i/><span>{title.genre.join(" · ")}</span></div><p>{title.overview}</p><div className="actions">{playable && <button className="button button-light"><Play size={18} fill="currentColor"/> Watch now</button>}<button className="button button-glass" onClick={() => setListed(v => !v)}>{listed ? <Check size={18}/> : <Plus size={18}/>} {listed ? "In My List" : "My List"}</button></div></div>
    </section>
    <section className="detail-body">
      {title.seasons && <div className="episodes-panel"><div className="section-title"><div><span className="eyebrow plain">Episodes</span><h2>Season 1</h2></div><button className="season-select">Season 1 <ChevronRight size={16}/></button></div>{title.seasons[0]?.episodes.map(e => <div className="episode-row" key={e.id}><span className="episode-number">{String(e.number).padStart(2,"0")}</span><div className="episode-thumb"><Film size={20}/></div><div className="episode-info"><strong>{e.title}</strong><span><Clock3 size={13}/> {formatRuntime(e.runtimeMinutes)}</span><p>{e.overview ?? "Episode details will appear as catalogue metadata is enriched."}</p></div><button className="episode-play" aria-label={`Play episode ${e.number}`}><Play size={15} fill="currentColor"/></button></div>)}</div>}
      <aside className="details-aside"><div className="info-card"><span>MovieLab match</span><strong>{title.match ?? 0}%</strong><div className="match-bar"><i style={{width: `${title.match ?? 0}%`}}/></div></div><div className="info-card"><span>Available in</span><strong>Nigeria</strong><small>Provider availability is verified separately from metadata.</small></div></aside>
    </section>
  </main>;
}

function MyList() { return <main className="page empty"><div className="empty-icon"><Plus size={28}/></div><h1>Your List</h1><p>Save movies and series here for later.</p><Link className="button button-light" to="/movies">Browse movies</Link></main>; }

export default function App() {
  const location = useLocation();
  return <CatalogProvider><div className="app"><Header/><Routes><Route path="/" element={<Home/>}/><Route path="/movies" element={<Listing type="movie"/>}/><Route path="/series" element={<Listing type="series"/>}/><Route path="/nigerian-cinema" element={<Listing type="movie" title="Nigerian Cinema"/>}/><Route path="/coming-soon" element={<Listing type="movie" title="New & Trending"/>}/><Route path="/search" element={<SearchPage/>}/><Route path="/title/:slug" element={<TitlePage/>}/><Route path="/my-list" element={<MyList/>}/><Route path="/cms/media" element={<MediaLibrary/>}/><Route path="*" element={<main className="page empty"><h1>Page not found</h1><Link className="button button-light" to="/">Return home</Link></main>}/></Routes><nav className="mobile-nav" aria-label="Mobile navigation"><Link to="/" className={location.pathname === "/" ? "active" : ""}><House size={18}/><span>Home</span></Link><Link to="/movies"><Clapperboard size={18}/><span>Movies</span></Link><Link to="/series"><Tv2 size={18}/><span>Series</span></Link><Link to="/nigerian-cinema"><span className="mobile-naija">NG</span><span>Nigerian</span></Link><Link to="/my-list"><UserRound size={18}/><span>My List</span></Link></nav></div></CatalogProvider>;
}

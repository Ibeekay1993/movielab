create extension if not exists pgcrypto;

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  original_title text,
  type text not null check (type in ('movie','series')),
  overview text not null default '',
  year integer,
  rating text,
  runtime_minutes integer,
  poster_url text,
  backdrop_url text,
  countries text[] not null default '{}',
  languages text[] not null default '{}',
  status text not null default 'published' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  match integer check (match between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists public.title_genres (
  title_id uuid not null references public.titles(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  primary key (title_id, genre_id)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  created_at timestamptz not null default now(),
  unique (title_id, season_number)
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  overview text,
  runtime_minutes integer,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  unique (season_id, episode_number)
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('telegram','cms','metadata','partner','other')),
  status text not null default 'active' check (status in ('active','paused','disabled')),
  config jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','rejected')),
  attempts integer not null default 0,
  error_message text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists titles_status_type_idx on public.titles(status, type);
create index if not exists titles_featured_idx on public.titles(featured) where featured = true;
create index if not exists ingestion_jobs_queue_idx on public.ingestion_jobs(status, available_at, created_at);
create unique index if not exists ingestion_jobs_source_external_idx
  on public.ingestion_jobs(source_id, external_id)
  where external_id is not null;

alter table public.titles enable row level security;
alter table public.genres enable row level security;
alter table public.title_genres enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.sources enable row level security;
alter table public.ingestion_jobs enable row level security;

drop policy if exists "Published titles are public" on public.titles;
create policy "Published titles are public"
  on public.titles for select
  using (status = 'published');

drop policy if exists "Published genres are public" on public.genres;
create policy "Published genres are public"
  on public.genres for select
  using (exists (
    select 1 from public.title_genres tg
    join public.titles t on t.id = tg.title_id
    where tg.genre_id = genres.id and t.status = 'published'
  ));

drop policy if exists "Published title genres are public" on public.title_genres;
create policy "Published title genres are public"
  on public.title_genres for select
  using (exists (
    select 1 from public.titles t
    where t.id = title_genres.title_id and t.status = 'published'
  ));

drop policy if exists "Published seasons are public" on public.seasons;
create policy "Published seasons are public"
  on public.seasons for select
  using (exists (
    select 1 from public.titles t
    where t.id = seasons.title_id and t.status = 'published'
  ));

drop policy if exists "Published episodes are public" on public.episodes;
create policy "Published episodes are public"
  on public.episodes for select
  using (exists (
    select 1
    from public.seasons s
    join public.titles t on t.id = s.title_id
    where s.id = episodes.season_id and t.status = 'published'
  ));

-- Sources and ingestion_jobs intentionally have no public policies.
-- Edge Functions using the server-side secret can manage ingestion safely.

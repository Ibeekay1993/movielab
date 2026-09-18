create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'MovieLab User',
  avatar_url text,
  country_code text not null default 'NG',
  language_code text not null default 'en',
  is_kids boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  original_title text,
  overview text,
  release_date date,
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  content_rating text,
  poster_url text,
  backdrop_url text,
  trailer_url text,
  type text not null check (type in ('movie','series')),
  status text not null default 'published' check (status in ('draft','published','archived')),
  original_language text,
  country_of_origin text[] not null default '{}',
  metadata_provider text,
  metadata_provider_id text,
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

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.title_cast (
  title_id uuid not null references public.titles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  character_name text,
  billing_order integer,
  primary key (title_id, person_id)
);

create table if not exists public.title_crew (
  title_id uuid not null references public.titles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  department text not null,
  job text not null,
  primary key (title_id, person_id, department, job)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.titles(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  title text,
  overview text,
  unique (series_id, season_number)
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  overview text,
  runtime_minutes integer check (runtime_minutes is null or runtime_minutes > 0),
  still_url text,
  release_date date,
  unique (season_id, episode_number)
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website_url text,
  logo_url text,
  provider_type text not null default 'streaming'
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  territory_code text not null,
  availability_type text not null check (availability_type in ('subscription','rent','buy','free','licensed_streaming')),
  url text,
  starts_at timestamptz,
  ends_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (title_id, provider_id, territory_code, availability_type)
);

create table if not exists public.rights (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  territory_code text not null,
  rights_type text not null check (rights_type in ('streaming','download','rental','purchase')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('pending','active','expired','revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.streaming_sources (
  id uuid primary key default gen_random_uuid(),
  title_id uuid references public.titles(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  source_type text not null check (source_type in ('hls','dash','mp4')),
  asset_id text not null,
  drm_required boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check ((title_id is not null) <> (episode_id is not null))
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  visibility text not null default 'published' check (visibility in ('draft','published')),
  territory_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  position integer not null default 0,
  primary key (collection_id, title_id)
);

create table if not exists public.my_list (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (profile_id, title_id)
);

create table if not exists public.watch_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  position_seconds numeric(12,2) not null default 0 check (position_seconds >= 0),
  duration_seconds numeric(12,2),
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  primary key (profile_id, title_id, episode_id)
);

create table if not exists public.watch_events (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  title_id uuid references public.titles(id) on delete set null,
  episode_id uuid references public.episodes(id) on delete set null,
  event_type text not null check (event_type in ('impression','open','play_started','play_25','play_50','play_75','play_completed','trailer_played','my_list_added','my_list_removed','search','provider_clicked')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists titles_type_status_idx on public.titles(type,status);
create index if not exists availability_title_territory_idx on public.availability(title_id,territory_code);
create index if not exists rights_title_territory_idx on public.rights(title_id,territory_code,status);
create index if not exists watch_progress_profile_idx on public.watch_progress(profile_id,last_watched_at desc);
create index if not exists watch_events_profile_idx on public.watch_events(profile_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.my_list enable row level security;
alter table public.watch_progress enable row level security;
alter table public.watch_events enable row level security;

create policy "profiles_self_select" on public.profiles for select using (id = auth.uid());
create policy "profiles_self_insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_self_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "my_list_self_all" on public.my_list for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "watch_progress_self_all" on public.watch_progress for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "watch_events_self_insert" on public.watch_events for insert with check (profile_id = auth.uid());

alter table public.titles enable row level security;
alter table public.genres enable row level security;
alter table public.title_genres enable row level security;
alter table public.people enable row level security;
alter table public.title_cast enable row level security;
alter table public.title_crew enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.providers enable row level security;
alter table public.availability enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

create policy "published_titles_read" on public.titles for select using (status = 'published');
create policy "genres_read" on public.genres for select using (true);
create policy "title_genres_read" on public.title_genres for select using (true);
create policy "people_read" on public.people for select using (true);
create policy "title_cast_read" on public.title_cast for select using (true);
create policy "title_crew_read" on public.title_crew for select using (true);
create policy "seasons_read" on public.seasons for select using (exists (select 1 from public.titles t where t.id = series_id and t.status = 'published'));
create policy "episodes_read" on public.episodes for select using (exists (select 1 from public.seasons s join public.titles t on t.id=s.series_id where s.id=season_id and t.status='published'));
create policy "providers_read" on public.providers for select using (true);
create policy "availability_read" on public.availability for select using (true);
create policy "collections_read" on public.collections for select using (visibility = 'published');
create policy "collection_items_read" on public.collection_items for select using (exists (select 1 from public.collections c where c.id=collection_id and c.visibility='published'));

-- Rights and streaming sources are intentionally not client-readable.
-- Playback authorization must resolve them server-side after entitlement and territory checks.
alter table public.rights enable row level security;
alter table public.streaming_sources enable row level security;

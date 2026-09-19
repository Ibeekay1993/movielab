create table if not exists public.web_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  source_type text not null check (source_type in ('catalogue','provider')),
  status text not null default 'pending' check (status in ('pending','active','paused','revoked')),
  authorization_status text not null default 'unknown' check (authorization_status in ('unknown','metadata_only','authorized','licensed','expired','blocked')),
  authorization_reference text,
  authorization_notes text,
  auto_publish boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain, source_type)
);

create table if not exists public.source_discovery (
  id uuid primary key default gen_random_uuid(),
  web_source_id uuid not null references public.web_sources(id) on delete cascade,
  source_url text not null,
  parent_source_url text,
  external_id text,
  discovered_title text,
  discovered_filename text,
  discovered_year integer,
  content_type text check (content_type in ('movie','series','episode','unknown')),
  season_number integer,
  episode_number integer,
  quality_label text,
  codec text,
  audio_codec text,
  container text,
  language text,
  subtitle_language text,
  file_size bigint,
  duration_seconds integer,
  title_id uuid references public.titles(id) on delete set null,
  episode_id uuid references public.episodes(id) on delete set null,
  rights_status text not null default 'unknown' check (rights_status in ('unknown','metadata_only','authorized','licensed','expired','blocked')),
  discovery_status text not null default 'queued' check (discovery_status in ('queued','processing','matched','review','completed','failed','blocked')),
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  error_message text,
  unique (web_source_id, source_url)
);

create index if not exists source_discovery_status_idx on public.source_discovery(discovery_status, first_seen_at);
create index if not exists source_discovery_title_idx on public.source_discovery(title_id);
create index if not exists source_discovery_episode_idx on public.source_discovery(episode_id);
create index if not exists source_discovery_domain_idx on public.web_sources(domain, status);

alter table public.web_sources enable row level security;
alter table public.source_discovery enable row level security;

-- Source configuration and discovery are service-role controlled.
-- Browser clients must use authenticated admin/CMS Edge Functions.

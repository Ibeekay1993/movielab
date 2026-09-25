-- MovieLab media library: provider-neutral media assets and ingestion jobs.
-- Storage providers remain replaceable; the browser never receives raw origin credentials.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  title_id uuid references public.titles(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  provider_type text not null,
  provider_asset_id text,
  storage_key text,
  playback_id text,
  playback_url text,
  quality_label text,
  mime_type text,
  processing_status text not null default 'ready',
  rights_status text not null default 'unknown',
  source_name text,
  metadata jsonb not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((title_id is not null) <> (episode_id is not null))
);

alter table public.media_assets
  drop constraint if exists media_assets_provider_type_check;

alter table public.media_assets
  add constraint media_assets_provider_type_check
  check (provider_type in ('telegram','supabase_storage','s3','r2','cloudflare_stream','bunny_stream','gofile','other'));

alter table public.media_assets
  add column if not exists storage_key text,
  add column if not exists playback_id text,
  add column if not exists playback_url text,
  add column if not exists processing_status text not null default 'ready',
  add column if not exists rights_status text not null default 'unknown',
  add column if not exists source_name text,
  add column if not exists metadata jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.media_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  source_type text not null check (source_type in ('upload','telegram','partner','api')),
  source_ref text,
  status text not null default 'queued' check (status in ('queued','uploading','processing','ready','failed','blocked')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists media_assets_title_active_idx on public.media_assets(title_id, active);
create index if not exists media_assets_episode_active_idx on public.media_assets(episode_id, active);
create index if not exists media_ingestion_jobs_ready_idx on public.media_ingestion_jobs(status, available_at);

alter table public.media_assets enable row level security;
alter table public.media_ingestion_jobs enable row level security;

-- Admin/upload workers use service-role or a future CMS authorization RPC.
-- No anonymous access to media ingestion jobs.

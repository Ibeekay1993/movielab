-- GoFile storage provider for MovieLab-owned and partner-authorized media.
-- GoFile credentials never reach the browser. Playback links are generated server-side.
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
  check (provider_type in (
    'telegram',
    'supabase_storage',
    's3',
    'r2',
    'cloudflare_stream',
    'bunny_stream',
    'gofile',
    'other'
  ));

alter table public.media_assets enable row level security;

create index if not exists media_assets_title_active_idx
  on public.media_assets(title_id, active, processing_status);

create index if not exists media_assets_episode_active_idx
  on public.media_assets(episode_id, active, processing_status);

-- GoFile direct links are public by design. Playback authorization is still enforced
-- by MovieLab's rights function before the URL is returned to an authenticated client.

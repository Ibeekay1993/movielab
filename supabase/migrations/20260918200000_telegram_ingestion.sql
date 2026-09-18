create table if not exists public.telegram_channels (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null unique,
  username text,
  title text not null,
  chat_type text not null check (chat_type in ('channel','group','supergroup')),
  connection_mode text not null default 'bot' check (connection_mode in ('bot','mtproto')),
  status text not null default 'pending' check (status in ('pending','active','paused','revoked')),
  permission_confirmed boolean not null default false,
  auto_publish boolean not null default false,
  permission_confirmed_at timestamptz,
  permission_notes text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_admins (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_channel_admins (
  channel_id uuid not null references public.telegram_channels(id) on delete cascade,
  admin_id uuid not null references public.telegram_admins(id) on delete cascade,
  role text not null default 'partner_admin',
  created_at timestamptz not null default now(),
  primary key (channel_id, admin_id)
);

create table if not exists public.telegram_media (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.telegram_channels(id) on delete cascade,
  telegram_message_id bigint not null,
  telegram_file_id text,
  telegram_file_unique_id text,
  media_kind text not null check (media_kind in ('video','document')),
  file_name text,
  mime_type text,
  file_size bigint,
  duration_seconds integer,
  width integer,
  height integer,
  caption text,
  message_url text,
  source_message jsonb not null default '{}',
  title_id uuid references public.titles(id) on delete set null,
  episode_id uuid references public.episodes(id) on delete set null,
  ingestion_status text not null default 'queued' check (ingestion_status in ('queued','processing','matched','review','published','rejected','failed')),
  match_confidence numeric(5,4),
  extracted_title text,
  extracted_year integer,
  extracted_season integer,
  extracted_episode integer,
  quality_label text,
  language_hint text,
  error_message text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, telegram_message_id)
);

create table if not exists public.telegram_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  telegram_media_id uuid not null references public.telegram_media(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  title_id uuid references public.titles(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  provider_type text not null check (provider_type in ('telegram','supabase_storage','s3','r2','other')),
  provider_asset_id text not null,
  telegram_media_id uuid references public.telegram_media(id) on delete set null,
  quality_label text,
  mime_type text,
  duration_seconds integer,
  file_size bigint,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check ((title_id is not null) <> (episode_id is not null)),
  unique (provider_type, provider_asset_id)
);

create index if not exists telegram_media_status_idx on public.telegram_media(ingestion_status, first_seen_at);
create index if not exists telegram_media_title_idx on public.telegram_media(title_id);
create index if not exists telegram_media_episode_idx on public.telegram_media(episode_id);
create index if not exists telegram_jobs_ready_idx on public.telegram_ingestion_jobs(status, available_at);
create index if not exists telegram_channels_status_idx on public.telegram_channels(status);

alter table public.telegram_channels enable row level security;
alter table public.telegram_admins enable row level security;
alter table public.telegram_channel_admins enable row level security;
alter table public.telegram_media enable row level security;
alter table public.telegram_ingestion_jobs enable row level security;
alter table public.media_assets enable row level security;

-- These tables are service-role controlled. No browser policy is granted.
-- Public clients must use approved Edge Functions/RPCs for ingestion and playback.
create or replace function public.claim_telegram_ingestion_job(worker_id text)
returns public.telegram_ingestion_jobs
language plpgsql
security definer
set search_path = public
as $$
declare result_row public.telegram_ingestion_jobs;
begin
  update public.telegram_ingestion_jobs
  set status='processing', locked_at=now(), locked_by=worker_id, attempts=attempts+1
  where id = (
    select j.id
    from public.telegram_ingestion_jobs j
    where j.status='queued' and j.available_at <= now()
    order by j.created_at
    for update skip locked
    limit 1
  )
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.claim_telegram_ingestion_job(text) from public, anon, authenticated;
grant execute on function public.claim_telegram_ingestion_job(text) to service_role;

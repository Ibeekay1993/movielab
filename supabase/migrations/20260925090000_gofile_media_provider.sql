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


-- Backfill the source registry for projects where the earlier source-control
-- migration has already been applied.
insert into public.source_connectors
  (connector_key, display_name, source_class, enabled, authorization_required)
values
  ('gofile', 'GoFile', 'media', true, true)
on conflict (connector_key) do update set
  display_name = excluded.display_name,
  source_class = excluded.source_class,
  updated_at = now();

-- Correct episode rights resolution for already-deployed databases:
-- an episode inherits streaming rights from its parent series title.
drop function if exists public.get_playable_media(uuid,uuid);
create or replace function public.get_playable_media(
  p_title_id uuid,
  p_episode_id uuid default null,
  p_territory text default 'NG'
)
returns table (
  id uuid,
  provider_type text,
  playback_id text,
  playback_url text,
  quality_label text,
  mime_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ma.id,
    ma.provider_type,
    ma.playback_id,
    ma.playback_url,
    ma.quality_label,
    ma.mime_type
  from public.media_assets ma
  where ma.active = true
    and ma.processing_status = 'ready'
    and ma.rights_status in ('authorized','licensed')
    and (
      (p_episode_id is not null and ma.episode_id = p_episode_id)
      or
      (p_episode_id is null and ma.title_id = p_title_id)
    )
    and exists (
      select 1
      from public.rights r
      where r.title_id = coalesce(
        ma.title_id,
        (
          select s.title_id
          from public.episodes e
          join public.seasons s on s.id = e.season_id
          where e.id = ma.episode_id
          limit 1
        )
      )
        and r.territory_code = upper(p_territory)
        and r.rights_type = 'streaming'
        and r.status = 'active'
        and r.starts_at <= now()
        and (r.ends_at is null or r.ends_at > now())
    )
  order by
    case
      when ma.quality_label ilike '%2160%' or ma.quality_label ilike '%4k%' then 1
      when ma.quality_label ilike '%1080%' then 2
      when ma.quality_label ilike '%720%' then 3
      when ma.quality_label ilike '%480%' then 4
      else 9
    end,
    ma.created_at desc;
$$;

revoke all on function public.get_playable_media(uuid,uuid,text) from public, anon;
grant execute on function public.get_playable_media(uuid,uuid,text) to authenticated, service_role;

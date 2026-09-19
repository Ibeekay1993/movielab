-- Unified source registry. Existing Telegram, metadata providers and web sources remain intact;
-- this table gives MovieLab a common control plane for future connectors such as X and partner APIs.
create table if not exists public.source_connectors (
  id uuid primary key default gen_random_uuid(),
  connector_key text not null unique,
  display_name text not null,
  source_class text not null check (source_class in ('media','metadata','availability','discovery')),
  enabled boolean not null default true,
  authorization_required boolean not null default true,
  configuration jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.source_connectors
(connector_key,display_name,source_class,enabled,authorization_required)
values
('telegram','Telegram','media',true,true),
('movielab_upload','MovieLab CMS Upload','media',true,true),
('tmdb','TMDB','metadata',true,true),
('tvmaze','TVmaze','metadata',true,true),
('omdb','OMDb','metadata',true,true),
('watchmode','Watchmode','availability',true,true),
('x','X / Twitter','discovery',true,true),
('partner_api','Partner API','media',true,true),
('web_source','Authorized Web Source','discovery',true,true)
on conflict (connector_key) do update set
 display_name=excluded.display_name,
 source_class=excluded.source_class,
 updated_at=now();

alter table public.source_connectors enable row level security;
create policy "enabled_source_connectors_read" on public.source_connectors for select using (enabled=true);
create index if not exists source_connectors_class_idx on public.source_connectors(source_class,enabled);

-- Tighten playback: a playable asset must have current territory rights.
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
  select ma.id, ma.provider_type, ma.playback_id, ma.playback_url, ma.quality_label, ma.mime_type
  from public.media_assets ma
  where ma.active = true
    and ma.processing_status = 'ready'
    and ma.rights_status in ('authorized','licensed')
    and ((p_episode_id is not null and ma.episode_id = p_episode_id)
      or (p_episode_id is null and ma.title_id = p_title_id))
    and exists (
      select 1
      from public.rights r
      where r.title_id = coalesce(ma.title_id, (select e.season_id from public.episodes e where e.id=ma.episode_id limit 1))
        and r.territory_code = upper(p_territory)
        and r.rights_type = 'streaming'
        and r.status = 'active'
        and r.starts_at <= now()
        and (r.ends_at is null or r.ends_at > now())
    )
  order by
    case when ma.quality_label ilike '%1080%' then 1
         when ma.quality_label ilike '%720%' then 2
         when ma.quality_label ilike '%480%' then 3
         else 9 end,
    ma.created_at desc;
$$;

revoke all on function public.get_playable_media(uuid,uuid,text) from public, anon;
grant execute on function public.get_playable_media(uuid,uuid,text) to authenticated, service_role;

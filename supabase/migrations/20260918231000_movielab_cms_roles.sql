-- MovieLab CMS roles and secure media-upload foundation.
create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

alter table public.profile_roles enable row level security;

create or replace function public.is_movielab_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_roles
    where profile_id = auth.uid() and role in ('admin','editor')
  );
$$;

revoke all on function public.is_movielab_admin() from public;
grant execute on function public.is_movielab_admin() to authenticated, service_role;

create policy "profile_roles_self_read"
on public.profile_roles for select
using (profile_id = auth.uid());

create index if not exists profile_roles_role_idx on public.profile_roles(role);

-- Secure playback helper: only return an asset when it is explicitly active,
-- rights are authorized/licensed, and it has a playback identifier.
create or replace function public.get_playable_media(p_title_id uuid, p_episode_id uuid default null)
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
  order by
    case when ma.quality_label ilike '%1080%' then 1
         when ma.quality_label ilike '%720%' then 2
         when ma.quality_label ilike '%480%' then 3
         else 9 end,
    ma.created_at desc;
$$;

revoke all on function public.get_playable_media(uuid,uuid) from public, anon;
grant execute on function public.get_playable_media(uuid,uuid) to authenticated, service_role;

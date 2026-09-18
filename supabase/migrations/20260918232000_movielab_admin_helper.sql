create or replace function public.is_movielab_admin_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_roles
    where profile_id = p_user_id and role in ('admin','editor')
  );
$$;

revoke all on function public.is_movielab_admin_for_user(uuid) from public, anon, authenticated;
grant execute on function public.is_movielab_admin_for_user(uuid) to service_role;

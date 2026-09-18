create table if not exists public.metadata_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  name text not null,
  kind text not null check (kind in ('metadata','availability')),
  base_url text,
  enabled boolean not null default true,
  commercial_use_allowed boolean not null default false,
  attribution_required boolean not null default true,
  cache_days integer,
  license_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.title_metadata_sources (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  provider_id uuid not null references public.metadata_providers(id) on delete cascade,
  external_id text not null,
  source_url text,
  raw_metadata jsonb not null default '{}',
  fetched_at timestamptz not null default now(),
  unique(provider_id, external_id)
);

create table if not exists public.provider_availability_cache (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles(id) on delete cascade,
  provider_id uuid not null references public.metadata_providers(id) on delete cascade,
  territory_code text not null,
  payload jsonb not null default '{}',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(title_id, provider_id, territory_code)
);

insert into public.metadata_providers
(provider_key,name,kind,base_url,enabled,commercial_use_allowed,attribution_required,cache_days,license_notes)
values
('tmdb','The Movie Database','metadata','https://api.themoviedb.org/3',true,false,true,null,'Free developer API is non-commercial; commercial use requires a separate license.'),
('tvmaze','TVmaze','metadata','https://api.tvmaze.com',true,true,true,null,'Public API is CC BY-SA with attribution/share-alike requirements.'),
('watchmode','Watchmode','availability','https://api.watchmode.com/v1',true,false,true,30,'Developer plan provides 2,500 monthly credits for non-commercial use; free-plan cached data must be refreshed or deleted within 30 days.')
on conflict (provider_key) do update set
  name=excluded.name, kind=excluded.kind, base_url=excluded.base_url,
  commercial_use_allowed=excluded.commercial_use_allowed,
  attribution_required=excluded.attribution_required,
  cache_days=excluded.cache_days,
  license_notes=excluded.license_notes,
  updated_at=now();

alter table public.metadata_providers enable row level security;
alter table public.title_metadata_sources enable row level security;
alter table public.provider_availability_cache enable row level security;

create policy "metadata_providers_read" on public.metadata_providers for select using (enabled = true);
create policy "title_metadata_sources_read" on public.title_metadata_sources for select using (
  exists (select 1 from public.titles t where t.id = title_id and t.status = 'published')
);
create policy "provider_availability_cache_read" on public.provider_availability_cache for select using (
  exists (select 1 from public.titles t where t.id = title_id and t.status = 'published')
);

create index if not exists title_metadata_sources_title_idx on public.title_metadata_sources(title_id);
create index if not exists provider_availability_cache_title_idx on public.provider_availability_cache(title_id,territory_code);

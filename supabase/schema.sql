-- Kaptei: tabelas para guardar listas, leads e scripts no Supabase.
-- Rode este arquivo no SQL Editor do projeto novo (ou peça ao Claude Code para aplicar).
-- Cada registro pertence ao usuário logado (auth.users), protegido por RLS.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id text not null,                 -- ex.: osm:node/123 ou cnpj:00000000000191
  source text,                             -- Mapa aberto, Receita Federal...
  name text not null,
  razao_social text,
  category text,
  cnpj text,
  phones text[] not null default '{}',
  whatsapp text[] not null default '{}',
  email text,
  website text,
  instagram text,
  facebook text,
  linkedin text,
  address text,
  city text,
  uf text,
  socios jsonb not null default '[]',
  list_id uuid references public.lists(id) on delete set null,
  status text not null default 'novo' check (status in ('novo','contatado','respondeu','cliente','descartado')),
  notes text,
  last_script text,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_id)
);
create index if not exists leads_owner_status_idx on public.leads (owner_id, status);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

alter table public.lists   enable row level security;
alter table public.leads   enable row level security;
alter table public.scripts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lists','leads','scripts'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

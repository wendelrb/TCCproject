-- SHIM DE TESTE — recria o contrato do Supabase que as policies consomem.
--
-- ESTE ARQUIVO NUNCA VAI PARA /supabase/migrations. Em produção, quem fornece
-- schema auth, roles e auth.uid() é o próprio Supabase. Aqui ele existe só para
-- que as MESMAS migrations de produção rodem contra um Postgres puro.
--
-- Roda ANTES das migrations: auth.users precisa existir para as FKs.
-- Ver ASSUMPTIONS.md A-001.

create schema if not exists auth;

-- Subconjunto de auth.users suficiente para as chaves estrangeiras.
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- BYPASSRLS é o que distingue o service_role no Supabase real. É também o
  -- motivo de a imutabilidade de forecasts morar em TRIGGER e não em policy:
  -- BYPASSRLS pula policy, não pula trigger.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Réplica fiel da implementação do Supabase, incluindo o fallback para a claim
-- individual usada por versões mais antigas do GoTrue.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

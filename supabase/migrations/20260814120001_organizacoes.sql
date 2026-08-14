-- Tarefa 1 — multi-tenancy: organizações e vínculo usuário↔organização.
--
-- RLS é habilitada AQUI, junto com a criação das tabelas. As policies só chegam
-- na migration seguinte (dependem de funções que dependem destas tabelas).
-- RLS habilitada sem policy nenhuma = nega tudo. A janela intermediária é
-- fechada, nunca aberta.

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) between 1 and 200),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.organizations is
  'Tenant. Toda tabela com dado de cliente aponta para cá via organization_id.';

create type public.papel_organizacao as enum ('proprietario', 'membro');

create table public.users_organizations (
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  papel           public.papel_organizacao not null default 'membro',
  criado_em       timestamptz not null default now(),
  primary key (user_id, organization_id)
);

comment on table public.users_organizations is
  'Associação N:N. É dado de cliente: quem pertence a qual organização não pode '
  'vazar entre tenants.';

create index users_organizations_organization_id_idx
  on public.users_organizations (organization_id);

alter table public.organizations       enable row level security;
alter table public.users_organizations enable row level security;

-- Mantém atualizado_em honesto sem depender da aplicação.
create or replace function public.toca_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger organizations_toca_atualizado_em
  before update on public.organizations
  for each row execute function public.toca_atualizado_em();

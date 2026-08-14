-- Tarefa 1 — funções de pertencimento e policies das tabelas de tenant.
--
-- POR QUE SECURITY DEFINER (ver ASSUMPTIONS.md A-002):
-- a policy idiomática `using (exists (select 1 from users_organizations ...))`
-- retorna ZERO linhas quando users_organizations também tem RLS ligada — a
-- subconsulta é filtrada pela própria RLS junto com a query externa. Verificado
-- empiricamente. A checagem precisa rodar com os privilégios do dono da função.
--
-- search_path fixo + revoke de PUBLIC são obrigatórios em SECURITY DEFINER:
-- sem isso a função vira vetor de escalada de privilégio.

create or replace function public.orgs_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id
    from public.users_organizations
   where user_id = auth.uid()
$$;

comment on function public.orgs_do_usuario() is
  'Organizações do usuário autenticado. SECURITY DEFINER para não ser filtrada '
  'pela RLS de users_organizations.';

create or replace function public.eh_membro(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.users_organizations
     where user_id = auth.uid()
       and organization_id = p_organization_id
  )
$$;

comment on function public.eh_membro(uuid) is
  'Predicado de pertencimento usado por toda policy de tabela com dado de cliente.';

revoke all on function public.orgs_do_usuario()  from public;
revoke all on function public.eh_membro(uuid)    from public;
grant execute on function public.orgs_do_usuario() to authenticated;
grant execute on function public.eh_membro(uuid)   to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
--
-- v1: escrita em organizations/users_organizations acontece só pelo service_role
-- (Edge Function), que tem BYPASSRLS. Nenhuma policy de INSERT/UPDATE/DELETE
-- para `authenticated` é criada aqui — convite e criação de organização não
-- estão no escopo da Tarefa 1. Ver ASSUMPTIONS.md A-004.
-- ---------------------------------------------------------------------------

create policy organizations_select_membro
  on public.organizations
  for select
  to authenticated
  using (public.eh_membro(id));

create policy users_organizations_select_membro
  on public.users_organizations
  for select
  to authenticated
  using (public.eh_membro(organization_id));

grant select on public.organizations       to authenticated;
grant select on public.users_organizations to authenticated;

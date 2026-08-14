-- Tarefa 1 — abastecimentos importados por CSV. Dado de cliente: RLS por
-- organização em todas as operações.
--
-- RESTRIÇÃO DE PRIVACIDADE (decisão fechada, CLAUDE.md):
-- aceita-se SOMENTE data, UF, município, litros, valor total, produto.
-- Placa, nome de motorista, CPF e qualquer outro dado pessoal são rejeitados
-- na importação e NÃO têm coluna aqui. O schema é o último ponto de recusa:
-- não existe onde guardar, nem "por precaução".
--
-- O arquivo CSV original também não é persistido — ele pode conter justamente
-- as colunas rejeitadas. Guarda-se o hash do conteúdo e os NOMES das colunas
-- recusadas, nunca os valores.
--
-- Um teste automatizado trava o conjunto exato de colunas de fuel_purchases:
-- migration futura que adicione `placa` quebra a suíte.

create table public.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  criado_por         uuid references auth.users(id) on delete set null,

  arquivo_nome       text,
  conteudo_hash      text not null,

  linhas_recebidas   integer not null check (linhas_recebidas   >= 0),
  linhas_aceitas     integer not null check (linhas_aceitas     >= 0),
  linhas_rejeitadas  integer not null check (linhas_rejeitadas  >= 0),
  colunas_rejeitadas text[] not null default '{}',

  criado_em          timestamptz not null default now(),

  constraint import_batches_contagem_coerente
    check (linhas_aceitas + linhas_rejeitadas = linhas_recebidas),

  -- Idempotência no nível do lote: reenviar o mesmo arquivo para a mesma
  -- organização colide aqui. Não se deduplica por linha, porque dois
  -- abastecimentos idênticos no mesmo dia são legítimos e perder um seria
  -- descartar dado real do cliente.
  constraint import_batches_conteudo_uk
    unique (organization_id, conteudo_hash)
);

comment on column public.import_batches.colunas_rejeitadas is
  'Apenas os NOMES das colunas recusadas por conterem dado pessoal, para a '
  'mensagem ao usuário e auditoria. Jamais os valores.';

create table public.fuel_purchases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,

  data            date not null,
  uf              text not null check (uf ~ '^[A-Z]{2}$'),
  municipio       text not null,
  municipio_norm  text not null,
  municipio_ibge  text references public.municipios(codigo_ibge),
  produto         public.produto_combustivel not null,
  litros          numeric(12,3) not null check (litros > 0),
  valor_total     numeric(14,2) not null check (valor_total > 0),

  preco_litro     numeric(12,6) generated always as (valor_total / litros) stored,

  criado_em       timestamptz not null default now()
);

comment on table public.fuel_purchases is
  'Abastecimentos do cliente. Conjunto de colunas travado por teste automatizado '
  'pela restrição de privacidade — ver CLAUDE.md.';

create index fuel_purchases_org_data_idx
  on public.fuel_purchases (organization_id, data desc);
create index fuel_purchases_org_regiao_idx
  on public.fuel_purchases (organization_id, uf, municipio_norm);
create index fuel_purchases_import_batch_idx
  on public.fuel_purchases (import_batch_id);

alter table public.import_batches enable row level security;
alter table public.fuel_purchases enable row level security;

-- Policies por operação. USING filtra o que já existe; WITH CHECK impede
-- gravar linha carimbada com organização alheia.
create policy import_batches_select on public.import_batches
  for select to authenticated using (public.eh_membro(organization_id));
create policy import_batches_insert on public.import_batches
  for insert to authenticated with check (public.eh_membro(organization_id));
create policy import_batches_update on public.import_batches
  for update to authenticated
  using (public.eh_membro(organization_id))
  with check (public.eh_membro(organization_id));
create policy import_batches_delete on public.import_batches
  for delete to authenticated using (public.eh_membro(organization_id));

create policy fuel_purchases_select on public.fuel_purchases
  for select to authenticated using (public.eh_membro(organization_id));
create policy fuel_purchases_insert on public.fuel_purchases
  for insert to authenticated with check (public.eh_membro(organization_id));
create policy fuel_purchases_update on public.fuel_purchases
  for update to authenticated
  using (public.eh_membro(organization_id))
  with check (public.eh_membro(organization_id));
create policy fuel_purchases_delete on public.fuel_purchases
  for delete to authenticated using (public.eh_membro(organization_id));

grant select, insert, update, delete on public.import_batches to authenticated;
grant select, insert, update, delete on public.fuel_purchases to authenticated;

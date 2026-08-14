-- Tarefa 1 — dados públicos de referência: municípios, quebras de série,
-- preços ANP e câmbio PTAX.
--
-- Estas tabelas NÃO contêm dado de cliente. Mesmo assim levam RLS habilitada,
-- com policy de leitura para qualquer autenticado e nenhuma policy de escrita:
-- só o service_role (BYPASSRLS) escreve, a partir das Edge Functions de
-- ingestão. Nenhuma linha é inserida aqui — as tabelas nascem vazias e são
-- preenchidas nas Tarefas 2 e 3 a partir das fontes reais.

-- ---------------------------------------------------------------------------
-- Municípios (referência IBGE) — populada na Tarefa 2, nasce vazia.
-- ---------------------------------------------------------------------------
create table public.municipios (
  codigo_ibge text primary key check (codigo_ibge ~ '^[0-9]{7}$'),
  nome        text not null,
  nome_norm   text not null,
  uf          text not null check (uf ~ '^[A-Z]{2}$'),
  fonte       text not null,
  coletado_em timestamptz not null default now()
);

comment on column public.municipios.nome_norm is
  'Nome em caixa alta e sem acento. Chave de casamento com o arquivo da ANP, '
  'que não publica código IBGE.';

create index municipios_uf_nome_norm_idx on public.municipios (uf, nome_norm);

-- ---------------------------------------------------------------------------
-- Quebras de série. Exigido pela SPEC §4: mudança de nomenclatura do produto e
-- mudança de metodologia da pesquisa são quebras e precisam ser documentadas.
-- ---------------------------------------------------------------------------
create type public.tipo_quebra as enum ('NOMENCLATURA', 'METODOLOGIA', 'COBERTURA');

create table public.source_breaks (
  id            uuid primary key default gen_random_uuid(),
  fonte         text not null,
  tipo          public.tipo_quebra not null,
  vigente_de    date not null,
  vigente_ate   date,
  descricao     text not null,
  evidencia_url text,
  registrado_em timestamptz not null default now(),
  check (vigente_ate is null or vigente_ate >= vigente_de)
);

-- ---------------------------------------------------------------------------
-- Preços ANP
-- ---------------------------------------------------------------------------
create type public.nivel_geo as enum ('UF', 'MUNICIPIO');

-- Escopo da v1 é diesel S-10. O enum canônico existe para que a nomenclatura
-- variável da ANP ("ÓLEO DIESEL S10", "ÓLEO DIESEL S10 COMUM", ...) colapse num
-- valor só; a string exata publicada fica em produto_fonte, sem perda.
create type public.produto_combustivel as enum ('DIESEL_S10');

create table public.fuel_prices (
  id                          uuid primary key default gen_random_uuid(),

  semana_inicio               date not null,
  semana_fim                  date not null,

  nivel                       public.nivel_geo not null,
  uf                          text not null check (uf ~ '^[A-Z]{2}$'),
  municipio                   text,
  municipio_norm              text,
  municipio_ibge              text references public.municipios(codigo_ibge),

  produto                     public.produto_combustivel not null,
  produto_fonte               text not null,
  unidade                     text not null,

  preco_medio_revenda         numeric(10,4),
  desvio_padrao_revenda       numeric(10,4),
  preco_min_revenda           numeric(10,4),
  preco_max_revenda           numeric(10,4),
  num_postos_revenda          integer check (num_postos_revenda >= 0),

  preco_medio_distribuicao    numeric(10,4),
  desvio_padrao_distribuicao  numeric(10,4),
  preco_min_distribuicao      numeric(10,4),
  preco_max_distribuicao      numeric(10,4),
  num_postos_distribuicao     integer check (num_postos_distribuicao >= 0),

  fonte                       text not null,
  coletado_em                 timestamptz not null default now(),
  revisao                     integer not null default 1 check (revisao >= 1),

  constraint fuel_prices_semana_coerente
    check (semana_fim > semana_inicio),

  -- Nível UF não carrega município; nível município exige o nome normalizado.
  -- O código IBGE é enriquecimento e pode faltar (nome sem correspondência),
  -- caso em que a Tarefa 2 reporta em vez de inventar.
  constraint fuel_prices_nivel_coerente check (
    (nivel = 'UF'        and municipio is null     and municipio_norm is null)
 or (nivel = 'MUNICIPIO' and municipio is not null and municipio_norm is not null)
  ),

  constraint fuel_prices_faixa_revenda
    check (preco_min_revenda is null or preco_max_revenda is null
           or preco_min_revenda <= preco_max_revenda),
  constraint fuel_prices_faixa_distribuicao
    check (preco_min_distribuicao is null or preco_max_distribuicao is null
           or preco_min_distribuicao <= preco_max_distribuicao)
);

comment on table public.fuel_prices is
  'Levantamento semanal de preços da ANP. Uma linha por semana × granularidade × '
  'produto. Idempotência garantida pelos índices únicos parciais abaixo.';

-- Chave natural — é o que torna a ingestão idempotente. Rodar duas vezes na
-- mesma semana colide aqui em vez de duplicar.
create unique index fuel_prices_uf_uk
  on public.fuel_prices (semana_inicio, uf, produto)
  where nivel = 'UF';

create unique index fuel_prices_municipio_uk
  on public.fuel_prices (semana_inicio, uf, municipio_norm, produto)
  where nivel = 'MUNICIPIO';

create index fuel_prices_serie_uf_idx
  on public.fuel_prices (uf, produto, semana_inicio desc)
  where nivel = 'UF';

-- ---------------------------------------------------------------------------
-- Revisões da ANP.
--
-- Se a ANP republicar uma semana com valor corrigido, um upsert simples apagaria
-- o valor COMO ELE ERA CONHECIDO na hora em que a previsão foi feita — e a regra
-- de não-vazamento temporal depende exatamente disso. Antes de sobrescrever,
-- arquiva-se o valor anterior aqui.
-- ---------------------------------------------------------------------------
create table public.fuel_prices_revisoes (
  id             uuid primary key default gen_random_uuid(),
  fuel_price_id  uuid not null references public.fuel_prices(id) on delete cascade,
  revisao        integer not null,
  valores        jsonb not null,
  coletado_em    timestamptz not null,
  arquivado_em   timestamptz not null default now()
);

create index fuel_prices_revisoes_fuel_price_id_idx
  on public.fuel_prices_revisoes (fuel_price_id, revisao desc);

create or replace function public.arquiva_revisao_fuel_price()
returns trigger
language plpgsql
as $$
declare
  v_antigo jsonb;
  v_novo   jsonb;
begin
  -- Só os campos de valor entram na comparação. coletado_em muda a cada
  -- execução e não pode, sozinho, caracterizar revisão — senão a ingestão
  -- deixaria de ser idempotente.
  v_antigo := jsonb_build_object(
    'preco_medio_revenda',        old.preco_medio_revenda,
    'desvio_padrao_revenda',      old.desvio_padrao_revenda,
    'preco_min_revenda',          old.preco_min_revenda,
    'preco_max_revenda',          old.preco_max_revenda,
    'num_postos_revenda',         old.num_postos_revenda,
    'preco_medio_distribuicao',   old.preco_medio_distribuicao,
    'desvio_padrao_distribuicao', old.desvio_padrao_distribuicao,
    'preco_min_distribuicao',     old.preco_min_distribuicao,
    'preco_max_distribuicao',     old.preco_max_distribuicao,
    'num_postos_distribuicao',    old.num_postos_distribuicao,
    'produto_fonte',              old.produto_fonte,
    'unidade',                    old.unidade
  );
  v_novo := jsonb_build_object(
    'preco_medio_revenda',        new.preco_medio_revenda,
    'desvio_padrao_revenda',      new.desvio_padrao_revenda,
    'preco_min_revenda',          new.preco_min_revenda,
    'preco_max_revenda',          new.preco_max_revenda,
    'num_postos_revenda',         new.num_postos_revenda,
    'preco_medio_distribuicao',   new.preco_medio_distribuicao,
    'desvio_padrao_distribuicao', new.desvio_padrao_distribuicao,
    'preco_min_distribuicao',     new.preco_min_distribuicao,
    'preco_max_distribuicao',     new.preco_max_distribuicao,
    'num_postos_distribuicao',    new.num_postos_distribuicao,
    'produto_fonte',              new.produto_fonte,
    'unidade',                    new.unidade
  );

  if v_antigo is distinct from v_novo then
    insert into public.fuel_prices_revisoes
      (fuel_price_id, revisao, valores, coletado_em)
    values
      (old.id, old.revisao, v_antigo, old.coletado_em);
    new.revisao := old.revisao + 1;
  else
    -- Reingestão sem mudança de valor: preserva a revisão corrente.
    new.revisao := old.revisao;
  end if;

  return new;
end;
$$;

create trigger fuel_prices_arquiva_revisao
  before update on public.fuel_prices
  for each row execute function public.arquiva_revisao_fuel_price();

-- ---------------------------------------------------------------------------
-- Câmbio PTAX (Banco Central) — populada na Tarefa 3, nasce vazia.
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  data            date not null,
  moeda           text not null default 'USD' check (moeda ~ '^[A-Z]{3}$'),
  cotacao_compra  numeric(12,6) not null check (cotacao_compra > 0),
  cotacao_venda   numeric(12,6) not null check (cotacao_venda > 0),
  fonte           text not null,
  coletado_em     timestamptz not null default now(),
  primary key (data, moeda)
);

-- ---------------------------------------------------------------------------
-- RLS: leitura pública para autenticados, escrita só service_role.
-- ---------------------------------------------------------------------------
alter table public.municipios           enable row level security;
alter table public.source_breaks        enable row level security;
alter table public.fuel_prices          enable row level security;
alter table public.fuel_prices_revisoes enable row level security;
alter table public.fx_rates             enable row level security;

create policy municipios_select_autenticado
  on public.municipios for select to authenticated using (true);
create policy source_breaks_select_autenticado
  on public.source_breaks for select to authenticated using (true);
create policy fuel_prices_select_autenticado
  on public.fuel_prices for select to authenticated using (true);
create policy fuel_prices_revisoes_select_autenticado
  on public.fuel_prices_revisoes for select to authenticated using (true);
create policy fx_rates_select_autenticado
  on public.fx_rates for select to authenticated using (true);

grant select on public.municipios           to authenticated;
grant select on public.source_breaks        to authenticated;
grant select on public.fuel_prices          to authenticated;
grant select on public.fuel_prices_revisoes to authenticated;
grant select on public.fx_rates             to authenticated;

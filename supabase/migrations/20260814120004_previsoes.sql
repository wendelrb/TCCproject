-- Tarefa 1 — previsões, execuções e realizados.
--
-- SPEC §5: "Toda previsão é gravada em tabela imutável, com o realizado
-- preenchido depois. Sem esse registro não existe placar de acurácia."
-- A imutabilidade aqui é imposta por trigger, não por convenção.

create type public.classe_previsao as enum ('ALTA', 'ESTAVEL', 'QUEDA');

-- ---------------------------------------------------------------------------
-- Execuções do modelo.
--
-- dados_ate é a prova auditável da regra de não-vazamento: nenhuma feature
-- usada para prever t+h pode vir de informação publicada depois de t. Sem esse
-- campo, a afirmação "não houve vazamento" é indemonstrável depois do fato.
-- ---------------------------------------------------------------------------
create table public.forecast_runs (
  id             uuid primary key default gen_random_uuid(),
  executado_em   timestamptz not null default now(),
  modelo_versao  text not null,
  codigo_git_sha text,
  dados_ate      date not null,
  semana_origem  date not null,
  observacao     text,
  check (dados_ate >= semana_origem)
);

comment on column public.forecast_runs.dados_ate is
  'Data de corte: nenhuma informação publicada depois desta data entrou na '
  'execução. Inclui escalonadores, seleção de janela e ajuste de parâmetro.';

-- ---------------------------------------------------------------------------
-- Previsões (IMUTÁVEL)
-- ---------------------------------------------------------------------------
create table public.forecasts (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.forecast_runs(id) on delete restrict,
  criado_em         timestamptz not null default now(),

  uf                text not null check (uf ~ '^[A-Z]{2}$'),
  horizonte_semanas smallint not null check (horizonte_semanas between 1 and 4),
  semana_alvo       date not null,

  valor_previsto    numeric(10,4) not null,
  p10               numeric(10,4) not null,
  p90               numeric(10,4) not null,
  classe            public.classe_previsao not null,
  modelo_versao     text not null,

  -- O naive entra nesta mesma tabela como modelo_versao próprio, para que o
  -- placar "modelo vs naive" seja uma query só, sobre o mesmo registro imutável.
  oficial           boolean not null default false,

  constraint forecasts_intervalo_coerente
    check (p10 <= valor_previsto and valor_previsto <= p90)
);

-- Uma previsão por UF e horizonte dentro de cada execução.
create unique index forecasts_run_uk
  on public.forecasts (run_id, uf, horizonte_semanas);

-- Só uma previsão OFICIAL por UF × horizonte × semana-alvo × modelo. Reexecução
-- na mesma semana (correção de bug) grava run nova, mas não pode reescrever o
-- que já foi cravado para o placar.
create unique index forecasts_oficial_uk
  on public.forecasts (uf, horizonte_semanas, semana_alvo, modelo_versao)
  where oficial;

create index forecasts_semana_alvo_idx
  on public.forecasts (uf, semana_alvo, horizonte_semanas);

create or replace function public.bloqueia_mutacao()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'tabela %.% é imutável: correção entra como nova execução em forecast_runs, nunca como % ',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- Trigger vale para TODOS os papéis, inclusive service_role. BYPASSRLS pula
-- policy, não pula trigger — que é justamente por isso que a imutabilidade
-- mora aqui e não numa policy.
create trigger forecasts_imutavel
  before update or delete on public.forecasts
  for each row execute function public.bloqueia_mutacao();

-- ---------------------------------------------------------------------------
-- Realizados
-- ---------------------------------------------------------------------------
create table public.forecast_outcomes (
  forecast_id      uuid primary key references public.forecasts(id) on delete restrict,
  semana_alvo      date not null,
  valor_realizado  numeric(10,4) not null,
  fonte_realizado  text not null,
  preenchido_em    timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table public.forecast_outcomes is
  'Realizado preenchido depois. Mutável de propósito: se a ANP revisar a semana '
  'realizada, o realizado acompanha. A previsão, essa, não muda nunca. '
  'Ver ASSUMPTIONS.md A-005.';

create trigger forecast_outcomes_toca_atualizado_em
  before update on public.forecast_outcomes
  for each row execute function public.toca_atualizado_em();

-- ---------------------------------------------------------------------------
-- Placar. Erro por linha, sem agregação — as métricas da SPEC §5 (RMSE, MAE,
-- MASE, direcional, PICP) são construídas em cima disto na Tarefa 4.
-- security_invoker garante que a view não vire porta dos fundos para a RLS.
-- ---------------------------------------------------------------------------
create view public.v_forecast_placar
with (security_invoker = true)
as
select
  f.id                as forecast_id,
  f.run_id,
  f.uf,
  f.horizonte_semanas,
  f.semana_alvo,
  f.modelo_versao,
  f.oficial,
  f.valor_previsto,
  f.p10,
  f.p90,
  f.classe,
  o.valor_realizado,
  o.valor_realizado - f.valor_previsto            as erro,
  abs(o.valor_realizado - f.valor_previsto)       as erro_absoluto,
  (o.valor_realizado between f.p10 and f.p90)     as dentro_do_intervalo
from public.forecasts f
left join public.forecast_outcomes o on o.forecast_id = f.id;

alter table public.forecast_runs      enable row level security;
alter table public.forecasts          enable row level security;
alter table public.forecast_outcomes  enable row level security;

create policy forecast_runs_select_autenticado
  on public.forecast_runs for select to authenticated using (true);
create policy forecasts_select_autenticado
  on public.forecasts for select to authenticated using (true);
create policy forecast_outcomes_select_autenticado
  on public.forecast_outcomes for select to authenticated using (true);

grant select on public.forecast_runs     to authenticated;
grant select on public.forecasts         to authenticated;
grant select on public.forecast_outcomes to authenticated;
grant select on public.v_forecast_placar to authenticated;

import { comoUsuario } from './db.ts';
import type { UsuarioDemo } from './demo.ts';

export interface PontoSerie {
  readonly semana: string;
  readonly valor: number;
}

export interface PrecoAtual {
  readonly semana: string;
  readonly uf: number | null;
  readonly municipio: number | null;
  readonly variacaoSemanal: number | null;
  readonly numPostos: number | null;
  readonly minRegiao: number | null;
  readonly maxRegiao: number | null;
}

export interface Benchmark {
  readonly litros: number;
  readonly valorTotal: number;
  readonly precoMedioPago: number;
  readonly precoMedioRegiao: number;
  readonly diferencaPercentual: number;
  readonly compras: number;
  readonly excedente: number;
}

export interface Previsao {
  readonly horizonte: number;
  readonly semanaAlvo: string;
  readonly valor: number;
  readonly p10: number;
  readonly p90: number;
  readonly classe: 'ALTA' | 'ESTAVEL' | 'QUEDA';
}

export interface PlacarModelo {
  readonly modelo: string;
  readonly n: number;
  readonly mae: number;
  readonly rmse: number;
  readonly picp: number;
  readonly direcional: number;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export async function historicoUf(u: UsuarioDemo, semanas = 104): Promise<PontoSerie[]> {
  return comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<{ semana: string; valor: string }>(
      `select to_char(semana_inicio,'YYYY-MM-DD') semana, preco_medio_revenda::text valor
         from public.fuel_prices
        where nivel='UF' and uf=$1 and produto='DIESEL_S10' and preco_medio_revenda is not null
        order by semana_inicio desc limit $2`,
      [u.ufBase, semanas],
    );
    return rows.map((r) => ({ semana: r.semana, valor: Number(r.valor) })).reverse();
  });
}

export async function precoAtual(u: UsuarioDemo): Promise<PrecoAtual | null> {
  return comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<{
      semana: string; uf: string | null; num_postos_revenda: number | null;
      min_revenda: string | null; max_revenda: string | null; anterior: string | null;
      municipio: string | null;
    }>(
      `with uf as (
         select semana_inicio, preco_medio_revenda, num_postos_revenda,
                preco_min_revenda, preco_max_revenda,
                lag(preco_medio_revenda) over (order by semana_inicio) anterior
           from public.fuel_prices
          where nivel='UF' and uf=$1 and produto='DIESEL_S10'
       )
       select to_char(u.semana_inicio,'YYYY-MM-DD') semana,
              u.preco_medio_revenda::text uf,
              u.num_postos_revenda,
              u.preco_min_revenda::text min_revenda,
              u.preco_max_revenda::text max_revenda,
              u.anterior::text anterior,
              (select m.preco_medio_revenda::text from public.fuel_prices m
                where m.nivel='MUNICIPIO' and m.uf=$1 and m.municipio_norm=$2
                  and m.semana_inicio=u.semana_inicio) municipio
         from uf u order by u.semana_inicio desc limit 1`,
      [u.ufBase, u.municipioBase],
    );
    const r = rows[0];
    if (r === undefined) return null;

    const atual = num(r.uf);
    const anterior = num(r.anterior);
    return {
      semana: r.semana,
      uf: atual,
      municipio: num(r.municipio),
      variacaoSemanal: atual !== null && anterior !== null ? atual - anterior : null,
      numPostos: r.num_postos_revenda,
      minRegiao: num(r.min_revenda),
      maxRegiao: num(r.max_revenda),
    };
  });
}

export async function benchmark(u: UsuarioDemo): Promise<Benchmark | null> {
  return comoUsuario(u.id, async (c) => {
    // A média da região é ponderada pelos MESMOS litros da compra: comparar
    // preço médio simples com média semanal da ANP distorceria quando o volume
    // se concentra em poucas semanas.
    const { rows } = await c.query<{
      litros: string; valor: string; pago: string; regiao: string; compras: string;
    }>(
      `select sum(p.litros)::text litros,
              sum(p.valor_total)::text valor,
              (sum(p.valor_total)/sum(p.litros))::text pago,
              (sum(f.preco_medio_revenda*p.litros)/sum(p.litros))::text regiao,
              count(*)::text compras
         from public.fuel_purchases p
         join public.fuel_prices f
           on f.nivel='UF' and f.uf=p.uf and f.produto=p.produto
          and p.data between f.semana_inicio and f.semana_fim`,
    );
    const r = rows[0];
    if (r === undefined || r.litros === null) return null;

    const pago = Number(r.pago);
    const regiao = Number(r.regiao);
    const litros = Number(r.litros);
    return {
      litros,
      valorTotal: Number(r.valor),
      precoMedioPago: pago,
      precoMedioRegiao: regiao,
      diferencaPercentual: ((pago - regiao) / regiao) * 100,
      compras: Number(r.compras),
      excedente: (pago - regiao) * litros,
    };
  });
}

/** Nome do modelo gravado por scripts/backtest.ts. */
export const MODELO_ATUAL = 'wf-selecao-v1';

export interface MesRelatorio {
  readonly mes: string;
  readonly compras: number;
  readonly litros: number;
  readonly valorTotal: number;
  readonly precoPago: number;
  readonly precoRegiao: number;
  readonly diferencaPercentual: number;
  readonly excedente: number;
}

export async function relatorioMensal(u: UsuarioDemo): Promise<MesRelatorio[]> {
  return comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<{
      mes: string; compras: string; litros: string; valor: string; pago: string; regiao: string;
    }>(
      `select to_char(date_trunc('month', p.data),'YYYY-MM') mes,
              count(*)::text compras,
              sum(p.litros)::text litros,
              sum(p.valor_total)::text valor,
              (sum(p.valor_total)/sum(p.litros))::text pago,
              (sum(f.preco_medio_revenda*p.litros)/sum(p.litros))::text regiao
         from public.fuel_purchases p
         join public.fuel_prices f
           on f.nivel='UF' and f.uf=p.uf and f.produto=p.produto
          and p.data between f.semana_inicio and f.semana_fim
        group by 1 order by 1 desc`,
    );
    return rows.map((r) => {
      const pago = Number(r.pago);
      const regiao = Number(r.regiao);
      const litros = Number(r.litros);
      return {
        mes: r.mes,
        compras: Number(r.compras),
        litros,
        valorTotal: Number(r.valor),
        precoPago: pago,
        precoRegiao: regiao,
        diferencaPercentual: ((pago - regiao) / regiao) * 100,
        excedente: (pago - regiao) * litros,
      };
    });
  });
}

export async function previsoes(u: UsuarioDemo, modelo = MODELO_ATUAL): Promise<Previsao[]> {
  return comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<{
      horizonte_semanas: number; semana_alvo: string; valor: string;
      p10: string; p90: string; classe: 'ALTA' | 'ESTAVEL' | 'QUEDA';
    }>(
      `select f.horizonte_semanas, to_char(f.semana_alvo,'YYYY-MM-DD') semana_alvo,
              f.valor_previsto::text valor, f.p10::text, f.p90::text, f.classe
         from public.forecasts f
         join public.forecast_runs r on r.id = f.run_id
        where f.uf=$1 and f.modelo_versao=$2 and f.oficial
          and r.semana_origem = (select max(r2.semana_origem) from public.forecast_runs r2
                                  where r2.modelo_versao=$2)
        order by f.horizonte_semanas`,
      [u.ufBase, modelo],
    );
    return rows.map((r) => ({
      horizonte: r.horizonte_semanas,
      semanaAlvo: r.semana_alvo,
      valor: Number(r.valor),
      p10: Number(r.p10),
      p90: Number(r.p90),
      classe: r.classe,
    }));
  });
}

export async function placar(u: UsuarioDemo, semanas = 12): Promise<PlacarModelo[]> {
  return comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<{
      modelo: string; n: string; mae: string; rmse: string; picp: string; direcional: string;
    }>(
      `with recente as (
         select p.*, lag(o.valor_realizado) over (partition by p.uf, p.horizonte_semanas,
                                                  p.modelo_versao order by p.semana_alvo) anterior
           from public.v_forecast_placar p
           join public.forecast_outcomes o on o.forecast_id = p.forecast_id
          where p.uf = $1 and p.valor_realizado is not null
            and p.semana_alvo >= (select max(semana_alvo) - ($2::int * 7) from public.v_forecast_placar)
       )
       select modelo_versao modelo,
              count(*)::text n,
              avg(erro_absoluto)::text mae,
              sqrt(avg(erro*erro))::text rmse,
              (avg(case when dentro_do_intervalo then 1.0 else 0.0 end)*100)::text picp,
              (avg(case when anterior is null then null
                        when sign(valor_previsto - anterior) = sign(valor_realizado - anterior)
                        then 1.0 else 0.0 end)*100)::text direcional
         from recente group by modelo_versao order by modelo_versao`,
      [u.ufBase, semanas],
    );
    return rows.map((r) => ({
      modelo: r.modelo,
      n: Number(r.n),
      mae: Number(r.mae),
      rmse: Number(r.rmse),
      picp: Number(r.picp),
      direcional: Number(r.direcional ?? 0),
    }));
  });
}

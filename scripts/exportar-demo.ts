#!/usr/bin/env node
// Exporta o estado da demo para JSON, para gerar a versão estática navegável.
//
// A versão estática é uma CAPTURA: não tem banco atrás, e portanto não tem RLS
// rodando. Ela serve para ver e clicar as telas; a versão que exercita a RLS de
// verdade é a que roda com `next start` contra o Postgres.

import { writeFile } from 'node:fs/promises';
import pg from 'pg';

import { urlBanco } from '../app/lib/pgurl.ts';

import { corpoAlerta, assuntoAlerta } from '../supabase/functions/_shared/email/alertaSemanal.ts';

const USUARIOS = [
  {
    id: 'd0000000-0000-4000-8000-0000000000a1',
    rotulo: 'demo-a@exemplo.invalid',
    organizacao: 'TRANSPORTADORA DEMO A',
    uf: 'SP',
    municipio: 'Campinas',
    municipioNorm: 'CAMPINAS',
  },
  {
    id: 'd0000000-0000-4000-8000-0000000000b1',
    rotulo: 'demo-b@exemplo.invalid',
    organizacao: 'INDÚSTRIA DEMO B',
    uf: 'MG',
    municipio: 'Uberlândia',
    municipioNorm: 'UBERLANDIA',
  },
] as const;

const MODELO = 'wf-selecao-v1';

async function comoUsuario<T>(pool: pg.Pool, userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await c.query('set local role authenticated');
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

const n = (v: string | null): number | null => (v === null ? null : Number(v));

async function main(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: urlBanco(),
  });

  const saida: Record<string, unknown>[] = [];

  try {
    for (const u of USUARIOS) {
      const dados = await comoUsuario(pool, u.id, async (c) => {
        const historico = (
          await c.query<{ s: string; v: string }>(
            `select to_char(semana_inicio,'YYYY-MM-DD') s, preco_medio_revenda::text v
               from public.fuel_prices
              where nivel='UF' and uf=$1 and produto='DIESEL_S10'
              order by semana_inicio desc limit 104`,
            [u.uf],
          )
        ).rows.map((r) => ({ semana: r.s, valor: Number(r.v) })).reverse();

        const atualRows = (
          await c.query<{
            s: string; uf: string | null; postos: number | null; mn: string | null;
            mx: string | null; ant: string | null; mun: string | null;
          }>(
            `with u as (
               select semana_inicio, preco_medio_revenda, num_postos_revenda,
                      preco_min_revenda, preco_max_revenda,
                      lag(preco_medio_revenda) over (order by semana_inicio) ant
                 from public.fuel_prices
                where nivel='UF' and uf=$1 and produto='DIESEL_S10')
             select to_char(u.semana_inicio,'YYYY-MM-DD') s, u.preco_medio_revenda::text uf,
                    u.num_postos_revenda postos, u.preco_min_revenda::text mn,
                    u.preco_max_revenda::text mx, u.ant::text ant,
                    (select m.preco_medio_revenda::text from public.fuel_prices m
                      where m.nivel='MUNICIPIO' and m.uf=$1 and m.municipio_norm=$2
                        and m.semana_inicio=u.semana_inicio) mun
               from u order by u.semana_inicio desc limit 1`,
            [u.uf, u.municipioNorm],
          )
        ).rows[0];

        const precoAtual = atualRows === undefined ? null : {
          semana: atualRows.s,
          uf: n(atualRows.uf),
          municipio: n(atualRows.mun),
          numPostos: atualRows.postos,
          minRegiao: n(atualRows.mn),
          maxRegiao: n(atualRows.mx),
          variacaoSemanal:
            n(atualRows.uf) !== null && n(atualRows.ant) !== null
              ? (n(atualRows.uf) as number) - (n(atualRows.ant) as number)
              : null,
        };

        const previsao = (
          await c.query<{ h: number; sa: string; v: string; p10: string; p90: string; classe: string }>(
            `select f.horizonte_semanas h, to_char(f.semana_alvo,'YYYY-MM-DD') sa,
                    f.valor_previsto::text v, f.p10::text, f.p90::text, f.classe
               from public.forecasts f join public.forecast_runs r on r.id=f.run_id
              where f.uf=$1 and f.modelo_versao=$2 and f.oficial
                and r.semana_origem=(select max(semana_origem) from public.forecast_runs where modelo_versao=$2)
              order by f.horizonte_semanas`,
            [u.uf, MODELO],
          )
        ).rows.map((r) => ({
          horizonte: r.h, semanaAlvo: r.sa, valor: Number(r.v),
          p10: Number(r.p10), p90: Number(r.p90), classe: r.classe as 'ALTA' | 'ESTAVEL' | 'QUEDA',
        }));

        const placar = (
          await c.query<{ m: string; n: string; mae: string; rmse: string; picp: string; dir: string | null }>(
            `with recente as (
               select p.*, lag(o.valor_realizado) over (partition by p.uf,p.horizonte_semanas,p.modelo_versao
                                                        order by p.semana_alvo) ant
                 from public.v_forecast_placar p
                 join public.forecast_outcomes o on o.forecast_id=p.forecast_id
                where p.uf=$1 and p.valor_realizado is not null
                  and p.semana_alvo >= (select max(semana_alvo)-84 from public.v_forecast_placar))
             select modelo_versao m, count(*)::text n, avg(erro_absoluto)::text mae,
                    sqrt(avg(erro*erro))::text rmse,
                    (avg(case when dentro_do_intervalo then 1.0 else 0.0 end)*100)::text picp,
                    (avg(case when ant is null then null
                              when sign(valor_previsto-ant)=sign(valor_realizado-ant) then 1.0
                              else 0.0 end)*100)::text dir
               from recente group by modelo_versao order by modelo_versao`,
            [u.uf],
          )
        ).rows.map((r) => ({
          modelo: r.m, n: Number(r.n), mae: Number(r.mae), rmse: Number(r.rmse),
          picp: Number(r.picp), direcional: Number(r.dir ?? 0),
        }));

        const bmRow = (
          await c.query<{ l: string; v: string; pago: string; regiao: string; c: string }>(
            `select sum(p.litros)::text l, sum(p.valor_total)::text v,
                    (sum(p.valor_total)/sum(p.litros))::text pago,
                    (sum(f.preco_medio_revenda*p.litros)/sum(p.litros))::text regiao,
                    count(*)::text c
               from public.fuel_purchases p
               join public.fuel_prices f on f.nivel='UF' and f.uf=p.uf and f.produto=p.produto
                and p.data between f.semana_inicio and f.semana_fim`,
          )
        ).rows[0];

        const benchmark = bmRow?.l == null ? null : {
          litros: Number(bmRow.l), valorTotal: Number(bmRow.v),
          precoMedioPago: Number(bmRow.pago), precoMedioRegiao: Number(bmRow.regiao),
          compras: Number(bmRow.c),
          diferencaPercentual: ((Number(bmRow.pago) - Number(bmRow.regiao)) / Number(bmRow.regiao)) * 100,
          excedente: (Number(bmRow.pago) - Number(bmRow.regiao)) * Number(bmRow.l),
        };

        const relatorio = (
          await c.query<{ mes: string; c: string; l: string; v: string; pago: string; regiao: string }>(
            `select to_char(date_trunc('month',p.data),'YYYY-MM') mes, count(*)::text c,
                    sum(p.litros)::text l, sum(p.valor_total)::text v,
                    (sum(p.valor_total)/sum(p.litros))::text pago,
                    (sum(f.preco_medio_revenda*p.litros)/sum(p.litros))::text regiao
               from public.fuel_purchases p
               join public.fuel_prices f on f.nivel='UF' and f.uf=p.uf and f.produto=p.produto
                and p.data between f.semana_inicio and f.semana_fim
              group by 1 order by 1 desc`,
          )
        ).rows.map((r) => {
          const pago = Number(r.pago), regiao = Number(r.regiao), litros = Number(r.l);
          return {
            mes: r.mes, compras: Number(r.c), litros, valorTotal: Number(r.v),
            precoPago: pago, precoRegiao: regiao,
            diferencaPercentual: ((pago - regiao) / regiao) * 100,
            excedente: (pago - regiao) * litros,
          };
        });

        // Resíduos do backtest: é o que alimenta o bootstrap de cenários do
        // simulador na página estática.
        const residuos = (
          await c.query<{ erro: string }>(
            `select p.erro::text
               from public.v_forecast_placar p
              where p.uf=$1 and p.modelo_versao=$2 and p.horizonte_semanas=1
                and p.valor_realizado is not null
              order by p.semana_alvo`,
            [u.uf, MODELO],
          )
        ).rows.map((r) => Number(r.erro)).filter((v) => Number.isFinite(v));

        return { historico, precoAtual, previsao, placar, benchmark, relatorio, residuos };
      });

      const modeloL = dados.placar.find((l) => l.modelo !== 'naive-v1');
      const naiveL = dados.placar.find((l) => l.modelo === 'naive-v1');

      const dadosEmail = {
        organizacao: u.organizacao,
        uf: u.uf,
        semana: dados.precoAtual?.semana ?? '—',
        precoAtual: dados.precoAtual?.uf ?? 0,
        variacaoSemanal: dados.precoAtual?.variacaoSemanal ?? null,
        previsoes: dados.previsao,
        benchmarkPercentual: dados.benchmark?.diferencaPercentual ?? null,
        modeloBateNaive: modeloL !== undefined && naiveL !== undefined ? modeloL.mae < naiveL.mae : null,
        linkDescadastro: 'https://exemplo.invalid/descadastro?t=TOKEN_DEMO',
        ficticio: true,
      };

      saida.push({
        usuario: u,
        ...dados,
        email: { assunto: assuntoAlerta(dadosEmail), html: corpoAlerta(dadosEmail) },
      });
    }

    const destino = process.argv[2] ?? 'demo.json';
    await writeFile(destino, JSON.stringify(saida), 'utf8');
    console.log(`exportado para ${destino}`);
  } finally {
    await pool.end();
  }
}

await main();

#!/usr/bin/env node
// Backtest walk-forward por UF (Tarefa 4).
//
// Lê a série de fuel_prices, roda o walk-forward, imprime a tabela de métricas
// por UF com o naive na mesma tabela como referência, e opcionalmente grava as
// previsões.
//
// Uso:
//   node scripts/backtest.ts [--db <url>] [--gravar] [--min-treino 26]
//
// ⚠️ As métricas que este script imprime valem o que valem os dados que estão
// no banco. Contra o banco da demo, saem FICTÍCIAS — o cabeçalho avisa. O banco
// padrão é o do app (`TCC_BANCO`, ou `tcc_demo`); use --db para outro.

import pg from 'pg';

import { urlBanco } from '../app/lib/pgurl.ts';

import { backtest, type Observacao, type PrevisaoEmitida } from '../supabase/functions/_shared/previsao/walkforward.ts';
import { calcular, escalaMase, type Metricas } from '../supabase/functions/_shared/previsao/metricas.ts';

const MODELO_ESCOLHIDO = 'wf-selecao-v1';
const MODELO_NAIVE = 'naive-v1';

interface Args {
  readonly db: string;
  readonly gravar: boolean;
  readonly minTreino: number;
}

function lerArgs(argv: readonly string[]): Args {
  let db = urlBanco();
  let gravar = false;
  let minTreino = 26;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') { db = argv[i + 1] ?? db; i += 1; }
    else if (a === '--gravar') gravar = true;
    else if (a === '--min-treino') { minTreino = Number(argv[i + 1] ?? minTreino); i += 1; }
  }
  return { db, gravar, minTreino };
}

async function serieDaUf(pool: pg.Pool, uf: string): Promise<Observacao[]> {
  const { rows } = await pool.query<{ semana: string; valor: string }>(
    `select to_char(semana_inicio,'YYYY-MM-DD') semana, preco_medio_revenda::text valor
       from public.fuel_prices
      where nivel='UF' and uf=$1 and produto='DIESEL_S10' and preco_medio_revenda is not null
      order by semana_inicio`,
    [uf],
  );
  return rows.map((r) => ({ semana: r.semana, valor: Number(r.valor) }));
}

function linha(uf: string, rotulo: string, m: Metricas): string {
  const f = (v: number, casas = 4) => (Number.isFinite(v) ? v.toFixed(casas) : '—');
  return [
    uf.padEnd(4),
    rotulo.padEnd(16),
    String(m.n).padStart(5),
    f(m.mae).padStart(8),
    f(m.rmse).padStart(8),
    f(m.mase, 3).padStart(7),
    f(m.direcional, 1).padStart(7),
    f(m.picp, 1).padStart(7),
  ].join(' ');
}

async function gravar(
  pool: pg.Pool,
  uf: string,
  previsoes: readonly PrevisaoEmitida[],
  modeloVersao: string,
): Promise<number> {
  // Agrupa por semana de origem: uma execução por semana, cobrindo os 4
  // horizontes. É o que a Edge Function faria toda semana em produção.
  const porOrigem = new Map<string, PrevisaoEmitida[]>();
  for (const p of previsoes) {
    const atual = porOrigem.get(p.semanaOrigem) ?? [];
    atual.push(p);
    porOrigem.set(p.semanaOrigem, atual);
  }

  let gravadas = 0;
  for (const [semanaOrigem, doGrupo] of porOrigem) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.forecast_runs (modelo_versao, dados_ate, semana_origem, observacao)
       values ($1, $2::date + 6, $2, $3) returning id`,
      [modeloVersao, semanaOrigem, `backtest walk-forward; corte em ${semanaOrigem}+6`],
    );
    const runId = rows[0]?.id;

    for (const p of doGrupo) {
      const f = await pool.query<{ id: string }>(
        `insert into public.forecasts
           (run_id, uf, horizonte_semanas, semana_alvo, valor_previsto, p10, p90,
            classe, modelo_versao, oficial)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning id`,
        [runId, uf, p.h, p.semanaAlvo, p.previsto.toFixed(4), p.p10.toFixed(4),
         p.p90.toFixed(4), p.classe, modeloVersao],
      );
      gravadas += 1;

      if (p.realizado !== null) {
        await pool.query(
          `insert into public.forecast_outcomes (forecast_id, semana_alvo, valor_realizado, fonte_realizado)
           values ($1,$2,$3,$4)`,
          [f.rows[0]?.id, p.semanaAlvo, p.realizado.toFixed(4), `serie fuel_prices ${uf}`],
        );
      }
    }
  }
  return gravadas;
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: args.db });

  try {
    const ufs = (
      await pool.query<{ uf: string }>(
        `select distinct uf from public.fuel_prices where nivel='UF' and produto='DIESEL_S10' order by uf`,
      )
    ).rows.map((r) => r.uf);

    if (ufs.length === 0) {
      console.error('Nenhuma série em fuel_prices. Rode a ingestão (ou o seed da demo) antes.');
      process.exitCode = 2;
      return;
    }

    if (args.gravar) {
      const { rows } = await pool.query<{ n: string }>('select count(*)::text n from public.forecasts');
      if (rows[0]?.n !== '0') {
        console.error(
          `Já existem ${rows[0]?.n} previsões gravadas. A tabela é IMUTÁVEL de propósito: ` +
            'para regravar, recrie o banco (ex.: rode o seed da demo de novo).',
        );
        process.exitCode = 1;
        return;
      }
    }

    console.log('=== BACKTEST WALK-FORWARD POR UF ===');
    console.log(`fonte: ${args.db.replace(/:[^:@]*@/, ':***@')} | min. treino: ${args.minTreino} semanas`);
    console.log('modelo escolhido online entre naive / drift / mm3, sem olhar o futuro\n');
    console.log(
      ['UF  ', 'modelo          ', '    n', '     MAE', '    RMSE', '   MASE', '  dir.%', '  PICP%'].join(' '),
    );
    console.log('-'.repeat(72));

    let totalGravadas = 0;

    for (const uf of ufs) {
      const s = await serieDaUf(pool, uf);
      if (s.length < args.minTreino + 8) {
        console.log(`${uf.padEnd(4)} série curta demais (${s.length} semanas), pulada`);
        continue;
      }

      const escala = escalaMase(s, args.minTreino);
      const escolhido = backtest(s, { minTreino: args.minTreino });
      const naive = backtest(s, { minTreino: args.minTreino, modeloFixo: 'naive' });

      const mEscolhido = calcular(escolhido, s, escala);
      const mNaive = calcular(naive, s, escala);

      console.log(linha(uf, 'escolhido (wf)', mEscolhido));
      console.log(linha(uf, 'naive (referência)', mNaive));

      // A regra do produto: se o escolhido não bate o naive, isso aparece.
      if (mEscolhido.mae >= mNaive.mae) {
        console.log(`     ⚠️  em ${uf} o modelo NÃO bate o naive (MAE ${mEscolhido.mae.toFixed(4)} vs ${mNaive.mae.toFixed(4)})`);
      }

      if (args.gravar) {
        totalGravadas += await gravar(pool, uf, escolhido, MODELO_ESCOLHIDO);
        totalGravadas += await gravar(pool, uf, naive, MODELO_NAIVE);
      }
    }

    if (args.gravar) console.log(`\n${totalGravadas} previsões gravadas.`);
  } finally {
    await pool.end();
  }
}

await main();

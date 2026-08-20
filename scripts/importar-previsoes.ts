#!/usr/bin/env node
// Importa previsões de um modelo externo (docs/CONTRATO_MODELO.md).
//
// O modelo roda onde já roda — Python, R, planilha, o que for — e entrega um
// CSV/JSON. Este runner valida, grava em forecast_runs + forecasts, preenche o
// realizado a partir da série da ANP e mostra o placar contra o naive.
//
// Uso:
//   node scripts/importar-previsoes.ts [--db <url>] [--conferir] <arquivo|https://...> ...
//
//   --conferir   valida e relata, sem gravar nada
//
// Exemplos:
//   node scripts/importar-previsoes.ts --conferir previsoes-arima.csv
//   node scripts/importar-previsoes.ts previsoes-arima.csv

import { readFile } from 'node:fs/promises';
import pg from 'pg';

import { decodificar } from '../supabase/functions/_shared/anp/texto.ts';
import type { Executor } from '../supabase/functions/_shared/anp/tipos.ts';
import { validarPrevisoes } from '../supabase/functions/_shared/modeloExterno/contrato.ts';
import {
  gravarPrevisoesExternas,
  preencherRealizados,
} from '../supabase/functions/_shared/modeloExterno/persistencia.ts';
import { ErroContratoModelo } from '../supabase/functions/_shared/modeloExterno/tipos.ts';

interface Args {
  readonly db: string;
  readonly conferir: boolean;
  readonly fontes: readonly string[];
}

function lerArgs(argv: readonly string[]): Args {
  const fontes: string[] = [];
  let db = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
  let conferir = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') {
      db = argv[i + 1] ?? db;
      i += 1;
    } else if (a === '--conferir' || a === '--dry-run') {
      conferir = true;
    } else if (a !== undefined && !a.startsWith('--')) {
      fontes.push(a);
    }
  }
  return { db, conferir, fontes };
}

async function carregar(fonte: string): Promise<string> {
  if (/^https?:\/\//i.test(fonte)) {
    const r = await fetch(fonte, { redirect: 'follow' });
    if (!r.ok) throw new ErroContratoModelo(`${fonte} respondeu ${r.status} ${r.statusText}`);
    return decodificar(new Uint8Array(await r.arrayBuffer()));
  }
  return decodificar(new Uint8Array(await readFile(fonte)));
}

function criarExecutor(pool: pg.Pool): Executor {
  return {
    async executar(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return { linhasAfetadas: r.rowCount ?? 0 };
    },
    async consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows as T[];
    },
  };
}

async function placar(pool: pg.Pool, modelos: readonly string[]): Promise<void> {
  const { rows } = await pool.query<{
    uf: string; modelo: string; n: string; mae: string; rmse: string; picp: string;
  }>(
    `select uf, modelo_versao modelo, count(*)::text n,
            avg(erro_absoluto)::text mae, sqrt(avg(erro*erro))::text rmse,
            (avg(case when dentro_do_intervalo then 1.0 else 0.0 end)*100)::text picp
       from public.v_forecast_placar
      where valor_realizado is not null
        and (modelo_versao = any($1) or modelo_versao like 'naive%')
      group by uf, modelo_versao
      order by uf, modelo_versao`,
    [modelos as string[]],
  );

  if (rows.length === 0) {
    console.log('\nNenhum alvo realizado ainda — o placar aparece quando a ANP publicar as semanas-alvo.');
    return;
  }

  console.log('\n=== PLACAR (realizado vindo de fuel_prices) ===');
  console.log('UF   modelo                     n      MAE      RMSE     PICP%');
  for (const r of rows) {
    console.log(
      `${r.uf.padEnd(4)} ${r.modelo.padEnd(24)} ${String(r.n).padStart(5)} ` +
        `${Number(r.mae).toFixed(4).padStart(8)} ${Number(r.rmse).toFixed(4).padStart(8)} ` +
        `${Number(r.picp).toFixed(1).padStart(8)}`,
    );
  }

  // A comparação com o naive é o ponto do placar. Se o modelo perder, sai aqui.
  const porUf = new Map<string, { modelo?: number; naive?: number; nome?: string }>();
  for (const r of rows) {
    const atual = porUf.get(r.uf) ?? {};
    if (r.modelo.startsWith('naive')) atual.naive = Number(r.mae);
    else {
      atual.modelo = Number(r.mae);
      atual.nome = r.modelo;
    }
    porUf.set(r.uf, atual);
  }
  console.log('');
  for (const [uf, v] of [...porUf].sort()) {
    if (v.modelo === undefined || v.naive === undefined) continue;
    const venceu = v.modelo < v.naive;
    console.log(
      `${venceu ? '✓' : '⚠️ '} ${uf}: ${v.nome ?? 'modelo'} MAE ${v.modelo.toFixed(4)} ` +
        `${venceu ? 'bate' : 'NÃO bate'} o naive (${v.naive.toFixed(4)})`,
    );
  }
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  if (args.fontes.length === 0) {
    console.error('nenhuma fonte informada. Passe caminhos de arquivo ou URLs.');
    console.error('Formato esperado: docs/CONTRATO_MODELO.md §3');
    process.exitCode = 2;
    return;
  }

  const pool = new pg.Pool({ connectionString: args.db });
  const exec = criarExecutor(pool);
  const modelosVistos = new Set<string>();

  try {
    for (const fonte of args.fontes) {
      const { previsoes, relatorio } = validarPrevisoes(await carregar(fonte));

      console.log(`\n=== ${fonte} ===`);
      console.log(`linhas lidas: ${relatorio.linhasLidas}   válidas: ${relatorio.aceitas}`);
      console.log(`modelos: ${relatorio.modelos.join(', ') || '-'}`);
      console.log(`UFs: ${relatorio.ufs.join(', ') || '-'}`);
      console.log(
        `origens: ${relatorio.origens.length} ` +
          `(${relatorio.origens.at(0) ?? '-'} .. ${relatorio.origens.at(-1) ?? '-'})`,
      );

      if (relatorio.colunasPorSinonimo.length > 0) {
        console.log('\ncolunas resolvidas por sinônimo (confira se está certo):');
        for (const c of relatorio.colunasPorSinonimo) console.log(`  ${c}`);
      }
      if (relatorio.colunasIgnoradas.length > 0) {
        console.log(`\ncolunas ignoradas: ${relatorio.colunasIgnoradas.join(', ')}`);
      }

      if (relatorio.erros.length > 0) {
        console.error(`\n✗ ${relatorio.erros.length} linha(s) fora do contrato. NADA foi gravado.`);
        for (const e of relatorio.erros.slice(0, 40)) {
          console.error(`  linha ${e.linha}  ${e.campo}: ${e.motivo}`);
        }
        if (relatorio.erros.length > 40) {
          console.error(`  ... e mais ${relatorio.erros.length - 40}`);
        }
        console.error('\nCorrija a fonte. Nenhum campo é preenchido por aproximação.');
        process.exitCode = 1;
        return;
      }

      for (const m of relatorio.modelos) modelosVistos.add(m);

      if (args.conferir) {
        console.log('\n--conferir: arquivo válido, nada gravado.');
        continue;
      }

      const r = await gravarPrevisoesExternas(exec, previsoes, fonte);
      console.log(
        `\ngravado: ${r.inseridas} previsões novas, ${r.ignoradas} já existentes ` +
          `(idempotência), em ${r.execucoes} execução(ões) — ${r.execucoesReaproveitadas} reaproveitada(s).`,
      );

      if (r.semanasOrigemSemSerie.length > 0) {
        console.log('\n⚠️  Origens sem semana correspondente em fuel_prices:');
        for (const s of r.semanasOrigemSemSerie.slice(0, 20)) console.log(`  ${s}`);
        if (r.semanasOrigemSemSerie.length > 20) {
          console.log(`  ... e mais ${r.semanasOrigemSemSerie.length - 20}`);
        }
        console.log('  A grade de semanas do modelo pode não bater com a da ANP. Confira antes de citar o placar.');
      }
    }

    if (!args.conferir) {
      let realizados = 0;
      for (const m of modelosVistos) realizados += await preencherRealizados(exec, m);
      console.log(`\nrealizados preenchidos a partir da ANP: ${realizados}`);
      await placar(pool, [...modelosVistos]);
    }
  } catch (erro) {
    console.error(`\nFALHA: ${(erro as Error).name}: ${(erro as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();

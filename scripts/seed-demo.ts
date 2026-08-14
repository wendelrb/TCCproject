#!/usr/bin/env node
// SEED DA DEMO — GERA DADOS FICTÍCIOS.
//
// Autorizado pela emenda de 2026-08-14 no CLAUDE.md (ver ASSUMPTIONS.md A-019).
// A exceção vale SÓ para a demo. Nada que sai daqui é métrica do produto.
//
// Travas, nesta ordem, antes de qualquer escrita:
//   1. recusa string de conexão apontando para Supabase gerenciado;
//   2. exige PERMITIR_SEED_DEMO=1 no ambiente;
//   3. escreve exclusivamente no banco `tcc_demo`, recriado do zero.

import pg from 'pg';

import { prepararBanco, CONEXAO } from '../tests/harness.ts';
import { gravarPrecos } from '../supabase/functions/_shared/anp/persistencia.ts';
import { normalizar } from '../supabase/functions/_shared/anp/texto.ts';
import type { Executor, LinhaPreco } from '../supabase/functions/_shared/anp/tipos.ts';

const BANCO_DEMO = 'tcc_demo';
const FONTE = 'DEMO-FICTICIO (nao e dado da ANP)';

export const ORG_A = 'd0000000-0000-4000-8000-00000000000a';
export const ORG_B = 'd0000000-0000-4000-8000-00000000000b';
export const USER_A = 'd0000000-0000-4000-8000-0000000000a1';
export const USER_B = 'd0000000-0000-4000-8000-0000000000b1';

function travas(): void {
  const alvo = `${process.env.DATABASE_URL ?? ''} ${CONEXAO.host}`;
  if (/supabase\.(co|in|net)/i.test(alvo)) {
    throw new Error(
      'RECUSADO: a conexão aponta para Supabase gerenciado. O seed da demo nunca ' +
        'escreve em banco de produção.',
    );
  }
  if (process.env.PERMITIR_SEED_DEMO !== '1') {
    throw new Error(
      'RECUSADO: defina PERMITIR_SEED_DEMO=1 para confirmar que você quer gerar ' +
        'dados FICTÍCIOS. Sem isso o seed não roda.',
    );
  }
}

/** PRNG determinístico: mesma saída a cada execução, para a demo ser reprodutível. */
function rng(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface Regiao {
  readonly uf: string;
  readonly municipio: string;
  readonly base: number;
  readonly deriva: number;
}

const REGIOES: readonly Regiao[] = [
  { uf: 'SP', municipio: 'Campinas', base: 6.05, deriva: 0.0021 },
  { uf: 'MG', municipio: 'Uberlândia', base: 6.18, deriva: 0.0018 },
  { uf: 'PR', municipio: 'Londrina', base: 6.11, deriva: 0.0024 },
  { uf: 'RS', municipio: 'Caxias do Sul', base: 6.26, deriva: 0.0016 },
  { uf: 'BA', municipio: 'Feira de Santana', base: 6.42, deriva: 0.0027 },
  { uf: 'GO', municipio: 'Rio Verde', base: 6.33, deriva: 0.0022 },
];

const SEMANAS = 157; // ~3 anos de série semanal
const ULTIMA_SEMANA = '2026-08-02'; // domingo

function serie(): { linhas: LinhaPreco[]; precos: Map<string, number> } {
  const linhas: LinhaPreco[] = [];
  const precos = new Map<string, number>();

  REGIOES.forEach((r, idx) => {
    const aleatorio = rng(1000 + idx * 37);
    let nivelPreco = r.base;

    for (let s = SEMANAS - 1; s >= 0; s -= 1) {
      const semanaInicio = somarDias(ULTIMA_SEMANA, -7 * s);
      const semanaFim = somarDias(semanaInicio, 6);

      // Passeio com deriva suave e choques ocasionais — forma plausível de série
      // de preço, ainda assim inteiramente inventada.
      const choque = aleatorio() < 0.04 ? (aleatorio() - 0.35) * 0.28 : 0;
      nivelPreco += r.deriva + (aleatorio() - 0.5) * 0.035 + choque;
      nivelPreco = Math.max(4.6, Math.min(8.4, nivelPreco));

      const precoUf = Number(nivelPreco.toFixed(4));
      precos.set(`${r.uf}|${semanaInicio}`, precoUf);

      const comum = {
        semanaInicio,
        semanaFim,
        produtoFonte: 'ÓLEO DIESEL S10',
        unidade: 'R$/l',
        precoMedioDistribuicao: Number((precoUf * 0.935).toFixed(4)),
        desvioPadraoDistribuicao: 0.09,
        precoMinDistribuicao: Number((precoUf * 0.9).toFixed(4)),
        precoMaxDistribuicao: Number((precoUf * 0.97).toFixed(4)),
        numPostosDistribuicao: null,
      } as const;

      linhas.push({
        ...comum,
        nivel: 'UF',
        uf: r.uf,
        municipio: null,
        municipioNorm: null,
        precoMedioRevenda: precoUf,
        desvioPadraoRevenda: Number((0.11 + aleatorio() * 0.06).toFixed(4)),
        precoMinRevenda: Number((precoUf - 0.24).toFixed(4)),
        precoMaxRevenda: Number((precoUf + 0.31).toFixed(4)),
        numPostosRevenda: 380 + Math.floor(aleatorio() * 260),
      });

      const precoMun = Number((precoUf + (aleatorio() - 0.45) * 0.13).toFixed(4));
      linhas.push({
        ...comum,
        nivel: 'MUNICIPIO',
        uf: r.uf,
        municipio: r.municipio,
        municipioNorm: normalizar(r.municipio),
        precoMedioRevenda: precoMun,
        desvioPadraoRevenda: Number((0.08 + aleatorio() * 0.05).toFixed(4)),
        precoMinRevenda: Number((precoMun - 0.18).toFixed(4)),
        precoMaxRevenda: Number((precoMun + 0.22).toFixed(4)),
        numPostosRevenda: 8 + Math.floor(aleatorio() * 26),
      });
    }
  });

  return { linhas, precos };
}

async function semearOrganizacoes(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into auth.users (id, email) values ($1,'demo-a@exemplo.invalid'), ($2,'demo-b@exemplo.invalid')`,
    [USER_A, USER_B],
  );
  await pool.query(
    `insert into public.organizations (id, nome) values
       ($1, 'TRANSPORTADORA DEMO A (dados fictícios)'),
       ($2, 'INDÚSTRIA DEMO B (dados fictícios)')`,
    [ORG_A, ORG_B],
  );
  await pool.query(
    `insert into public.users_organizations (user_id, organization_id, papel) values
       ($1,$3,'proprietario'), ($2,$4,'proprietario')`,
    [USER_A, USER_B, ORG_A, ORG_B],
  );
}

async function semearCompras(pool: pg.Pool, precos: Map<string, number>): Promise<void> {
  const configs = [
    { org: ORG_A, uf: 'SP', municipio: 'Campinas', semente: 7, n: 46, viesPreco: 0.09, litros: 1400 },
    { org: ORG_B, uf: 'MG', municipio: 'Uberlândia', semente: 11, n: 31, viesPreco: -0.03, litros: 2600 },
  ] as const;

  for (const c of configs) {
    const aleatorio = rng(c.semente);
    const lote = await pool.query<{ id: string }>(
      `insert into public.import_batches
         (organization_id, arquivo_nome, conteudo_hash, linhas_recebidas, linhas_aceitas,
          linhas_rejeitadas, colunas_rejeitadas)
       values ($1, 'abastecimentos-demo.csv', $2, $3, $3, 0, '{}') returning id`,
      [c.org, `demo-${c.semente}`, c.n],
    );
    const loteId = lote.rows[0]?.id;

    for (let i = 0; i < c.n; i += 1) {
      const semanasAtras = Math.floor((i / c.n) * 52);
      const semana = somarDias(ULTIMA_SEMANA, -7 * (51 - semanasAtras));
      const refer = precos.get(`${c.uf}|${semana}`);
      if (refer === undefined) continue;

      // Preço pago com viés em relação à média da região — é o que o benchmark mede.
      const pago = refer + c.viesPreco + (aleatorio() - 0.5) * 0.08;
      const litros = Number((c.litros * (0.7 + aleatorio() * 0.6)).toFixed(3));
      const data = somarDias(semana, Math.floor(aleatorio() * 7));

      await pool.query(
        `insert into public.fuel_purchases
           (organization_id, import_batch_id, data, uf, municipio, municipio_norm,
            produto, litros, valor_total)
         values ($1,$2,$3,$4,$5,$6,'DIESEL_S10',$7,$8)`,
        [c.org, loteId, data, c.uf, c.municipio, normalizar(c.municipio), litros,
         Number((litros * pago).toFixed(2))],
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    travas();
  } catch (erro) {
    console.error((erro as Error).message);
    process.exitCode = 1;
    return;
  }

  console.log('AVISO: gerando DADOS FICTÍCIOS no banco', BANCO_DEMO);
  const pool = await prepararBanco(BANCO_DEMO);

  const exec: Executor = {
    async executar(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return { linhasAfetadas: r.rowCount ?? 0 };
    },
    async consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows as T[];
    },
  };

  try {
    await semearOrganizacoes(pool);

    const { linhas, precos } = serie();
    const g = await gravarPrecos(exec, linhas, FONTE, new Date().toISOString());
    console.log(`fuel_prices: ${g.inseridas} inseridas`);

    await semearCompras(pool, precos);
    const compras = await pool.query<{ n: string }>('select count(*)::text n from public.fuel_purchases');
    console.log(`fuel_purchases: ${compras.rows[0]?.n}`);

    console.log('\nSérie e compras prontas. TODO número deste banco é fictício.');
    console.log('As PREVISÕES não são semeadas: elas saem do motor real. Rode agora:');
    console.log('  node scripts/backtest.ts --gravar');
  } finally {
    await pool.end();
  }
}

await main();

#!/usr/bin/env node
// Gera o CLIENTE FICTÍCIO ancorado numa série REAL da ANP.
//
//   npm run cliente -- --db postgres://.../tcc_vitrine
//
// POR QUE ISTO EXISTE: as telas de benchmark, relatório mensal e alerta semanal
// dependem de abastecimentos de uma empresa. Não existe empresa real, e inventar
// preço da ANP é proibido — mas o CLIENTE pode ser inventado, porque é
// exatamente o que a emenda de 2026-08-14 autoriza para a demo navegável.
//
// A DIFERENÇA EM RELAÇÃO AO seed-demo.ts: aqui a série de preços NÃO é gerada.
// Ela já está no banco, vinda da ANP. O que se gera são as COMPRAS, e cada uma é
// ancorada no preço real da semana real em que aconteceu. É o que faz o
// benchmark ("você pagou X% acima da sua região") ter forma de número plausível
// em vez de ruído.
//
// Travas, nesta ordem, antes de qualquer escrita:
//   1. recusa string de conexão apontando para Supabase gerenciado;
//   2. exige PERMITIR_CLIENTE_FICTICIO=1;
//   3. exige que a série da ANP já esteja carregada — sem ela não há a que
//      ancorar, e o script pararia em vez de inventar preço de referência.

import pg from 'pg';

import { normalizar } from '../supabase/functions/_shared/anp/texto.ts';

const FONTE_LOTE = 'CLIENTE-FICTICIO (nao e dado de cliente real)';

export const ORG_A = 'd0000000-0000-4000-8000-00000000000a';
export const ORG_B = 'd0000000-0000-4000-8000-00000000000b';
export const USER_A = 'd0000000-0000-4000-8000-0000000000a1';
export const USER_B = 'd0000000-0000-4000-8000-0000000000b1';

interface Perfil {
  readonly org: string;
  readonly user: string;
  readonly email: string;
  readonly nome: string;
  readonly uf: string;
  readonly municipio: string;
  readonly semente: number;
  /** Quanto a empresa paga acima (+) ou abaixo (−) da média da região, em R$/L. */
  readonly vies: number;
  /** Litros por abastecimento, antes da variação. */
  readonly litros: number;
  /** Abastecimentos por semana. */
  readonly porSemana: number;
}

const PERFIS: readonly Perfil[] = [
  {
    org: ORG_A, user: USER_A, email: 'demo-a@exemplo.invalid',
    nome: 'TRANSPORTADORA DEMONSTRAÇÃO (cliente fictício)',
    uf: 'SP', municipio: 'CAMPINAS', semente: 7,
    vies: 0.11, litros: 1400, porSemana: 2,
  },
  {
    org: ORG_B, user: USER_B, email: 'demo-b@exemplo.invalid',
    nome: 'INDÚSTRIA DEMONSTRAÇÃO (cliente fictício)',
    uf: 'MG', municipio: 'UBERLANDIA', semente: 11,
    vies: -0.04, litros: 2600, porSemana: 1,
  },
];

/** PRNG determinístico: a mesma demo a cada execução. */
function rng(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function lerArgs(argv: readonly string[]): { db: string; recriar: boolean } {
  let db = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
  let recriar = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db') { db = argv[i + 1] ?? db; i += 1; }
    else if (argv[i] === '--recriar') recriar = true;
  }
  return { db, recriar };
}

function travas(db: string): void {
  if (/supabase\.(co|in|net)/i.test(db)) {
    throw new Error(
      'RECUSADO: a conexão aponta para Supabase gerenciado. Cliente fictício nunca ' +
        'entra em banco de produção.',
    );
  }
  if (process.env.PERMITIR_CLIENTE_FICTICIO !== '1') {
    throw new Error(
      'RECUSADO: defina PERMITIR_CLIENTE_FICTICIO=1 para confirmar que você quer ' +
        'gerar uma empresa FICTÍCIA. Sem isso o script não roda.',
    );
  }
}

interface SemanaPreco {
  readonly semana: string;
  readonly uf: number;
  readonly municipio: number | null;
}

/** Semanas reais da UF, com o preço do município quando a ANP pesquisou lá. */
async function semanasReais(pool: pg.Pool, p: Perfil, limite: number): Promise<SemanaPreco[]> {
  const { rows } = await pool.query<{ s: string; uf: string; mun: string | null }>(
    `select to_char(u.semana_inicio,'YYYY-MM-DD') s,
            u.preco_medio_revenda::text uf,
            (select m.preco_medio_revenda::text from public.fuel_prices m
              where m.nivel='MUNICIPIO' and m.uf=$1 and m.municipio_norm=$2
                and m.semana_inicio=u.semana_inicio) mun
       from public.fuel_prices u
      where u.nivel='UF' and u.uf=$1 and u.produto='DIESEL_S10'
        and u.preco_medio_revenda is not null
      order by u.semana_inicio desc limit $3`,
    [p.uf, normalizar(p.municipio), limite],
  );
  return rows
    .map((r) => ({ semana: r.s, uf: Number(r.uf), municipio: r.mun === null ? null : Number(r.mun) }))
    .reverse();
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));

  try {
    travas(args.db);
  } catch (erro) {
    console.error((erro as Error).message);
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: args.db });

  try {
    const { rows: serie } = await pool.query<{ n: string; anp: string }>(
      `select count(*)::text n,
              count(*) filter (where fonte like 'ANP:%')::text anp
         from public.fuel_prices where produto='DIESEL_S10'`,
    );
    const total = Number(serie[0]?.n ?? '0');
    const daAnp = Number(serie[0]?.anp ?? '0');

    if (total === 0) {
      console.error(
        'RECUSADO: não há série de preços neste banco. O cliente fictício é ancorado\n' +
          'no preço REAL da semana em que cada compra aconteceu — sem série, o script\n' +
          'teria que inventar o preço de referência, e isso é proibido.\n\n' +
          'Rode antes:  npm run real -- dados\\semanal-estados-desde-2013.xlsx',
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `Série encontrada: ${total} linhas (${daAnp} da ANP). ` +
        'Gerando CLIENTE FICTÍCIO ancorado nela.\n',
    );

    const { rows: jaTem } = await pool.query<{ n: string }>(
      'select count(*)::text n from public.organizations',
    );
    if (Number(jaTem[0]?.n ?? '0') > 0) {
      if (!args.recriar) {
        console.log('Já existe organização neste banco. Nada a fazer.');
        console.log('Para regerar do zero: --recriar');
        return;
      }
      // Ordem obrigatória: fuel_purchases referencia import_batches, que
      // referencia organizations com on delete restrict.
      await pool.query('delete from public.fuel_purchases');
      await pool.query('delete from public.import_batches');
      await pool.query('delete from public.users_organizations');
      await pool.query('delete from public.organizations');
      await pool.query('delete from auth.users where id = any($1)', [[USER_A, USER_B]]);
      console.log('Cliente anterior removido (--recriar).\n');
    }

    let compras = 0;

    for (const p of PERFIS) {
      await pool.query('insert into auth.users (id, email) values ($1,$2)', [p.user, p.email]);
      await pool.query('insert into public.organizations (id, nome) values ($1,$2)', [p.org, p.nome]);
      await pool.query(
        `insert into public.users_organizations (user_id, organization_id, papel)
         values ($1,$2,'proprietario')`,
        [p.user, p.org],
      );

      const semanas = await semanasReais(pool, p, 78);
      if (semanas.length === 0) {
        console.error(`sem série para ${p.uf} — pulando ${p.nome}`);
        continue;
      }

      const n = semanas.length * p.porSemana;
      const { rows: lote } = await pool.query<{ id: string }>(
        `insert into public.import_batches
           (organization_id, arquivo_nome, conteudo_hash, linhas_recebidas,
            linhas_aceitas, linhas_rejeitadas, colunas_rejeitadas)
         values ($1, 'abastecimentos-ficticios.csv', $2, $3, $3, 0, '{}') returning id`,
        [p.org, `${FONTE_LOTE}:${p.semente}`, n],
      );
      const loteId = lote[0]?.id;

      const aleatorio = rng(p.semente);
      const valores: unknown[][] = [];

      for (const s of semanas) {
        // A referência é o preço do MUNICÍPIO quando a ANP pesquisou lá; senão,
        // o da UF. É a mesma referência que o benchmark usa para comparar.
        const referencia = s.municipio ?? s.uf;
        for (let k = 0; k < p.porSemana; k += 1) {
          const pago = referencia + p.vies + (aleatorio() - 0.5) * 0.09;
          const litros = Number((p.litros * (0.7 + aleatorio() * 0.6)).toFixed(3));
          const data = somarDias(s.semana, Math.floor(aleatorio() * 7));
          valores.push([
            p.org, loteId, data, p.uf, p.municipio, normalizar(p.municipio),
            litros, Number((litros * pago).toFixed(2)),
          ]);
        }
      }

      const tuplas: string[] = [];
      const params: unknown[] = [];
      for (const v of valores) {
        const base = params.length;
        tuplas.push(`($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3}::date,$${base + 4},` +
          `$${base + 5},$${base + 6},'DIESEL_S10',$${base + 7},$${base + 8})`);
        params.push(...v);
      }
      await pool.query(
        `insert into public.fuel_purchases
           (organization_id, import_batch_id, data, uf, municipio, municipio_norm,
            produto, litros, valor_total) values ${tuplas.join(',')}`,
        params,
      );

      compras += valores.length;
      console.log(
        `${p.nome}\n  ${valores.length} abastecimentos em ${p.municipio}/${p.uf}, ` +
          `de ${semanas[0]?.semana} a ${semanas.at(-1)?.semana}`,
      );
    }

    console.log(`\n${compras} abastecimentos gerados.`);
    console.log('A EMPRESA e as COMPRAS são fictícias. A série de preços continua sendo a real.');
    console.log('\nSuba a interface:  TCC_BANCO=<banco> npm run dev');
  } finally {
    await pool.end();
  }
}

await main();

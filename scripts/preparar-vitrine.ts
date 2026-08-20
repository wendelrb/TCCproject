#!/usr/bin/env node
// Monta a VITRINE: preço REAL da ANP + cliente FICTÍCIO, num comando.
//
//   npm run vitrine
//
// A vitrine é uma CÓPIA de `tcc_real` (que fica intocado) com uma empresa
// fictícia por cima. É o banco em que as sete telas funcionam ao mesmo tempo:
// preço, previsão, simulador e placar sobre dado real; benchmark, relatório e
// alerta sobre um cliente inventado — cada bloco com o seu selo.
//
// Ver ASSUMPTIONS.md A-026, inclusive a ressalva constitucional pendente.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

import { CONEXAO } from '../tests/harness.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ORIGEM_PADRAO = 'tcc_real';
const DESTINO_PADRAO = 'tcc_vitrine';

interface Args {
  readonly origem: string;
  readonly destino: string;
  readonly recriar: boolean;
}

function lerArgs(argv: readonly string[]): Args {
  let origem = process.env.TCC_BANCO_REAL?.trim() || ORIGEM_PADRAO;
  let destino = process.env.TCC_BANCO_VITRINE?.trim() || DESTINO_PADRAO;
  let recriar = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--de') { origem = argv[i + 1] ?? origem; i += 1; }
    else if (argv[i] === '--para') { destino = argv[i + 1] ?? destino; i += 1; }
    else if (argv[i] === '--recriar') recriar = true;
  }
  return { origem, destino, recriar };
}

function box(titulo: string, linhas: readonly string[]): void {
  console.log(`\n${titulo}`);
  console.log('─'.repeat(Math.max(titulo.length, 62)));
  for (const l of linhas) console.log(l);
  console.log('');
}

function url(banco: string): string {
  const cred = CONEXAO.password === ''
    ? CONEXAO.user
    : `${CONEXAO.user}:${encodeURIComponent(CONEXAO.password)}`;
  return `postgres://${cred}@${CONEXAO.host}:${CONEXAO.port}/${banco}`;
}

function nomeValido(b: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(b);
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));

  for (const b of [args.origem, args.destino]) {
    if (!nomeValido(b)) {
      console.error(`nome de banco inválido: ${b}`);
      process.exitCode = 1;
      return;
    }
  }

  const admin = new pg.Client({ ...CONEXAO, database: 'postgres', connectionTimeoutMillis: 4000 });
  try {
    await admin.connect();
  } catch (erro) {
    box('✗ Não consegui falar com o Postgres', [
      `Tentei: ${CONEXAO.user}@${CONEXAO.host}:${CONEXAO.port}`,
      `Erro:   ${(erro as Error).message}`,
      '',
      '  docker run -d --name tcc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16',
      '  $env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"',
    ]);
    process.exitCode = 1;
    return;
  }

  try {
    const existeOrigem = (await admin.query(
      'select 1 from pg_database where datname = $1', [args.origem],
    )).rows.length > 0;

    if (!existeOrigem) {
      box(`✗ O banco ${args.origem} não existe`, [
        'A vitrine é uma cópia do banco com a série REAL da ANP. Sem ele, não há',
        'preço a que ancorar o cliente — e inventar preço é proibido.',
        '',
        'Rode antes:',
        '  npm run real -- dados\\semanal-estados-desde-2013.xlsx dados\\semanal-municipios-2026.xlsx',
      ]);
      process.exitCode = 1;
      return;
    }

    // Confere que a origem tem mesmo série da ANP, e não um banco vazio.
    const origem = new pg.Client({ ...CONEXAO, database: args.origem });
    await origem.connect();
    let linhasAnp = 0;
    try {
      const { rows } = await origem.query<{ n: string }>(
        `select count(*)::text n from public.fuel_prices
          where produto='DIESEL_S10' and fonte like 'ANP:%'`,
      );
      linhasAnp = Number(rows[0]?.n ?? '0');
    } finally {
      await origem.end();
    }

    if (linhasAnp === 0) {
      box(`✗ ${args.origem} não tem série da ANP`, [
        'O banco existe mas está sem preço vindo da ANP. Rode a ingestão antes:',
        '  npm run real -- dados\\semanal-estados-desde-2013.xlsx',
      ]);
      process.exitCode = 1;
      return;
    }

    const existeDestino = (await admin.query(
      'select 1 from pg_database where datname = $1', [args.destino],
    )).rows.length > 0;

    if (existeDestino && !args.recriar) {
      box(`1/2 · ${args.destino} já existe`, [
        'Mantido como está. O gerador de cliente decide se há algo a fazer.',
        '',
        'Para refazer a cópia do zero: --recriar',
      ]);
    } else {
      box(`1/2 · Copiando ${args.origem} → ${args.destino}`, [
        `${linhasAnp} linhas de preço da ANP na origem.`,
        `${args.origem} não é alterado.`,
      ]);
      if (existeDestino) await admin.query(`drop database ${args.destino} with (force)`);
      // `template` exige que ninguém esteja conectado na origem.
      await admin.query(`create database ${args.destino} template ${args.origem}`);
      console.log('  cópia pronta');
    }
  } finally {
    await admin.end();
  }

  box('2/2 · Gerando o cliente fictício', [
    'Cada compra é ancorada no preço REAL do município naquela semana real.',
    'A EMPRESA é inventada; o PREÇO continua sendo o da ANP.',
  ]);

  try {
    execFileSync(
      process.execPath,
      [
        path.join(RAIZ, 'scripts/seed-cliente.ts'),
        '--db', url(args.destino),
        ...(args.recriar ? ['--recriar'] : []),
      ],
      {
        stdio: 'inherit',
        cwd: RAIZ,
        env: { ...process.env, PERMITIR_CLIENTE_FICTICIO: '1' },
      },
    );
  } catch {
    console.error('\n✗ A geração do cliente falhou no passo acima.');
    process.exitCode = 1;
    return;
  }

  box('Pronto', [
    'Suba a interface apontando para a vitrine:',
    '',
    `  PowerShell:  $env:TCC_BANCO="${args.destino}"; npm run dev`,
    `  bash/zsh:    TCC_BANCO=${args.destino} npm run dev`,
    '',
    '  → http://localhost:3000',
    '',
    'O cabeçalho mostra DOIS selos: ANP (preço real) e CLIENTE FICTÍCIO.',
    'Nenhum número de cliente desta vitrine é métrica do produto.',
  ]);
}

await main();

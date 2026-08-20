#!/usr/bin/env node
// Prepara o banco com a série REAL da ANP, num comando.
//
//   npm run real -- dados/semanal-estados-desde-2013.xlsx [outros.xlsx ...]
//
// Faz, em ordem:
//   1. confere a conexão com o Postgres;
//   2. cria o banco (padrão `tcc_real`) e aplica shim + migrations, SE ele
//      ainda não existir;
//   3. ingere cada arquivo passado — idempotente, pode rodar de novo;
//   4. roda o backtest walk-forward sobre a série real e grava as previsões.
//
// POR QUE NÃO REUSA `prepararBanco` DO HARNESS: aquele DERRUBA o banco antes de
// criar, que é o certo para teste e é destruição de dado aqui. Este script nunca
// derruba nada sem `--recriar` explícito — a série da ANP custa download e hash,
// e recriar por engano apaga a proveniência junto.
//
// O banco é SEPARADO do `tcc_demo` de propósito: a emenda de 2026-08-14 no
// CLAUDE.md exige que dado fictício não conviva com dado real. Se os dois caírem
// no mesmo banco, a interface mostra alarme e recusa todos os números.

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { CONEXAO } from '../tests/harness.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_MIGRATIONS = path.join(RAIZ, 'supabase', 'migrations');
const DIR_SQL_APOIO = path.join(RAIZ, 'tests', 'sql');

const BANCO_PADRAO = 'tcc_real';

interface Args {
  readonly banco: string;
  readonly recriar: boolean;
  readonly semBacktest: boolean;
  readonly arquivos: readonly string[];
}

function lerArgs(argv: readonly string[]): Args {
  const arquivos: string[] = [];
  let banco = process.env.TCC_BANCO?.trim() || BANCO_PADRAO;
  let recriar = false;
  let semBacktest = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--banco') {
      banco = argv[i + 1] ?? banco;
      i += 1;
    } else if (a === '--recriar') {
      recriar = true;
    } else if (a === '--sem-backtest') {
      semBacktest = true;
    } else if (a !== undefined && !a.startsWith('--')) {
      arquivos.push(a);
    }
  }
  return { banco, recriar, semBacktest, arquivos };
}

function box(titulo: string, linhas: readonly string[]): void {
  console.log(`\n${titulo}`);
  console.log('─'.repeat(Math.max(titulo.length, 62)));
  for (const l of linhas) console.log(l);
  console.log('');
}

function urlDo(banco: string): string {
  const cred = CONEXAO.password === ''
    ? CONEXAO.user
    : `${CONEXAO.user}:${encodeURIComponent(CONEXAO.password)}`;
  return `postgres://${cred}@${CONEXAO.host}:${CONEXAO.port}/${banco}`;
}

function urlSegura(banco: string): string {
  return urlDo(banco).replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');
}

async function conferirConexao(): Promise<boolean> {
  const c = new pg.Client({ ...CONEXAO, database: 'postgres', connectionTimeoutMillis: 4000 });
  try {
    await c.connect();
    const { rows } = await c.query<{ v: string }>('select version() v');
    console.log(`✓ Postgres respondeu em ${CONEXAO.host}:${CONEXAO.port}`);
    console.log(`  ${(rows[0]?.v ?? '').split(',')[0]}`);
    return true;
  } catch (erro) {
    box('✗ Não consegui falar com o Postgres', [
      `Tentei: ${CONEXAO.user}@${CONEXAO.host}:${CONEXAO.port}`,
      `Erro:   ${(erro as Error).message}`,
      '',
      '  Docker (igual em Windows, Mac e Linux):',
      '    docker run -d --name tcc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16',
      '',
      '  Depois, no PowerShell:',
      '    $env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"',
      '  No bash/zsh:',
      '    export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"',
    ]);
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function existe(banco: string): Promise<boolean> {
  const c = new pg.Client({ ...CONEXAO, database: 'postgres' });
  await c.connect();
  try {
    const { rows } = await c.query('select 1 from pg_database where datname = $1', [banco]);
    return rows.length > 0;
  } finally {
    await c.end();
  }
}

/** Cria o banco e aplica shim + migrations de produção + grants. */
async function criar(banco: string, recriar: boolean): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(banco)) throw new Error(`nome de banco inválido: ${banco}`);

  const admin = new pg.Client({ ...CONEXAO, database: 'postgres' });
  await admin.connect();
  try {
    if (recriar) await admin.query(`drop database if exists ${banco} with (force)`);
    await admin.query(`create database ${banco}`);
  } finally {
    await admin.end();
  }

  const c = new pg.Client({ ...CONEXAO, database: banco });
  await c.connect();
  try {
    await c.query(await readFile(path.join(DIR_SQL_APOIO, '00_shim_supabase.sql'), 'utf8'));

    const migrations = (await readdir(DIR_MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
    if (migrations.length === 0) throw new Error(`nenhuma migration em ${DIR_MIGRATIONS}`);
    for (const arquivo of migrations) {
      try {
        await c.query(await readFile(path.join(DIR_MIGRATIONS, arquivo), 'utf8'));
      } catch (erro) {
        throw new Error(`migration ${arquivo} falhou: ${(erro as Error).message}`);
      }
    }
    console.log(`  ${migrations.length} migrations aplicadas`);

    await c.query(await readFile(path.join(DIR_SQL_APOIO, '99_grants_service_role.sql'), 'utf8'));
  } finally {
    await c.end();
  }
}

function rodar(script: string, args: readonly string[], env: Record<string, string> = {}): void {
  execFileSync(process.execPath, [path.join(RAIZ, script), ...args], {
    stdio: 'inherit',
    cwd: RAIZ,
    // Os .xlsx da ANP passam de 100 mil linhas; o padrão do Node não dá conta.
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144', ...env },
  });
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));

  if (args.arquivos.length === 0) {
    console.error('Passe os arquivos da ANP. Exemplo:\n');
    console.error('  npm run real -- dados/semanal-estados-desde-2013.xlsx\n');
    console.error('Quais arquivos baixar e de onde: docs/INGESTAO_ANP.md');
    process.exitCode = 2;
    return;
  }

  console.log('Preparando o banco com a série REAL da ANP.');
  console.log('Este banco é separado do `tcc_demo` — dado real e fictício não se misturam.\n');

  if (!(await conferirConexao())) {
    process.exitCode = 1;
    return;
  }

  try {
    const jaExiste = await existe(args.banco);

    if (jaExiste && !args.recriar) {
      box(`1/3 · Banco ${args.banco} já existe`, [
        'Pulando criação e migrations. A ingestão é idempotente: reprocessar os',
        'mesmos arquivos não duplica linha.',
        '',
        'Para começar do zero: --recriar (apaga tudo que está lá).',
      ]);
    } else {
      box(`1/3 · Criando o banco ${args.banco}`, [
        jaExiste ? 'Recriando do zero (--recriar).' : 'Aplicando shim + migrations de produção.',
      ]);
      await criar(args.banco, args.recriar);
    }

    box('2/3 · Ingerindo os arquivos da ANP', [
      'O contrato de colunas é conferido a cada arquivo. Se não bater, o script',
      'PARA e lista o cabeçalho recebido — nada é preenchido por aproximação.',
    ]);
    rodar('scripts/ingest-anp.ts', ['--db', urlDo(args.banco), ...args.arquivos]);

    if (!args.semBacktest) {
      box('3/3 · Backtest walk-forward sobre a série real', [
        'As previsões saem do motor rodando sobre a série da ANP, com o modelo',
        'reescolhido a cada origem usando só erros cujo alvo já se realizou.',
      ]);
      rodar('scripts/backtest.ts', ['--db', urlDo(args.banco), '--gravar']);
    }

    box('Pronto', [
      `Banco: ${urlSegura(args.banco)}`,
      '',
      'Suba a interface apontando para ele:',
      '',
      `  PowerShell:  $env:TCC_BANCO="${args.banco}"; npm run dev`,
      `  bash/zsh:    TCC_BANCO=${args.banco} npm run dev`,
      '',
      '  → http://localhost:3000',
      '',
      'A interface identifica a origem sozinha, lendo a coluna `fonte`: as telas',
      'de preço, previsão, simulador e placar aparecem com selo ANP e data de',
      'coleta. Benchmark, relatório e alerta ficam vazios — dependem de um',
      'cliente, e não existe cliente real.',
      '',
      'Registre a coleta em DATA_PROVENANCE.md: URL, licença, data, período e',
      'hash SHA-256 de cada arquivo. Sem isso o dado não conta como coletado.',
    ]);
  } catch {
    console.error('\n✗ A preparação falhou no passo acima.');
    process.exitCode = 1;
  }
}

await main();

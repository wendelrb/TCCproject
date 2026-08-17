#!/usr/bin/env node
// Prepara a demo do zero, num comando: confere a conexão, cria e popula o banco
// `tcc_demo` e roda o backtest que gera as previsões.
//
//   npm run demo:dados
//
// Depois:
//   npm run dev     (ou npm run demo, que faz os dois)

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

import { CONEXAO } from '../tests/harness.ts';
import { BANCO_DEMO, urlDemoSegura } from '../app/lib/pgurl.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');

function box(titulo: string, linhas: readonly string[]): void {
  console.log(`\n${titulo}`);
  console.log('─'.repeat(Math.max(titulo.length, 60)));
  for (const l of linhas) console.log(l);
  console.log('');
}

async function conferirConexao(): Promise<boolean> {
  const cliente = new pg.Client({ ...CONEXAO, database: 'postgres', connectionTimeoutMillis: 4000 });
  try {
    await cliente.connect();
    const { rows } = await cliente.query<{ v: string }>('select version() v');
    console.log(`✓ Postgres respondeu em ${CONEXAO.host}:${CONEXAO.port}`);
    console.log(`  ${(rows[0]?.v ?? '').split(',')[0]}`);
    return true;
  } catch (erro) {
    const msg = (erro as Error).message;
    box('✗ Não consegui falar com o Postgres', [
      `Tentei: ${CONEXAO.user}@${CONEXAO.host}:${CONEXAO.port}`,
      `Erro:   ${msg}`,
      '',
      'Escolha UM caminho:',
      '',
      '  Docker (mais simples, funciona igual em Windows, Mac e Linux):',
      '    docker run -d --name tcc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16',
      '    Depois exporte:  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres',
      '',
      '  Postgres já instalado na máquina:',
      '    aponte a variável para ele, por exemplo',
      '    DATABASE_URL=postgres://postgres:SUA_SENHA@127.0.0.1:5432/postgres',
      '',
      'No PowerShell:  $env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"',
      'No bash/zsh:    export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"',
      '',
      'O nome do banco na URL não importa: o script cria e usa `tcc_demo`.',
    ]);
    return false;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

function rodar(script: string, args: readonly string[], env: Record<string, string> = {}): void {
  execFileSync(process.execPath, [path.join(RAIZ, script), ...args], {
    stdio: 'inherit',
    cwd: RAIZ,
    env: { ...process.env, ...env },
  });
}

async function main(): Promise<void> {
  console.log('Preparando a demo — TODOS os dados gerados aqui são FICTÍCIOS.\n');

  if (!(await conferirConexao())) {
    process.exitCode = 1;
    return;
  }

  try {
    box('1/2 · Criando e populando o banco ' + BANCO_DEMO, [
      'Aplica as migrations reais, cria as duas organizações de demonstração e',
      'gera a série semanal e os abastecimentos fictícios.',
    ]);
    rodar('scripts/seed-demo.ts', [], { PERMITIR_SEED_DEMO: '1' });

    box('2/2 · Rodando o backtest walk-forward', [
      'As previsões NÃO são semeadas: saem do motor de verdade rodando sobre a',
      'série fictícia. As métricas abaixo são, portanto, fictícias também.',
    ]);
    rodar('scripts/backtest.ts', ['--gravar']);

    box('Pronto', [
      `Banco: ${urlDemoSegura()}`,
      '',
      'Agora suba a interface:',
      '  npm run dev        → http://localhost:3000',
      '',
      'Ou gere a página estática, que abre sem servidor:',
      '  npm run demo:estatica',
      '',
      'Nenhum número desta demo pode ser citado como métrica do produto.',
    ]);
  } catch {
    // Os scripts filhos já imprimiram o próprio erro; não repetir o ruído.
    console.error('\n✗ A preparação falhou no passo acima.');
    process.exitCode = 1;
  }
}

await main();

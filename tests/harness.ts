// Harness dos testes de banco.
//
// Cria um banco descartável, aplica o shim do Supabase, aplica TODAS as
// migrations de produção na ordem e devolve um pool. Nada aqui toca banco de
// produção: o banco de teste é derrubado e recriado a cada execução.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DIR_MIGRATIONS = path.join(RAIZ, 'supabase', 'migrations');
const DIR_SQL_TESTE = path.join(AQUI, 'sql');

export const CONEXAO = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? '',
} as const;

const BANCO_PADRAO = process.env.PGDATABASE_TESTE ?? 'tcc_rls_test';

async function lerSql(diretorio: string, arquivo: string): Promise<string> {
  return readFile(path.join(diretorio, arquivo), 'utf8');
}

/**
 * Sobe um banco limpo com shim + migrations aplicados.
 *
 * O nome é parametrizável porque `node --test` roda cada arquivo de teste em
 * processo próprio e em paralelo: dois arquivos derrubando o MESMO banco se
 * atropelam.
 */
export async function prepararBanco(banco: string = BANCO_PADRAO): Promise<Pool> {
  if (!/^[a-z_][a-z0-9_]*$/.test(banco)) {
    throw new Error(`nome de banco inválido: ${banco}`);
  }

  const admin = new pg.Client({ ...CONEXAO, database: 'postgres' });
  await admin.connect();
  await admin.query(`drop database if exists ${banco} with (force)`);
  await admin.query(`create database ${banco}`);
  await admin.end();

  const pool = new pg.Pool({ ...CONEXAO, database: banco, max: 4 });

  const cliente = await pool.connect();
  try {
    await cliente.query(await lerSql(DIR_SQL_TESTE, '00_shim_supabase.sql'));

    const migrations = (await readdir(DIR_MIGRATIONS))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (migrations.length === 0) {
      throw new Error(`nenhuma migration encontrada em ${DIR_MIGRATIONS}`);
    }

    for (const arquivo of migrations) {
      try {
        await cliente.query(await lerSql(DIR_MIGRATIONS, arquivo));
      } catch (erro) {
        throw new Error(`migration ${arquivo} falhou: ${(erro as Error).message}`);
      }
    }

    await cliente.query(await lerSql(DIR_SQL_TESTE, '99_grants_service_role.sql'));
    return pool;
  } finally {
    cliente.release();
  }
}

export interface Identidade {
  readonly role: 'authenticated' | 'anon' | 'service_role';
  readonly userId?: string;
}

/**
 * Executa `fn` sob a identidade dada e SEMPRE desfaz por rollback.
 *
 * `set local role` + `request.jwt.claims` reproduzem o que o PostgREST faz a
 * cada request no Supabase: assume o papel do token e publica as claims como
 * setting de transação, que é de onde auth.uid() lê.
 */
export async function como<T>(
  pool: Pool,
  identidade: Identidade,
  fn: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    if (identidade.userId !== undefined) {
      await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: identidade.userId, role: identidade.role }),
      ]);
    }
    await cliente.query(`set local role ${identidade.role}`);
    return await fn(cliente);
  } finally {
    await cliente.query('rollback').catch(() => undefined);
    cliente.release();
  }
}

/** Captura o SQLSTATE de uma operação que se espera que falhe. */
export async function capturarErro(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (erro) {
    const código = (erro as { code?: string }).code;
    return código ?? `sem-sqlstate:${(erro as Error).message}`;
  }
  return 'NAO_FALHOU';
}

export async function linhas<T extends QueryResultRow>(
  cliente: PoolClient,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const r = await cliente.query<T>(sql, params as unknown[]);
  return r.rows;
}

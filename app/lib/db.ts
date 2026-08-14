import pg from 'pg';

/**
 * Acesso ao banco da DEMO.
 *
 * O ponto importante: as consultas rodam sob `role authenticated` com
 * `request.jwt.claims` preenchido — exatamente como o PostgREST faz no Supabase.
 * Ou seja, **a RLS que isola as organizações é a de verdade**, com as policies
 * das migrations de produção. O que é falso aqui é o dado, não o mecanismo.
 */

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/tcc_demo',
  max: 6,
});

export async function comoUsuario<T>(
  userId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await cliente.query('set local role authenticated');
    return await fn(cliente);
  } finally {
    await cliente.query('rollback').catch(() => undefined);
    cliente.release();
  }
}

export type { PoolClient } from 'pg';

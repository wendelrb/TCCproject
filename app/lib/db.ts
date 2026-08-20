import pg from 'pg';

import { urlBanco } from './pgurl.ts';

/**
 * Acesso ao banco do app — `tcc_demo` por padrão, ou o que `TCC_BANCO` disser.
 *
 * O ponto importante: as consultas rodam sob `role authenticated` com
 * `request.jwt.claims` preenchido — exatamente como o PostgREST faz no Supabase.
 * Ou seja, **a RLS que isola as organizações é a de verdade**, com as policies
 * das migrations de produção. O mecanismo é o mesmo em qualquer banco; o que
 * muda é a procedência do dado, e quem responde por ela é `proveniencia.ts`.
 */

const pool = new pg.Pool({ connectionString: urlBanco(), max: 6 });

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

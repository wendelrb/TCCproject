// Fixtures dos testes.
//
// ATENÇÃO (CLAUDE.md § DADOS): estes valores NÃO são dados de produto. São
// fixtures de teste, vivem só no banco descartável criado pelo harness e nunca
// são inseridos em banco real. A regra "nunca gere dados sintéticos" proíbe
// preencher TABELA DE PRODUTO com número inventado — o que se prova aqui é
// comportamento de isolamento, e isolamento não se prova sem duas organizações
// que existam. Registrado em ASSUMPTIONS.md A-003.

import type { Pool } from 'pg';

export const ORG_A = '0a000000-0000-4000-8000-000000000001';
export const ORG_B = '0b000000-0000-4000-8000-000000000002';

export const USER_A = 'aa000000-0000-4000-8000-000000000001';
export const USER_B = 'bb000000-0000-4000-8000-000000000002';
export const USER_SEM_ORG = 'cc000000-0000-4000-8000-000000000003';

export const LOTE_A = '1a000000-0000-4000-8000-000000000001';
export const LOTE_B = '1b000000-0000-4000-8000-000000000002';

export async function semear(pool: Pool): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');

    await c.query(
      `insert into auth.users (id, email) values
         ($1, 'a@teste.invalid'), ($2, 'b@teste.invalid'), ($3, 'sem-org@teste.invalid')`,
      [USER_A, USER_B, USER_SEM_ORG],
    );

    await c.query(
      `insert into public.organizations (id, nome) values
         ($1, 'Transportadora A'), ($2, 'Industria B')`,
      [ORG_A, ORG_B],
    );

    await c.query(
      `insert into public.users_organizations (user_id, organization_id, papel) values
         ($1, $3, 'proprietario'), ($2, $4, 'proprietario')`,
      [USER_A, USER_B, ORG_A, ORG_B],
    );

    await c.query(
      `insert into public.import_batches
         (id, organization_id, criado_por, arquivo_nome, conteudo_hash,
          linhas_recebidas, linhas_aceitas, linhas_rejeitadas, colunas_rejeitadas)
       values
         ($1, $3, $5, 'abastecimentos.csv', 'hash-lote-a', 2, 2, 0, '{}'),
         ($2, $4, $6, 'abastecimentos.csv', 'hash-lote-b', 1, 1, 0, '{placa}')`,
      [LOTE_A, LOTE_B, ORG_A, ORG_B, USER_A, USER_B],
    );

    await c.query(
      `insert into public.fuel_purchases
         (organization_id, import_batch_id, data, uf, municipio, municipio_norm,
          produto, litros, valor_total)
       values
         ($1, $3, date '2026-07-06', 'SP', 'Campinas', 'CAMPINAS', 'DIESEL_S10', 1200.000, 7440.00),
         ($1, $3, date '2026-07-13', 'SP', 'Campinas', 'CAMPINAS', 'DIESEL_S10',  800.000, 4992.00),
         ($2, $4, date '2026-07-06', 'MG', 'Uberlandia','UBERLANDIA','DIESEL_S10',2000.000,12300.00)`,
      [ORG_A, ORG_B, LOTE_A, LOTE_B],
    );

    await c.query('commit');
  } catch (erro) {
    await c.query('rollback');
    throw erro;
  } finally {
    c.release();
  }
}

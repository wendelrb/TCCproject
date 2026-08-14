// Teste automatizado de isolamento multi-tenant.
//
// CLAUDE.md § CÓDIGO: "RLS habilitada em toda tabela com dado de cliente, com
// teste automatizado provando que a organização A não lê dados da B. Inspeção
// visual não conta."
//
// Roda contra as MESMAS migrations que vão para produção.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import { prepararBanco, como, capturarErro, linhas } from './harness.ts';
import { semear, ORG_A, ORG_B, USER_A, USER_B, USER_SEM_ORG } from './fixtures.ts';

let pool: Pool;

const comoA = { role: 'authenticated', userId: USER_A } as const;
const comoB = { role: 'authenticated', userId: USER_B } as const;
const comoSemOrg = { role: 'authenticated', userId: USER_SEM_ORG } as const;
const comoAnon = { role: 'anon' } as const;
const comoServico = { role: 'service_role' } as const;

before(async () => {
  pool = await prepararBanco();
  await semear(pool);
});

after(async () => {
  await pool?.end();
});

describe('isolamento de leitura entre organizações', () => {
  it('A lê apenas as compras da própria organização', async () => {
    const r = await como(pool, comoA, (c) =>
      linhas<{ organization_id: string }>(c, 'select organization_id from public.fuel_purchases'),
    );
    assert.equal(r.length, 2);
    assert.ok(r.every((l) => l.organization_id === ORG_A), 'vazou linha de outra organização');
  });

  it('B lê apenas as compras da própria organização', async () => {
    const r = await como(pool, comoB, (c) =>
      linhas<{ organization_id: string }>(c, 'select organization_id from public.fuel_purchases'),
    );
    assert.equal(r.length, 1);
    assert.ok(r.every((l) => l.organization_id === ORG_B), 'vazou linha de outra organização');
  });

  it('A não enxerga NADA da organização de B, mesmo filtrando explicitamente', async () => {
    const r = await como(pool, comoA, (c) =>
      linhas(c, 'select id from public.fuel_purchases where organization_id = $1', [ORG_B]),
    );
    assert.equal(r.length, 0);
  });

  it('usuário sem organização não lê nada', async () => {
    const r = await como(pool, comoSemOrg, (c) => linhas(c, 'select id from public.fuel_purchases'));
    assert.equal(r.length, 0);
  });

  it('lotes de importação também são isolados', async () => {
    const r = await como(pool, comoA, (c) =>
      linhas<{ organization_id: string }>(c, 'select organization_id from public.import_batches'),
    );
    assert.equal(r.length, 1);
    assert.equal(r[0]?.organization_id, ORG_A);
  });

  it('anon não tem sequer privilégio na tabela de compras', async () => {
    const sqlstate = await capturarErro(() =>
      como(pool, comoAnon, (c) => linhas(c, 'select id from public.fuel_purchases')),
    );
    assert.equal(sqlstate, '42501');
  });
});

describe('isolamento de escrita entre organizações', () => {
  it('A não consegue gravar linha carimbada com a organização de B', async () => {
    const sqlstate = await capturarErro(() =>
      como(pool, comoA, (c) =>
        c.query(
          `insert into public.fuel_purchases
             (organization_id, data, uf, municipio, municipio_norm, produto, litros, valor_total)
           values ($1, date '2026-07-20', 'MG', 'Uberlandia', 'UBERLANDIA', 'DIESEL_S10', 10, 62)`,
          [ORG_B],
        ),
      ),
    );
    assert.equal(sqlstate, '42501');
  });

  it('A consegue gravar na própria organização', async () => {
    const afetadas = await como(pool, comoA, async (c) => {
      const r = await c.query(
        `insert into public.fuel_purchases
           (organization_id, data, uf, municipio, municipio_norm, produto, litros, valor_total)
         values ($1, date '2026-07-20', 'SP', 'Campinas', 'CAMPINAS', 'DIESEL_S10', 10, 62)`,
        [ORG_A],
      );
      return r.rowCount;
    });
    assert.equal(afetadas, 1);
  });

  it('UPDATE de A sobre linhas de B não afeta nada', async () => {
    const afetadas = await como(pool, comoA, async (c) => {
      const r = await c.query(
        'update public.fuel_purchases set litros = 1 where organization_id = $1',
        [ORG_B],
      );
      return r.rowCount;
    });
    assert.equal(afetadas, 0);
  });

  it('DELETE de A sobre linhas de B não afeta nada', async () => {
    const afetadas = await como(pool, comoA, async (c) => {
      const r = await c.query('delete from public.fuel_purchases where organization_id = $1', [
        ORG_B,
      ]);
      return r.rowCount;
    });
    assert.equal(afetadas, 0);
  });

  it('A não consegue mover a própria linha para a organização de B', async () => {
    const sqlstate = await capturarErro(() =>
      como(pool, comoA, (c) =>
        c.query('update public.fuel_purchases set organization_id = $1 where organization_id = $2', [
          ORG_B,
          ORG_A,
        ]),
      ),
    );
    assert.equal(sqlstate, '42501');
  });
});

describe('organizações e membresia não vazam', () => {
  it('A vê apenas a própria organização', async () => {
    const r = await como(pool, comoA, (c) => linhas<{ id: string }>(c, 'select id from public.organizations'));
    assert.equal(r.length, 1);
    assert.equal(r[0]?.id, ORG_A);
  });

  it('A não descobre quem pertence à organização de B', async () => {
    const r = await como(pool, comoA, (c) =>
      linhas<{ user_id: string }>(c, 'select user_id from public.users_organizations'),
    );
    assert.equal(r.length, 1);
    assert.equal(r[0]?.user_id, USER_A);
  });
});

describe('dados públicos de referência', () => {
  it('autenticado lê fuel_prices sem erro de privilégio', async () => {
    const r = await como(pool, comoA, (c) => linhas(c, 'select id from public.fuel_prices'));
    assert.equal(r.length, 0); // tabela nasce vazia: ingestão é a Tarefa 2
  });

  it('anon não lê fuel_prices', async () => {
    const sqlstate = await capturarErro(() =>
      como(pool, comoAnon, (c) => linhas(c, 'select id from public.fuel_prices')),
    );
    assert.equal(sqlstate, '42501');
  });
});

describe('service_role', () => {
  it('enxerga as compras de todas as organizações (BYPASSRLS)', async () => {
    const r = await como(pool, comoServico, (c) =>
      linhas<{ n: string }>(c, 'select count(*)::text as n from public.fuel_purchases'),
    );
    assert.equal(r[0]?.n, '3');
  });
});

describe('imutabilidade de forecasts', () => {
  let forecastId = '';

  before(async () => {
    const run = await pool.query<{ id: string }>(
      `insert into public.forecast_runs (modelo_versao, dados_ate, semana_origem)
       values ('teste-v0', date '2026-07-13', date '2026-07-06') returning id`,
    );
    const runId = run.rows[0]?.id;
    assert.ok(runId);
    const f = await pool.query<{ id: string }>(
      `insert into public.forecasts
         (run_id, uf, horizonte_semanas, semana_alvo, valor_previsto, p10, p90, classe, modelo_versao, oficial)
       values ($1, 'SP', 1, date '2026-07-20', 6.2000, 6.0000, 6.4000, 'ESTAVEL', 'teste-v0', true)
       returning id`,
      [runId],
    );
    forecastId = f.rows[0]?.id ?? '';
    assert.ok(forecastId);
  });

  it('UPDATE é recusado mesmo para service_role', async () => {
    const sqlstate = await capturarErro(() =>
      pool.query('update public.forecasts set valor_previsto = 9.9 where id = $1', [forecastId]),
    );
    assert.equal(sqlstate, '23001'); // restrict_violation
  });

  it('DELETE é recusado mesmo para service_role', async () => {
    const sqlstate = await capturarErro(() =>
      pool.query('delete from public.forecasts where id = $1', [forecastId]),
    );
    assert.equal(sqlstate, '23001');
  });

  it('duas previsões oficiais para a mesma UF/horizonte/semana colidem', async () => {
    const run = await pool.query<{ id: string }>(
      `insert into public.forecast_runs (modelo_versao, dados_ate, semana_origem)
       values ('teste-v0', date '2026-07-13', date '2026-07-06') returning id`,
    );
    const sqlstate = await capturarErro(() =>
      pool.query(
        `insert into public.forecasts
           (run_id, uf, horizonte_semanas, semana_alvo, valor_previsto, p10, p90, classe, modelo_versao, oficial)
         values ($1, 'SP', 1, date '2026-07-20', 6.3000, 6.1000, 6.5000, 'ALTA', 'teste-v0', true)`,
        [run.rows[0]?.id],
      ),
    );
    assert.equal(sqlstate, '23505'); // unique_violation
  });
});

describe('idempotência e revisão de fuel_prices', () => {
  const inserir = (preco: string) =>
    pool.query(
      `insert into public.fuel_prices
         (semana_inicio, semana_fim, nivel, uf, produto, produto_fonte, unidade,
          preco_medio_revenda, fonte)
       values (date '2026-07-06', date '2026-07-12', 'UF', 'SP', 'DIESEL_S10',
               'ÓLEO DIESEL S10', 'R$/l', $1, 'ANP')`,
      [preco],
    );

  before(async () => {
    await inserir('6.1000');
  });

  it('reinserir a mesma semana/UF/produto colide em vez de duplicar', async () => {
    const sqlstate = await capturarErro(() => inserir('6.1000'));
    assert.equal(sqlstate, '23505');
  });

  it('reingestão com valor idêntico mantém a revisão', async () => {
    await pool.query(
      `update public.fuel_prices set preco_medio_revenda = 6.1000, coletado_em = now()
        where uf = 'SP' and nivel = 'UF' and semana_inicio = date '2026-07-06'`,
    );
    const r = await pool.query<{ revisao: number; n: string }>(
      `select f.revisao, (select count(*) from public.fuel_prices_revisoes v
                           where v.fuel_price_id = f.id)::text as n
         from public.fuel_prices f
        where f.uf = 'SP' and f.nivel = 'UF' and f.semana_inicio = date '2026-07-06'`,
    );
    assert.equal(r.rows[0]?.revisao, 1);
    assert.equal(r.rows[0]?.n, '0');
  });

  it('valor corrigido pela ANP arquiva o valor anterior e sobe a revisão', async () => {
    await pool.query(
      `update public.fuel_prices set preco_medio_revenda = 6.2500
        where uf = 'SP' and nivel = 'UF' and semana_inicio = date '2026-07-06'`,
    );
    const r = await pool.query<{ revisao: number; anterior: string }>(
      `select f.revisao,
              (select v.valores ->> 'preco_medio_revenda'
                 from public.fuel_prices_revisoes v
                where v.fuel_price_id = f.id order by v.revisao desc limit 1) as anterior
         from public.fuel_prices f
        where f.uf = 'SP' and f.nivel = 'UF' and f.semana_inicio = date '2026-07-06'`,
    );
    assert.equal(r.rows[0]?.revisao, 2);
    assert.equal(r.rows[0]?.anterior, '6.1000');
  });
});

describe('guardas estruturais', () => {
  it('toda tabela do schema public tem RLS habilitada', async () => {
    const r = await pool.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by c.relname`,
    );
    assert.deepEqual(r.rows.map((l) => l.relname), []);
  });

  it('fuel_purchases tem EXATAMENTE as colunas permitidas pela restrição de privacidade', async () => {
    const r = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fuel_purchases'
        order by column_name`,
    );
    assert.deepEqual(r.rows.map((l) => l.column_name), [
      'criado_em',
      'data',
      'id',
      'import_batch_id',
      'litros',
      'municipio',
      'municipio_ibge',
      'municipio_norm',
      'organization_id',
      'preco_litro',
      'produto',
      'uf',
      'valor_total',
    ]);
  });

  it('nenhuma coluna de dado pessoal existe nas tabelas de importação', async () => {
    const r = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('fuel_purchases', 'import_batches')
          and column_name ~ '(placa|cpf|motorista|condutor|cnh|telefone|endereco|email)'`,
    );
    assert.deepEqual(r.rows, []);
  });
});

// Testes do adaptador de modelo externo (docs/CONTRATO_MODELO.md).
//
// O que estes testes protegem, em uma frase: que uma previsão vinda de fora
// entre no placar SEM que nada seja preenchido por aproximação e SEM que
// métrica pronta de terceiro vire número do produto.
//
// Os valores usados aqui são fixtures de teste em banco descartável, não dado
// de produto — mesma justificativa registrada em ASSUMPTIONS.md A-003.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import type { Executor } from '../supabase/functions/_shared/anp/tipos.ts';
import { validarPrevisoes } from '../supabase/functions/_shared/modeloExterno/contrato.ts';
import {
  gravarPrevisoesExternas,
  preencherRealizados,
} from '../supabase/functions/_shared/modeloExterno/persistencia.ts';
import { ErroContratoModelo } from '../supabase/functions/_shared/modeloExterno/tipos.ts';
import { prepararBanco } from './harness.ts';

const CABECALHO =
  'modelo_versao,uf,semana_origem,dados_ate,horizonte_semanas,semana_alvo,valor_previsto,p10,p90';

const CSV_OK = [
  CABECALHO,
  'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.1200,6.0500,6.1900',
  'arima-externo-v1,SP,2026-08-03,2026-08-03,2,2026-08-17,6.1400,6.0200,6.2600',
  'arima-externo-v1,MG,2026-08-03,2026-08-03,1,2026-08-10,5.9800,5.9100,6.0500',
].join('\n');

describe('contrato: o que passa', () => {
  it('CSV canônico é aceito inteiro', () => {
    const { previsoes, relatorio } = validarPrevisoes(CSV_OK);

    assert.equal(relatorio.erros.length, 0);
    assert.equal(previsoes.length, 3);
    assert.deepEqual(relatorio.modelos, ['arima-externo-v1']);
    assert.deepEqual(relatorio.ufs, ['MG', 'SP']);
    assert.equal(previsoes[0]?.valorPrevisto, 6.12);
    assert.equal(previsoes[0]?.semanaAlvo, '2026-08-10');
  });

  it('JSON com as mesmas chaves dá o mesmo resultado do CSV', () => {
    const json = JSON.stringify([
      {
        modelo_versao: 'arima-externo-v1', uf: 'SP', semana_origem: '2026-08-03',
        dados_ate: '2026-08-03', horizonte_semanas: 1, semana_alvo: '2026-08-10',
        valor_previsto: 6.12, p10: 6.05, p90: 6.19,
      },
    ]);
    const { previsoes, relatorio } = validarPrevisoes(json);
    assert.equal(relatorio.erros.length, 0);
    assert.equal(previsoes[0]?.valorPrevisto, 6.12);
    assert.equal(previsoes[0]?.uf, 'SP');
  });

  it('sinônimos comuns de saída de modelo resolvem, e ficam registrados', () => {
    // `yhat`, `lo`, `hi`, `h` são o que sai da maioria dos pipelines de série
    // temporal. Aceitar é pragmático; registrar é obrigatório, porque um
    // sinônimo mal resolvido é erro silencioso.
    const csv = [
      'model,uf,origem,cutoff,h,target,yhat,lo,hi',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19',
    ].join('\n');
    const { previsoes, relatorio } = validarPrevisoes(csv);

    assert.equal(relatorio.erros.length, 0);
    assert.equal(previsoes[0]?.p10, 6.05);
    // 8, e não 9: `uf` já é o nome canônico e não conta como sinônimo.
    assert.equal(relatorio.colunasPorSinonimo.length, 8);
    assert.ok(relatorio.colunasPorSinonimo.some((c) => c.includes('yhat')));
  });

  it('com delimitador ponto-e-vírgula, vírgula decimal é aceita', () => {
    const csv = [
      CABECALHO.replace(/,/g, ';'),
      'arima-externo-v1;SP;2026-08-03;2026-08-03;1;2026-08-10;6,1200;6,0500;6,1900',
    ].join('\n');
    const { previsoes, relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros.length, 0);
    assert.equal(previsoes[0]?.valorPrevisto, 6.12);
  });

  it('data em dd/mm/aaaa é aceita e normalizada para ISO', () => {
    const csv = [
      CABECALHO.replace(/,/g, ';'),
      'arima-externo-v1;SP;03/08/2026;03/08/2026;1;10/08/2026;6,12;6,05;6,19',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    assert.equal(previsoes[0]?.semanaOrigem, '2026-08-03');
    assert.equal(previsoes[0]?.semanaAlvo, '2026-08-10');
  });

  it('intervalo pode ficar todo acima do ponto — é viés, não erro', () => {
    // Coerente com a migration …006 e ASSUMPTIONS.md A-020: só se exige
    // p10 <= p90. Modelo enviesado tem que conseguir denunciar o próprio viés.
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.1200,6.2000,6.3000',
    ].join('\n');
    const { relatorio, previsoes } = validarPrevisoes(csv);
    assert.equal(relatorio.erros.length, 0);
    assert.equal(previsoes.length, 1);
  });
});

/** Captura o erro de contrato. `assert.throws` devolve void e não serve aqui. */
function recusa(fn: () => unknown): ErroContratoModelo {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof ErroContratoModelo) return erro;
    throw erro;
  }
  throw new Error('esperava ErroContratoModelo, mas o arquivo passou');
}

describe('contrato: o que barra o arquivo inteiro', () => {
  it('coluna de métrica pronta derruba tudo', () => {
    const csv = [`${CABECALHO},mae`, 'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19,0.0134'].join('\n');
    const erro = recusa(() => validarPrevisoes(csv));
    assert.match(erro.message, /mae/);
    assert.match(erro.message, /recalculamos aqui/);
  });

  it('coluna de realizado derrruba tudo — o realizado vem da ANP', () => {
    const csv = [
      `${CABECALHO},valor_realizado`,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19,6.13',
    ].join('\n');
    const erro = recusa(() => validarPrevisoes(csv));
    assert.match(erro.message, /realizado/);
  });

  it('o VALOR da métrica barrada não vaza para a mensagem', () => {
    const csv = [
      `${CABECALHO},rmse`,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19,0.0271',
    ].join('\n');
    const erro = recusa(() => validarPrevisoes(csv));
    assert.equal(erro.message.includes('0.0271'), false, 'vazou o valor da métrica recusada');
  });

  it('coluna obrigatória ausente derruba, dizendo qual', () => {
    const csv = [
      'modelo_versao,uf,semana_origem,horizonte_semanas,semana_alvo,valor_previsto,p10,p90',
      'arima-externo-v1,SP,2026-08-03,1,2026-08-10,6.12,6.05,6.19',
    ].join('\n');
    const erro = recusa(() => validarPrevisoes(csv));
    assert.match(erro.message, /dados_ate/);
  });
});

describe('contrato: erros de linha vêm todos juntos', () => {
  it('acumula, não para no primeiro', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,ZZ,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,9,2026-08-10,6.12,6.05,6.19',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,xis,6.05,6.19',
    ].join('\n');
    const { previsoes, relatorio } = validarPrevisoes(csv);

    assert.equal(previsoes.length, 0);
    assert.equal(relatorio.erros.length, 3);
    assert.deepEqual(relatorio.erros.map((e) => e.campo), ['uf', 'horizonte_semanas', 'valor_previsto']);
    assert.equal(relatorio.erros[0]?.linha, 2, 'a linha 1 é o cabeçalho');
  });

  it('semana_alvo que não fecha com origem + horizonte é erro, não é ajustada', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,2,2026-08-10,6.12,6.05,6.19',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros.length, 1);
    assert.equal(relatorio.erros[0]?.campo, 'semana_alvo');
    assert.match(relatorio.erros[0]?.motivo ?? '', /2026-08-17/);
  });

  it('corte anterior à origem é erro — seria execução sem os dados da própria semana', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-07-27,1,2026-08-10,6.12,6.05,6.19',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros[0]?.campo, 'dados_ate');
  });

  it('p10 acima de p90 é erro', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.30,6.05',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros[0]?.campo, 'p10');
  });

  it('duplicata de (modelo, uf, origem, horizonte) é erro', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.15,6.05,6.19',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros.length, 1);
    assert.match(relatorio.erros[0]?.motivo ?? '', /duplicata/);
  });

  it('mesma execução com dois cortes diferentes é contradição', () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.12,6.05,6.19',
      'arima-externo-v1,MG,2026-08-03,2026-08-09,1,2026-08-10,5.98,5.91,6.05',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros[0]?.campo, 'dados_ate');
    assert.match(relatorio.erros[0]?.motivo ?? '', /já declarou corte/);
  });

  it('número ambíguo com ponto E vírgula é recusado, não adivinhado', () => {
    const csv = [
      CABECALHO.replace(/,/g, ';'),
      'arima-externo-v1;SP;2026-08-03;2026-08-03;1;2026-08-10;6.123,45;6,05;6,19',
    ].join('\n');
    const { relatorio } = validarPrevisoes(csv);
    assert.equal(relatorio.erros[0]?.campo, 'valor_previsto');
  });
});

describe('gravação das previsões externas', () => {
  let pool: Pool;
  let exec: Executor;

  const semanas = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10'];
  const precos = [6.00, 6.02, 6.05, 6.07, 6.10, 6.13];

  before(async () => {
    pool = await prepararBanco('tcc_modelo_test');
    exec = {
      async executar(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return { linhasAfetadas: r.rowCount ?? 0 };
      },
      async consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
        const r = await pool.query(sql, params as unknown[]);
        return r.rows as T[];
      },
    };

    for (let i = 0; i < semanas.length; i += 1) {
      await pool.query(
        `insert into public.fuel_prices
           (semana_inicio, semana_fim, nivel, uf, produto, produto_fonte, unidade,
            preco_medio_revenda, fonte, coletado_em)
         values ($1::date, $1::date + 6, 'UF', 'SP', 'DIESEL_S10', 'OLEO DIESEL S10',
                 'R$/l', $2, 'fixture', now())`,
        [semanas[i], precos[i]],
      );
    }
  });

  after(async () => {
    await pool?.end();
  });

  it('cria a execução e grava as previsões', async () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.1100,6.0500,6.1900',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,2,2026-08-17,6.4000,6.3000,6.5000',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    const r = await gravarPrevisoesExternas(exec, previsoes, 'fixture.csv');

    assert.equal(r.execucoes, 1);
    assert.equal(r.execucoesReaproveitadas, 0);
    assert.equal(r.inseridas, 2);
    assert.equal(r.ignoradas, 0);
    assert.deepEqual(r.semanasOrigemSemSerie, []);
  });

  it('a classe é derivada aqui, com a banda da própria UF', async () => {
    // Série até 2026-08-03 termina em 6.10, com banda de R$ 0,02 (o piso).
    // h=1 prevê 6.11 (Δ 0,01, dentro da banda) → ESTAVEL.
    // h=2 prevê 6.40 (Δ 0,30) → ALTA.
    const { rows } = await pool.query<{ h: number; classe: string }>(
      `select horizonte_semanas h, classe::text from public.forecasts
        where modelo_versao = 'arima-externo-v1' order by horizonte_semanas`,
    );
    assert.equal(rows[0]?.classe, 'ESTAVEL');
    assert.equal(rows[1]?.classe, 'ALTA');
  });

  it('reimportar o mesmo arquivo não duplica nem tenta reescrever', async () => {
    // `forecasts` é imutável por trigger: se a gravação tentasse UPDATE, isto
    // estouraria em restrict_violation em vez de devolver zero.
    const csv = [
      CABECALHO,
      'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.1100,6.0500,6.1900',
      'arima-externo-v1,SP,2026-08-03,2026-08-03,2,2026-08-17,6.4000,6.3000,6.5000',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    const r = await gravarPrevisoesExternas(exec, previsoes, 'fixture.csv');

    assert.equal(r.inseridas, 0);
    assert.equal(r.ignoradas, 2);
    assert.equal(r.execucoesReaproveitadas, 1);

    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text n from public.forecasts where modelo_versao = 'arima-externo-v1'`,
    );
    assert.equal(rows[0]?.n, '2');
  });

  it('a classe usa a série cortada em dados_ate, não a série inteira', async () => {
    // Não-vazamento na gravação: prever 6.12 a partir de uma origem antiga, com
    // corte antigo, tem que classificar contra o preço DAQUELA data (6.00), não
    // contra o último preço conhecido hoje (6.13). Contra 6.00, 6.12 é ALTA.
    const csv = [
      CABECALHO,
      'corte-antigo-v1,SP,2026-07-06,2026-07-06,1,2026-07-13,6.1200,6.0500,6.1900',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    await gravarPrevisoesExternas(exec, previsoes, 'fixture.csv');

    const { rows } = await pool.query<{ classe: string }>(
      `select classe::text from public.forecasts where modelo_versao = 'corte-antigo-v1'`,
    );
    assert.equal(rows[0]?.classe, 'ALTA');
  });

  it('origem que não existe na grade da ANP é reportada', async () => {
    const csv = [
      CABECALHO,
      'grade-torta-v1,SP,2026-08-04,2026-08-04,1,2026-08-11,6.1200,6.0500,6.1900',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    const r = await gravarPrevisoesExternas(exec, previsoes, 'fixture.csv');
    assert.deepEqual(r.semanasOrigemSemSerie, ['SP 2026-08-04']);
  });

  it('sem série da ANP para a UF, a gravação PARA em vez de inventar referência', async () => {
    const csv = [
      CABECALHO,
      'arima-externo-v1,RS,2026-08-03,2026-08-03,1,2026-08-10,6.1200,6.0500,6.1900',
    ].join('\n');
    const { previsoes } = validarPrevisoes(csv);
    await assert.rejects(
      () => gravarPrevisoesExternas(exec, previsoes, 'fixture.csv'),
      (e: Error) => {
        assert.equal(e.name, 'ErroContratoModelo');
        assert.match(e.message, /série da ANP para RS/);
        assert.match(e.message, /ingestão da ANP/);
        return true;
      },
    );
  });
});

describe('preenchimento do realizado', () => {
  let pool: Pool;
  let exec: Executor;

  before(async () => {
    pool = await prepararBanco('tcc_modelo_realizado_test');
    exec = {
      async executar(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return { linhasAfetadas: r.rowCount ?? 0 };
      },
      async consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
        const r = await pool.query(sql, params as unknown[]);
        return r.rows as T[];
      },
    };

    for (const [semana, preco] of [['2026-08-03', 6.10], ['2026-08-10', 6.13]] as const) {
      await pool.query(
        `insert into public.fuel_prices
           (semana_inicio, semana_fim, nivel, uf, produto, produto_fonte, unidade,
            preco_medio_revenda, fonte, coletado_em)
         values ($1::date, $1::date + 6, 'UF', 'SP', 'DIESEL_S10', 'OLEO DIESEL S10',
                 'R$/l', $2, 'fixture', now())`,
        [semana, preco],
      );
    }

    // h=1 tem alvo já publicado (2026-08-10); h=2 ainda não (2026-08-17).
    const { previsoes } = validarPrevisoes(
      [
        CABECALHO,
        'arima-externo-v1,SP,2026-08-03,2026-08-03,1,2026-08-10,6.1200,6.0500,6.1900',
        'arima-externo-v1,SP,2026-08-03,2026-08-03,2,2026-08-17,6.1400,6.0200,6.2600',
      ].join('\n'),
    );
    await gravarPrevisoesExternas(exec, previsoes, 'fixture.csv');
  });

  after(async () => {
    await pool?.end();
  });

  it('preenche só o que a ANP já publicou, com o valor da ANP', async () => {
    const n = await preencherRealizados(exec, 'arima-externo-v1');
    assert.equal(n, 1);

    const { rows } = await pool.query<{ v: string; fonte: string }>(
      `select valor_realizado::text v, fonte_realizado fonte from public.forecast_outcomes`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.v, '6.1300');
    assert.match(rows[0]?.fonte ?? '', /fuel_prices/);
  });

  it('rodar de novo não duplica', async () => {
    const n = await preencherRealizados(exec, 'arima-externo-v1');
    assert.equal(n, 0);
  });

  it('o placar já enxerga o modelo externo, com erro calculado por nós', async () => {
    const { rows } = await pool.query<{
      modelo: string; erro: string; dentro: boolean;
    }>(
      `select modelo_versao modelo, erro::text, dentro_do_intervalo dentro
         from public.v_forecast_placar where valor_realizado is not null`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.modelo, 'arima-externo-v1');
    // 6.1300 realizado − 6.1200 previsto
    assert.equal(Number(rows[0]?.erro).toFixed(4), '0.0100');
    assert.equal(rows[0]?.dentro, true);
  });
});

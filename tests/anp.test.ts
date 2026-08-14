// Testes do pipeline de ingestão da ANP.
//
// ⚠️ LEIA ANTES DE CONFIAR NO VERDE DESTA SUÍTE.
//
// Os CSVs abaixo são fixtures escritos por mim para exercitar a LÓGICA do
// parser. Eles NÃO são amostras do arquivo real da ANP — o host da ANP está
// bloqueado pela política de egresso desta sessão (DATA_PROVENANCE.md).
//
// Logo, esta suíte prova: separador, aspas, preâmbulo, decimal BR, data BR,
// classificação de produto, derivação de semana_fim, detecção de gap e
// idempotência da gravação.
//
// Ela NÃO prova que os nomes de coluna em _shared/anp/colunas.ts são os nomes
// que a ANP publica. Isso só se descobre rodando contra o arquivo de verdade, e
// o parser foi feito para FALHAR ALTO nessa hora em vez de adivinhar.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import { prepararBanco } from './harness.ts';
import { lerCsv } from '../supabase/functions/_shared/anp/csv.ts';
import { dataBr, inteiro, normalizar, numeroBr, siglaUf } from '../supabase/functions/_shared/anp/texto.ts';
import { classificarProduto } from '../supabase/functions/_shared/anp/produto.ts';
import { resolverColunas, ErroContratoColunas } from '../supabase/functions/_shared/anp/colunas.ts';
import { parsearAnp } from '../supabase/functions/_shared/anp/parser.ts';
import { analisarCadencia } from '../supabase/functions/_shared/anp/semanas.ts';
import { gravarPrecos } from '../supabase/functions/_shared/anp/persistencia.ts';
import type { Executor } from '../supabase/functions/_shared/anp/tipos.ts';

const CABECALHO =
  'DATA INICIAL;DATA FINAL;ESTADO;MUNICIPIO;PRODUTO;NÚMERO DE POSTOS PESQUISADOS;' +
  'UNIDADE DE MEDIDA;PREÇO MÉDIO REVENDA;DESVIO PADRÃO REVENDA;PREÇO MÍNIMO REVENDA;' +
  'PREÇO MÁXIMO REVENDA;PREÇO MÉDIO DISTRIBUIÇÃO';

const CSV_FIXTURE = [
  CABECALHO,
  '06/07/2026;12/07/2026;SP;CAMPINAS;ÓLEO DIESEL S10;12;R$/l;6,199;0,145;5,990;6,490;5,801',
  '06/07/2026;12/07/2026;SP;SÃO PAULO;ÓLEO DIESEL S10;40;R$/l;6,321;0,201;5,999;6,899;5,912',
  '06/07/2026;12/07/2026;MG;UBERLÂNDIA;ÓLEO DIESEL S10;8;R$/l;6,050;0,110;5,890;6,210;',
  '06/07/2026;12/07/2026;SP;CAMPINAS;GASOLINA COMUM;30;R$/l;5,899;0,120;5,700;6,100;5,200',
  '06/07/2026;12/07/2026;SP;CAMPINAS;ÓLEO DIESEL S500;10;R$/l;5,999;0,130;5,800;6,200;5,300',
].join('\n');

describe('texto: número, data e UF no formato da fonte', () => {
  it('decimal brasileiro com e sem separador de milhar', () => {
    assert.equal(numeroBr('6,199'), 6.199);
    assert.equal(numeroBr('1.234,56'), 1234.56);
    assert.equal(numeroBr('-0,05'), -0.05);
  });

  it('ausência vira null, nunca zero', () => {
    // Preencher com 0 criaria preço fictício de R$ 0,00 na série.
    for (const vazio of ['', '   ', '-', 'N/A', 'ND']) {
      assert.equal(numeroBr(vazio), null, `"${vazio}" deveria virar null`);
    }
    assert.equal(numeroBr(undefined), null);
  });

  it('texto que não é número vira null em vez de NaN', () => {
    assert.equal(numeroBr('abc'), null);
    assert.equal(numeroBr('6,1,9'), null);
  });

  it('data dd/mm/aaaa e ISO', () => {
    assert.equal(dataBr('06/07/2026'), '2026-07-06');
    assert.equal(dataBr('2026-07-06'), '2026-07-06');
  });

  it('data impossível é rejeitada em vez de rolar para o mês seguinte', () => {
    assert.equal(dataBr('31/02/2026'), null);
    assert.equal(dataBr('quinta-feira'), null);
  });

  it('UF por sigla e por nome por extenso', () => {
    assert.equal(siglaUf('SP'), 'SP');
    assert.equal(siglaUf('São Paulo'), 'SP');
    assert.equal(siglaUf('MINAS GERAIS'), 'MG');
    assert.equal(siglaUf('Sao Paulo'), 'SP');
    assert.equal(siglaUf('XX'), null);
  });

  it('normalização remove acento e caixa', () => {
    assert.equal(normalizar('São  Paulo'), 'SAO PAULO');
    assert.equal(normalizar(' Uberlândia '), 'UBERLANDIA');
  });

  it('inteiro trunca em vez de arredondar', () => {
    assert.equal(inteiro('12'), 12);
    assert.equal(inteiro('12,9'), 12);
    assert.equal(inteiro(''), null);
  });
});

describe('csv', () => {
  it('detecta ponto-e-vírgula e lê o cabeçalho', () => {
    const t = lerCsv(CSV_FIXTURE);
    assert.equal(t.delimitador, ';');
    assert.equal(t.linhas.length, 5);
    assert.equal(t.preambuloIgnorado, 0);
  });

  it('pula preâmbulo antes do cabeçalho', () => {
    const t = lerCsv(`Levantamento de Preços\nGerado em 01/01/2026\n\n${CSV_FIXTURE}`);
    assert.equal(t.preambuloIgnorado, 2);
    assert.equal(t.linhas.length, 5);
  });

  it('respeita aspas: vírgula e quebra de linha dentro do campo não separam', () => {
    const t = lerCsv('A;B;C;D\n"x;1";"tem ""aspas""";"duas\nlinhas";4');
    assert.deepEqual(t.linhas[0], ['x;1', 'tem "aspas"', 'duas\nlinhas', '4']);
  });

  it('arquivo sem linha plausível de cabeçalho falha alto', () => {
    assert.throws(() => lerCsv('só uma frase solta'), /não parece ser o CSV esperado/);
  });
});

describe('produto: nomenclatura', () => {
  it('reconhece variantes de grafia do S-10', () => {
    for (const g of ['ÓLEO DIESEL S10', 'OLEO DIESEL S-10', 'DIESEL S 10', 'ÓLEO DIESEL S10 COMUM']) {
      assert.equal(classificarProduto(g), 'DIESEL_S10', g);
    }
  });

  it('outros produtos são OUTRO', () => {
    for (const g of ['GASOLINA COMUM', 'ETANOL HIDRATADO', 'ÓLEO DIESEL S500', 'GNV']) {
      assert.equal(classificarProduto(g), 'OUTRO', g);
    }
  });

  it('diesel de grafia desconhecida vira SUSPEITO, não descarte silencioso', () => {
    // É a assinatura de uma mudança de nomenclatura: precisa aparecer no
    // relatório em vez de sumir da série.
    assert.equal(classificarProduto('ÓLEO DIESEL TIPO NOVO'), 'SUSPEITO');
  });
});

describe('contrato de colunas', () => {
  it('resolve o cabeçalho do fixture', () => {
    const m = resolverColunas(CABECALHO.split(';'));
    assert.equal(m.get('precoMedioRevenda')?.como, 'exato');
    assert.equal(m.get('uf')?.cabecalhoOriginal, 'ESTADO');
  });

  it('cabeçalho sem coluna obrigatória falha com mensagem acionável', () => {
    let erro: unknown;
    try {
      resolverColunas(['DATA INICIAL', 'ESTADO', 'MUNICIPIO']);
    } catch (e) {
      erro = e;
    }
    assert.ok(erro instanceof ErroContratoColunas);
    assert.deepEqual(erro.faltantes, ['produto', 'precoMedioRevenda']);
    assert.match(erro.message, /Cabeçalho recebido: DATA INICIAL \| ESTADO \| MUNICIPIO/);
  });

  it('casamento exato tem precedência sobre aproximado', () => {
    // "PREÇO MÉDIO REVENDA" não pode ser roubado por um candidato mais curto.
    const m = resolverColunas(['DATA INICIAL', 'ESTADO', 'PRODUTO', 'PREÇO MÉDIO REVENDA']);
    assert.equal(m.get('precoMedioRevenda')?.como, 'exato');
  });
});

describe('parser', () => {
  it('aceita só S-10 e descarta o resto contabilizando', () => {
    const { linhas, relatorio } = parsearAnp(CSV_FIXTURE);
    assert.equal(relatorio.linhasLidas, 5);
    assert.equal(linhas.length, 3);
    assert.equal(relatorio.descartes.length, 2);
    assert.deepEqual(
      relatorio.descartes.map((d) => d.motivo),
      ['OUTRO_PRODUTO', 'OUTRO_PRODUTO'],
    );
  });

  it('normaliza valores e município', () => {
    const { linhas } = parsearAnp(CSV_FIXTURE);
    const sp = linhas.find((l) => l.municipioNorm === 'SAO PAULO');
    assert.ok(sp);
    assert.equal(sp.uf, 'SP');
    assert.equal(sp.nivel, 'MUNICIPIO');
    assert.equal(sp.precoMedioRevenda, 6.321);
    assert.equal(sp.numPostosRevenda, 40);
    assert.equal(sp.produtoFonte, 'ÓLEO DIESEL S10');
  });

  it('campo em branco na fonte permanece nulo', () => {
    const { linhas } = parsearAnp(CSV_FIXTURE);
    const mg = linhas.find((l) => l.uf === 'MG');
    assert.ok(mg);
    assert.equal(mg.precoMedioDistribuicao, null);
  });

  it('linha sem preço de revenda é descartada, não zerada', () => {
    const csv = [CABECALHO, '06/07/2026;12/07/2026;SP;JUNDIAI;ÓLEO DIESEL S10;3;R$/l;;;;;'].join('\n');
    const { linhas, relatorio } = parsearAnp(csv);
    assert.equal(linhas.length, 0);
    assert.equal(relatorio.descartes[0]?.motivo, 'SEM_PRECO');
  });

  it('sem coluna de data final, semana_fim é derivada e contabilizada', () => {
    const csv = [
      'DATA INICIAL;ESTADO;PRODUTO;PREÇO MÉDIO REVENDA',
      '06/07/2026;SP;ÓLEO DIESEL S10;6,199',
    ].join('\n');
    const { linhas, relatorio } = parsearAnp(csv);
    assert.equal(linhas[0]?.semanaFim, '2026-07-12');
    assert.equal(relatorio.semanasFimDerivadas, 1);
  });

  it('linha sem município vira nível UF', () => {
    const csv = [CABECALHO, '06/07/2026;12/07/2026;SP;;ÓLEO DIESEL S10;100;R$/l;6,200;0,1;6,0;6,4;5,8'].join('\n');
    const { linhas } = parsearAnp(csv);
    assert.equal(linhas[0]?.nivel, 'UF');
    assert.equal(linhas[0]?.municipio, null);
  });

  it('nomenclatura suspeita sobe no relatório', () => {
    const csv = [CABECALHO, '06/07/2026;12/07/2026;SP;CAMPINAS;ÓLEO DIESEL VERDE;5;R$/l;6,1;0,1;6,0;6,2;5,8'].join('\n');
    const { relatorio } = parsearAnp(csv);
    assert.deepEqual(relatorio.nomenclaturasSuspeitas, ['ÓLEO DIESEL VERDE']);
  });

  it('UF desconhecida é descartada com motivo', () => {
    const csv = [CABECALHO, '06/07/2026;12/07/2026;ZZ;X;ÓLEO DIESEL S10;5;R$/l;6,1;0,1;6,0;6,2;5,8'].join('\n');
    const { linhas, relatorio } = parsearAnp(csv);
    assert.equal(linhas.length, 0);
    assert.equal(relatorio.descartes[0]?.motivo, 'UF_INVALIDA');
  });
});

describe('cadência semanal e gaps', () => {
  it('infere cadência de 7 dias e não acusa gap onde não há', () => {
    const c = analisarCadencia(['2026-07-06', '2026-07-13', '2026-07-20']);
    assert.equal(c.cadenciaModalDias, 7);
    assert.deepEqual(c.anomalias, []);
  });

  it('acusa gap e diz quantas semanas faltam', () => {
    const c = analisarCadencia(['2026-07-06', '2026-07-13', '2026-08-03', '2026-08-10']);
    assert.equal(c.cadenciaModalDias, 7);
    assert.equal(c.anomalias.length, 1);
    assert.equal(c.anomalias[0]?.tipo, 'GAP');
    assert.equal(c.anomalias[0]?.dias, 21);
    assert.equal(c.anomalias[0]?.semanasFaltando, 2);
  });

  it('cadência quinzenal não vira gap falso', () => {
    // Se a fonte mudar o calendário, o correto é reconhecer a nova cadência,
    // não inundar o relatório de gaps inexistentes.
    const c = analisarCadencia(['2026-01-04', '2026-01-18', '2026-02-01', '2026-02-15']);
    assert.equal(c.cadenciaModalDias, 14);
    assert.deepEqual(c.anomalias, []);
  });

  it('série de uma semana só não inventa cadência', () => {
    const c = analisarCadencia(['2026-07-06']);
    assert.equal(c.cadenciaModalDias, null);
  });
});

describe('gravação idempotente em fuel_prices', () => {
  let pool: Pool;
  let exec: Executor;

  before(async () => {
    pool = await prepararBanco('tcc_anp_test');
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
  });

  after(async () => {
    await pool?.end();
  });

  it('primeira execução insere tudo', async () => {
    const { linhas } = parsearAnp(CSV_FIXTURE);
    const r = await gravarPrecos(exec, linhas, 'ANP:fixture', new Date().toISOString());
    assert.equal(r.inseridas, 3);
    assert.equal(r.atualizadas, 0);
  });

  it('segunda execução não duplica: zero inserções', async () => {
    // É esta a definição operacional de idempotência do CLAUDE.md:
    // rodar duas vezes na mesma semana não duplica.
    const { linhas } = parsearAnp(CSV_FIXTURE);
    const r = await gravarPrecos(exec, linhas, 'ANP:fixture', new Date().toISOString());
    assert.equal(r.inseridas, 0);
    assert.equal(r.atualizadas, 3);

    const { rows } = await pool.query<{ n: string }>('select count(*)::text as n from public.fuel_prices');
    assert.equal(rows[0]?.n, '3');
  });

  it('reingestão sem mudança de valor não gera revisão', async () => {
    const { rows } = await pool.query<{ revisao: number; revisoes: string }>(
      `select f.revisao,
              (select count(*) from public.fuel_prices_revisoes v where v.fuel_price_id = f.id)::text as revisoes
         from public.fuel_prices f where f.municipio_norm = 'CAMPINAS'`,
    );
    assert.equal(rows[0]?.revisao, 1);
    assert.equal(rows[0]?.revisoes, '0');
  });

  it('valor corrigido na fonte gera revisão arquivada', async () => {
    const corrigido = CSV_FIXTURE.replace('6,199;0,145', '6,250;0,145');
    const { linhas } = parsearAnp(corrigido);
    await gravarPrecos(exec, linhas, 'ANP:fixture', new Date().toISOString());

    const { rows } = await pool.query<{ revisao: number; anterior: string | null; atual: string }>(
      `select f.revisao, f.preco_medio_revenda::text as atual,
              (select v.valores ->> 'preco_medio_revenda' from public.fuel_prices_revisoes v
                where v.fuel_price_id = f.id order by v.revisao desc limit 1) as anterior
         from public.fuel_prices f where f.municipio_norm = 'CAMPINAS'`,
    );
    assert.equal(rows[0]?.revisao, 2);
    assert.equal(rows[0]?.atual, '6.2500');
    assert.equal(rows[0]?.anterior, '6.1990');
  });
});

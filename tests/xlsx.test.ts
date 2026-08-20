// Testes do leitor de .xlsx — o formato em que a ANP publica a série.
//
// O teste que mais importa aqui é o do número: no XML do xlsx o decimal é
// ponto, e `numeroBr` (usada pelo resto do pipeline) trata ponto como separador
// de MILHAR. Se a conversão falhar, R$ 6,199 vira R$ 6.199,00 em silêncio — sem
// erro, sem descarte, com o gráfico inteiro mil vezes fora de escala.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parsearAnpXlsx } from '../supabase/functions/_shared/anp/parser.ts';
import { lerXlsx, tabelaDeXlsx } from '../supabase/functions/_shared/anp/xlsx.ts';
import { criarXlsbFalso, criarXlsx, data, numero, texto, vazia } from './xlsxFixture.ts';

// 2026-08-03 no serial do Excel (época 1899-12-30).
const SERIAL_2026_08_03 = 46237;
const SERIAL_2026_08_09 = 46243;

describe('leitura crua do xlsx', () => {
  it('lê aba, cabeçalho e células', async () => {
    const bytes = criarXlsx('Plan1', [
      [texto('A'), texto('B')],
      [texto('x'), numero(2)],
    ]);
    const planilhas = await lerXlsx(bytes);

    assert.equal(planilhas.length, 1);
    assert.equal(planilhas[0]?.nome, 'Plan1');
    assert.deepEqual(planilhas[0]?.linhas[0], ['A', 'B']);
    assert.deepEqual(planilhas[0]?.linhas[1], ['x', '2']);
  });

  it('número vira texto BR: ponto decimal do XML vira vírgula', async () => {
    const bytes = criarXlsx('Plan1', [[numero(6.199)], [numero(1234.5)], [numero(42)]]);
    const planilhas = await lerXlsx(bytes);

    assert.deepEqual(planilhas[0]?.linhas[0], ['6,199']);
    assert.deepEqual(planilhas[0]?.linhas[1], ['1234,5'], 'não pode inventar separador de milhar');
    assert.deepEqual(planilhas[0]?.linhas[2], ['42']);
  });

  it('célula com formato de data vira ISO; sem formato, continua número', async () => {
    const bytes = criarXlsx('Plan1', [[data(SERIAL_2026_08_03), numero(SERIAL_2026_08_03)]]);
    const planilhas = await lerXlsx(bytes);

    assert.deepEqual(planilhas[0]?.linhas[0], ['2026-08-03', '46237']);
  });

  it('célula omitida no meio da linha não desloca as seguintes', async () => {
    // No XML do xlsx a célula vazia simplesmente não existe. Quem lê por ordem
    // de aparição desloca tudo à direita e carrega preço na coluna do município.
    const bytes = criarXlsx('Plan1', [[texto('a'), vazia, texto('c')]]);
    const planilhas = await lerXlsx(bytes);

    assert.deepEqual(planilhas[0]?.linhas[0], ['a', '', 'c']);
  });

  it('preâmbulo antes da tabela é pulado', async () => {
    const bytes = criarXlsx('Plan1', [
      [texto('LEVANTAMENTO DE PREÇOS')],
      [vazia],
      [texto('DATA INICIAL'), texto('DATA FINAL'), texto('ESTADO'), texto('PRODUTO')],
      [data(SERIAL_2026_08_03), data(SERIAL_2026_08_09), texto('SAO PAULO'), texto('OLEO DIESEL S10')],
    ]);
    const tabela = await tabelaDeXlsx(bytes);

    assert.equal(tabela.preambuloIgnorado, 2);
    assert.deepEqual(tabela.cabecalho, ['DATA INICIAL', 'DATA FINAL', 'ESTADO', 'PRODUTO']);
    assert.equal(tabela.linhas.length, 1);
  });

  it('arquivo que não é xlsx falha com mensagem, não com stack', async () => {
    await assert.rejects(
      () => lerXlsx(new TextEncoder().encode('isto é um CSV;de;verdade')),
      (e: Error) => {
        assert.equal(e.name, 'ErroFonteAnp');
        assert.match(e.message, /não parece um arquivo \.xlsx/);
        return true;
      },
    );
  });

  it('.xls antigo é reconhecido pelo nome do formato', async () => {
    // A ANP publica a mesma série em .xlsx, .xlsb e .xls conforme o período.
    // Baixar o arquivo errado da lista é o erro provável — a mensagem tem que
    // dizer QUAL formato chegou, não "diretório ZIP não encontrado".
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await assert.rejects(
      () => lerXlsx(ole2),
      (e: Error) => {
        assert.match(e.message, /\.xls antigo/);
        assert.match(e.message, /\.xlsx/);
        return true;
      },
    );
  });

  it('.xlsb é reconhecido: passa pelo ZIP e falha com o motivo certo', async () => {
    // O .xlsb tem o mesmo empacotamento ZIP do .xlsx. Só se distingue por dentro.
    const bytes = criarXlsbFalso();
    await assert.rejects(
      () => lerXlsx(bytes),
      (e: Error) => {
        assert.match(e.message, /\.xlsb/);
        assert.match(e.message, /Use a versão \.xlsx/);
        return true;
      },
    );
  });

  it('aba inexistente lista as abas que existem', async () => {
    const bytes = criarXlsx('SEMANAL', [[texto('A'), texto('B'), texto('C'), texto('D')]]);
    await assert.rejects(
      () => tabelaDeXlsx(bytes, 4, 'MENSAL'),
      (e: Error) => {
        assert.match(e.message, /SEMANAL/);
        return true;
      },
    );
  });
});

describe('xlsx e CSV chegam no mesmo lugar', () => {
  // Nomes de coluna conforme o contrato em _shared/anp/colunas.ts.
  const CABECALHO = [
    texto('DATA INICIAL'), texto('DATA FINAL'), texto('ESTADO'), texto('MUNICIPIO'),
    texto('PRODUTO'), texto('UNIDADE DE MEDIDA'), texto('PREÇO MÉDIO REVENDA'),
    texto('NÚMERO DE POSTOS PESQUISADOS'),
  ];

  it('a série sai do xlsx com o preço certo, não mil vezes maior', async () => {
    const bytes = criarXlsx('SEMANAL', [
      [texto('LEVANTAMENTO DE PREÇOS DE COMBUSTÍVEIS')],
      CABECALHO,
      [
        data(SERIAL_2026_08_03), data(SERIAL_2026_08_09), texto('SAO PAULO'), texto('CAMPINAS'),
        texto('ÓLEO DIESEL S10'), texto('R$/l'), numero(6.199), numero(48),
      ],
      [
        data(SERIAL_2026_08_03), data(SERIAL_2026_08_09), texto('MINAS GERAIS'), texto(''),
        texto('ÓLEO DIESEL S10'), texto('R$/l'), numero(6.05), numero(310),
      ],
      [
        data(SERIAL_2026_08_03), data(SERIAL_2026_08_09), texto('SAO PAULO'), texto('CAMPINAS'),
        texto('GASOLINA COMUM'), texto('R$/l'), numero(5.79), numero(48),
      ],
    ]);

    const { linhas, relatorio } = await parsearAnpXlsx(bytes);

    assert.equal(relatorio.aceitas, 2);
    assert.equal(relatorio.descartes.length, 1, 'a gasolina tem que ser descartada');
    assert.equal(relatorio.descartes[0]?.motivo, 'OUTRO_PRODUTO');

    const campinas = linhas.find((l) => l.municipioNorm === 'CAMPINAS');
    assert.equal(campinas?.precoMedioRevenda, 6.199);
    assert.equal(campinas?.nivel, 'MUNICIPIO');
    assert.equal(campinas?.uf, 'SP');
    assert.equal(campinas?.semanaInicio, '2026-08-03');
    assert.equal(campinas?.semanaFim, '2026-08-09');
    assert.equal(campinas?.numPostosRevenda, 48);

    // Município em branco = linha de UF. É o que separa a série do benchmark.
    const mg = linhas.find((l) => l.uf === 'MG');
    assert.equal(mg?.nivel, 'UF');
    assert.equal(mg?.municipio, null);
  });

  it('coluna obrigatória ausente falha alto, sem adivinhar posição', async () => {
    const bytes = criarXlsx('SEMANAL', [
      [texto('DATA INICIAL'), texto('ESTADO'), texto('ALGUMA OUTRA COISA'), texto('MAIS UMA')],
      [data(SERIAL_2026_08_03), texto('SAO PAULO'), numero(1), numero(2)],
    ]);
    await assert.rejects(
      () => parsearAnpXlsx(bytes),
      (e: Error) => {
        assert.equal(e.name, 'ErroContratoColunas');
        assert.match(e.message, /PRODUTO|produto/);
        assert.match(e.message, /Cabeçalho recebido/);
        return true;
      },
    );
  });
});

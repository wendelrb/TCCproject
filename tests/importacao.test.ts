// Testes da restrição de privacidade na importação.
//
// Esta é a decisão fechada do CLAUDE.md: só data, UF, município, litros,
// valor total, produto. O resto é recusado com mensagem clara, e do recusado
// guarda-se o NOME da coluna, jamais o valor.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validarImportacao } from '../supabase/functions/_shared/importacao/abastecimentos.ts';

const OK = [
  'data;uf;municipio;litros;valor total;produto',
  '06/07/2026;SP;Campinas;1200,000;7440,00;DIESEL S10',
  '13/07/2026;SP;Campinas;800,5;4992,00;DIESEL S10',
].join('\n');

describe('recusa de dado pessoal', () => {
  it('placa derruba o arquivo inteiro', () => {
    const csv = [
      'data;uf;municipio;litros;valor total;placa',
      '06/07/2026;SP;Campinas;1200;7440;ABC1D23',
    ].join('\n');
    const r = validarImportacao(csv);

    assert.equal(r.aceito, false);
    assert.equal(r.colunasRejeitadas[0]?.nome, 'placa');
    assert.equal(r.linhas.length, 0);
    assert.match(r.mensagem, /dado pessoal/);
  });

  it('o VALOR da coluna pessoal nunca aparece em lugar nenhum do resultado', () => {
    // A garantia operacional: a recusa acontece na leitura do cabeçalho, então
    // a placa "ABC1D23" não chega a ser carregada.
    const csv = [
      'data;uf;municipio;litros;valor total;placa;cpf do motorista',
      '06/07/2026;SP;Campinas;1200;7440;ABC1D23;123.456.789-00',
    ].join('\n');
    const r = validarImportacao(csv);

    const serializado = JSON.stringify(r);
    assert.equal(serializado.includes('ABC1D23'), false, 'vazou o valor da placa');
    assert.equal(serializado.includes('123.456.789-00'), false, 'vazou o CPF');
    // Mas o NOME da coluna fica, que é o necessário para a mensagem e auditoria.
    assert.equal(serializado.includes('placa'), true);
  });

  it('reconhece as variações de dado pessoal', () => {
    for (const coluna of [
      'CPF', 'Nome do Motorista', 'CONDUTOR', 'CNH', 'telefone',
      'e-mail', 'endereço', 'matrícula', 'cartão abastecimento',
    ]) {
      const csv = [`data;uf;municipio;litros;valor total;${coluna}`, '06/07/2026;SP;X;1;1;y'].join('\n');
      assert.equal(validarImportacao(csv).aceito, false, `deveria recusar "${coluna}"`);
    }
  });

  it('mensagem diz o que fazer, não só que deu errado', () => {
    const csv = ['data;uf;municipio;litros;valor total;placa', '06/07/2026;SP;X;1;1;y'].join('\n');
    const r = validarImportacao(csv);
    assert.match(r.mensagem, /Remova a\(s\) coluna\(s\) e reenvie/);
    assert.match(r.mensagem, /Nenhum valor dessas colunas foi lido ou armazenado/);
  });
});

describe('aceitação do arquivo conforme', () => {
  it('aceita o conjunto permitido', () => {
    const r = validarImportacao(OK);
    assert.equal(r.aceito, true);
    assert.equal(r.linhas.length, 2);
    assert.equal(r.linhas[0]?.uf, 'SP');
    assert.equal(r.linhas[0]?.litros, 1200);
    assert.equal(r.linhas[0]?.valorTotal, 7440);
    assert.equal(r.linhas[0]?.municipioNorm, 'CAMPINAS');
  });

  it('aceita sinônimos comuns de cabeçalho', () => {
    const csv = [
      'Data do Abastecimento;Estado;Cidade;Volume;Valor Pago',
      '06/07/2026;São Paulo;Campinas;1200,0;7440,00',
    ].join('\n');
    const r = validarImportacao(csv);
    assert.equal(r.aceito, true);
    assert.equal(r.linhas[0]?.uf, 'SP');
  });

  it('coluna obrigatória ausente recusa com o cabeçalho recebido na mensagem', () => {
    const r = validarImportacao('data;uf;produto\n06/07/2026;SP;DIESEL S10');
    assert.equal(r.aceito, false);
    assert.deepEqual(r.colunasFaltando, ['MUNICIPIO', 'LITROS', 'VALOR TOTAL']);
    assert.match(r.mensagem, /Cabeçalho recebido: data \| uf \| produto/);
  });

  it('linha inválida é contabilizada sem derrubar as válidas', () => {
    const csv = [
      'data;uf;municipio;litros;valor total',
      '06/07/2026;SP;Campinas;1200;7440',
      '99/99/2026;SP;Campinas;10;60',
      '13/07/2026;ZZ;Campinas;10;60',
      '20/07/2026;SP;Campinas;0;60',
    ].join('\n');
    const r = validarImportacao(csv);
    assert.equal(r.linhas.length, 1);
    assert.deepEqual(r.errosLinha.map((e) => e.motivo), [
      'data inválida',
      'UF inválida',
      'litros inválido',
    ]);
  });
});

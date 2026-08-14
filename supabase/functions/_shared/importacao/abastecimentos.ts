// Validação do CSV de abastecimentos.
//
// RESTRIÇÃO DE PRIVACIDADE (CLAUDE.md, decisão fechada):
// aceita SOMENTE data, UF, município, litros, valor total, produto.
// Qualquer coluna com placa, motorista, CPF ou outro dado pessoal é rejeitada
// com mensagem clara.
//
// Detalhe que não é detalhe: quando uma coluna é rejeitada, guarda-se o NOME
// dela e **nunca o valor**. Por isso a rejeição acontece na leitura do
// CABEÇALHO, antes de qualquer célula ser lida — não dá para vazar o que nunca
// foi carregado.

import { lerCsv } from '../anp/csv.ts';
import { dataBr, normalizar, numeroBr, siglaUf } from '../anp/texto.ts';

export const COLUNAS_PERMITIDAS = ['DATA', 'UF', 'MUNICIPIO', 'LITROS', 'VALOR TOTAL', 'PRODUTO'] as const;

const SINONIMOS: Readonly<Record<string, readonly string[]>> = {
  DATA: ['DATA', 'DATA ABASTECIMENTO', 'DATA DO ABASTECIMENTO', 'DT'],
  UF: ['UF', 'ESTADO', 'SIGLA UF'],
  MUNICIPIO: ['MUNICIPIO', 'CIDADE'],
  LITROS: ['LITROS', 'QTD LITROS', 'QUANTIDADE', 'VOLUME'],
  'VALOR TOTAL': ['VALOR TOTAL', 'VALOR', 'TOTAL', 'VALOR PAGO'],
  PRODUTO: ['PRODUTO', 'COMBUSTIVEL'],
};

/**
 * Tokens que caracterizam dado pessoal.
 *
 * Lista fechada e conservadora: qualquer um destes no nome da coluna barra o
 * arquivo inteiro. Preferimos recusar um arquivo legítimo a aceitar um com CPF.
 */
const TOKENS_PESSOAIS = [
  'PLACA', 'CPF', 'CNPJ', 'MOTORISTA', 'CONDUTOR', 'NOME', 'CNH', 'RG',
  'DOCUMENTO', 'TELEFONE', 'CELULAR', 'EMAIL', 'E MAIL', 'ENDERECO',
  'MATRICULA', 'FUNCIONARIO', 'CARTAO', 'RASTREADOR',
] as const;

export interface ColunaRejeitada {
  readonly nome: string;
  readonly token: string;
}

export interface LinhaAbastecimento {
  readonly data: string;
  readonly uf: string;
  readonly municipio: string;
  readonly municipioNorm: string;
  readonly litros: number;
  readonly valorTotal: number;
  readonly produto: 'DIESEL_S10';
}

export interface ErroLinha {
  readonly linha: number;
  readonly motivo: string;
}

export interface ResultadoImportacao {
  readonly aceito: boolean;
  /** Nomes das colunas recusadas. NUNCA acompanha valor. */
  readonly colunasRejeitadas: readonly ColunaRejeitada[];
  readonly colunasFaltando: readonly string[];
  readonly linhas: readonly LinhaAbastecimento[];
  readonly errosLinha: readonly ErroLinha[];
  readonly linhasRecebidas: number;
  readonly mensagem: string;
}

/**
 * Nome de coluna comparável: sem acento, caixa alta e com qualquer separador
 * (hífen, underscore, ponto, barra) virando espaço.
 *
 * Sem isso, `e-mail` escapa do token `E MAIL` e o arquivo passa — falha real
 * pega pelo teste de variações.
 */
function chaveColuna(bruto: string): string {
  return normalizar(bruto).replace(/[-_./\\]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectarPessoais(cabecalho: readonly string[]): ColunaRejeitada[] {
  const achados: ColunaRejeitada[] = [];
  for (const bruto of cabecalho) {
    const n = chaveColuna(bruto);
    const token = TOKENS_PESSOAIS.find((t) => n.includes(t));
    if (token !== undefined) achados.push({ nome: bruto, token });
  }
  return achados;
}

function resolver(cabecalho: readonly string[]): Map<string, number> {
  const norm = cabecalho.map(chaveColuna);
  const mapa = new Map<string, number>();
  for (const canonica of COLUNAS_PERMITIDAS) {
    const candidatos = SINONIMOS[canonica] ?? [canonica];
    for (const c of candidatos) {
      const i = norm.indexOf(c);
      if (i !== -1) {
        mapa.set(canonica, i);
        break;
      }
    }
  }
  return mapa;
}

export function validarImportacao(texto: string): ResultadoImportacao {
  const tabela = lerCsv(texto, 3);

  // PRIMEIRO a recusa por dado pessoal. Antes de ler uma célula sequer.
  const rejeitadas = detectarPessoais(tabela.cabecalho);
  if (rejeitadas.length > 0) {
    const nomes = rejeitadas.map((r) => `"${r.nome}"`).join(', ');
    return {
      aceito: false,
      colunasRejeitadas: rejeitadas,
      colunasFaltando: [],
      linhas: [],
      errosLinha: [],
      linhasRecebidas: 0,
      mensagem:
        `Arquivo recusado: contém coluna com dado pessoal — ${nomes}. ` +
        `Este produto aceita somente ${COLUNAS_PERMITIDAS.join(', ')}. ` +
        `Remova a(s) coluna(s) e reenvie. Nenhum valor dessas colunas foi lido ou armazenado.`,
    };
  }

  const mapa = resolver(tabela.cabecalho);
  const obrigatorias = ['DATA', 'UF', 'MUNICIPIO', 'LITROS', 'VALOR TOTAL'] as const;
  const faltando = obrigatorias.filter((c) => !mapa.has(c));
  if (faltando.length > 0) {
    return {
      aceito: false,
      colunasRejeitadas: [],
      colunasFaltando: faltando,
      linhas: [],
      errosLinha: [],
      linhasRecebidas: tabela.linhas.length,
      mensagem:
        `Arquivo recusado: faltam colunas obrigatórias — ${faltando.join(', ')}. ` +
        `Cabeçalho recebido: ${tabela.cabecalho.join(' | ')}.`,
    };
  }

  const linhas: LinhaAbastecimento[] = [];
  const erros: ErroLinha[] = [];

  tabela.linhas.forEach((bruta, i) => {
    const numero = i + 2;
    const em = (c: string): string | undefined => {
      const idx = mapa.get(c);
      return idx === undefined ? undefined : bruta[idx];
    };

    const data = dataBr(em('DATA'));
    const uf = siglaUf(em('UF'));
    const municipio = (em('MUNICIPIO') ?? '').trim();
    const litros = numeroBr(em('LITROS'));
    const valorTotal = numeroBr(em('VALOR TOTAL'));

    if (data === null) return void erros.push({ linha: numero, motivo: 'data inválida' });
    if (uf === null) return void erros.push({ linha: numero, motivo: 'UF inválida' });
    if (municipio === '') return void erros.push({ linha: numero, motivo: 'município ausente' });
    if (litros === null || litros <= 0) return void erros.push({ linha: numero, motivo: 'litros inválido' });
    if (valorTotal === null || valorTotal <= 0) {
      return void erros.push({ linha: numero, motivo: 'valor total inválido' });
    }

    linhas.push({
      data, uf, municipio,
      municipioNorm: normalizar(municipio),
      litros, valorTotal,
      produto: 'DIESEL_S10',
    });
  });

  return {
    aceito: linhas.length > 0,
    colunasRejeitadas: [],
    colunasFaltando: [],
    linhas,
    errosLinha: erros,
    linhasRecebidas: tabela.linhas.length,
    mensagem:
      linhas.length === 0
        ? 'Nenhuma linha válida no arquivo.'
        : `${linhas.length} de ${tabela.linhas.length} linhas aceitas.`,
  };
}

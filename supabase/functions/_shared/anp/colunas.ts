// Contrato de colunas do arquivo da ANP.
//
// ⚠️ NÃO VERIFICADO CONTRA O ARQUIVO REAL.
// A política de egresso desta sessão bloqueia o host da ANP (ver
// DATA_PROVENANCE.md), então os nomes abaixo são candidatos declarados, não
// fatos observados. É exatamente por isso que a resolução FALHA ALTO em vez de
// adivinhar posição de coluna: na primeira execução contra o arquivo de verdade,
// ou casa, ou o erro lista o que veio e o que se esperava. O que não acontece é
// carregar número na coluna errada em silêncio.

import { normalizar } from './texto.ts';

export type CampoAnp =
  | 'semanaInicio'
  | 'semanaFim'
  | 'uf'
  | 'municipio'
  | 'produto'
  | 'unidade'
  | 'precoMedioRevenda'
  | 'desvioPadraoRevenda'
  | 'precoMinRevenda'
  | 'precoMaxRevenda'
  | 'numPostosRevenda'
  | 'precoMedioDistribuicao'
  | 'desvioPadraoDistribuicao'
  | 'precoMinDistribuicao'
  | 'precoMaxDistribuicao'
  | 'numPostosDistribuicao';

interface Contrato {
  readonly campo: CampoAnp;
  readonly obrigatorio: boolean;
  readonly candidatos: readonly string[];
}

export const CONTRATO: readonly Contrato[] = [
  { campo: 'semanaInicio', obrigatorio: true, candidatos: ['DATA INICIAL', 'DATA INICIAL DA SEMANA', 'DATA INICIO'] },
  { campo: 'semanaFim', obrigatorio: false, candidatos: ['DATA FINAL', 'DATA FINAL DA SEMANA', 'DATA FIM'] },
  { campo: 'uf', obrigatorio: true, candidatos: ['ESTADO', 'UF', 'SIGLA DA UF'] },
  { campo: 'municipio', obrigatorio: false, candidatos: ['MUNICIPIO'] },
  { campo: 'produto', obrigatorio: true, candidatos: ['PRODUTO'] },
  { campo: 'unidade', obrigatorio: false, candidatos: ['UNIDADE DE MEDIDA', 'UNIDADE'] },

  { campo: 'precoMedioRevenda', obrigatorio: true, candidatos: ['PRECO MEDIO REVENDA'] },
  { campo: 'desvioPadraoRevenda', obrigatorio: false, candidatos: ['DESVIO PADRAO REVENDA'] },
  { campo: 'precoMinRevenda', obrigatorio: false, candidatos: ['PRECO MINIMO REVENDA'] },
  { campo: 'precoMaxRevenda', obrigatorio: false, candidatos: ['PRECO MAXIMO REVENDA'] },
  { campo: 'numPostosRevenda', obrigatorio: false, candidatos: ['NUMERO DE POSTOS PESQUISADOS', 'NUMERO DE POSTOS PESQUISADOS REVENDA'] },

  { campo: 'precoMedioDistribuicao', obrigatorio: false, candidatos: ['PRECO MEDIO DISTRIBUICAO'] },
  { campo: 'desvioPadraoDistribuicao', obrigatorio: false, candidatos: ['DESVIO PADRAO DISTRIBUICAO'] },
  { campo: 'precoMinDistribuicao', obrigatorio: false, candidatos: ['PRECO MINIMO DISTRIBUICAO'] },
  { campo: 'precoMaxDistribuicao', obrigatorio: false, candidatos: ['PRECO MAXIMO DISTRIBUICAO'] },
  { campo: 'numPostosDistribuicao', obrigatorio: false, candidatos: ['NUMERO DE POSTOS PESQUISADOS DISTRIBUICAO'] },
];

export type ComoResolveu = 'exato' | 'aproximado';

export interface ColunaResolvida {
  readonly indice: number;
  readonly cabecalhoOriginal: string;
  readonly como: ComoResolveu;
}

export type MapaColunas = ReadonlyMap<CampoAnp, ColunaResolvida>;

export class ErroContratoColunas extends Error {
  override readonly name = 'ErroContratoColunas';
  readonly faltantes: readonly CampoAnp[];
  readonly cabecalhoRecebido: readonly string[];

  constructor(faltantes: readonly CampoAnp[], cabecalhoRecebido: readonly string[]) {
    super(
      `contrato de colunas da ANP não bateu. Campos obrigatórios não resolvidos: ` +
        `${faltantes.join(', ')}. Cabeçalho recebido: ${cabecalhoRecebido.join(' | ')}. ` +
        `Ajuste CONTRATO em _shared/anp/colunas.ts com os nomes reais — não altere ` +
        `o parser para assumir posição fixa.`,
    );
    this.faltantes = faltantes;
    this.cabecalhoRecebido = cabecalhoRecebido;
  }
}

export function resolverColunas(cabecalho: readonly string[]): MapaColunas {
  const normalizados = cabecalho.map(normalizar);
  const mapa = new Map<CampoAnp, ColunaResolvida>();
  const usados = new Set<number>();

  // Passo 1: casamento exato. Tem precedência sobre aproximação para que
  // "PRECO MEDIO REVENDA" nunca seja capturado por um candidato mais curto.
  for (const c of CONTRATO) {
    for (const candidato of c.candidatos) {
      const i = normalizados.findIndex((h, idx) => !usados.has(idx) && h === candidato);
      if (i !== -1) {
        mapa.set(c.campo, { indice: i, cabecalhoOriginal: cabecalho[i] ?? '', como: 'exato' });
        usados.add(i);
        break;
      }
    }
  }

  // Passo 2: aproximação por continência, só para o que sobrou.
  for (const c of CONTRATO) {
    if (mapa.has(c.campo)) continue;
    for (const candidato of c.candidatos) {
      const i = normalizados.findIndex(
        (h, idx) => !usados.has(idx) && (h.includes(candidato) || candidato.includes(h)),
      );
      if (i !== -1) {
        mapa.set(c.campo, { indice: i, cabecalhoOriginal: cabecalho[i] ?? '', como: 'aproximado' });
        usados.add(i);
        break;
      }
    }
  }

  const faltantes = CONTRATO.filter((c) => c.obrigatorio && !mapa.has(c.campo)).map((c) => c.campo);
  if (faltantes.length > 0) throw new ErroContratoColunas(faltantes, cabecalho);

  return mapa;
}

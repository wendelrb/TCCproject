// Tipos do pipeline de ingestão da ANP.

export type NivelGeo = 'UF' | 'MUNICIPIO';

/** Linha já normalizada, pronta para gravar em fuel_prices. */
export interface LinhaPreco {
  readonly semanaInicio: string; // ISO yyyy-mm-dd
  readonly semanaFim: string;
  readonly nivel: NivelGeo;
  readonly uf: string;
  readonly municipio: string | null;
  readonly municipioNorm: string | null;
  readonly produtoFonte: string;
  readonly unidade: string;
  readonly precoMedioRevenda: number | null;
  readonly desvioPadraoRevenda: number | null;
  readonly precoMinRevenda: number | null;
  readonly precoMaxRevenda: number | null;
  readonly numPostosRevenda: number | null;
  readonly precoMedioDistribuicao: number | null;
  readonly desvioPadraoDistribuicao: number | null;
  readonly precoMinDistribuicao: number | null;
  readonly precoMaxDistribuicao: number | null;
  readonly numPostosDistribuicao: number | null;
}

export type MotivoDescarte =
  | 'OUTRO_PRODUTO'
  | 'SEM_PRECO'
  | 'UF_INVALIDA'
  | 'DATA_INVALIDA'
  | 'MUNICIPIO_AUSENTE';

export interface Descarte {
  readonly linha: number;
  readonly motivo: MotivoDescarte;
  readonly detalhe: string;
}

export interface RelatorioParse {
  readonly linhasLidas: number;
  readonly aceitas: number;
  readonly descartes: readonly Descarte[];
  /** Toda grafia de produto vista no arquivo, com contagem. Rastreia mudança de nomenclatura. */
  readonly nomenclaturasVistas: ReadonlyMap<string, number>;
  /** Grafias que parecem diesel S-10 mas não bateram com nenhuma variante conhecida. */
  readonly nomenclaturasSuspeitas: readonly string[];
  /** Colunas resolvidas por aproximação, não por nome exato. Merecem conferência. */
  readonly colunasAproximadas: readonly string[];
  /** Linhas em que semana_fim foi derivada (semana_inicio + 6) por ausência da coluna. */
  readonly semanasFimDerivadas: number;
}

export interface ResultadoParse {
  readonly linhas: readonly LinhaPreco[];
  readonly relatorio: RelatorioParse;
}

/** Abstrai o driver de banco: `pg` no Node, postgres.js no Edge Function. */
export interface Executor {
  executar(sql: string, params: readonly unknown[]): Promise<{ linhasAfetadas: number }>;
  consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]>;
}

export class ErroFonteAnp extends Error {
  override readonly name = 'ErroFonteAnp';
}

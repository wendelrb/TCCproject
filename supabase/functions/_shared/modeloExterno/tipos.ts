// Tipos do adaptador de modelo externo.
//
// Contrato completo em docs/CONTRATO_MODELO.md.

/** Uma previsão validada, pronta para gravar em public.forecasts. */
export interface PrevisaoExterna {
  readonly modeloVersao: string;
  readonly uf: string;
  readonly semanaOrigem: string; // ISO yyyy-mm-dd
  readonly dadosAte: string; // ISO yyyy-mm-dd — prova de não-vazamento
  readonly horizonteSemanas: number; // 1..4
  readonly semanaAlvo: string; // ISO yyyy-mm-dd
  readonly valorPrevisto: number;
  readonly p10: number;
  readonly p90: number;
}

export interface ErroLinhaContrato {
  readonly linha: number; // 1-based, contando o cabeçalho como linha 1
  readonly campo: string;
  readonly motivo: string;
}

export interface RelatorioContrato {
  readonly linhasLidas: number;
  readonly aceitas: number;
  readonly erros: readonly ErroLinhaContrato[];
  /** Colunas presentes no arquivo que o contrato não conhece. Ignoradas. */
  readonly colunasIgnoradas: readonly string[];
  /** Campos resolvidos por sinônimo, não pelo nome canônico. Merecem conferência. */
  readonly colunasPorSinonimo: readonly string[];
  readonly modelos: readonly string[];
  readonly ufs: readonly string[];
  readonly origens: readonly string[];
}

export interface ResultadoContrato {
  readonly previsoes: readonly PrevisaoExterna[];
  readonly relatorio: RelatorioContrato;
}

/**
 * Uma execução do modelo: identidade + corte temporal.
 *
 * O agrupamento por (modelo, origem, corte) é o que permite um arquivo único
 * carregar o histórico walk-forward inteiro — uma execução por semana de origem.
 */
export interface ExecucaoExterna {
  readonly modeloVersao: string;
  readonly semanaOrigem: string;
  readonly dadosAte: string;
}

export interface ResultadoImportacaoPrevisoes {
  readonly execucoes: number;
  readonly execucoesReaproveitadas: number;
  readonly inseridas: number;
  /** Já existiam com a mesma identidade (uf, horizonte, alvo, modelo). */
  readonly ignoradas: number;
  readonly semanasOrigemSemSerie: readonly string[];
}

export class ErroContratoModelo extends Error {
  override readonly name = 'ErroContratoModelo';
  readonly erros: readonly ErroLinhaContrato[];

  constructor(mensagem: string, erros: readonly ErroLinhaContrato[] = []) {
    super(mensagem);
    this.erros = erros;
  }
}

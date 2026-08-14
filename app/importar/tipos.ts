// Tipos e constantes da importação.
//
// Vivem FORA de `acoes.ts` porque um módulo marcado com 'use server' só pode
// exportar funções async — qualquer outro export chega como `undefined` no
// cliente e quebra em runtime, não em build.

export interface EstadoImportacao {
  readonly estado: 'inicial' | 'aceito' | 'recusado';
  readonly mensagem: string;
  readonly colunasRejeitadas: readonly string[];
  readonly linhasAceitas: number;
  readonly linhasRecebidas: number;
  readonly errosLinha: readonly { linha: number; motivo: string }[];
  readonly amostra: readonly {
    data: string; uf: string; municipio: string; litros: number; valorTotal: number;
  }[];
}

export const ESTADO_INICIAL: EstadoImportacao = {
  estado: 'inicial',
  mensagem: '',
  colunasRejeitadas: [],
  linhasAceitas: 0,
  linhasRecebidas: 0,
  errosLinha: [],
  amostra: [],
};

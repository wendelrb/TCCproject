// Walk-forward por UF. Sem divisão aleatória, jamais (SPEC §5).
//
// Três coisas precisam ser honestas ao mesmo tempo, e é fácil errar as três:
//
// 1. A PREVISÃO em t+h só vê observações até t.
// 2. A ESCOLHA DO MODELO em t só vê erros de previsões cujo alvo já se
//    realizou até t. Escolher o melhor modelo olhando a série inteira e depois
//    "avaliar" nela é vazamento — e é o erro mais comum em backtest caseiro.
// 3. Os QUANTIS DO RESÍDUO que formam o intervalo P10–P90 seguem a mesma regra
//    da escolha: só resíduos já realizados até t.
//
// Por isso o corte é sempre `alvoIdx <= origemIdx`, e não `origemIdx` sozinho:
// uma previsão feita antes de t mas cujo alvo cai depois de t ainda não tinha
// resultado conhecido em t.

import {
  MODELOS, bandaEstabilidade, classificar, prever, quantil,
  type Classe, type NomeModelo,
} from './modelos.ts';

export interface Observacao {
  readonly semana: string;
  readonly valor: number;
}

export interface ErroWF {
  readonly origemIdx: number;
  readonly alvoIdx: number;
  readonly h: number;
  readonly modelo: NomeModelo;
  readonly previsto: number;
  readonly realizado: number;
  readonly erro: number;
}

export interface PrevisaoEmitida {
  readonly semanaOrigem: string;
  readonly origemIdx: number;
  readonly h: number;
  readonly semanaAlvo: string;
  readonly modelo: NomeModelo;
  readonly previsto: number;
  readonly p10: number;
  readonly p90: number;
  readonly classe: Classe;
  readonly banda: number;
  readonly realizado: number | null;
  /** Quantos resíduos passados sustentaram o intervalo. Sai no relatório. */
  readonly nResiduos: number;
}

export interface OpcoesBacktest {
  readonly horizontes?: readonly number[];
  /** Observações mínimas antes da primeira previsão. */
  readonly minTreino?: number;
  /** Resíduos mínimos para emitir intervalo. Sem eles não há P10–P90 honesto. */
  readonly minResiduos?: number;
  /** Fixa o modelo (usado para gravar o naive como referência). */
  readonly modeloFixo?: NomeModelo;
}

const PADRAO = { horizontes: [1, 2, 3, 4], minTreino: 26, minResiduos: 8 } as const;

/** Erros walk-forward de TODOS os modelos candidatos, em todas as origens. */
export function errosWalkForward(
  serie: readonly Observacao[],
  horizontes: readonly number[],
  minTreino: number,
): ErroWF[] {
  const erros: ErroWF[] = [];
  const n = serie.length;

  for (let origemIdx = minTreino - 1; origemIdx < n; origemIdx += 1) {
    // O corte é o ponto central: o modelo só enxerga até `origemIdx`.
    const historico = serie.slice(0, origemIdx + 1).map((o) => o.valor);

    for (const h of horizontes) {
      const alvoIdx = origemIdx + h;
      const alvo = serie[alvoIdx];
      if (alvo === undefined) continue;

      for (const modelo of MODELOS) {
        const previsto = prever(historico, h, modelo);
        if (previsto === null) continue;
        erros.push({
          origemIdx, alvoIdx, h, modelo, previsto,
          realizado: alvo.valor,
          erro: alvo.valor - previsto,
        });
      }
    }
  }
  return erros;
}

/** MAE de um conjunto de erros. */
function mae(erros: readonly ErroWF[]): number {
  if (erros.length === 0) return Number.POSITIVE_INFINITY;
  return erros.reduce((s, e) => s + Math.abs(e.erro), 0) / erros.length;
}

/**
 * Modelo escolhido na origem `t` para o horizonte `h`.
 *
 * Só considera erros cujo ALVO já se realizou até `t`. Empate resolve pelo
 * naive, que é o baseline — na dúvida, não se troca de modelo.
 */
export function escolherModelo(
  erros: readonly ErroWF[],
  origemIdx: number,
  h: number,
): { modelo: NomeModelo; n: number } {
  const disponiveis = erros.filter((e) => e.h === h && e.alvoIdx <= origemIdx);
  if (disponiveis.length === 0) return { modelo: 'naive', n: 0 };

  let melhor: NomeModelo = 'naive';
  let melhorMae = mae(disponiveis.filter((e) => e.modelo === 'naive'));
  let contagem = disponiveis.filter((e) => e.modelo === 'naive').length;

  for (const modelo of MODELOS) {
    if (modelo === 'naive') continue;
    const doModelo = disponiveis.filter((e) => e.modelo === modelo);
    const m = mae(doModelo);
    if (m < melhorMae) {
      melhorMae = m;
      melhor = modelo;
      contagem = doModelo.length;
    }
  }
  return { modelo: melhor, n: contagem };
}

/**
 * Roda o walk-forward completo e emite as previsões com intervalo e classe.
 *
 * Com `modeloFixo`, pula a seleção — é assim que o naive é gravado como
 * referência na mesma tabela, sob as mesmas regras de intervalo.
 */
export function backtest(
  serie: readonly Observacao[],
  opcoes: OpcoesBacktest = {},
): PrevisaoEmitida[] {
  const horizontes = opcoes.horizontes ?? PADRAO.horizontes;
  const minTreino = opcoes.minTreino ?? PADRAO.minTreino;
  const minResiduos = opcoes.minResiduos ?? PADRAO.minResiduos;

  const erros = errosWalkForward(serie, horizontes, minTreino);
  const emitidas: PrevisaoEmitida[] = [];
  const n = serie.length;

  for (let origemIdx = minTreino - 1; origemIdx < n; origemIdx += 1) {
    const origem = serie[origemIdx];
    if (origem === undefined) continue;

    const historico = serie.slice(0, origemIdx + 1).map((o) => o.valor);
    const banda = bandaEstabilidade(historico);

    for (const h of horizontes) {
      const modelo =
        opcoes.modeloFixo ?? escolherModelo(erros, origemIdx, h).modelo;

      const previsto = prever(historico, h, modelo);
      if (previsto === null) continue;

      // Resíduos do MESMO modelo e horizonte, já realizados até a origem.
      const residuos = erros
        .filter((e) => e.h === h && e.modelo === modelo && e.alvoIdx <= origemIdx)
        .map((e) => e.erro)
        .sort((a, b) => a - b);

      if (residuos.length < minResiduos) continue;

      const alvoIdx = origemIdx + h;
      const alvo = serie[alvoIdx];

      emitidas.push({
        semanaOrigem: origem.semana,
        origemIdx,
        h,
        // Semana-alvo por passo de calendário, para funcionar mesmo além do fim
        // da série observada (é o caso da previsão viva, que ainda não realizou).
        semanaAlvo: alvo?.semana ?? somarSemanas(origem.semana, h),
        modelo,
        previsto,
        p10: previsto + quantil(residuos, 0.1),
        p90: previsto + quantil(residuos, 0.9),
        classe: classificar(previsto, historico[historico.length - 1] ?? previsto, banda),
        banda,
        realizado: alvo?.valor ?? null,
        nResiduos: residuos.length,
      });
    }
  }

  return emitidas;
}

export function somarSemanas(iso: string, semanas: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}

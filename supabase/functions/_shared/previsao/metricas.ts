// Métricas do backtest: RMSE, MAE, MASE, acurácia direcional e PICP.
// Por UF, não só agregado (SPEC §5).

import type { Observacao, PrevisaoEmitida } from './walkforward.ts';

export interface Metricas {
  readonly n: number;
  readonly rmse: number;
  readonly mae: number;
  readonly mase: number;
  readonly direcional: number;
  readonly picp: number;
}

/**
 * Denominador do MASE: MAE do naive de 1 passo, calculado **só na janela de
 * treino**. Usar a série inteira contaminaria a métrica com o período avaliado.
 */
export function escalaMase(serie: readonly Observacao[], minTreino: number): number {
  const ate = Math.min(minTreino, serie.length);
  let soma = 0;
  let n = 0;
  for (let i = 1; i < ate; i += 1) {
    const a = serie[i - 1];
    const b = serie[i];
    if (a !== undefined && b !== undefined) {
      soma += Math.abs(b.valor - a.valor);
      n += 1;
    }
  }
  return n === 0 ? Number.NaN : soma / n;
}

export function calcular(
  previsoes: readonly PrevisaoEmitida[],
  serie: readonly Observacao[],
  escala: number,
): Metricas {
  const comRealizado = previsoes.filter((p) => p.realizado !== null);
  const n = comRealizado.length;
  if (n === 0) {
    return { n: 0, rmse: Number.NaN, mae: Number.NaN, mase: Number.NaN, direcional: Number.NaN, picp: Number.NaN };
  }

  let somaAbs = 0;
  let somaQuad = 0;
  let dentro = 0;
  let acertosDir = 0;
  let avaliaveisDir = 0;

  for (const p of comRealizado) {
    const realizado = p.realizado as number;
    const erro = realizado - p.previsto;
    somaAbs += Math.abs(erro);
    somaQuad += erro * erro;
    if (realizado >= p.p10 && realizado <= p.p90) dentro += 1;

    // Direção medida contra o ÚLTIMO VALOR CONHECIDO na origem — que é a
    // pergunta do cliente: "sobe ou desce a partir de agora?".
    const base = serie[p.origemIdx]?.valor;
    if (base !== undefined) {
      const dirPrev = Math.sign(p.previsto - base);
      const dirReal = Math.sign(realizado - base);
      // Movimento nulo no realizado não é acerto nem erro de direção.
      if (dirReal !== 0) {
        avaliaveisDir += 1;
        if (dirPrev === dirReal) acertosDir += 1;
      }
    }
  }

  const mae = somaAbs / n;
  return {
    n,
    mae,
    rmse: Math.sqrt(somaQuad / n),
    mase: escala > 0 ? mae / escala : Number.NaN,
    direcional: avaliaveisDir === 0 ? Number.NaN : (acertosDir / avaliaveisDir) * 100,
    picp: (dentro / n) * 100,
  };
}

export function porHorizonte(
  previsoes: readonly PrevisaoEmitida[],
  serie: readonly Observacao[],
  escala: number,
): Map<number, Metricas> {
  const saida = new Map<number, Metricas>();
  const horizontes = [...new Set(previsoes.map((p) => p.h))].sort((a, b) => a - b);
  for (const h of horizontes) {
    saida.set(h, calcular(previsoes.filter((p) => p.h === h), serie, escala));
  }
  return saida;
}

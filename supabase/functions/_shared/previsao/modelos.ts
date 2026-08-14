// Modelos de previsão da v1. Simples de propósito (SPEC §5).
//
// REGRA QUE GOVERNA TUDO AQUI: para prever t+h só se pode usar informação
// disponível até t. Nenhuma função deste arquivo recebe a série inteira — todas
// recebem `historico`, que o chamador já cortou em t. É desenho defensivo: não
// dá para vazar futuro sem alterar a assinatura.

export type NomeModelo = 'naive' | 'drift' | 'mm3';

export const MODELOS: readonly NomeModelo[] = ['naive', 'drift', 'mm3'];

/** Janela usada para estimar a inclinação do drift. */
const JANELA_DRIFT = 8;
/** Janela da média móvel curta. */
const JANELA_MM = 3;

/**
 * Prevê `h` passos à frente a partir de `historico`.
 *
 * @param historico valores em ordem cronológica, TODOS anteriores ou iguais a t.
 * @param h horizonte em passos (1 a 4 semanas na v1).
 */
export function prever(historico: readonly number[], h: number, modelo: NomeModelo): number | null {
  const n = historico.length;
  if (n === 0 || h < 1) return null;

  const ultimo = historico[n - 1];
  if (ultimo === undefined) return null;

  switch (modelo) {
    case 'naive':
      return ultimo;

    case 'drift': {
      // Inclinação média por passo numa janela curta. Com menos de 2 pontos não
      // há inclinação estimável e o modelo degenera para o naive — que é o
      // comportamento correto, não um erro.
      const janela = Math.min(JANELA_DRIFT, n - 1);
      if (janela < 1) return ultimo;
      const antigo = historico[n - 1 - janela];
      if (antigo === undefined) return ultimo;
      const inclinacao = (ultimo - antigo) / janela;
      return ultimo + inclinacao * h;
    }

    case 'mm3': {
      const janela = Math.min(JANELA_MM, n);
      let soma = 0;
      for (let i = n - janela; i < n; i += 1) soma += historico[i] ?? 0;
      return soma / janela;
    }
  }
}

/**
 * Banda de estabilidade da UF.
 *
 * A SPEC pede banda explícita "calibrada pelo ruído histórico da própria UF".
 * Usa-se a mediana do |Δ| semanal — mediana e não média porque choque de preço
 * é justamente o que não pode inflar a banda. O piso de R$ 0,02/L é o valor de
 * referência do enunciado: abaixo disso, a variação não é acionável para quem
 * compra combustível.
 */
export function bandaEstabilidade(historico: readonly number[], piso = 0.02): number {
  if (historico.length < 3) return piso;

  const deltas: number[] = [];
  for (let i = 1; i < historico.length; i += 1) {
    const a = historico[i - 1];
    const b = historico[i];
    if (a !== undefined && b !== undefined) deltas.push(Math.abs(b - a));
  }
  if (deltas.length === 0) return piso;

  deltas.sort((x, y) => x - y);
  const mediana = quantil(deltas, 0.5);
  return Math.max(piso, mediana * 0.5);
}

export type Classe = 'ALTA' | 'ESTAVEL' | 'QUEDA';

export function classificar(previsto: number, atual: number, banda: number): Classe {
  const delta = previsto - atual;
  if (Math.abs(delta) < banda) return 'ESTAVEL';
  return delta > 0 ? 'ALTA' : 'QUEDA';
}

/** Quantil empírico por interpolação linear. Espera `ordenados` já ordenado. */
export function quantil(ordenados: readonly number[], p: number): number {
  const n = ordenados.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return ordenados[0] ?? Number.NaN;

  const pos = (n - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  const a = ordenados[baixo] ?? 0;
  const b = ordenados[alto] ?? 0;
  return a + (b - a) * (pos - baixo);
}

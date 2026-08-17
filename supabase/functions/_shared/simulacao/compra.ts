// Simulador de estratégia de compra.
//
// Responde à pergunta que o cliente realmente faz: "compro agora ou espero?" —
// em reais, sobre o volume dele, não em R$/L abstrato.
//
// Duas leituras, de propósito:
//
// 1. RETROSPECTIVA: aplica a estratégia à série já observada e diz o que ela
//    TERIA custado. Não depende de a previsão estar certa, então é a evidência
//    mais difícil de contestar.
// 2. PROSPECTIVA: gera caminhos de preço por bootstrap dos resíduos
//    walk-forward e devolve a DISTRIBUIÇÃO do custo. Intervalo, não número
//    único — porque número único sobre o futuro é fantasia.
//
// Custo de capital entra na conta: antecipar compra imobiliza dinheiro em
// tanque. Ignorar isso faz antecipar parecer sempre melhor do que é.

export interface Parametros {
  /** Litros consumidos por semana. */
  readonly consumoSemanalLitros: number;
  /** Litros que cabem em tanque. Limita quantas semanas dá para antecipar. */
  readonly capacidadeTanqueLitros: number;
  /** Custo de capital ao ano (0.12 = 12% a.a.). */
  readonly custoCapitalAnual: number;
}

export interface ResultadoEstrategia {
  readonly antecipacaoSemanas: number;
  readonly viavel: boolean;
  readonly motivoInviavel: string | null;
  readonly litros: number;
  readonly custoCombustivel: number;
  readonly custoCapital: number;
  readonly custoTotal: number;
  readonly precoMedioEfetivo: number;
  readonly compras: number;
}

const SEMANAS_NO_ANO = 52;

/**
 * Custo de carregar estoque.
 *
 * Comprando N semanas de uma vez, o estoque médio ao longo do ciclo é
 * (N-1)/2 semanas de consumo. É esse capital que fica parado.
 */
function custoDeCarregar(
  valorDaCompra: number,
  antecipacao: number,
  custoCapitalAnual: number,
): number {
  if (antecipacao <= 1) return 0;
  const semanasMediasParado = (antecipacao - 1) / 2;
  return valorDaCompra * (custoCapitalAnual / SEMANAS_NO_ANO) * semanasMediasParado;
}

/**
 * Simula uma estratégia sobre uma sequência de preços.
 *
 * `antecipacao = 1` é a estratégia base: compra o consumo de cada semana na
 * própria semana. `antecipacao = N` compra N semanas de consumo a cada N
 * semanas, ao preço da semana da compra.
 */
export function simularEstrategia(
  precos: readonly number[],
  p: Parametros,
  antecipacaoSemanas: number,
): ResultadoEstrategia {
  const n = precos.length;
  const loteLitros = p.consumoSemanalLitros * antecipacaoSemanas;

  const vazio: ResultadoEstrategia = {
    antecipacaoSemanas,
    viavel: false,
    motivoInviavel: null,
    litros: 0,
    custoCombustivel: 0,
    custoCapital: 0,
    custoTotal: 0,
    precoMedioEfetivo: Number.NaN,
    compras: 0,
  };

  if (n === 0 || antecipacaoSemanas < 1) {
    return { ...vazio, motivoInviavel: 'parâmetros inválidos' };
  }
  if (loteLitros > p.capacidadeTanqueLitros) {
    return {
      ...vazio,
      motivoInviavel:
        `precisaria estocar ${Math.round(loteLitros).toLocaleString('pt-BR')} L, ` +
        `mas o tanque comporta ${Math.round(p.capacidadeTanqueLitros).toLocaleString('pt-BR')} L`,
    };
  }

  let custoCombustivel = 0;
  let custoCapital = 0;
  let litros = 0;
  let compras = 0;

  for (let t = 0; t < n; t += antecipacaoSemanas) {
    const preco = precos[t];
    if (preco === undefined) break;

    // Última compra pode ser parcial: só o consumo que resta no período.
    const semanasCobertas = Math.min(antecipacaoSemanas, n - t);
    const litrosDaCompra = p.consumoSemanalLitros * semanasCobertas;
    const valor = litrosDaCompra * preco;

    custoCombustivel += valor;
    custoCapital += custoDeCarregar(valor, semanasCobertas, p.custoCapitalAnual);
    litros += litrosDaCompra;
    compras += 1;
  }

  const custoTotal = custoCombustivel + custoCapital;
  return {
    antecipacaoSemanas,
    viavel: true,
    motivoInviavel: null,
    litros,
    custoCombustivel,
    custoCapital,
    custoTotal,
    precoMedioEfetivo: litros > 0 ? custoTotal / litros : Number.NaN,
    compras,
  };
}

export interface Comparacao {
  readonly base: ResultadoEstrategia;
  readonly estrategias: readonly ResultadoEstrategia[];
  readonly melhor: ResultadoEstrategia | null;
  /** Economia da melhor sobre a base, em reais. Negativo = a base ganha. */
  readonly economiaDaMelhor: number;
}

export function compararEstrategias(
  precos: readonly number[],
  p: Parametros,
  antecipacoes: readonly number[] = [1, 2, 3, 4],
): Comparacao {
  const estrategias = antecipacoes.map((a) => simularEstrategia(precos, p, a));
  const base = estrategias.find((e) => e.antecipacaoSemanas === 1)
    ?? simularEstrategia(precos, p, 1);

  const viaveis = estrategias.filter((e) => e.viavel);
  let melhor: ResultadoEstrategia | null = null;
  for (const e of viaveis) {
    if (melhor === null || e.custoTotal < melhor.custoTotal) melhor = e;
  }

  return {
    base,
    estrategias,
    melhor,
    economiaDaMelhor: melhor === null || !base.viavel ? 0 : base.custoTotal - melhor.custoTotal,
  };
}

// ---------------------------------------------------------------------------
// Prospectiva: caminhos de preço por bootstrap dos resíduos
// ---------------------------------------------------------------------------

/** PRNG determinístico — mesma semente, mesmo resultado, para a tela não tremer. */
function rng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CenarioOpcoes {
  readonly horizonteSemanas: number;
  readonly caminhos: number;
  readonly semente: number;
}

/**
 * Gera caminhos de preço partindo de `precoAtual`.
 *
 * Cada passo soma um resíduo sorteado do histórico. Usar os resíduos observados
 * em vez de uma normal preserva assimetria e caudas gordas — que é justamente o
 * que importa em preço de combustível, onde o choque para cima é mais violento
 * que o passeio para baixo.
 */
export function gerarCaminhos(
  precoAtual: number,
  residuos: readonly number[],
  o: CenarioOpcoes,
): number[][] {
  if (residuos.length === 0) return [];
  const sortear = rng(o.semente);
  const caminhos: number[][] = [];

  for (let c = 0; c < o.caminhos; c += 1) {
    const caminho: number[] = [];
    let preco = precoAtual;
    for (let h = 0; h < o.horizonteSemanas; h += 1) {
      const r = residuos[Math.floor(sortear() * residuos.length)] ?? 0;
      preco = Math.max(0.5, preco + r);
      caminho.push(preco);
    }
    caminhos.push(caminho);
  }
  return caminhos;
}

export interface DistribuicaoCusto {
  readonly antecipacaoSemanas: number;
  readonly viavel: boolean;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly media: number;
}

export function quantil(ordenados: readonly number[], p: number): number {
  const n = ordenados.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return ordenados[0] ?? Number.NaN;
  const pos = (n - 1) * p;
  const b = Math.floor(pos);
  const a = ordenados[b] ?? 0;
  const c = ordenados[Math.ceil(pos)] ?? 0;
  return a + (c - a) * (pos - b);
}

export interface ResultadoProspectivo {
  readonly distribuicoes: readonly DistribuicaoCusto[];
  /**
   * Fração dos caminhos em que comprar toda semana sai mais barato que
   * antecipar. `NaN` quando não há antecipação comparável.
   */
  readonly probEsperarCompensa: number;
  /**
   * Contra qual antecipação a probabilidade foi medida. `null` quando nenhuma
   * antecipação cabe no tanque — caso em que a pergunta "vale antecipar?" não
   * tem resposta, e a tela precisa dizer isso em vez de mostrar NaN.
   */
  readonly antecipacaoComparada: number | null;
  readonly caminhos: readonly (readonly number[])[];
}

export function simularProspectivo(
  precoAtual: number,
  residuos: readonly number[],
  p: Parametros,
  o: CenarioOpcoes,
  antecipacoes: readonly number[] = [1, 2, 3, 4],
): ResultadoProspectivo {
  const caminhos = gerarCaminhos(precoAtual, residuos, o);
  if (caminhos.length === 0) {
    return { distribuicoes: [], probEsperarCompensa: Number.NaN, antecipacaoComparada: null, caminhos: [] };
  }

  const custosPorAntecipacao = new Map<number, number[]>();
  for (const a of antecipacoes) custosPorAntecipacao.set(a, []);

  for (const caminho of caminhos) {
    for (const a of antecipacoes) {
      const r = simularEstrategia(caminho, p, a);
      if (r.viavel) custosPorAntecipacao.get(a)?.push(r.custoTotal);
    }
  }

  const distribuicoes: DistribuicaoCusto[] = antecipacoes.map((a) => {
    const custos = [...(custosPorAntecipacao.get(a) ?? [])].sort((x, y) => x - y);
    if (custos.length === 0) {
      return { antecipacaoSemanas: a, viavel: false, p10: Number.NaN, p50: Number.NaN, p90: Number.NaN, media: Number.NaN };
    }
    return {
      antecipacaoSemanas: a,
      viavel: true,
      p10: quantil(custos, 0.1),
      p50: quantil(custos, 0.5),
      p90: quantil(custos, 0.9),
      media: custos.reduce((s, v) => s + v, 0) / custos.length,
    };
  });

  // Compara caminho por caminho: a média das distribuições esconde que às
  // vezes antecipar ganha muito e às vezes perde pouco.
  //
  // A comparação é contra a maior antecipação que REALMENTE CABE no tanque.
  // Usar a maior pedida produzia NaN quando ela não cabia — e "NaN% dos
  // cenários" numa tela é pior que não mostrar nada.
  const cabeNoTanque = (a: number) => p.consumoSemanalLitros * a <= p.capacidadeTanqueLitros;
  const viaveisAcimaDeUm = antecipacoes.filter((a) => a > 1 && cabeNoTanque(a));
  const antecipacaoComparada = viaveisAcimaDeUm.length === 0 ? null : Math.max(...viaveisAcimaDeUm);

  if (antecipacaoComparada === null) {
    return { distribuicoes, probEsperarCompensa: Number.NaN, antecipacaoComparada: null, caminhos };
  }

  let esperarGanhou = 0;
  let comparaveis = 0;
  for (const caminho of caminhos) {
    const base = simularEstrategia(caminho, p, 1);
    const anteci = simularEstrategia(caminho, p, antecipacaoComparada);
    if (!base.viavel || !anteci.viavel) continue;
    comparaveis += 1;
    if (base.custoTotal < anteci.custoTotal) esperarGanhou += 1;
  }

  return {
    distribuicoes,
    probEsperarCompensa: comparaveis === 0 ? Number.NaN : esperarGanhou / comparaveis,
    antecipacaoComparada,
    caminhos,
  };
}

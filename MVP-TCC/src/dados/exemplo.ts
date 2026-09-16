/**
 * ⚠️ DADOS FICTÍCIOS — PROTÓTIPO.
 *
 * Nenhum número deste arquivo é dado da ANP nem métrica do produto. Ele existe
 * para que o protótipo tenha forma de produto real enquanto a série verdadeira
 * não é plugada.
 *
 * Repare que os valores são GERADOS por um PRNG determinístico logo abaixo, e
 * não uma tabela colada. É de propósito: quem abre este arquivo vê na hora que
 * é síntese, não observação.
 *
 * PARA TROCAR POR DADO REAL: substitua o objeto exportado `DADOS` pelo JSON
 * produzido por `scripts/exportar-demo.ts` do projeto Mesa Diesel, que carrega
 * a série da ANP já ingerida. A forma dos tipos abaixo é a mesma.
 */

export type Classe = 'ALTA' | 'ESTAVEL' | 'QUEDA';

export interface Ponto {
  readonly semana: string;
  readonly valor: number;
}

export interface PrecoAtual {
  readonly semana: string;
  readonly uf: number;
  readonly municipio: number;
  readonly min: number;
  readonly max: number;
  readonly postos: number;
  readonly variacao: number;
}

export interface Previsao {
  readonly horizonte: number;
  readonly semanaAlvo: string;
  readonly valor: number;
  readonly p10: number;
  readonly p90: number;
  readonly classe: Classe;
}

export interface LinhaPlacar {
  readonly horizonte: number;
  readonly n: number;
  readonly mae: number;
  readonly maeNaive: number;
  readonly rmse: number;
  readonly cobertura: number;
}

export interface Benchmark {
  readonly litros: number;
  readonly valorTotal: number;
  readonly precoPago: number;
  readonly precoRegiao: number;
  readonly compras: number;
  readonly diferencaPercentual: number;
  readonly excedente: number;
}

export interface MesRelatorio {
  readonly mes: string;
  readonly compras: number;
  readonly litros: number;
  readonly valorTotal: number;
  readonly precoPago: number;
  readonly precoRegiao: number;
  readonly diferencaPercentual: number;
  readonly excedente: number;
}

export interface Organizacao {
  readonly id: string;
  readonly nome: string;
  readonly uf: string;
  readonly municipio: string;
}

export interface Conjunto {
  readonly organizacao: Organizacao;
  readonly serie: readonly Ponto[];
  readonly atual: PrecoAtual;
  readonly previsoes: readonly Previsao[];
  readonly placar: readonly LinhaPlacar[];
  readonly benchmark: Benchmark;
  readonly relatorio: readonly MesRelatorio[];
  readonly residuos: readonly number[];
}

/** PRNG determinístico — o protótipo é igual em toda abertura. */
function prng(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEMANAS = 104;
const ULTIMA = new Date(Date.UTC(2026, 7, 9));

function somaDias(base: Date, dias: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

interface Perfil {
  readonly org: Organizacao;
  readonly semente: number;
  readonly base: number;
  readonly deriva: number;
  /** Quanto a empresa paga acima (+) ou abaixo (−) da média da região, R$/L. */
  readonly vies: number;
  readonly litrosSemana: number;
}

function montar(p: Perfil): Conjunto {
  const rnd = prng(p.semente);

  // Série: passeio aleatório com deriva suave e dois choques — a forma real de
  // uma série de preço de combustível.
  const serie: Ponto[] = [];
  let v = p.base;
  for (let i = 0; i < SEMANAS; i += 1) {
    const idx = SEMANAS - 1 - i;
    const choque = idx === 61 ? 0.19 : idx === 28 ? -0.11 : 0;
    v += p.deriva + (rnd() - 0.5) * 0.045 + choque;
    serie.push({ semana: iso(somaDias(ULTIMA, -7 * idx)), valor: Number(v.toFixed(3)) });
  }

  const ultimo = serie[serie.length - 1] as Ponto;
  const penultimo = serie[serie.length - 2] as Ponto;

  const atual: PrecoAtual = {
    semana: ultimo.semana,
    uf: ultimo.valor,
    municipio: Number((ultimo.valor + (rnd() - 0.35) * 0.12).toFixed(3)),
    min: Number((ultimo.valor - 0.92).toFixed(3)),
    max: Number((ultimo.valor + 1.31).toFixed(3)),
    postos: 380 + Math.floor(rnd() * 480),
    variacao: Number((ultimo.valor - penultimo.valor).toFixed(3)),
  };

  // Resíduos: base do intervalo e do bootstrap de cenários do simulador.
  const residuos: number[] = [];
  for (let i = 1; i < serie.length; i += 1) {
    const a = serie[i - 1] as Ponto;
    const b = serie[i] as Ponto;
    residuos.push(Number((b.valor - a.valor).toFixed(4)));
  }

  const ordenados = [...residuos].sort((a, b) => a - b);
  const quantil = (q: number): number => {
    const pos = (ordenados.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const a = ordenados[lo] ?? 0;
    const b = ordenados[hi] ?? 0;
    return a + (b - a) * (pos - lo);
  };

  const banda = Math.max(0.02, Math.abs(quantil(0.5)) + 0.018);
  const previsoes: Previsao[] = [];
  for (let h = 1; h <= 4; h += 1) {
    const ponto = Number((ultimo.valor + p.deriva * h * 1.1).toFixed(3));
    const esc = Math.sqrt(h);
    const delta = ponto - ultimo.valor;
    previsoes.push({
      horizonte: h,
      semanaAlvo: iso(somaDias(ULTIMA, 7 * h)),
      valor: ponto,
      p10: Number((ponto + quantil(0.1) * esc * 2.1).toFixed(3)),
      p90: Number((ponto + quantil(0.9) * esc * 2.1).toFixed(3)),
      classe: Math.abs(delta) < banda ? 'ESTAVEL' : delta > 0 ? 'ALTA' : 'QUEDA',
    });
  }

  // Placar: o modelo fica MUITO perto do naive, e perde por pouco. É o
  // comportamento honesto de série de preço semanal — ver docs do projeto.
  const placar: LinhaPlacar[] = [1, 2, 3, 4].map((h) => {
    const maeNaive = Number((0.0412 * Math.sqrt(h) * (1 + rnd() * 0.05)).toFixed(4));
    return {
      horizonte: h,
      n: 4400 - h * 54,
      mae: Number((maeNaive * (1.0035 + rnd() * 0.004)).toFixed(4)),
      maeNaive,
      rmse: Number((maeNaive * 2.2).toFixed(4)),
      cobertura: Number((64.6 - h * 1.4 - rnd() * 0.6).toFixed(1)),
    };
  });

  // Compras da empresa, ancoradas na série da própria semana.
  const meses = new Map<string, { c: number; l: number; v: number; r: number }>();
  let litrosTotal = 0;
  let valorTotal = 0;
  let regiaoPonderada = 0;
  let compras = 0;

  for (let i = serie.length - 78; i < serie.length; i += 1) {
    const s = serie[i] as Ponto;
    const litros = Number((p.litrosSemana * (0.72 + rnd() * 0.56)).toFixed(0));
    const pago = s.valor + p.vies + (rnd() - 0.5) * 0.07;
    const total = litros * pago;

    litrosTotal += litros;
    valorTotal += total;
    regiaoPonderada += s.valor * litros;
    compras += 1;

    const mes = s.semana.slice(0, 7);
    const m = meses.get(mes) ?? { c: 0, l: 0, v: 0, r: 0 };
    m.c += 1;
    m.l += litros;
    m.v += total;
    m.r += s.valor * litros;
    meses.set(mes, m);
  }

  const precoPago = valorTotal / litrosTotal;
  const precoRegiao = regiaoPonderada / litrosTotal;

  const benchmark: Benchmark = {
    litros: litrosTotal,
    valorTotal: Number(valorTotal.toFixed(2)),
    precoPago: Number(precoPago.toFixed(3)),
    precoRegiao: Number(precoRegiao.toFixed(3)),
    compras,
    diferencaPercentual: ((precoPago - precoRegiao) / precoRegiao) * 100,
    excedente: Number(((precoPago - precoRegiao) * litrosTotal).toFixed(2)),
  };

  const relatorio: MesRelatorio[] = [...meses.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 12)
    .map(([mes, m]) => {
      const pago = m.v / m.l;
      const regiao = m.r / m.l;
      return {
        mes,
        compras: m.c,
        litros: m.l,
        valorTotal: Number(m.v.toFixed(2)),
        precoPago: Number(pago.toFixed(3)),
        precoRegiao: Number(regiao.toFixed(3)),
        diferencaPercentual: ((pago - regiao) / regiao) * 100,
        excedente: Number(((pago - regiao) * m.l).toFixed(2)),
      };
    });

  return { organizacao: p.org, serie, atual, previsoes, placar, benchmark, relatorio, residuos };
}

const PERFIS: readonly Perfil[] = [
  {
    org: { id: 'a', nome: 'Transportadora Exemplo', uf: 'SP', municipio: 'Campinas' },
    semente: 7,
    base: 5.94,
    deriva: 0.0062,
    vies: 0.098,
    litrosSemana: 2800,
  },
  {
    org: { id: 'b', nome: 'Indústria Exemplo', uf: 'MG', municipio: 'Uberlândia' },
    semente: 23,
    base: 5.71,
    deriva: 0.0055,
    vies: -0.041,
    litrosSemana: 4200,
  },
];

export const DADOS: readonly Conjunto[] = PERFIS.map(montar);

export const SEMANA_REFERENCIA = (DADOS[0] as Conjunto).atual.semana;

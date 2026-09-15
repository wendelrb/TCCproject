/** Formatação pt-BR. Preço sempre com 3 casas — é a precisão que a ANP publica. */

export const nf = (v: number | null | undefined, casas = 3): string =>
  v == null || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const inteiro = (v: number): string => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export const moeda = (v: number): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (v: number, casas = 1): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(casas)}%`;

/** aaaa-mm-dd → dd/mm/aaaa */
export const dataBr = (iso: string): string => iso.split('-').reverse().join('/');

/** aaaa-mm → mmm/aaaa */
export function mesBr(iso: string): string {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [ano, mes] = iso.split('-');
  return `${nomes[Number(mes) - 1] ?? '?'}/${ano}`;
}

/**
 * Rótulo de eixo. Em janela longa mostra mês/ano — dd/mm ao longo de dois anos
 * repete o mesmo rótulo e o leitor não sabe de que ano é.
 */
export const eixoData = (iso: string, longa = false): string => {
  const [a, m, d] = iso.split('-');
  return longa ? `${m}/${(a ?? '').slice(2)}` : `${d}/${m}`;
};

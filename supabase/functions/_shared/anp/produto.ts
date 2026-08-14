// Nomenclatura do produto.
//
// A ANP mudou a grafia do diesel S-10 ao longo da série. O enunciado do projeto
// trata isso como quebra que precisa ser documentada, não como detalhe.
//
// Estratégia: não manter lista fechada de grafias (ela envelhece e o dia em que
// envelhecer a ingestão passa a descartar semanas em silêncio). Em vez disso,
// classificar por padrão estrutural e denunciar tudo que chegar perto sem casar.

import { normalizar } from './texto.ts';

export type ClasseProduto = 'DIESEL_S10' | 'OUTRO' | 'SUSPEITO';

const TEM_DIESEL = /\bDIESEL\b/;
const TEM_S10 = /\bS[-\s]?10\b/;
// Grafias explicitamente NÃO-S10 que contêm "diesel".
const OUTRO_DIESEL = /\bS[-\s]?(50|500|1800)\b|\bMARITIMO\b|\bB\d+\b/;

/**
 * Classifica a grafia publicada.
 *
 * - `DIESEL_S10`: casou o padrão de S-10.
 * - `OUTRO`: outro produto (gasolina, etanol, S-500...). Descarte legítimo.
 * - `SUSPEITO`: menciona diesel mas não casou nem como S-10 nem como outro
 *   diesel conhecido. NÃO é descartado em silêncio: sobe no relatório para
 *   inspeção humana, porque é exatamente a cara de uma mudança de nomenclatura.
 */
export function classificarProduto(produtoBruto: string): ClasseProduto {
  const p = normalizar(produtoBruto);
  if (!TEM_DIESEL.test(p)) return 'OUTRO';
  if (TEM_S10.test(p)) return 'DIESEL_S10';
  if (OUTRO_DIESEL.test(p)) return 'OUTRO';
  return 'SUSPEITO';
}

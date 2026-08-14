// Gravação idempotente em fuel_prices.
//
// Idempotência vem dos índices únicos parciais criados na Tarefa 1. Como são
// parciais, o ON CONFLICT precisa repetir o predicado para o Postgres inferir
// o índice certo — daí duas variantes de comando, uma por nível.
//
// O UPDATE não mexe em `revisao`: quem cuida disso é o trigger
// arquiva_revisao_fuel_price, que só considera revisão quando um campo de VALOR
// muda. Reingestão da mesma semana com os mesmos números é no-op de conteúdo.

import type { Executor, LinhaPreco, NivelGeo } from './tipos.ts';

const COLUNAS = [
  'semana_inicio', 'semana_fim', 'nivel', 'uf', 'municipio', 'municipio_norm',
  'produto', 'produto_fonte', 'unidade',
  'preco_medio_revenda', 'desvio_padrao_revenda', 'preco_min_revenda',
  'preco_max_revenda', 'num_postos_revenda',
  'preco_medio_distribuicao', 'desvio_padrao_distribuicao', 'preco_min_distribuicao',
  'preco_max_distribuicao', 'num_postos_distribuicao',
  'fonte', 'coletado_em',
] as const;

const ATUALIZAVEIS = COLUNAS.filter(
  (c) => c !== 'semana_inicio' && c !== 'nivel' && c !== 'uf' && c !== 'municipio_norm' && c !== 'produto',
);

const CONFLITO: Record<NivelGeo, string> = {
  UF: `(semana_inicio, uf, produto) where nivel = 'UF'`,
  MUNICIPIO: `(semana_inicio, uf, municipio_norm, produto) where nivel = 'MUNICIPIO'`,
};

const LOTE = 500;

function valores(linha: LinhaPreco, fonte: string, coletadoEm: string): unknown[] {
  return [
    linha.semanaInicio, linha.semanaFim, linha.nivel, linha.uf, linha.municipio,
    linha.municipioNorm, 'DIESEL_S10', linha.produtoFonte, linha.unidade,
    linha.precoMedioRevenda, linha.desvioPadraoRevenda, linha.precoMinRevenda,
    linha.precoMaxRevenda, linha.numPostosRevenda,
    linha.precoMedioDistribuicao, linha.desvioPadraoDistribuicao, linha.precoMinDistribuicao,
    linha.precoMaxDistribuicao, linha.numPostosDistribuicao,
    fonte, coletadoEm,
  ];
}

export interface ResultadoGravacao {
  readonly inseridas: number;
  readonly atualizadas: number;
}

export async function gravarPrecos(
  exec: Executor,
  linhas: readonly LinhaPreco[],
  fonte: string,
  coletadoEm: string,
): Promise<ResultadoGravacao> {
  let inseridas = 0;
  let atualizadas = 0;

  for (const nivel of ['UF', 'MUNICIPIO'] as const) {
    const doNivel = linhas.filter((l) => l.nivel === nivel);

    for (let i = 0; i < doNivel.length; i += LOTE) {
      const lote = doNivel.slice(i, i + LOTE);
      const params: unknown[] = [];
      const tuplas: string[] = [];

      for (const linha of lote) {
        const base = params.length;
        const ph = COLUNAS.map((_, j) => `$${base + j + 1}`);
        // Casts explícitos: os enums do schema não têm conversão implícita de texto.
        ph[2] = `${ph[2]}::public.nivel_geo`;
        ph[6] = `${ph[6]}::public.produto_combustivel`;
        ph[20] = `${ph[20]}::timestamptz`;
        tuplas.push(`(${ph.join(', ')})`);
        params.push(...valores(linha, fonte, coletadoEm));
      }

      const sql =
        `insert into public.fuel_prices (${COLUNAS.join(', ')}) values ${tuplas.join(', ')} ` +
        `on conflict ${CONFLITO[nivel]} do update set ` +
        ATUALIZAVEIS.map((c) => `${c} = excluded.${c}`).join(', ') +
        // xmax = 0 distingue linha recém-inserida de linha atualizada. É a
        // evidência de idempotência: na segunda execução, inseridas = 0.
        ` returning (xmax = 0) as inserida`;

      const linhasRetorno = await exec.consultar<{ inserida: boolean }>(sql, params);
      for (const r of linhasRetorno) {
        if (r.inserida) inseridas += 1;
        else atualizadas += 1;
      }
    }
  }

  return { inseridas, atualizadas };
}

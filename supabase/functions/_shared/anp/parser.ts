// Do arquivo bruto da ANP para linhas normalizadas de fuel_prices.
//
// O núcleo trabalha sobre uma TABELA, não sobre um formato: `lerCsv` e
// `tabelaDeXlsx` produzem a mesma forma, e daí para baixo o caminho é único.
// Um parser só significa um conjunto de testes só — e nenhuma chance de o
// caminho do xlsx divergir do caminho do CSV na primeira mudança.

import { lerCsv, type TabelaCsv } from './csv.ts';
import { tabelaDeXlsx } from './xlsx.ts';
import { resolverColunas, type CampoAnp, type MapaColunas } from './colunas.ts';
import { classificarProduto } from './produto.ts';
import { dataBr, inteiro, normalizar, numeroBr, siglaUf } from './texto.ts';
import type { Descarte, LinhaPreco, NivelGeo, ResultadoParse } from './tipos.ts';

const UNIDADE_PADRAO = 'R$/l';

function celula(linha: readonly string[], mapa: MapaColunas, campo: CampoAnp): string | undefined {
  const col = mapa.get(campo);
  if (col === undefined) return undefined;
  return linha[col.indice];
}

/** Soma dias a uma data ISO sem depender de fuso local. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function parsearAnp(texto: string): ResultadoParse {
  return parsearTabela(lerCsv(texto));
}

/** Mesma normalização, a partir de um .xlsx — o formato que a ANP publica. */
export async function parsearAnpXlsx(bytes: Uint8Array, aba?: string): Promise<ResultadoParse> {
  return parsearTabela(await tabelaDeXlsx(bytes, 4, aba));
}

export function parsearTabela(tabela: TabelaCsv): ResultadoParse {
  const mapa = resolverColunas(tabela.cabecalho);

  const colunasAproximadas = [...mapa.entries()]
    .filter(([, c]) => c.como === 'aproximado')
    .map(([campo, c]) => `${campo} <- "${c.cabecalhoOriginal}"`);

  const linhas: LinhaPreco[] = [];
  const descartes: Descarte[] = [];
  const nomenclaturasVistas = new Map<string, number>();
  const suspeitas = new Set<string>();
  let semanasFimDerivadas = 0;

  tabela.linhas.forEach((bruta, i) => {
    // +2: uma pelo cabeçalho, outra porque humano conta a partir de 1.
    const numeroLinha = tabela.preambuloIgnorado + i + 2;

    const produtoFonte = (celula(bruta, mapa, 'produto') ?? '').trim();
    const chaveProduto = normalizar(produtoFonte);
    nomenclaturasVistas.set(chaveProduto, (nomenclaturasVistas.get(chaveProduto) ?? 0) + 1);

    const classe = classificarProduto(produtoFonte);
    if (classe === 'SUSPEITO') suspeitas.add(produtoFonte);
    if (classe !== 'DIESEL_S10') {
      descartes.push({ linha: numeroLinha, motivo: 'OUTRO_PRODUTO', detalhe: produtoFonte });
      return;
    }

    const semanaInicio = dataBr(celula(bruta, mapa, 'semanaInicio'));
    if (semanaInicio === null) {
      descartes.push({
        linha: numeroLinha,
        motivo: 'DATA_INVALIDA',
        detalhe: celula(bruta, mapa, 'semanaInicio') ?? '(ausente)',
      });
      return;
    }

    let semanaFim = dataBr(celula(bruta, mapa, 'semanaFim'));
    if (semanaFim === null || semanaFim <= semanaInicio) {
      // A coluna existe na maior parte das vintages; quando falta, a semana da
      // pesquisa tem 7 dias. Assunção registrada em ASSUMPTIONS.md A-015.
      semanaFim = somarDias(semanaInicio, 6);
      semanasFimDerivadas += 1;
    }

    const uf = siglaUf(celula(bruta, mapa, 'uf'));
    if (uf === null) {
      descartes.push({
        linha: numeroLinha,
        motivo: 'UF_INVALIDA',
        detalhe: celula(bruta, mapa, 'uf') ?? '(ausente)',
      });
      return;
    }

    const municipioBruto = (celula(bruta, mapa, 'municipio') ?? '').trim();
    const nivel: NivelGeo = municipioBruto === '' ? 'UF' : 'MUNICIPIO';

    const precoMedioRevenda = numeroBr(celula(bruta, mapa, 'precoMedioRevenda'));
    if (precoMedioRevenda === null) {
      // Sem o preço de revenda a linha não serve nem para série nem para
      // benchmark. Descarte contabilizado, nunca preenchido com zero.
      descartes.push({
        linha: numeroLinha,
        motivo: 'SEM_PRECO',
        detalhe: `${uf}${municipioBruto === '' ? '' : `/${municipioBruto}`} ${semanaInicio}`,
      });
      return;
    }

    linhas.push({
      semanaInicio,
      semanaFim,
      nivel,
      uf,
      municipio: nivel === 'MUNICIPIO' ? municipioBruto : null,
      municipioNorm: nivel === 'MUNICIPIO' ? normalizar(municipioBruto) : null,
      produtoFonte,
      unidade: (celula(bruta, mapa, 'unidade') ?? '').trim() || UNIDADE_PADRAO,
      precoMedioRevenda,
      desvioPadraoRevenda: numeroBr(celula(bruta, mapa, 'desvioPadraoRevenda')),
      precoMinRevenda: numeroBr(celula(bruta, mapa, 'precoMinRevenda')),
      precoMaxRevenda: numeroBr(celula(bruta, mapa, 'precoMaxRevenda')),
      numPostosRevenda: inteiro(celula(bruta, mapa, 'numPostosRevenda')),
      precoMedioDistribuicao: numeroBr(celula(bruta, mapa, 'precoMedioDistribuicao')),
      desvioPadraoDistribuicao: numeroBr(celula(bruta, mapa, 'desvioPadraoDistribuicao')),
      precoMinDistribuicao: numeroBr(celula(bruta, mapa, 'precoMinDistribuicao')),
      precoMaxDistribuicao: numeroBr(celula(bruta, mapa, 'precoMaxDistribuicao')),
      numPostosDistribuicao: inteiro(celula(bruta, mapa, 'numPostosDistribuicao')),
    });
  });

  return {
    linhas,
    relatorio: {
      linhasLidas: tabela.linhas.length,
      aceitas: linhas.length,
      descartes,
      nomenclaturasVistas,
      nomenclaturasSuspeitas: [...suspeitas],
      colunasAproximadas,
      semanasFimDerivadas,
    },
  };
}

// Validação do arquivo de previsões de um modelo externo.
//
// Contrato em docs/CONTRATO_MODELO.md. Duas regras dão o tom deste arquivo:
//
//   1. NADA é preenchido por aproximação. Campo ausente, data que não fecha ou
//      número ambíguo viram ERRO, não valor default. Previsão inventada aqui
//      contaminaria o placar de acurácia, que é o que o produto vende.
//
//   2. MÉTRICA PRONTA NÃO ENTRA. Se o arquivo trouxer mae/rmse/coverage, o
//      arquivo inteiro é barrado. Métrica calculada de um lado não é comparável
//      com a do outro, mesmo quando as duas estão certas — e o CLAUDE.md proíbe
//      publicar número de acurácia que não tenha saído de execução nossa.
//
// A classe (ALTA/ESTAVEL/QUEDA) NÃO faz parte do contrato: ela é derivada na
// gravação, com a mesma regra aplicada a todos os modelos. Se cada modelo
// classificasse do seu jeito, a coluna "classe" do placar deixaria de comparar.

import { lerCsv } from '../anp/csv.ts';
import { dataBr, normalizar, siglaUf } from '../anp/texto.ts';
import {
  ErroContratoModelo,
  type ErroLinhaContrato,
  type PrevisaoExterna,
  type ResultadoContrato,
} from './tipos.ts';

type Campo =
  | 'modelo_versao' | 'uf' | 'semana_origem' | 'dados_ate'
  | 'horizonte_semanas' | 'semana_alvo' | 'valor_previsto' | 'p10' | 'p90';

const CAMPOS: readonly Campo[] = [
  'modelo_versao', 'uf', 'semana_origem', 'dados_ate',
  'horizonte_semanas', 'semana_alvo', 'valor_previsto', 'p10', 'p90',
];

/** Nome canônico primeiro; o resto é sinônimo tolerado e reportado. */
const SINONIMOS: Readonly<Record<Campo, readonly string[]>> = {
  modelo_versao: ['MODELO VERSAO', 'MODELO', 'MODEL', 'MODEL VERSION'],
  uf: ['UF', 'ESTADO', 'SIGLA UF'],
  semana_origem: ['SEMANA ORIGEM', 'ORIGEM', 'DATA ORIGEM', 'ORIGIN'],
  dados_ate: ['DADOS ATE', 'CORTE', 'DATA CORTE', 'CUTOFF', 'TRAIN END'],
  horizonte_semanas: ['HORIZONTE SEMANAS', 'HORIZONTE', 'H', 'HORIZON'],
  semana_alvo: ['SEMANA ALVO', 'ALVO', 'DATA ALVO', 'TARGET', 'TARGET DATE'],
  valor_previsto: ['VALOR PREVISTO', 'PREVISTO', 'PREVISAO', 'YHAT', 'Y HAT', 'FORECAST', 'PRED'],
  p10: ['P10', 'LO', 'LOWER', 'LIMITE INFERIOR', 'IC INFERIOR'],
  p90: ['P90', 'HI', 'UPPER', 'LIMITE SUPERIOR', 'IC SUPERIOR'],
};

/**
 * Colunas que barram o arquivo, com o motivo de cada grupo.
 *
 * Não é implicância: são exatamente as duas formas de o número de acurácia
 * publicado deixar de ser nosso. Métrica pronta não é recalculável; realizado
 * de terceiro não é auditável contra a fonte.
 */
const BARRADAS: readonly (readonly [motivo: string, tokens: readonly string[]])[] = [
  [
    'métrica pronta — recalculamos aqui, sobre o realizado da ANP, com o mesmo protocolo para todos os modelos',
    ['MAE', 'RMSE', 'MSE', 'MAPE', 'SMAPE', 'MASE', 'COVERAGE', 'COBERTURA',
     'PICP', 'ACURACIA', 'ACCURACY', 'R2', 'SCORE', 'ERRO', 'ERRO ABSOLUTO'],
  ],
  [
    'valor realizado — o realizado vem da ANP e é preenchido por nós; importá-lo do arquivo do modelo criaria uma segunda série não auditável',
    ['REALIZADO', 'VALOR REALIZADO', 'Y TRUE', 'Y REAL', 'ACTUAL', 'OBSERVADO'],
  ],
];

/** Normaliza nome de coluna: acento, caixa e separadores viram espaço. */
function chave(nome: string): string {
  return normalizar(nome.replace(/[_\-.]+/g, ' '));
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Decimal do arquivo do modelo.
 *
 * O contrato pede ponto. Vírgula é aceita apenas quando o delimitador NÃO é
 * vírgula — aí não há ambiguidade. Valor com ponto E vírgula é recusado em vez
 * de adivinhado: `6.123,45` e `6,123.45` não têm como ser distinguidos por
 * regra local, e chutar aqui vira preço errado no placar.
 */
function decimal(bruto: string | undefined, aceitaVirgula: boolean): number | null {
  if (bruto === undefined) return null;
  const t = bruto.trim();
  if (t === '') return null;

  const temPonto = t.includes('.');
  const temVirgula = t.includes(',');
  if (temPonto && temVirgula) return null;

  let texto = t;
  if (temVirgula) {
    if (!aceitaVirgula) return null;
    texto = t.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

interface Mapeamento {
  readonly indices: Readonly<Record<Campo, number>>;
  readonly porSinonimo: readonly string[];
  readonly ignoradas: readonly string[];
}

function mapearColunas(cabecalho: readonly string[]): Mapeamento {
  const chaves = cabecalho.map(chave);

  const barradas: string[] = [];
  const motivos: string[] = [];
  for (const [motivo, tokens] of BARRADAS) {
    for (let i = 0; i < chaves.length; i += 1) {
      const k = chaves[i] ?? '';
      if (tokens.includes(k)) {
        barradas.push(cabecalho[i] ?? k);
        if (!motivos.includes(motivo)) motivos.push(motivo);
      }
    }
  }
  if (barradas.length > 0) {
    throw new ErroContratoModelo(
      `arquivo recusado. Coluna(s) que não podem entrar: ${barradas.join(', ')}.\n` +
        motivos.map((m) => `  · ${m}`).join('\n') +
        '\nRemova a(s) coluna(s) e reenvie. Ver docs/CONTRATO_MODELO.md §3.',
    );
  }

  const indices: Partial<Record<Campo, number>> = {};
  const porSinonimo: string[] = [];
  const usados = new Set<number>();

  for (const campo of CAMPOS) {
    const nomes = SINONIMOS[campo];
    for (let ordem = 0; ordem < nomes.length; ordem += 1) {
      const alvo = nomes[ordem];
      const i = chaves.findIndex((k, idx) => k === alvo && !usados.has(idx));
      if (i !== -1) {
        indices[campo] = i;
        usados.add(i);
        if (ordem > 0) porSinonimo.push(`${cabecalho[i] ?? ''} → ${campo}`);
        break;
      }
    }
  }

  const faltando = CAMPOS.filter((c) => indices[c] === undefined);
  if (faltando.length > 0) {
    throw new ErroContratoModelo(
      `arquivo recusado: falta(m) a(s) coluna(s) ${faltando.join(', ')}.\n` +
        `Cabeçalho lido: ${cabecalho.join(', ')}\n` +
        'Ver o formato em docs/CONTRATO_MODELO.md §3.',
    );
  }

  const ignoradas = cabecalho.filter((_, i) => !usados.has(i) && (cabecalho[i] ?? '').trim() !== '');

  return { indices: indices as Record<Campo, number>, porSinonimo, ignoradas };
}

/** Detecta JSON (array de objetos) e converte para a mesma forma tabular do CSV. */
function comoTabela(texto: string): { cabecalho: string[]; linhas: string[][]; aceitaVirgula: boolean } {
  const inicio = texto.trimStart()[0];
  if (inicio === '[' || inicio === '{') {
    const bruto: unknown = JSON.parse(texto);
    const registros: unknown[] = Array.isArray(bruto) ? bruto : [bruto];
    if (registros.length === 0) throw new ErroContratoModelo('JSON sem nenhum registro.');

    const chavesVistas: string[] = [];
    for (const r of registros) {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) {
        throw new ErroContratoModelo('JSON deve ser um array de objetos, um por previsão.');
      }
      for (const k of Object.keys(r)) if (!chavesVistas.includes(k)) chavesVistas.push(k);
    }

    const linhas = registros.map((r) =>
      chavesVistas.map((k) => {
        const v = (r as Record<string, unknown>)[k];
        return v === null || v === undefined ? '' : String(v);
      }),
    );
    // JSON usa ponto decimal por definição do formato.
    return { cabecalho: chavesVistas, linhas, aceitaVirgula: false };
  }

  // Mínimo baixo de propósito: com `CAMPOS.length`, um arquivo a que falta UMA
  // coluna nem chega a ter cabeçalho reconhecido, e o usuário recebe "não parece
  // ser o CSV esperado" em vez de "falta a coluna dados_ate". Achar o cabeçalho
  // primeiro e reclamar depois dá uma mensagem que diz o que corrigir.
  const tabela = lerCsv(texto, 4);
  return {
    cabecalho: [...tabela.cabecalho],
    linhas: tabela.linhas.map((l) => [...l]),
    aceitaVirgula: tabela.delimitador !== ',',
  };
}

/**
 * Valida o arquivo inteiro.
 *
 * Problemas de CABEÇALHO derrubam na hora (lançam). Problemas de LINHA são
 * acumulados e devolvidos todos juntos: quem manda um arquivo com 400 linhas
 * quer a lista completa do que corrigir, não a primeira ocorrência.
 */
export function validarPrevisoes(texto: string): ResultadoContrato {
  const { cabecalho, linhas, aceitaVirgula } = comoTabela(texto);
  const { indices, porSinonimo, ignoradas } = mapearColunas(cabecalho);

  const erros: ErroLinhaContrato[] = [];
  const previsoes: PrevisaoExterna[] = [];
  const vistas = new Set<string>();
  const corteDaOrigem = new Map<string, string>();

  const modelos = new Set<string>();
  const ufs = new Set<string>();
  const origens = new Set<string>();

  for (let i = 0; i < linhas.length; i += 1) {
    const campos = linhas[i] ?? [];
    const numero = i + 2; // cabeçalho é a linha 1
    const bruto = (c: Campo): string | undefined => campos[indices[c]];
    const falha = (campo: string, motivo: string): void => {
      erros.push({ linha: numero, campo, motivo });
    };
    const antes = erros.length;

    const modeloVersao = (bruto('modelo_versao') ?? '').trim();
    if (!/^[\w.\-+]{1,80}$/.test(modeloVersao)) {
      falha('modelo_versao', `"${modeloVersao}" — use letras, números, ponto, hífen ou _, até 80 caracteres`);
    }

    const uf = siglaUf(bruto('uf'));
    if (uf === null) falha('uf', `"${bruto('uf') ?? ''}" não é uma UF brasileira`);

    const semanaOrigem = dataBr(bruto('semana_origem'));
    if (semanaOrigem === null) falha('semana_origem', `"${bruto('semana_origem') ?? ''}" — use aaaa-mm-dd`);

    const dadosAte = dataBr(bruto('dados_ate'));
    if (dadosAte === null) falha('dados_ate', `"${bruto('dados_ate') ?? ''}" — use aaaa-mm-dd`);

    const horizonte = decimal(bruto('horizonte_semanas'), aceitaVirgula);
    if (horizonte === null || !Number.isInteger(horizonte) || horizonte < 1 || horizonte > 4) {
      falha('horizonte_semanas', `"${bruto('horizonte_semanas') ?? ''}" — inteiro de 1 a 4`);
    }

    const semanaAlvo = dataBr(bruto('semana_alvo'));
    if (semanaAlvo === null) falha('semana_alvo', `"${bruto('semana_alvo') ?? ''}" — use aaaa-mm-dd`);

    const valorPrevisto = decimal(bruto('valor_previsto'), aceitaVirgula);
    if (valorPrevisto === null || valorPrevisto <= 0) {
      falha('valor_previsto', `"${bruto('valor_previsto') ?? ''}" — R$/litro com ponto decimal, maior que zero`);
    }

    const p10 = decimal(bruto('p10'), aceitaVirgula);
    if (p10 === null || p10 <= 0) falha('p10', `"${bruto('p10') ?? ''}" — número maior que zero`);

    const p90 = decimal(bruto('p90'), aceitaVirgula);
    if (p90 === null || p90 <= 0) falha('p90', `"${bruto('p90') ?? ''}" — número maior que zero`);

    if (erros.length > antes) continue;

    // A partir daqui os campos estão validados individualmente; falta a
    // coerência ENTRE eles, que é onde moram os erros interessantes.
    const o = semanaOrigem as string;
    const a = semanaAlvo as string;
    const c = dadosAte as string;
    const h = horizonte as number;

    if (c < o) {
      falha('dados_ate', `corte ${c} é anterior à origem ${o} — a execução não teria dados da própria semana`);
    }

    const esperado = somarDias(o, h * 7);
    if (a !== esperado) {
      falha(
        'semana_alvo',
        `origem ${o} + ${h} semana(s) dá ${esperado}, mas veio ${a} — grade de semanas desalinhada`,
      );
    }

    if ((p10 as number) > (p90 as number)) {
      falha('p10', `p10 ${p10} maior que p90 ${p90}`);
    }

    const chaveOrigem = `${modeloVersao}|${o}`;
    const corteAnterior = corteDaOrigem.get(chaveOrigem);
    if (corteAnterior === undefined) corteDaOrigem.set(chaveOrigem, c);
    else if (corteAnterior !== c) {
      falha('dados_ate', `a mesma execução (${modeloVersao}, origem ${o}) já declarou corte ${corteAnterior}`);
    }

    const identidade = `${modeloVersao}|${uf}|${o}|${h}`;
    if (vistas.has(identidade)) {
      falha('uf', `duplicata de ${modeloVersao} ${uf} origem ${o} horizonte ${h}`);
    }
    vistas.add(identidade);

    if (erros.length > antes) continue;

    previsoes.push({
      modeloVersao,
      uf: uf as string,
      semanaOrigem: o,
      dadosAte: c,
      horizonteSemanas: h,
      semanaAlvo: a,
      valorPrevisto: valorPrevisto as number,
      p10: p10 as number,
      p90: p90 as number,
    });
    modelos.add(modeloVersao);
    ufs.add(uf as string);
    origens.add(o);
  }

  return {
    previsoes,
    relatorio: {
      linhasLidas: linhas.length,
      aceitas: previsoes.length,
      erros,
      colunasIgnoradas: ignoradas,
      colunasPorSinonimo: porSinonimo,
      modelos: [...modelos].sort(),
      ufs: [...ufs].sort(),
      origens: [...origens].sort(),
    },
  };
}

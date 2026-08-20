// Leitor de XLSX sem dependência externa.
//
// POR QUE ISTO EXISTE: a ANP publica a série de preços em .xlsx, não em CSV.
// Sem ler xlsx, a ingestão real nunca sai do papel — a alternativa seria pedir
// ao usuário que abrisse o arquivo no Excel e exportasse CSV à mão, o que
// quebra a idempotência (passo manual não é reproduzível) e a proveniência
// (o hash registrado deixaria de ser o do arquivo da fonte).
//
// POR QUE SEM BIBLIOTECA: um .xlsx é um ZIP com XML dentro, e a plataforma já
// traz o que falta — `DecompressionStream('deflate-raw')` existe no Node 18+ e
// no Deno. O que se lê aqui é um subconjunto pequeno e estável do formato:
// planilha, células, strings compartilhadas e formato de data. O projeto já
// escreve o próprio leitor de CSV pelo mesmo motivo (CLAUDE.md: nenhuma
// dependência nova sem justificativa).
//
// CUIDADO QUE NÃO É DETALHE — o número sai daqui em formato BR (vírgula
// decimal). No XML do xlsx o número vem sempre com ponto decimal, mas o resto
// do pipeline usa `numeroBr`, que trata ponto como separador de MILHAR. Emitir
// "6.199" faria `numeroBr` devolver 6199 em silêncio: preço mil vezes maior,
// sem erro nenhum. Converter aqui mantém um parser só, já testado.

import type { TabelaCsv } from './csv.ts';
import { ErroFonteAnp } from './tipos.ts';

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

interface EntradaZip {
  readonly nome: string;
  readonly metodo: number;
  readonly tamanhoComprimido: number;
  readonly deslocamentoLocal: number;
}

function acharEocd(vista: DataView): number {
  // O EOCD fica no fim, mas pode ter até 64 KiB de comentário depois dele.
  const minimo = Math.max(0, vista.byteLength - 65_557);
  for (let i = vista.byteLength - 22; i >= minimo; i -= 1) {
    if (vista.getUint32(i, true) === ASSINATURA_EOCD) return i;
  }
  throw new ErroFonteAnp('não parece um arquivo .xlsx: fim do diretório ZIP não encontrado');
}

function lerDiretorio(bytes: Uint8Array): Map<string, EntradaZip> {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = acharEocd(vista);

  const quantidade = vista.getUint16(eocd + 10, true);
  const inicioCentral = vista.getUint32(eocd + 16, true);
  if (inicioCentral === 0xffff_ffff || quantidade === 0xffff) {
    throw new ErroFonteAnp('arquivo ZIP em formato ZIP64, não suportado por este leitor');
  }

  const decodificador = new TextDecoder('utf-8');
  const entradas = new Map<string, EntradaZip>();
  let p = inicioCentral;

  for (let i = 0; i < quantidade; i += 1) {
    if (vista.getUint32(p, true) !== ASSINATURA_CENTRAL) {
      throw new ErroFonteAnp(`diretório ZIP corrompido na entrada ${i + 1}`);
    }
    const metodo = vista.getUint16(p + 10, true);
    const tamanhoComprimido = vista.getUint32(p + 20, true);
    const tamanhoNome = vista.getUint16(p + 28, true);
    const tamanhoExtra = vista.getUint16(p + 30, true);
    const tamanhoComentario = vista.getUint16(p + 32, true);
    const deslocamentoLocal = vista.getUint32(p + 42, true);
    const nome = decodificador.decode(bytes.subarray(p + 46, p + 46 + tamanhoNome));

    entradas.set(nome, { nome, metodo, tamanhoComprimido, deslocamentoLocal });
    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return entradas;
}

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as unknown as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

async function extrair(bytes: Uint8Array, entrada: EntradaZip): Promise<string> {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entrada.deslocamentoLocal;
  if (vista.getUint32(p, true) !== ASSINATURA_LOCAL) {
    throw new ErroFonteAnp(`cabeçalho local ausente para ${entrada.nome}`);
  }
  const tamanhoNome = vista.getUint16(p + 26, true);
  const tamanhoExtra = vista.getUint16(p + 28, true);
  const inicio = p + 30 + tamanhoNome + tamanhoExtra;
  const bruto = bytes.subarray(inicio, inicio + entrada.tamanhoComprimido);

  if (entrada.metodo === 0) return new TextDecoder('utf-8').decode(bruto);
  if (entrada.metodo === 8) return new TextDecoder('utf-8').decode(await inflar(bruto));
  throw new ErroFonteAnp(`método de compressão ${entrada.metodo} não suportado em ${entrada.nome}`);
}

// ---------------------------------------------------------------------------
// XML — varredura mínima, suficiente para os quatro arquivos que interessam
// ---------------------------------------------------------------------------

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (inteiro, corpo: string) => {
    if (corpo.startsWith('#x') || corpo.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(corpo.slice(2), 16));
    }
    if (corpo.startsWith('#')) return String.fromCodePoint(Number.parseInt(corpo.slice(1), 10));
    return ENTIDADES[corpo] ?? inteiro;
  });
}

function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`${nome}="([^"]*)"`).exec(tag);
  return m === null ? null : desescapar(m[1] ?? '');
}

// ---------------------------------------------------------------------------
// Partes do xlsx
// ---------------------------------------------------------------------------

/** `<si>` pode ter vários `<t>` (texto com formatação). Concatena todos. */
function lerStringsCompartilhadas(xml: string): string[] {
  const saida: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let texto = '';
    for (const t of (si[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      texto += desescapar(t[1] ?? '');
    }
    saida.push(texto);
  }
  return saida;
}

/** numFmtId de cada entrada de cellXfs, na ordem — é o que o atributo `s` indexa. */
function lerEstilos(xml: string): { formatoDaCelula: number[]; ehData: ReadonlySet<number> } {
  const ehData = new Set<number>([
    // Formatos de data/hora embutidos no formato OOXML.
    14, 15, 16, 17, 18, 19, 20, 21, 22,
    27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    45, 46, 47,
    50, 51, 52, 53, 54, 55, 56, 57, 58,
  ]);

  for (const nf of xml.matchAll(/<numFmt\b[^>]*\/>/g)) {
    const tag = nf[0];
    const id = Number(atributo(tag, 'numFmtId') ?? Number.NaN);
    const codigo = atributo(tag, 'formatCode') ?? '';
    if (Number.isInteger(id) && pareceData(codigo)) ehData.add(id);
  }

  const bloco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const formatoDaCelula: number[] = [];
  if (bloco !== null) {
    for (const xf of (bloco[1] ?? '').matchAll(/<xf\b[^>]*>|<xf\b[^>]*\/>/g)) {
      formatoDaCelula.push(Number(atributo(xf[0], 'numFmtId') ?? '0') || 0);
    }
  }
  return { formatoDaCelula, ehData };
}

/**
 * Um formato customizado é de data se tiver marcador de dia/mês/ano fora de
 * literal. Os literais entre aspas e os blocos [ ] (cor, condição, locale)
 * precisam sair antes, senão `[$-416]` ou "day" marcariam qualquer coisa.
 */
function pareceData(codigo: string): boolean {
  const limpo = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[dmy]/i.test(limpo) && !/^[^dmy]*$/i.test(limpo);
}

/** "BC12" -> 54 (índice 0-based da coluna). */
function indiceColuna(referencia: string): number {
  const letras = /^([A-Z]+)/.exec(referencia.toUpperCase());
  if (letras === null) return 0;
  let n = 0;
  for (const c of letras[1] ?? '') n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Serial do Excel para ISO.
 *
 * A época é 1899-12-30 e não 1900-01-01 por causa do bug de ano bissexto de
 * 1900 que a planilha herdou do Lotus e nunca corrigiu. Datas da ANP são de
 * 2004 em diante, bem longe da faixa onde o bug importa.
 */
function serialParaIso(serial: number, base1904: boolean): string {
  const epoca = base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoca + Math.round(serial * 86_400_000));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Número em texto BR: vírgula decimal, sem separador de milhar. Ver topo. */
function numeroParaTextoBr(valor: string): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  if (Math.abs(n) >= 1e15) return valor; // notação científica não interessa aqui
  return String(n).replace('.', ',');
}

interface Celula {
  readonly coluna: number;
  readonly texto: string;
}

function lerPlanilha(
  xml: string,
  compartilhadas: readonly string[],
  estilos: { formatoDaCelula: number[]; ehData: ReadonlySet<number> },
  base1904: boolean,
): string[][] {
  const linhas: string[][] = [];

  for (const linha of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const corpo = linha[1] ?? '';
    const celulas: Celula[] = [];

    for (const c of corpo.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1] ?? '';
      const conteudo = c[2] ?? '';
      const referencia = atributo(`<c${atributos}>`, 'r') ?? '';
      const tipo = atributo(`<c${atributos}>`, 't');
      const estilo = atributo(`<c${atributos}>`, 's');

      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(conteudo);
      const bruto = v === null ? '' : desescapar(v[1] ?? '');

      let texto: string;
      if (tipo === 's') {
        texto = compartilhadas[Number(bruto)] ?? '';
      } else if (tipo === 'inlineStr') {
        texto = [...conteudo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => desescapar(t[1] ?? ''))
          .join('');
      } else if (tipo === 'str' || tipo === 'e' || tipo === 'b') {
        texto = bruto;
      } else if (bruto === '') {
        texto = '';
      } else {
        const idFormato = estilos.formatoDaCelula[Number(estilo ?? '0')] ?? 0;
        texto = estilos.ehData.has(idFormato)
          ? serialParaIso(Number(bruto), base1904)
          : numeroParaTextoBr(bruto);
      }

      celulas.push({ coluna: indiceColuna(referencia), texto: texto.trim() });
    }

    if (celulas.length === 0) {
      linhas.push([]);
      continue;
    }

    // Células vazias são OMITIDAS no XML. Preencher pelo índice da referência é
    // o que impede o deslocamento silencioso de coluna.
    const largura = Math.max(...celulas.map((c) => c.coluna)) + 1;
    const saida = new Array<string>(largura).fill('');
    for (const c of celulas) saida[c.coluna] = c.texto;
    linhas.push(saida);
  }

  return linhas;
}

export interface PlanilhaXlsx {
  readonly nome: string;
  readonly linhas: readonly (readonly string[])[];
}

/** Lê todas as abas, na ordem em que aparecem na pasta de trabalho. */
export async function lerXlsx(bytes: Uint8Array): Promise<readonly PlanilhaXlsx[]> {
  const entradas = lerDiretorio(bytes);

  const pegar = async (nome: string): Promise<string | null> => {
    const e = entradas.get(nome);
    return e === undefined ? null : extrair(bytes, e);
  };

  const workbook = await pegar('xl/workbook.xml');
  if (workbook === null) {
    throw new ErroFonteAnp('não parece um arquivo .xlsx: xl/workbook.xml ausente');
  }

  const compartilhadas = lerStringsCompartilhadas((await pegar('xl/sharedStrings.xml')) ?? '');
  const estilos = lerEstilos((await pegar('xl/styles.xml')) ?? '');
  const base1904 = /date1904="(1|true)"/.test(workbook);

  // r:id -> caminho da aba.
  const rels = (await pegar('xl/_rels/workbook.xml.rels')) ?? '';
  const alvoPorId = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = atributo(r[0], 'Id');
    const alvo = atributo(r[0], 'Target');
    if (id !== null && alvo !== null) {
      alvoPorId.set(id, alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`);
    }
  }

  const planilhas: PlanilhaXlsx[] = [];
  for (const s of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const nome = atributo(s[0], 'name') ?? `aba ${planilhas.length + 1}`;
    const idRel = atributo(s[0], 'r:id') ?? atributo(s[0], 'id');
    const caminho = idRel === null ? null : alvoPorId.get(idRel) ?? null;
    const xml = caminho === null ? null : await pegar(caminho);
    if (xml === null) continue;
    planilhas.push({ nome, linhas: lerPlanilha(xml, compartilhadas, estilos, base1904) });
  }

  if (planilhas.length === 0) throw new ErroFonteAnp('o .xlsx não tem nenhuma aba legível');
  return planilhas;
}

/**
 * Converte a aba escolhida para a mesma forma que `lerCsv` devolve, para que o
 * parser da ANP seja um só, independente do formato do arquivo.
 *
 * @param minimoColunas quantos campos preenchidos uma linha precisa ter para
 *   ser considerada o cabeçalho. Serve para pular o preâmbulo — as planilhas da
 *   ANP começam com título e nota antes da tabela.
 * @param aba nome da aba; sem isso, a primeira que tiver um cabeçalho plausível.
 */
export async function tabelaDeXlsx(
  bytes: Uint8Array,
  minimoColunas = 4,
  aba?: string,
): Promise<TabelaCsv> {
  const planilhas = await lerXlsx(bytes);
  const candidatas = aba === undefined
    ? planilhas
    : planilhas.filter((p) => p.nome.trim().toLowerCase() === aba.trim().toLowerCase());

  if (candidatas.length === 0) {
    throw new ErroFonteAnp(
      `aba "${aba ?? ''}" não existe. Abas do arquivo: ${planilhas.map((p) => p.nome).join(' | ')}`,
    );
  }

  for (const p of candidatas) {
    const indice = p.linhas.findIndex((l) => l.filter((c) => c !== '').length >= minimoColunas);
    if (indice === -1) continue;

    const cabecalho = [...(p.linhas[indice] ?? [])];
    const linhas = p.linhas
      .slice(indice + 1)
      .map((l) => [...l])
      .filter((l) => l.some((c) => c !== ''));

    return { cabecalho, linhas, delimitador: 'xlsx', preambuloIgnorado: indice };
  }

  throw new ErroFonteAnp(
    `nenhuma aba tem linha com ao menos ${minimoColunas} colunas preenchidas. ` +
      `Abas vistas: ${planilhas.map((p) => `${p.nome} (${p.linhas.length} linhas)`).join(' | ')}`,
  );
}

// Leitor de CSV sem dependência externa.
//
// Implementa o essencial do RFC 4180 mais o que a ANP usa na prática:
// delimitador `;`, aspas duplas escapadas por duplicação, CRLF, e linhas de
// preâmbulo antes do cabeçalho (algumas vintages trazem título/nota no topo).

export interface TabelaCsv {
  readonly cabecalho: readonly string[];
  readonly linhas: readonly (readonly string[])[];
  readonly delimitador: string;
  /** Quantas linhas de preâmbulo foram puladas antes do cabeçalho. */
  readonly preambuloIgnorado: number;
}

const DELIMITADORES = [';', ',', '\t'] as const;

function detectarDelimitador(linha: string): string {
  let melhor = ';';
  let maior = -1;
  for (const d of DELIMITADORES) {
    const n = linha.split(d).length - 1;
    if (n > maior) {
      maior = n;
      melhor = d;
    }
  }
  return melhor;
}

/** Divide uma linha respeitando aspas. */
function dividir(linha: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === delimitador) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += c ?? '';
    }
  }
  campos.push(atual.trim());
  return campos;
}

/**
 * Quebra o texto em registros lógicos. Uma quebra de linha dentro de aspas
 * pertence ao campo, não separa registro — nome de município com vírgula ou
 * quebra existe e derruba parser ingênuo.
 */
function registros(texto: string): string[] {
  const saida: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '"') {
      // Aspas duplicadas dentro de campo entre aspas são literal escapado e
      // NÃO alternam o estado — quem desfaz o escape é `dividir`.
      if (dentroDeAspas && texto[i + 1] === '"') {
        atual += '""';
        i += 1;
        continue;
      }
      dentroDeAspas = !dentroDeAspas;
      atual += c;
      continue;
    }
    if (!dentroDeAspas && (c === '\n' || c === '\r')) {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      saida.push(atual);
      atual = '';
      continue;
    }
    atual += c ?? '';
  }
  if (atual !== '') saida.push(atual);
  return saida;
}

/**
 * @param minimoColunas número mínimo de campos para uma linha ser considerada
 *   o cabeçalho. Serve para pular preâmbulo.
 */
export function lerCsv(texto: string, minimoColunas = 4): TabelaCsv {
  const brutas = registros(texto).filter((l) => l.trim() !== '');
  if (brutas.length === 0) {
    throw new Error('CSV vazio');
  }

  let indiceCabecalho = -1;
  let delimitador = ';';
  for (let i = 0; i < brutas.length; i += 1) {
    const linha = brutas[i] ?? '';
    const d = detectarDelimitador(linha);
    if (dividir(linha, d).filter((c) => c !== '').length >= minimoColunas) {
      indiceCabecalho = i;
      delimitador = d;
      break;
    }
  }
  if (indiceCabecalho === -1) {
    throw new Error(
      `nenhuma linha com ao menos ${minimoColunas} colunas: o arquivo não parece ser o CSV esperado`,
    );
  }

  const cabecalho = dividir(brutas[indiceCabecalho] ?? '', delimitador);
  const linhas = brutas
    .slice(indiceCabecalho + 1)
    .map((l) => dividir(l, delimitador))
    .filter((campos) => campos.some((c) => c !== ''));

  return { cabecalho, linhas, delimitador, preambuloIgnorado: indiceCabecalho };
}

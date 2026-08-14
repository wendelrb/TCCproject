// Decodificação, normalização de texto e parsing de número/data no formato BR.

/**
 * Decodifica bytes tentando UTF-8 estrito e caindo para windows-1252.
 *
 * Os arquivos da ANP variaram de codificação ao longo dos anos. Adivinhar
 * errado não quebra o parse — corrompe silenciosamente nomes de município
 * acentuados, que é pior. Por isso o UTF-8 é tentado em modo `fatal`.
 */
export function decodificar(bytes: Uint8Array): string {
  try {
    return semBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return semBom(new TextDecoder('windows-1252').decode(bytes));
  }
}

function semBom(texto: string): string {
  return texto.replace(/^\uFEFF/, '');
}

/** Caixa alta, sem acento, espaços colapsados. Base de toda comparação de texto. */
export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const VAZIOS = new Set(['', '-', '--', 'N/A', 'NA', 'ND', 'NULL', 'NAO DISPONIVEL']);

/**
 * Número no formato BR: vírgula decimal, ponto de milhar.
 *
 * Devolve null para marcadores de ausência. NÃO devolve 0 — a ANP deixa campos
 * em branco em várias vintages (distribuição, sobretudo), e transformar ausência
 * em zero criaria preço fictício de R$ 0,00.
 */
export function numeroBr(valor: string | undefined): number | null {
  if (valor === undefined) return null;
  const limpo = normalizar(valor);
  if (VAZIOS.has(limpo)) return null;

  const semMilhar = limpo.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(semMilhar)) return null;

  const n = Number(semMilhar);
  return Number.isFinite(n) ? n : null;
}

export function inteiro(valor: string | undefined): number | null {
  const n = numeroBr(valor);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

/** dd/mm/aaaa (formato da ANP) ou aaaa-mm-dd. Devolve ISO yyyy-mm-dd. */
export function dataBr(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const bruto = valor.trim();
  if (bruto === '') return null;

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto);
  if (br) {
    const [, d, m, a] = br;
    return validarIso(`${a}-${m}-${d}`);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
  if (iso) return validarIso(`${iso[1]}-${iso[2]}-${iso[3]}`);

  return null;
}

function validarIso(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/** Aceita sigla ou nome por extenso — a ANP já publicou das duas formas. */
export function siglaUf(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const n = normalizar(valor);
  if (UFS.has(n)) return n;
  return NOME_UF.get(n) ?? null;
}

const NOME_UF = new Map<string, string>([
  ['ACRE', 'AC'], ['ALAGOAS', 'AL'], ['AMAPA', 'AP'], ['AMAZONAS', 'AM'],
  ['BAHIA', 'BA'], ['CEARA', 'CE'], ['DISTRITO FEDERAL', 'DF'],
  ['ESPIRITO SANTO', 'ES'], ['GOIAS', 'GO'], ['MARANHAO', 'MA'],
  ['MATO GROSSO', 'MT'], ['MATO GROSSO DO SUL', 'MS'], ['MINAS GERAIS', 'MG'],
  ['PARA', 'PA'], ['PARAIBA', 'PB'], ['PARANA', 'PR'], ['PERNAMBUCO', 'PE'],
  ['PIAUI', 'PI'], ['RIO DE JANEIRO', 'RJ'], ['RIO GRANDE DO NORTE', 'RN'],
  ['RIO GRANDE DO SUL', 'RS'], ['RONDONIA', 'RO'], ['RORAIMA', 'RR'],
  ['SANTA CATARINA', 'SC'], ['SAO PAULO', 'SP'], ['SERGIPE', 'SE'],
  ['TOCANTINS', 'TO'],
]);

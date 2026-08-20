// Gera um .xlsx de verdade em memória, para testar o leitor.
//
// O fixture é construído em vez de comitado como binário por dois motivos: o
// formato fica explícito e revisável no diff, e não há arquivo opaco no
// repositório. Só é usado em teste — não é dado de produto (ASSUMPTIONS.md
// A-003).

import { crc32, deflateRawSync } from 'node:zlib';

interface Arquivo {
  readonly nome: string;
  readonly conteudo: Buffer;
}

/** Escreve um ZIP mínimo, com deflate, no formato que `lerXlsx` espera. */
function zipar(arquivos: readonly Arquivo[]): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const comprimido = deflateRawSync(a.conteudo);
    const soma = crc32(a.conteudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // método: deflate
    local.writeUInt32LE(soma, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(a.conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(soma, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(a.conteudo.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += local.length + nome.length + comprimido.length;
  }

  const corpo = Buffer.concat(locais);
  const diretorio = Buffer.concat(centrais);

  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(corpo.length, 16);

  return new Uint8Array(Buffer.concat([corpo, diretorio, fim]));
}

/** Célula do fixture: string compartilhada, número, ou data com estilo. */
export type CelulaFixture =
  | { readonly tipo: 'texto'; readonly valor: string }
  | { readonly tipo: 'numero'; readonly valor: number }
  | { readonly tipo: 'data'; readonly serial: number }
  | { readonly tipo: 'vazia' };

export const texto = (valor: string): CelulaFixture => ({ tipo: 'texto', valor });
export const numero = (valor: number): CelulaFixture => ({ tipo: 'numero', valor });
export const data = (serial: number): CelulaFixture => ({ tipo: 'data', serial });
export const vazia: CelulaFixture = { tipo: 'vazia' };

function letraColuna(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Monta um .xlsx com uma aba.
 *
 * O estilo 1 usa numFmtId 14 (data curta embutida); o estilo 0 é geral. É assim
 * que uma planilha real distingue "45870 é 30/07/2025" de "45870 é o número
 * quarenta e cinco mil".
 */
export function criarXlsx(nomeAba: string, linhas: readonly (readonly CelulaFixture[])[]): Uint8Array {
  const compartilhadas: string[] = [];
  const indiceDe = (valor: string): number => {
    const i = compartilhadas.indexOf(valor);
    if (i !== -1) return i;
    compartilhadas.push(valor);
    return compartilhadas.length - 1;
  };

  const xmlLinhas = linhas
    .map((linha, l) => {
      const celulas = linha
        .map((c, i) => {
          const ref = `${letraColuna(i)}${l + 1}`;
          switch (c.tipo) {
            case 'vazia':
              return '';
            case 'texto':
              return `<c r="${ref}" t="s"><v>${indiceDe(c.valor)}</v></c>`;
            case 'numero':
              return `<c r="${ref}"><v>${c.valor}</v></c>`;
            case 'data':
              return `<c r="${ref}" s="1"><v>${c.serial}</v></c>`;
          }
        })
        .join('');
      return `<row r="${l + 1}">${celulas}</row>`;
    })
    .join('');

  const sheet =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${xmlLinhas}</sheetData></worksheet>`;

  const shared =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${compartilhadas.length}">` +
    compartilhadas.map((s) => `<si><t>${escapar(s)}</t></si>`).join('') +
    `</sst>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>` +
    `</styleSheet>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapar(nomeAba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
    `Target="worksheets/sheet1.xml"/></Relationships>`;

  const b = (s: string): Buffer => Buffer.from(s, 'utf8');
  return zipar([
    { nome: 'xl/workbook.xml', conteudo: b(workbook) },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: b(rels) },
    { nome: 'xl/sharedStrings.xml', conteudo: b(shared) },
    { nome: 'xl/styles.xml', conteudo: b(styles) },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: b(sheet) },
  ]);
}

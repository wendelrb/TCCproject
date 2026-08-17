#!/usr/bin/env node
// Monta a versão estática navegável da demo.
//
// Três ingredientes:
//   1. os dados exportados do banco (scripts/exportar-demo.ts);
//   2. o template HTML;
//   3. o motor de simulação COMPILADO a partir do mesmo TypeScript que o app usa.
//
// O item 3 é o detalhe que importa: em vez de reescrever a matemática em JS na
// mão — que divergiria da versão testada na primeira mudança — o `tsc` gera o
// JS do próprio `_shared/simulacao/compra.ts`. Uma implementação, dois destinos.
//
// Uso:
//   node scripts/exportar-demo.ts demo.json
//   node scripts/gerar-estatica.ts demo.json demo-diesel.html

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const MOTOR_TS = path.join(RAIZ, 'supabase/functions/_shared/simulacao/compra.ts');
const TEMPLATE = path.join(RAIZ, 'scripts/demo-estatica.template.html');

// Roda o compilador pelo arquivo JS dele, com o próprio Node, em vez de chamar
// `npx tsc`. No Windows o executável é `npx.cmd`, e `execFileSync` sem shell não
// resolve a extensão — daria ENOENT. Assim o caminho é o mesmo nos três sistemas.
const TSC_JS = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');

/** Compila o motor e devolve o JS pronto para inline num <script> comum. */
function motorCompilado(): string {
  const saida = mkdtempSync(path.join(tmpdir(), 'motor-'));
  execFileSync(
    process.execPath,
    [TSC_JS, MOTOR_TS, '--target', 'es2022', '--module', 'esnext',
     '--moduleResolution', 'bundler', '--strict', '--outDir', saida],
    { stdio: 'inherit' },
  );

  const js = readFileSync(path.join(saida, 'compra.js'), 'utf8');

  // O <script> da página não é módulo, então `export` quebraria. Remove a
  // palavra-chave e expõe o necessário num objeto global.
  const semExport = js.replace(/^export /gm, '');
  return `const SIM = (function () {\n${semExport}\n` +
    `return { simularEstrategia, compararEstrategias, simularProspectivo, gerarCaminhos, quantil };\n})();`;
}

function main(): void {
  const entrada = process.argv[2] ?? 'demo.json';
  const destino = process.argv[3] ?? 'demo-diesel.html';

  const template = readFileSync(TEMPLATE, 'utf8');
  for (const marca of ['/*__DADOS__*/', '/*__MOTOR__*/']) {
    if (!template.includes(marca)) throw new Error(`template sem o marcador ${marca}`);
  }

  const html = template
    .replace('/*__MOTOR__*/', motorCompilado())
    .replace('/*__DADOS__*/', readFileSync(entrada, 'utf8'));

  writeFileSync(destino, html, 'utf8');
  console.log(`gerado ${destino} — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
}

main();

#!/usr/bin/env node
// Runner local da ingestão da ANP — mesmo núcleo da Edge Function, rodando em
// Node contra um Postgres qualquer.
//
// Existe porque a Edge Function não pode ser executada contra a fonte real
// nesta sessão (egresso bloqueado). Com este runner, quem tiver acesso à rede
// da ANP roda a ingestão de verdade e devolve o output bruto.
//
// Aceita .xlsx (o formato que a ANP publica) e CSV. O formato é decidido pelo
// conteúdo do arquivo, não pela extensão.
//
// Uso:
//   node scripts/ingest-anp.ts [--db <url>] [--serie UF] [--aba NOME] <arquivo|https://...> ...
//
// Exemplos:
//   node scripts/ingest-anp.ts dados/semanal-estados.xlsx --serie SP
//   node scripts/ingest-anp.ts dados/anp-2024.csv dados/anp-2025.csv --serie SP
//   node scripts/ingest-anp.ts --url https://www.gov.br/anp/.../semanal-estados.xlsx

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { parsearAnp, parsearAnpXlsx } from '../supabase/functions/_shared/anp/parser.ts';
import { gravarPrecos } from '../supabase/functions/_shared/anp/persistencia.ts';
import { analisarCadencia } from '../supabase/functions/_shared/anp/semanas.ts';
import { decodificar } from '../supabase/functions/_shared/anp/texto.ts';
import { ErroFonteAnp, type Executor } from '../supabase/functions/_shared/anp/tipos.ts';

interface Args {
  readonly db: string;
  readonly serie: string | null;
  readonly aba: string | null;
  readonly fontes: readonly string[];
}

function lerArgs(argv: readonly string[]): Args {
  const fontes: string[] = [];
  let db = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
  let serie: string | null = null;
  let aba: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') {
      db = argv[i + 1] ?? db;
      i += 1;
    } else if (a === '--serie') {
      serie = (argv[i + 1] ?? '').toUpperCase() || null;
      i += 1;
    } else if (a === '--aba') {
      aba = argv[i + 1] ?? null;
      i += 1;
    } else if (a === '--url') {
      const u = argv[i + 1];
      if (u !== undefined) fontes.push(u);
      i += 1;
    } else if (a !== undefined && !a.startsWith('--')) {
      fontes.push(a);
    }
  }
  return { db, serie, aba, fontes };
}

async function carregar(fonte: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(fonte)) {
    const r = await fetch(fonte, { redirect: 'follow' });
    if (!r.ok) throw new ErroFonteAnp(`ANP respondeu ${r.status} ${r.statusText} para ${fonte}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  try {
    return new Uint8Array(await readFile(fonte));
  } catch (erro) {
    if ((erro as { code?: string }).code !== 'ENOENT') throw erro;
    // O nome com que a ANP BAIXA o arquivo não é o mesmo que aparece no link da
    // página. Em vez de só dizer "não existe", mostra o que existe na pasta —
    // que é a informação de que a pessoa precisa para corrigir o comando.
    throw new ErroFonteAnp(
      `arquivo não encontrado: ${fonte}\n${await vizinhos(fonte)}`,
    );
  }
}

/** Lista as planilhas que existem na pasta onde o arquivo foi procurado. */
async function vizinhos(fonte: string): Promise<string> {
  const pasta = path.dirname(path.resolve(fonte)) || '.';
  try {
    const achados = (await readdir(pasta))
      .filter((f) => /\.(xlsx|xlsb|xls|csv)$/i.test(f))
      .sort();
    if (achados.length === 0) {
      return `A pasta ${pasta} existe mas não tem nenhuma planilha.\n` +
        'Copie os arquivos .xlsx da ANP para lá. Ver docs/INGESTAO_ANP.md.';
    }
    return `Planilhas que existem em ${pasta}:\n` +
      achados.map((f) => `  ${f}`).join('\n') +
      '\n\nUse o nome EXATO, entre aspas se tiver espaço. No Git Bash a barra é `/`.';
  } catch {
    return `A pasta ${pasta} não existe. Crie-a e copie os .xlsx da ANP para lá.`;
  }
}

/**
 * Decide pelo CONTEÚDO, não pela extensão.
 *
 * Todo ZIP — e um .xlsx é um ZIP — começa com "PK\x03\x04". A ANP já publicou
 * arquivo com extensão trocada; confiar no nome é como confiar no rótulo em vez
 * de olhar dentro da caixa.
 */
async function parsear(bytes: Uint8Array, aba: string | null) {
  const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return ehZip ? parsearAnpXlsx(bytes, aba ?? undefined) : parsearAnp(decodificar(bytes));
}

function criarExecutor(pool: pg.Pool): Executor {
  return {
    async executar(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return { linhasAfetadas: r.rowCount ?? 0 };
    },
    async consultar<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows as T[];
    },
  };
}

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  if (args.fontes.length === 0) {
    console.error('nenhuma fonte informada. Passe caminhos de arquivo ou --url <endereço>.');
    process.exitCode = 2;
    return;
  }

  const pool = new pg.Pool({ connectionString: args.db });
  const exec = criarExecutor(pool);
  const coletadoEm = new Date().toISOString();

  try {
    let inseridas = 0;
    let atualizadas = 0;
    const semanas: string[] = [];
    const suspeitas = new Set<string>();
    const descartes = new Map<string, number>();
    const aproximadas = new Set<string>();

    for (const fonte of args.fontes) {
      const { linhas, relatorio } = await parsear(await carregar(fonte), args.aba);
      const r = await gravarPrecos(exec, linhas, `ANP:${fonte}`, coletadoEm);
      inseridas += r.inseridas;
      atualizadas += r.atualizadas;
      for (const l of linhas) semanas.push(l.semanaInicio);
      for (const s of relatorio.nomenclaturasSuspeitas) suspeitas.add(s);
      for (const c of relatorio.colunasAproximadas) aproximadas.add(c);
      for (const d of relatorio.descartes) descartes.set(d.motivo, (descartes.get(d.motivo) ?? 0) + 1);

      console.log(
        `[${fonte}] lidas=${relatorio.linhasLidas} aceitas=${relatorio.aceitas} ` +
          `inseridas=${r.inseridas} atualizadas=${r.atualizadas} ` +
          `semanaFimDerivada=${relatorio.semanasFimDerivadas}`,
      );
    }

    const cadencia = analisarCadencia(semanas);

    console.log('\n=== SEMANAS CARREGADAS ===');
    console.log(`distintas: ${cadencia.semanas.length}`);
    console.log(`primeira:  ${cadencia.semanas.at(0) ?? '-'}`);
    console.log(`última:    ${cadencia.semanas.at(-1) ?? '-'}`);
    console.log(`cadência modal: ${cadencia.cadenciaModalDias ?? '-'} dias`);

    console.log('\n=== GAPS / ANOMALIAS DE CADÊNCIA ===');
    if (cadencia.anomalias.length === 0) {
      console.log('nenhuma');
    } else {
      for (const a of cadencia.anomalias) {
        console.log(
          `${a.tipo}: ${a.de} -> ${a.ate} (${a.dias} dias, ` +
            `${a.semanasFaltando ?? '?'} semana(s) faltando)`,
        );
      }
    }

    console.log('\n=== DESCARTES POR MOTIVO ===');
    if (descartes.size === 0) console.log('nenhum');
    for (const [motivo, n] of [...descartes].sort()) console.log(`${motivo}: ${n}`);

    if (aproximadas.size > 0) {
      console.log('\n=== COLUNAS RESOLVIDAS POR APROXIMAÇÃO (conferir) ===');
      for (const c of aproximadas) console.log(c);
    }

    if (suspeitas.size > 0) {
      console.log('\n=== NOMENCLATURA SUSPEITA (possível quebra de série) ===');
      for (const s of suspeitas) console.log(s);
      console.log('Registre em source_breaks se for mudança de nomenclatura real.');
    }

    if (args.serie !== null) {
      const { rows } = await pool.query<{
        semana_inicio: string;
        preco_medio_revenda: string | null;
        num_postos_revenda: number | null;
      }>(
        `select to_char(semana_inicio,'YYYY-MM-DD') as semana_inicio,
                preco_medio_revenda::text, num_postos_revenda
           from public.fuel_prices
          where nivel = 'UF' and uf = $1 and produto = 'DIESEL_S10'
          order by semana_inicio`,
        [args.serie],
      );
      console.log(`\n=== SÉRIE ${args.serie} (nível UF, diesel S-10) — ${rows.length} semanas ===`);
      for (const l of rows) {
        console.log(`${l.semana_inicio}  R$ ${l.preco_medio_revenda ?? '-'}  postos=${l.num_postos_revenda ?? '-'}`);
      }
    }
  } catch (erro) {
    console.error(`\nFALHA: ${(erro as Error).name}: ${(erro as Error).message}`);
    console.error('Nada foi preenchido por aproximação. Corrija a fonte ou o contrato de colunas.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();

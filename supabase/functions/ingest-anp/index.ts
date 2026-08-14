// Edge Function ingest-anp.
//
// Baixa o levantamento semanal da ANP, extrai diesel S-10 por UF e município,
// normaliza e grava de forma idempotente.
//
// Dependência: npm:postgres (postgres.js) — cliente Postgres para o upsert em
// lote; supabase-js não expõe ON CONFLICT sobre índice parcial, que é o que dá
// a idempotência aqui.
//
// ⚠️ NUNCA EXECUTADA CONTRA A FONTE REAL nesta sessão: o host da ANP é negado
// pela política de egresso (ver DATA_PROVENANCE.md). Se a fonte falhar, esta
// função levanta erro e não grava nada — não existe caminho que preencha tabela
// com valor aproximado.

import postgres from 'postgres';

import { parsearAnp } from '../_shared/anp/parser.ts';
import { gravarPrecos } from '../_shared/anp/persistencia.ts';
import { analisarCadencia } from '../_shared/anp/semanas.ts';
import { decodificar } from '../_shared/anp/texto.ts';
import { ErroFonteAnp, type Executor } from '../_shared/anp/tipos.ts';

interface Pedido {
  readonly urls?: readonly string[];
}

async function baixar(url: string): Promise<string> {
  const resposta = await fetch(url, { redirect: 'follow' });
  if (!resposta.ok) {
    throw new ErroFonteAnp(`ANP respondeu ${resposta.status} ${resposta.statusText} para ${url}`);
  }
  return decodificar(new Uint8Array(await resposta.arrayBuffer()));
}

function criarExecutor(sql: ReturnType<typeof postgres>): Executor {
  return {
    async executar(query, params) {
      const r = await sql.unsafe(query, params as unknown as never[]);
      return { linhasAfetadas: r.count ?? 0 };
    },
    async consultar<T>(query: string, params: readonly unknown[]): Promise<T[]> {
      const r = await sql.unsafe(query, params as unknown as never[]);
      return r as unknown as T[];
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? Deno.env.get('DATABASE_URL');
  if (dbUrl === undefined) {
    return Response.json({ erro: 'SUPABASE_DB_URL não configurada' }, { status: 500 });
  }

  let urls: readonly string[] = [];
  try {
    const corpo = (await req.json()) as Pedido;
    urls = corpo.urls ?? [];
  } catch {
    urls = [];
  }
  if (urls.length === 0) {
    const doAmbiente = Deno.env.get('ANP_URLS');
    urls = doAmbiente === undefined ? [] : doAmbiente.split(',').map((u) => u.trim()).filter(Boolean);
  }
  if (urls.length === 0) {
    return Response.json(
      { erro: 'nenhuma URL informada: envie {"urls":[...]} ou configure ANP_URLS' },
      { status: 400 },
    );
  }

  const sql = postgres(dbUrl);
  const exec = criarExecutor(sql);
  const coletadoEm = new Date().toISOString();

  try {
    let inseridas = 0;
    let atualizadas = 0;
    const semanas: string[] = [];
    const suspeitas = new Set<string>();
    const descartes: Record<string, number> = {};

    for (const url of urls) {
      const { linhas, relatorio } = parsearAnp(await baixar(url));
      const r = await gravarPrecos(exec, linhas, `ANP:${url}`, coletadoEm);
      inseridas += r.inseridas;
      atualizadas += r.atualizadas;
      for (const l of linhas) semanas.push(l.semanaInicio);
      for (const s of relatorio.nomenclaturasSuspeitas) suspeitas.add(s);
      for (const d of relatorio.descartes) {
        descartes[d.motivo] = (descartes[d.motivo] ?? 0) + 1;
      }
    }

    const cadencia = analisarCadencia(semanas);
    return Response.json({
      ok: true,
      arquivos: urls.length,
      inseridas,
      atualizadas,
      semanasDistintas: cadencia.semanas.length,
      cadenciaModalDias: cadencia.cadenciaModalDias,
      anomalias: cadencia.anomalias,
      nomenclaturasSuspeitas: [...suspeitas],
      descartes,
    });
  } catch (erro) {
    // Falha de fonte ou de contrato NÃO vira gravação parcial silenciosa.
    return Response.json(
      { ok: false, erro: (erro as Error).message, tipo: (erro as Error).name },
      { status: 502 },
    );
  } finally {
    await sql.end();
  }
});

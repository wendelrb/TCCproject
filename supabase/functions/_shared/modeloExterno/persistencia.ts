// Gravação das previsões de um modelo externo em forecast_runs + forecasts.
//
// Três decisões moram aqui:
//
//   1. UMA EXECUÇÃO POR (modelo, origem, corte). Um arquivo pode carregar o
//      histórico walk-forward inteiro; cada semana de origem vira uma execução
//      própria, que é o que torna o placar comparável linha a linha.
//
//   2. IDEMPOTÊNCIA SEM VIOLAR IMUTABILIDADE. `forecasts` é imutável por
//      trigger — não existe UPDATE. Reimportar o mesmo arquivo não pode nem
//      duplicar nem tentar reescrever, então a inserção usa `on conflict do
//      nothing` e a execução é reaproveitada quando já existe com a mesma
//      identidade.
//
//   3. A CLASSE É DERIVADA AQUI, não lida do arquivo. Mesma regra para todos os
//      modelos (banda de estabilidade da própria UF), senão a coluna "classe"
//      do placar compara coisas diferentes. E ela é calculada sobre a série
//      cortada em `dados_ate` — o corte declarado pelo próprio modelo — para não
//      introduzir vazamento na hora de gravar.

import type { Executor } from '../anp/tipos.ts';
import { bandaEstabilidade, classificar } from '../previsao/modelos.ts';
import {
  ErroContratoModelo,
  type ExecucaoExterna,
  type PrevisaoExterna,
  type ResultadoImportacaoPrevisoes,
} from './tipos.ts';

const LOTE = 500;

interface LinhaSerie {
  readonly semana: string;
  readonly valor: number;
}

/** Série da UF cortada em `dadosAte`. O corte é a garantia de não-vazamento. */
async function serieAte(exec: Executor, uf: string, dadosAte: string): Promise<readonly LinhaSerie[]> {
  const linhas = await exec.consultar<{ semana: string; valor: string }>(
    `select to_char(semana_inicio,'YYYY-MM-DD') as semana, preco_medio_revenda::text as valor
       from public.fuel_prices
      where nivel = 'UF' and uf = $1 and produto = 'DIESEL_S10'
        and semana_inicio <= $2::date and preco_medio_revenda is not null
      order by semana_inicio`,
    [uf, dadosAte],
  );
  return linhas.map((l) => ({ semana: l.semana, valor: Number(l.valor) }));
}

async function execucaoId(
  exec: Executor,
  e: ExecucaoExterna,
  fonte: string,
): Promise<{ id: string; reaproveitada: boolean }> {
  const existentes = await exec.consultar<{ id: string }>(
    `select id from public.forecast_runs
      where modelo_versao = $1 and semana_origem = $2::date and dados_ate = $3::date
      order by executado_em limit 1`,
    [e.modeloVersao, e.semanaOrigem, e.dadosAte],
  );
  const existente = existentes[0];
  if (existente !== undefined) return { id: existente.id, reaproveitada: true };

  const criadas = await exec.consultar<{ id: string }>(
    `insert into public.forecast_runs (modelo_versao, semana_origem, dados_ate, observacao)
     values ($1, $2::date, $3::date, $4) returning id`,
    [e.modeloVersao, e.semanaOrigem, e.dadosAte, `modelo externo · ${fonte}`],
  );
  const criada = criadas[0];
  if (criada === undefined) throw new ErroContratoModelo('não consegui criar a execução em forecast_runs');
  return { id: criada.id, reaproveitada: false };
}

/**
 * Grava as previsões validadas.
 *
 * @param fonte identificação da origem do arquivo, para auditoria.
 */
export async function gravarPrevisoesExternas(
  exec: Executor,
  previsoes: readonly PrevisaoExterna[],
  fonte: string,
): Promise<ResultadoImportacaoPrevisoes> {
  const grupos = new Map<string, PrevisaoExterna[]>();
  for (const p of previsoes) {
    const k = `${p.modeloVersao}|${p.semanaOrigem}|${p.dadosAte}`;
    const atual = grupos.get(k);
    if (atual === undefined) grupos.set(k, [p]);
    else atual.push(p);
  }

  // Uma consulta por (UF, corte), não uma por previsão.
  const cacheSerie = new Map<string, readonly LinhaSerie[]>();
  const serie = async (uf: string, dadosAte: string): Promise<readonly LinhaSerie[]> => {
    const k = `${uf}|${dadosAte}`;
    const guardada = cacheSerie.get(k);
    if (guardada !== undefined) return guardada;
    const s = await serieAte(exec, uf, dadosAte);
    cacheSerie.set(k, s);
    return s;
  };

  let execucoes = 0;
  let execucoesReaproveitadas = 0;
  let inseridas = 0;
  let ignoradas = 0;
  const semSerie = new Set<string>();

  for (const [, doGrupo] of [...grupos].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cabeca = doGrupo[0];
    if (cabeca === undefined) continue;

    const { id, reaproveitada } = await execucaoId(
      exec,
      { modeloVersao: cabeca.modeloVersao, semanaOrigem: cabeca.semanaOrigem, dadosAte: cabeca.dadosAte },
      fonte,
    );
    execucoes += 1;
    if (reaproveitada) execucoesReaproveitadas += 1;

    const valores: unknown[][] = [];
    for (const p of doGrupo) {
      const s = await serie(p.uf, p.dadosAte);
      const ultimo = s.at(-1);
      if (ultimo === undefined) {
        // Sem série não dá para classificar sem inventar um preço de referência.
        // Inventar aqui é exatamente o que o CLAUDE.md proíbe.
        throw new ErroContratoModelo(
          `a série da ANP para ${p.uf} não está carregada até ${p.dadosAte}. ` +
            'Sem ela não é possível classificar ALTA/ESTAVEL/QUEDA nem comparar com o naive. ' +
            'Rode a ingestão da ANP antes de importar previsões.',
        );
      }
      if (!s.some((l) => l.semana === p.semanaOrigem)) semSerie.add(`${p.uf} ${p.semanaOrigem}`);

      const historico = s.map((l) => l.valor);
      const classe = classificar(p.valorPrevisto, ultimo.valor, bandaEstabilidade(historico));

      valores.push([
        id, p.uf, p.horizonteSemanas, p.semanaAlvo,
        p.valorPrevisto, p.p10, p.p90, classe, p.modeloVersao, true,
      ]);
    }

    for (let i = 0; i < valores.length; i += LOTE) {
      const lote = valores.slice(i, i + LOTE);
      const params: unknown[] = [];
      const tuplas: string[] = [];
      for (const v of lote) {
        const base = params.length;
        const ph = v.map((_, j) => `$${base + j + 1}`);
        ph[0] = `${ph[0]}::uuid`;
        ph[3] = `${ph[3]}::date`;
        ph[7] = `${ph[7]}::public.classe_previsao`;
        tuplas.push(`(${ph.join(', ')})`);
        params.push(...v);
      }

      // `do nothing` sem alvo cobre os dois índices únicos da tabela: o de
      // execução e o de previsão oficial. Reimportar o mesmo arquivo devolve
      // inseridas = 0, que é a evidência de idempotência.
      const retorno = await exec.consultar<{ id: string }>(
        `insert into public.forecasts
           (run_id, uf, horizonte_semanas, semana_alvo, valor_previsto, p10, p90, classe, modelo_versao, oficial)
         values ${tuplas.join(', ')}
         on conflict do nothing
         returning id`,
        params,
      );
      inseridas += retorno.length;
      ignoradas += lote.length - retorno.length;
    }
  }

  return {
    execucoes,
    execucoesReaproveitadas,
    inseridas,
    ignoradas,
    semanasOrigemSemSerie: [...semSerie].sort(),
  };
}

/**
 * Preenche o realizado das previsões cujo alvo já saiu na série da ANP.
 *
 * É o passo que faz o modelo aparecer no placar. O realizado vem SEMPRE de
 * `fuel_prices` — nunca do arquivo do modelo — porque é a única forma de os
 * dois lados da comparação virem da mesma fonte.
 *
 * Idempotente pelo `not exists`: rodar de novo não duplica nem reescreve.
 */
export async function preencherRealizados(exec: Executor, modeloVersao: string): Promise<number> {
  const linhas = await exec.consultar<{ forecast_id: string }>(
    `insert into public.forecast_outcomes (forecast_id, semana_alvo, valor_realizado, fonte_realizado)
     select f.id, f.semana_alvo, p.preco_medio_revenda, 'serie fuel_prices ' || f.uf
       from public.forecasts f
       join public.fuel_prices p
         on p.nivel = 'UF' and p.uf = f.uf and p.produto = 'DIESEL_S10'
        and p.semana_inicio = f.semana_alvo and p.preco_medio_revenda is not null
      where f.modelo_versao = $1
        and not exists (select 1 from public.forecast_outcomes o where o.forecast_id = f.id)
     returning forecast_id`,
    [modeloVersao],
  );
  return linhas.length;
}

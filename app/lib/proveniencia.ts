/**
 * De onde vem cada número da tela.
 *
 * DECISÃO (ASSUMPTIONS.md A-025): a marcação de "dado fictício" **não** é um
 * flag de build nem um modo do app. Ela é DERIVADA do próprio dado, lendo a
 * coluna `fonte` de `fuel_prices` e a existência de organização sob a RLS.
 *
 * O motivo é simples: não existe caminho em que alguém esqueça de ligar a
 * tarja. Se a linha veio do seed fictício, ela se denuncia sozinha; se veio da
 * ANP, ela se identifica sozinha, com data de coleta.
 *
 * O estado `MISTA` é o mais importante dos quatro. Ele significa que dado
 * fictício e dado da ANP estão no MESMO banco — o que a emenda de 2026-08-14
 * proíbe. A tela grita em vez de escolher um dos dois para exibir.
 */

import { comoUsuario } from './db.ts';
import { nomeDoBanco } from './pgurl.ts';
import type { UsuarioDemo } from './demo.ts';

/** Prefixo que a ingestão real grava em `fuel_prices.fonte`. */
const PREFIXO_ANP = 'ANP:';

export type OrigemSerie = 'ANP' | 'FICTICIA' | 'MISTA' | 'AUSENTE';
export type OrigemCliente = 'FICTICIO' | 'AUSENTE';

export interface Proveniencia {
  readonly banco: string;
  readonly serie: OrigemSerie;
  /** Data da coleta mais recente, quando a série é da ANP. */
  readonly coletadaEm: string | null;
  readonly semanas: number;
  readonly primeiraSemana: string | null;
  readonly ultimaSemana: string | null;
  readonly municipios: number;
  readonly cliente: OrigemCliente;
}

interface LinhaContagem {
  readonly anp: string;
  readonly outras: string;
  readonly semanas: string;
  readonly de: string | null;
  readonly ate: string | null;
  readonly coletada: string | null;
  readonly municipios: string;
  readonly orgs: string;
}

export async function proveniencia(u: UsuarioDemo): Promise<Proveniencia> {
  const banco = nomeDoBanco();

  const linha = await comoUsuario(u.id, async (c) => {
    const { rows } = await c.query<LinhaContagem>(
      `select
         count(*) filter (where fonte like $1)::text                        as anp,
         count(*) filter (where fonte not like $1)::text                    as outras,
         count(distinct semana_inicio)::text                                as semanas,
         to_char(min(semana_inicio), 'YYYY-MM-DD')                          as de,
         to_char(max(semana_inicio), 'YYYY-MM-DD')                          as ate,
         to_char(max(coletado_em) filter (where fonte like $1), 'YYYY-MM-DD') as coletada,
         count(distinct municipio_norm)::text                               as municipios,
         (select count(*) from public.organizations)::text                  as orgs
       from public.fuel_prices
       where produto = 'DIESEL_S10'`,
      [`${PREFIXO_ANP}%`],
    );
    return rows[0] ?? null;
  });

  if (linha === null) {
    return {
      banco, serie: 'AUSENTE', coletadaEm: null, semanas: 0,
      primeiraSemana: null, ultimaSemana: null, municipios: 0, cliente: 'AUSENTE',
    };
  }

  const anp = Number(linha.anp);
  const outras = Number(linha.outras);

  const serie: OrigemSerie =
    anp > 0 && outras > 0 ? 'MISTA'
      : anp > 0 ? 'ANP'
        : outras > 0 ? 'FICTICIA'
          : 'AUSENTE';

  return {
    banco,
    serie,
    coletadaEm: linha.coletada,
    semanas: Number(linha.semanas),
    primeiraSemana: linha.de,
    ultimaSemana: linha.ate,
    municipios: Number(linha.municipios),
    // Não existe cliente REAL: a identidade da demo vem de cookie, e o Supabase
    // Auth ainda não roda. Enquanto for assim, organização que existe é fictícia.
    cliente: Number(linha.orgs) > 0 ? 'FICTICIO' : 'AUSENTE',
  };
}

/** Data ISO para dd/mm/aaaa. */
export function dataBr(iso: string | null): string {
  return iso === null ? '—' : iso.split('-').reverse().join('/');
}

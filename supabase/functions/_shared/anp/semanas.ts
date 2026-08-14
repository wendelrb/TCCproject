// Detecção de gaps na série semanal.
//
// A cadência NÃO é assumida como 7 dias. Ela é inferida do próprio arquivo (a
// diferença modal entre semanas consecutivas) e o que desvia disso é reportado.
// Assumir 7 fixo produziria "gap" falso toda vez que a ANP alterasse o
// calendário da pesquisa — e um gap falso no relatório é tão ruim quanto um
// gap real escondido.

export type TipoAnomalia = 'GAP' | 'SOBREPOSICAO';

export interface Anomalia {
  readonly de: string;
  readonly ate: string;
  readonly dias: number;
  readonly tipo: TipoAnomalia;
  /** Quantas semanas de cadência cabem no buraco, quando divide certo. */
  readonly semanasFaltando: number | null;
}

export interface Cadencia {
  readonly semanas: readonly string[];
  readonly cadenciaModalDias: number | null;
  readonly anomalias: readonly Anomalia[];
}

function diffDias(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function analisarCadencia(semanasBrutas: readonly string[]): Cadencia {
  const semanas = [...new Set(semanasBrutas)].sort();
  if (semanas.length < 2) {
    return { semanas, cadenciaModalDias: null, anomalias: [] };
  }

  const diffs: number[] = [];
  for (let i = 1; i < semanas.length; i += 1) {
    diffs.push(diffDias(semanas[i - 1] ?? '', semanas[i] ?? ''));
  }

  const contagem = new Map<number, number>();
  for (const d of diffs) contagem.set(d, (contagem.get(d) ?? 0) + 1);

  let modal = diffs[0] ?? 0;
  let maior = 0;
  for (const [d, n] of contagem) {
    if (n > maior) {
      maior = n;
      modal = d;
    }
  }

  const anomalias: Anomalia[] = [];
  for (let i = 0; i < diffs.length; i += 1) {
    const d = diffs[i] ?? 0;
    if (d === modal) continue;
    anomalias.push({
      de: semanas[i] ?? '',
      ate: semanas[i + 1] ?? '',
      dias: d,
      tipo: d > modal ? 'GAP' : 'SOBREPOSICAO',
      semanasFaltando: modal > 0 && d % modal === 0 ? d / modal - 1 : null,
    });
  }

  return { semanas, cadenciaModalDias: modal, anomalias };
}

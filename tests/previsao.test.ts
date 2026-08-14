// Testes do motor de previsão.
//
// Séries construídas, não dados reais — mas aqui isso é uma VANTAGEM: numa
// série cuja lei eu conheço, sei qual é a resposta certa, e dá para provar
// propriedades que dado real não provaria.
//
// O teste central é o de não-vazamento: mutar o futuro da série e exigir que
// nenhuma previsão anterior mude. É o tipo de erro que passa despercebido num
// backtest e produz acurácia fantástica que evapora em produção.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  prever, bandaEstabilidade, classificar, quantil,
} from '../supabase/functions/_shared/previsao/modelos.ts';
import {
  backtest, errosWalkForward, escolherModelo, somarSemanas,
  type Observacao,
} from '../supabase/functions/_shared/previsao/walkforward.ts';
import { calcular, escalaMase } from '../supabase/functions/_shared/previsao/metricas.ts';

function serie(valores: readonly number[], inicio = '2024-01-07'): Observacao[] {
  return valores.map((valor, i) => ({ semana: somarSemanas(inicio, i), valor }));
}

/** Série determinística com tendência e oscilação. */
function serieSintetica(n: number, base = 6): number[] {
  return Array.from({ length: n }, (_, i) =>
    Number((base + i * 0.004 + Math.sin(i / 5) * 0.06 + Math.cos(i / 3) * 0.02).toFixed(4)),
  );
}

describe('modelos', () => {
  it('naive devolve o último valor observado', () => {
    assert.equal(prever([5, 6, 7], 1, 'naive'), 7);
    assert.equal(prever([5, 6, 7], 4, 'naive'), 7);
  });

  it('drift acerta na mosca uma série perfeitamente linear', () => {
    // 1,2,3,...,10 → daqui a 3 passos tem de ser 13. Se der outra coisa, a
    // inclinação está errada.
    const linear = Array.from({ length: 10 }, (_, i) => i + 1);
    assert.equal(prever(linear, 1, 'drift'), 11);
    assert.equal(prever(linear, 3, 'drift'), 13);
  });

  it('mm3 é a média dos três últimos', () => {
    assert.equal(prever([1, 2, 3, 10, 20, 30], 1, 'mm3'), 20);
  });

  it('com histórico curto o drift degenera para o naive em vez de explodir', () => {
    assert.equal(prever([7], 2, 'drift'), 7);
  });

  it('série vazia devolve null, não NaN', () => {
    assert.equal(prever([], 1, 'naive'), null);
  });
});

describe('banda de estabilidade e classe', () => {
  it('série imóvel usa o piso de R$ 0,02', () => {
    assert.equal(bandaEstabilidade([6, 6, 6, 6, 6]), 0.02);
  });

  it('série ruidosa alarga a banda', () => {
    const banda = bandaEstabilidade([6, 6.3, 6, 6.35, 6.02, 6.4]);
    assert.ok(banda > 0.02, `esperava banda maior que o piso, veio ${banda}`);
  });

  it('choque isolado não infla a banda (mediana, não média)', () => {
    const calma = [6, 6.01, 6.02, 6.01, 6.0, 6.01, 6.02];
    const comChoque = [...calma.slice(0, 6), 9.5];
    // A mediana do |Δ| ignora o outlier; a média não ignoraria.
    assert.ok(bandaEstabilidade(comChoque) < 0.1);
  });

  it('classifica dentro e fora da banda', () => {
    assert.equal(classificar(6.01, 6.0, 0.02), 'ESTAVEL');
    assert.equal(classificar(6.05, 6.0, 0.02), 'ALTA');
    assert.equal(classificar(5.95, 6.0, 0.02), 'QUEDA');
  });
});

describe('quantil empírico', () => {
  it('interpola entre pontos', () => {
    assert.equal(quantil([0, 10], 0.5), 5);
    assert.equal(quantil([0, 1, 2, 3, 4], 0.5), 2);
  });

  it('P10 e P90 de uma sequência conhecida', () => {
    const s = Array.from({ length: 11 }, (_, i) => i); // 0..10
    assert.equal(quantil(s, 0.1), 1);
    assert.equal(quantil(s, 0.9), 9);
  });
});

describe('NÃO-VAZAMENTO TEMPORAL', () => {
  it('mudar o futuro da série não altera nenhuma previsão anterior', () => {
    const base = serieSintetica(120);
    const corte = 80;

    // Série B é idêntica até `corte` e absurda depois. Se qualquer previsão
    // feita em origem <= corte mudar, houve vazamento.
    const b = [...base];
    for (let i = corte + 1; i < b.length; i += 1) b[i] = 99;

    const previstasA = backtest(serie(base));
    const previstasB = backtest(serie(b));

    const chave = (p: { semanaOrigem: string; h: number }) => `${p.semanaOrigem}|${p.h}`;
    const mapaB = new Map(previstasB.map((p) => [chave(p), p]));

    let comparadas = 0;
    for (const pa of previstasA) {
      if (pa.origemIdx > corte) continue;
      const pb = mapaB.get(chave(pa));
      assert.ok(pb, `previsão sumiu ao mudar o futuro: ${chave(pa)}`);
      assert.equal(pb.modelo, pa.modelo, `modelo mudou em ${chave(pa)}`);
      assert.equal(pb.previsto, pa.previsto, `ponto mudou em ${chave(pa)}`);
      assert.equal(pb.p10, pa.p10, `P10 mudou em ${chave(pa)}`);
      assert.equal(pb.p90, pa.p90, `P90 mudou em ${chave(pa)}`);
      comparadas += 1;
    }
    assert.ok(comparadas > 100, `esperava comparar muitas previsões, comparei ${comparadas}`);
  });

  it('a escolha do modelo só olha alvos já realizados na origem', () => {
    const erros = errosWalkForward(serie(serieSintetica(80)), [1], 26);
    const origem = 40;
    const usados = erros.filter((e) => e.h === 1 && e.alvoIdx <= origem);
    const futuros = erros.filter((e) => e.h === 1 && e.alvoIdx > origem);

    assert.ok(usados.length > 0 && futuros.length > 0, 'cenário precisa ter os dois grupos');

    // Estragar só os erros futuros não pode mexer na escolha feita na origem.
    const escolhaLimpa = escolherModelo(erros, origem, 1);
    const errosPoluidos = erros.map((e) =>
      e.alvoIdx > origem ? { ...e, erro: e.modelo === 'naive' ? 1000 : -1000 } : e,
    );
    assert.equal(escolherModelo(errosPoluidos, origem, 1).modelo, escolhaLimpa.modelo);
  });

  it('previsão em t+h nunca usa observação posterior a t', () => {
    const valores = serieSintetica(60);
    const s = serie(valores);
    const erros = errosWalkForward(s, [1, 2, 3, 4], 26);

    for (const e of erros) {
      assert.ok(e.alvoIdx === e.origemIdx + e.h, 'alvo fora do horizonte declarado');
      assert.ok(e.origemIdx < e.alvoIdx, 'origem precisa ser anterior ao alvo');
    }
  });
});

describe('emissão de previsões', () => {
  it('não emite intervalo sem resíduos suficientes', () => {
    const p = backtest(serie(serieSintetica(60)), { minResiduos: 8 });
    assert.ok(p.every((x) => x.nResiduos >= 8));
  });

  it('P10 <= P90 sempre', () => {
    for (const p of backtest(serie(serieSintetica(140)))) {
      assert.ok(p.p10 <= p.p90, `intervalo invertido: ${p.p10} > ${p.p90}`);
    }
  });

  it('o intervalo PODE não conter o ponto, e isso denuncia viés do modelo', () => {
    // Contra-intuitivo e deliberado. O intervalo é feito de quantis empíricos
    // dos resíduos; se o modelo vinha errando sempre para o mesmo lado, o
    // intervalo desloca. Forçar o ponto para dentro esconderia o viés.
    // Ver ASSUMPTIONS.md A-020 e a migration 20260814120006.
    const p = backtest(serie(serieSintetica(140)));
    const fora = p.filter((x) => x.previsto < x.p10 || x.previsto > x.p90);
    assert.ok(fora.length > 0, 'esperava ao menos um caso enviesado nesta série');
    assert.ok(
      fora.every((x) => x.p10 <= x.p90),
      'mesmo enviesado, o intervalo continua ordenado',
    );
  });

  it('modeloFixo ignora a seleção', () => {
    const p = backtest(serie(serieSintetica(120)), { modeloFixo: 'naive' });
    assert.ok(p.length > 0);
    assert.ok(p.every((x) => x.modelo === 'naive'));
  });

  it('a última origem projeta além da série observada, sem realizado', () => {
    const p = backtest(serie(serieSintetica(120)));
    const semRealizado = p.filter((x) => x.realizado === null);
    assert.ok(semRealizado.length > 0, 'precisa existir previsão viva, ainda não realizada');
    assert.ok(semRealizado.every((x) => x.semanaAlvo > x.semanaOrigem));
  });
});

describe('métricas', () => {
  it('MASE usa só a janela de treino como escala', () => {
    const s = serie([1, 2, 3, 4, 5, 100, 200, 300]);
    // Nos 4 primeiros pontos o passo do naive é 1.
    assert.equal(escalaMase(s, 4), 1);
  });

  it('erro zero produz métricas zeradas e cobertura total', () => {
    const s = serie([6, 6, 6, 6]);
    const m = calcular(
      [
        {
          semanaOrigem: s[0]?.semana ?? '', origemIdx: 0, h: 1, semanaAlvo: s[1]?.semana ?? '',
          modelo: 'naive', previsto: 6, p10: 5.9, p90: 6.1, classe: 'ESTAVEL', banda: 0.02,
          realizado: 6, nResiduos: 10,
        },
      ],
      s,
      0.5,
    );
    assert.equal(m.mae, 0);
    assert.equal(m.rmse, 0);
    assert.equal(m.picp, 100);
  });

  it('PICP conta realizado fora do intervalo', () => {
    const s = serie([6, 6.5]);
    const comum = {
      semanaOrigem: s[0]?.semana ?? '', origemIdx: 0, h: 1, semanaAlvo: s[1]?.semana ?? '',
      modelo: 'naive' as const, classe: 'ESTAVEL' as const, banda: 0.02, nResiduos: 10,
    };
    const m = calcular(
      [
        { ...comum, previsto: 6, p10: 5.9, p90: 6.1, realizado: 6.5 }, // fora
        { ...comum, previsto: 6, p10: 5.5, p90: 6.6, realizado: 6.5 }, // dentro
      ],
      s,
      0.5,
    );
    assert.equal(m.picp, 50);
  });
});

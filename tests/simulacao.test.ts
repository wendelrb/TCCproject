// Testes do simulador de compra.
//
// Séries construídas com resposta conhecida: numa série que só sobe, antecipar
// TEM de ganhar; numa que só cai, TEM de perder. Se o simulador não reproduz
// isso, ele está errado — e um simulador errado é pior que nenhum, porque leva
// o cliente a antecipar compra na hora errada.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  compararEstrategias, gerarCaminhos, quantil, simularEstrategia, simularProspectivo,
  type Parametros,
} from '../supabase/functions/_shared/simulacao/compra.ts';

const P: Parametros = {
  consumoSemanalLitros: 1000,
  capacidadeTanqueLitros: 8000,
  custoCapitalAnual: 0,
};

describe('estratégia base (compra semanal)', () => {
  it('custo é a soma litro × preço de cada semana', () => {
    const r = simularEstrategia([6, 7, 8, 9], P, 1);
    assert.equal(r.litros, 4000);
    assert.equal(r.custoCombustivel, 1000 * (6 + 7 + 8 + 9));
    assert.equal(r.compras, 4);
    assert.equal(r.custoCapital, 0);
  });

  it('preço médio efetivo é o custo por litro', () => {
    const r = simularEstrategia([6, 8], P, 1);
    assert.equal(r.precoMedioEfetivo, 7);
  });
});

describe('antecipação em série que só sobe', () => {
  it('antecipar ganha, porque congela o preço baixo', () => {
    const subindo = [6.0, 6.2, 6.4, 6.6, 6.8, 7.0, 7.2, 7.4];
    const c = compararEstrategias(subindo, P, [1, 2, 4]);
    assert.ok(c.melhor);
    assert.ok(
      c.melhor.antecipacaoSemanas > 1,
      `numa série em alta a melhor estratégia deveria antecipar, veio ${c.melhor.antecipacaoSemanas}`,
    );
    assert.ok(c.economiaDaMelhor > 0);
  });

  it('quanto maior a antecipação, menor o custo nessa série', () => {
    const subindo = [6.0, 6.2, 6.4, 6.6, 6.8, 7.0, 7.2, 7.4];
    const a1 = simularEstrategia(subindo, P, 1).custoTotal;
    const a2 = simularEstrategia(subindo, P, 2).custoTotal;
    const a4 = simularEstrategia(subindo, P, 4).custoTotal;
    assert.ok(a4 < a2 && a2 < a1, `esperava a4 < a2 < a1, veio ${a4} ${a2} ${a1}`);
  });
});

describe('antecipação em série que só cai', () => {
  it('antecipar PERDE, e o simulador não esconde isso', () => {
    const caindo = [7.4, 7.2, 7.0, 6.8, 6.6, 6.4, 6.2, 6.0];
    const c = compararEstrategias(caindo, P, [1, 2, 4]);
    assert.equal(c.melhor?.antecipacaoSemanas, 1);
    assert.equal(c.economiaDaMelhor, 0);
    // Antecipar 4 semanas é estritamente pior aqui.
    assert.ok(simularEstrategia(caindo, P, 4).custoTotal > simularEstrategia(caindo, P, 1).custoTotal);
  });
});

describe('restrições físicas e financeiras', () => {
  it('tanque pequeno torna a antecipação inviável, com motivo legível', () => {
    const apertado: Parametros = { ...P, capacidadeTanqueLitros: 2500 };
    const r = simularEstrategia([6, 6, 6, 6], apertado, 4);
    assert.equal(r.viavel, false);
    assert.match(r.motivoInviavel ?? '', /tanque comporta/);
  });

  it('custo de capital encarece antecipar', () => {
    const plano = [6, 6, 6, 6, 6, 6, 6, 6];
    const semJuros = simularEstrategia(plano, P, 4).custoTotal;
    const comJuros = simularEstrategia(plano, { ...P, custoCapitalAnual: 0.15 }, 4).custoTotal;
    assert.ok(comJuros > semJuros, 'imobilizar capital tem de custar algo');
  });

  it('em preço constante e sem juros, antecipar é indiferente', () => {
    // Se der diferença aqui, tem viés no laço de compra.
    const plano = [6, 6, 6, 6, 6, 6, 6, 6];
    assert.equal(simularEstrategia(plano, P, 1).custoTotal, simularEstrategia(plano, P, 4).custoTotal);
  });

  it('cobre o período inteiro mesmo quando não divide redondo', () => {
    // 7 semanas com antecipação 3: 3 + 3 + 1. Ninguém fica sem diesel.
    const r = simularEstrategia([6, 6, 6, 6, 6, 6, 6], P, 3);
    assert.equal(r.litros, 7000);
    assert.equal(r.compras, 3);
  });
});

describe('quantil', () => {
  it('interpola', () => {
    assert.equal(quantil([0, 10], 0.5), 5);
    assert.equal(quantil([0, 1, 2, 3, 4], 0.25), 1);
  });
});

describe('cenários prospectivos', () => {
  const residuos = [-0.06, -0.03, -0.01, 0, 0.01, 0.02, 0.05, 0.09];

  it('gera o número pedido de caminhos, com o horizonte pedido', () => {
    const c = gerarCaminhos(6.5, residuos, { horizonteSemanas: 4, caminhos: 50, semente: 1 });
    assert.equal(c.length, 50);
    assert.ok(c.every((x) => x.length === 4));
  });

  it('é determinístico: mesma semente, mesmos caminhos', () => {
    const a = gerarCaminhos(6.5, residuos, { horizonteSemanas: 4, caminhos: 10, semente: 7 });
    const b = gerarCaminhos(6.5, residuos, { horizonteSemanas: 4, caminhos: 10, semente: 7 });
    assert.deepEqual(a, b);
  });

  it('sementes diferentes produzem caminhos diferentes', () => {
    const a = gerarCaminhos(6.5, residuos, { horizonteSemanas: 4, caminhos: 10, semente: 1 });
    const b = gerarCaminhos(6.5, residuos, { horizonteSemanas: 4, caminhos: 10, semente: 2 });
    assert.notDeepEqual(a, b);
  });

  it('sem resíduos históricos não inventa cenário', () => {
    assert.deepEqual(gerarCaminhos(6.5, [], { horizonteSemanas: 4, caminhos: 10, semente: 1 }), []);
  });

  it('a distribuição de custo vem ordenada e coerente', () => {
    const r = simularProspectivo(6.5, residuos, P, { horizonteSemanas: 8, caminhos: 300, semente: 3 });
    assert.ok(r.distribuicoes.length > 0);
    for (const d of r.distribuicoes) {
      if (!d.viavel) continue;
      assert.ok(d.p10 <= d.p50 && d.p50 <= d.p90, `quantis fora de ordem em h=${d.antecipacaoSemanas}`);
    }
    assert.ok(r.probEsperarCompensa >= 0 && r.probEsperarCompensa <= 1);
  });

  it('com resíduos de média positiva, antecipar tende a compensar', () => {
    // Resíduos enviesados para cima = preço subindo = antecipar deveria vencer
    // na maior parte dos caminhos.
    const subindo = [0.01, 0.02, 0.03, 0.04, 0.05];
    const r = simularProspectivo(6.5, subindo, P, { horizonteSemanas: 8, caminhos: 400, semente: 5 });
    assert.ok(
      r.probEsperarCompensa < 0.2,
      `esperar deveria compensar raramente aqui, veio ${r.probEsperarCompensa}`,
    );
  });

  it('com resíduos de média negativa, esperar tende a compensar', () => {
    const caindo = [-0.05, -0.04, -0.03, -0.02, -0.01];
    const r = simularProspectivo(6.5, caindo, P, { horizonteSemanas: 8, caminhos: 400, semente: 5 });
    assert.ok(
      r.probEsperarCompensa > 0.8,
      `esperar deveria compensar quase sempre aqui, veio ${r.probEsperarCompensa}`,
    );
  });
});

describe('regressão: NaN na probabilidade quando a antecipação não cabe', () => {
  const residuos = [-0.06, -0.03, -0.01, 0, 0.01, 0.02, 0.05, 0.09];

  it('compara contra a maior antecipação que CABE, não a maior pedida', () => {
    // Tanque de 8.000 L com consumo de 1.500 L/semana só comporta 5 semanas.
    // Pedir [1,2,3,4,6,8] não pode produzir NaN.
    const p: Parametros = {
      consumoSemanalLitros: 1500, capacidadeTanqueLitros: 8000, custoCapitalAnual: 0.13,
    };
    const r = simularProspectivo(6.6, residuos, p, { horizonteSemanas: 8, caminhos: 200, semente: 1 }, [1, 2, 3, 4, 6, 8]);
    assert.equal(r.antecipacaoComparada, 4, 'deveria comparar contra 4, a maior que cabe');
    assert.ok(Number.isFinite(r.probEsperarCompensa), 'probabilidade não pode ser NaN');
  });

  it('quando nenhuma antecipação cabe, devolve null explícito em vez de NaN silencioso', () => {
    const minusculo: Parametros = {
      consumoSemanalLitros: 5000, capacidadeTanqueLitros: 6000, custoCapitalAnual: 0.1,
    };
    const r = simularProspectivo(6.6, residuos, minusculo, { horizonteSemanas: 8, caminhos: 100, semente: 1 }, [1, 2, 4]);
    assert.equal(r.antecipacaoComparada, null);
    assert.ok(Number.isNaN(r.probEsperarCompensa));
  });
});

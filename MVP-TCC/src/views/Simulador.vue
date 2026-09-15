<script setup lang="ts">
/**
 * Simulador de compra.
 *
 * Responde "vale a pena encher o tanque agora?" — e responde com PROBABILIDADE
 * sobre cenários, não com um número único fingindo certeza.
 *
 * Os cenários vêm de reamostragem dos resíduos observados (bootstrap), não de
 * uma normal: a série de combustível tem choques, e a normal os apagaria
 * justamente quando eles mais importam.
 *
 * Regra que parece detalhe e não é: só entram na comparação as antecipações que
 * CABEM no tanque. Comparar com um volume que a empresa não consegue armazenar
 * produz recomendação impossível de executar.
 */
import { computed, ref } from 'vue';
import Cabeca from '../components/Cabeca.vue';
import { atual } from '../lib/estado';
import { inteiro, moeda, nf } from '../lib/formato';

const d = computed(() => atual.value);

const consumo = ref(3000);
const tanque = ref(12000);
const custoCapital = ref(14);
const antecipacao = ref(3);

const CENARIOS = 600;

/** PRNG fixo: a mesma entrada dá o mesmo resultado, sempre. */
function prng(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cabeNoTanque = computed(() => consumo.value * antecipacao.value <= tanque.value);

const maiorViavel = computed(() => {
  const max = Math.floor(tanque.value / Math.max(1, consumo.value));
  return Math.max(1, Math.min(8, max));
});

const resultado = computed(() => {
  const semanas = antecipacao.value;
  const litros = consumo.value * semanas;
  if (!cabeNoTanque.value) return null;

  const residuos = d.value.residuos;
  if (residuos.length === 0) return null;

  const rnd = prng(1337 + semanas * 7 + consumo.value);
  const hoje = d.value.atual.uf;
  const taxaSemana = custoCapital.value / 100 / 52;

  let ganhos = 0;
  let somaDif = 0;

  for (let c = 0; c < CENARIOS; c += 1) {
    let preco = hoje;
    let custoEsperar = 0;
    for (let s = 0; s < semanas; s += 1) {
      const r = residuos[Math.floor(rnd() * residuos.length)] ?? 0;
      preco += r;
      custoEsperar += consumo.value * preco;
    }
    // Antecipar: paga tudo hoje e carrega o estoque, que tem custo de capital.
    let custoAntecipar = litros * hoje;
    for (let s = 0; s < semanas; s += 1) {
      const estoqueRestante = consumo.value * (semanas - s);
      custoAntecipar += estoqueRestante * hoje * taxaSemana;
    }
    const dif = custoEsperar - custoAntecipar;
    somaDif += dif;
    if (dif > 0) ganhos += 1;
  }

  return {
    litros,
    prob: (ganhos / CENARIOS) * 100,
    media: somaDif / CENARIOS,
  };
});
</script>

<template>
  <Cabeca
    titulo="Simulador de compra"
    sub="Antecipar a compra compensa? Arraste os controles — o resultado recalcula na hora."
  />

  <div class="grade g-2 surge d1">
    <section class="cartao">
      <div class="cartao-cab"><h2>Sua operação</h2></div>
      <div class="cartao-corpo controles">
        <label class="ctrl">
          <span class="ctrl-top">
            <span class="rot">Consumo semanal</span>
            <b class="num">{{ inteiro(consumo) }} L</b>
          </span>
          <input v-model.number="consumo" type="range" min="500" max="12000" step="250" />
        </label>

        <label class="ctrl">
          <span class="ctrl-top">
            <span class="rot">Capacidade do tanque</span>
            <b class="num">{{ inteiro(tanque) }} L</b>
          </span>
          <input v-model.number="tanque" type="range" min="2000" max="60000" step="1000" />
        </label>

        <label class="ctrl">
          <span class="ctrl-top">
            <span class="rot">Custo de capital ao ano</span>
            <b class="num">{{ custoCapital }}%</b>
          </span>
          <input v-model.number="custoCapital" type="range" min="0" max="30" step="0.5" />
        </label>

        <label class="ctrl">
          <span class="ctrl-top">
            <span class="rot">Antecipar</span>
            <b class="num">{{ antecipacao }} {{ antecipacao === 1 ? 'semana' : 'semanas' }}</b>
          </span>
          <input v-model.number="antecipacao" type="range" min="1" max="8" step="1" />
        </label>

        <p class="dica-tanque" :class="{ ruim: !cabeNoTanque }">
          <template v-if="cabeNoTanque">
            {{ inteiro(consumo * antecipacao) }} L cabem no tanque de
            {{ inteiro(tanque) }} L.
          </template>
          <template v-else>
            <strong>Não cabe.</strong> {{ inteiro(consumo * antecipacao) }} L não
            entram num tanque de {{ inteiro(tanque) }} L — o máximo viável é
            <strong>{{ maiorViavel }}</strong>
            {{ maiorViavel === 1 ? 'semana' : 'semanas' }}.
          </template>
        </p>
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-cab">
        <h2>Resultado</h2>
        <span class="rot">{{ CENARIOS }} cenários</span>
      </div>
      <div class="cartao-corpo">
        <template v-if="resultado">
          <div class="medidor">
            <div class="med-num num">{{ resultado.prob.toFixed(0) }}<i>%</i></div>
            <div class="med-txt">
              dos cenários em que <strong>antecipar {{ antecipacao }}
              {{ antecipacao === 1 ? 'semana' : 'semanas' }}</strong> sai mais barato
            </div>
          </div>

          <div class="barra-prob" role="img" :aria-label="`${resultado.prob.toFixed(0)}% dos cenários favorecem antecipar`">
            <i :style="{ width: resultado.prob + '%' }"></i>
          </div>

          <table class="tab compacta">
            <tbody>
              <tr>
                <td>Volume da antecipação</td>
                <td class="n">{{ inteiro(resultado.litros) }} L</td>
              </tr>
              <tr>
                <td>Preço de hoje</td>
                <td class="n">{{ nf(d.atual.uf) }}</td>
              </tr>
              <tr>
                <td>Diferença média entre esperar e antecipar</td>
                <td class="n" :class="resultado.media > 0 ? 'bom' : 'mau'">
                  {{ resultado.media > 0 ? '+' : '−' }}R$ {{ moeda(Math.abs(resultado.media)) }}
                </td>
              </tr>
            </tbody>
          </table>

          <p class="nota">
            Valor positivo significa que <strong>antecipar</strong> tende a sair
            mais barato, já descontado o custo do capital parado em estoque.
          </p>
        </template>

        <div v-else class="vazio">
          <h3>Sem recomendação</h3>
          <p>
            Nenhuma antecipação viável nesta configuração. Aumente o tanque ou
            reduza as semanas — <strong>não vamos inventar um número</strong> para
            um volume que não cabe.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.controles { display: flex; flex-direction: column; gap: 18px; }
.ctrl { display: block; }
.ctrl-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.ctrl-top b { font-size: 14px; font-weight: 600; }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 99px;
  background: var(--superficie-3);
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--marca);
  border: 2px solid var(--superficie);
  box-shadow: var(--sombra-1);
  cursor: grab;
}
input[type="range"]::-moz-range-thumb {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--marca);
  border: 2px solid var(--superficie);
  cursor: grab;
}

.dica-tanque {
  font-size: 12.5px;
  color: var(--tinta-3);
  padding: 9px 11px;
  border-radius: var(--r-1);
  background: var(--superficie-2);
  border: 1px solid var(--linha);
}
.dica-tanque.ruim {
  background: var(--atencao-veu);
  color: var(--atencao);
  border-color: color-mix(in srgb, var(--atencao) 30%, transparent);
}
.dica-tanque strong { font-weight: 600; }

.medidor { display: flex; align-items: center; gap: 15px; margin-bottom: 14px; }
.med-num {
  font-size: 44px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.035em;
  color: var(--marca);
  display: flex;
  align-items: baseline;
}
.med-num i { font-style: normal; font-size: 18px; margin-left: 1px; }
.med-txt { font-size: 14px; color: var(--tinta-2); line-height: 1.4; }
.med-txt strong { color: var(--tinta); font-weight: 600; }

.barra-prob {
  height: 7px;
  border-radius: 99px;
  background: var(--superficie-3);
  overflow: hidden;
  margin-bottom: 16px;
}
.barra-prob i { display: block; height: 100%; background: var(--marca); border-radius: 99px; transition: width 0.25s; }

.tab.compacta td { padding: 7px 0; }
.n.bom { color: var(--cai); font-weight: 600; }
.n.mau { color: var(--sobe); font-weight: 600; }

.nota { margin-top: 12px; font-size: 12.5px; color: var(--tinta-3); line-height: 1.5; }
.nota strong, .vazio strong { color: var(--tinta-2); font-weight: 600; }

.vazio { padding: 12px 0; }
.vazio h3 { margin-bottom: 6px; color: var(--atencao); }
.vazio p { font-size: 14px; color: var(--tinta-2); max-width: 46ch; line-height: 1.55; }
</style>

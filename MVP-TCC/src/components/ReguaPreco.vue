<script setup lang="ts">
/**
 * RÉGUA DE PREÇO — a peça que organiza o produto inteiro.
 *
 * Um cartão que diz "R$ 6,89" responde "quanto custa". Não responde "isso é
 * caro?". A régua responde as duas ao mesmo tempo: posiciona o preço entre o
 * menor e o maior do período e, na MESMA escala, marca quanto a empresa
 * pagou. A distância entre os dois pinos é, literalmente, o produto.
 *
 * Decisões de leitura:
 * - mercado marcado ACIMA do trilho, empresa ABAIXO: os rótulos nunca colidem,
 *   por mais perto que os valores estejam;
 * - o rótulo é ancorado pela borda quando o pino chega perto das pontas, senão
 *   o texto vaza do cartão;
 * - a cor é reforço; o pino da empresa tem forma própria (losango) e rótulo,
 *   então continua legível sem cor nenhuma.
 */
import { computed } from 'vue';
import { nf } from '../lib/formato';

const props = defineProps<{
  min: number;
  max: number;
  uf: number;
  municipio: number;
  pago?: number | null;
  nomeMunicipio: string;
  rotuloReferencia?: string;
  rotuloMin?: string;
  rotuloMax?: string;
}>();

/** Posição percentual no trilho, com folga para o pino não encostar na borda. */
function posicao(v: number): number {
  const faixa = props.max - props.min;
  if (faixa <= 0) return 50;
  return Math.min(98, Math.max(2, ((v - props.min) / faixa) * 100));
}

/** Perto da borda, o rótulo deixa de ser centrado e passa a encostar. */
function alinhamento(p: number): string {
  if (p < 14) return 'translateX(0)';
  if (p > 86) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

const pUf = computed(() => posicao(props.uf));
const pMun = computed(() => posicao(props.municipio));
const pPago = computed(() => (props.pago == null ? null : posicao(props.pago)));

const diferenca = computed(() =>
  props.pago == null ? null : props.pago - props.uf,
);
</script>

<template>
  <div class="regua">
    <!-- camada de cima: mercado -->
    <div class="faixa faixa-cima">
      <div
        class="marca marca-mercado"
        :style="{ left: pUf + '%', transform: alinhamento(pUf) }"
      >
        <span class="rot">{{ rotuloReferencia ?? 'média da região' }}</span>
        <span class="v num">{{ nf(uf) }}</span>
      </div>
    </div>

    <div class="trilho">
      <div class="trilho-fundo"></div>
      <!-- zona entre a média da UF e o município: o "corredor" da região -->
      <div
        class="zona"
        :style="{
          left: Math.min(pUf, pMun) + '%',
          width: Math.abs(pMun - pUf) + '%',
        }"
      ></div>

      <div class="pino pino-mercado" :style="{ left: pUf + '%' }"></div>
      <div class="pino pino-municipio" :style="{ left: pMun + '%' }">
        <span class="anel"></span>
      </div>
      <div v-if="pPago !== null" class="pino pino-voce" :style="{ left: pPago + '%' }"></div>
    </div>

    <!-- camada de baixo: você -->
    <div class="faixa faixa-baixo">
      <div
        v-if="pPago !== null"
        class="marca marca-voce"
        :style="{ left: pPago + '%', transform: alinhamento(pPago) }"
      >
        <span class="v num">{{ nf(pago) }}</span>
        <span class="rot">você pagou</span>
      </div>
    </div>

    <div class="pontas">
      <span><span class="rot">{{ rotuloMin ?? 'menor no período' }}</span> <b class="num">{{ nf(min) }}</b></span>
      <span v-if="diferenca !== null" class="leitura">
        <template v-if="diferenca > 0">
          você paga <b class="num acima">R$ {{ nf(Math.abs(diferenca)) }}</b> por litro acima da média
        </template>
        <template v-else>
          você paga <b class="num abaixo">R$ {{ nf(Math.abs(diferenca)) }}</b> por litro abaixo da média
        </template>
      </span>
      <span class="dir"><span class="rot">{{ rotuloMax ?? 'maior no período' }}</span> <b class="num">{{ nf(max) }}</b></span>
    </div>
  </div>
</template>

<style scoped>
.regua { --alt-trilho: 12px; }

.faixa { position: relative; height: 40px; }
.faixa-cima { margin-bottom: 2px; }
.faixa-baixo { margin-top: 2px; height: 38px; }

.marca {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 1px;
  white-space: nowrap;
}
.faixa-cima .marca { bottom: 0; }
.faixa-baixo .marca { top: 0; }

.marca .v { font-size: 16px; font-weight: 600; line-height: 1.15; }
.marca-mercado .v { color: var(--serie-mercado); }
.marca-voce .v { color: var(--serie-voce); }

.trilho {
  position: relative;
  height: var(--alt-trilho);
}
.trilho-fundo {
  position: absolute;
  inset: 0;
  border-radius: 99px;
  background: var(--superficie-3);
  border: 1px solid var(--linha);
}
.zona {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--serie-mercado-veu);
  border-radius: 99px;
  min-width: 2px;
}

.pino {
  position: absolute;
  top: 50%;
  width: 3px;
  height: 26px;
  border-radius: 2px;
  transform: translate(-50%, -50%);
  /* anel de 2px na cor da superfície: separa o pino do trilho mesmo sobrepondo */
  box-shadow: 0 0 0 2px var(--superficie);
}
.pino-mercado { background: var(--serie-mercado); }
.pino-voce {
  background: var(--serie-voce);
  width: 4px;
  height: 30px;
}
.pino-municipio {
  background: transparent;
  box-shadow: none;
  width: 0;
  height: 0;
}
.pino-municipio .anel {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 11px;
  height: 11px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--superficie);
  border: 2px solid var(--serie-mercado);
  border-radius: 2px;
}

.pontas {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--linha);
  font-size: 13px;
  color: var(--tinta-2);
}
.pontas b { color: var(--tinta); font-weight: 600; }
.pontas .dir { text-align: right; }
.leitura { flex: 1 1 auto; text-align: center; }
.leitura .acima { color: var(--sobe); }
.leitura .abaixo { color: var(--cai); }

@media (max-width: 620px) {
  .pontas { flex-wrap: wrap; }
  .leitura { order: 3; flex-basis: 100%; text-align: left; }
}
</style>

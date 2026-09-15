<script setup lang="ts">
/**
 * Placar de acurácia.
 *
 * A tela que a maioria dos produtos não tem. Quando o modelo perde da
 * referência ingênua, ela ESCREVE que perdeu — não é humildade decorativa, é o
 * que permite ao cliente calibrar quanta confiança depositar.
 */
import { computed } from 'vue';
import Cabeca from '../components/Cabeca.vue';
import { atual } from '../lib/estado';
import { inteiro } from '../lib/formato';

const d = computed(() => atual.value);

const perde = computed(() => d.value.placar.filter((l) => l.mae > l.maeNaive).length);

/** Barra comparativa: escala comum aos dois modelos, para a comparação valer. */
function larg(v: number, linha: { mae: number; maeNaive: number }): number {
  const teto = Math.max(linha.mae, linha.maeNaive) * 1.06;
  return (v / teto) * 100;
}
</script>

<template>
  <Cabeca
    titulo="Placar de acurácia"
    sub="Erro do modelo contra a referência ingênua — repetir o preço da semana passada."
  />

  <section
    class="cartao veredito surge d1"
    :class="perde > 0 ? 'ruim' : 'bom'"
  >
    <div class="v-icone" aria-hidden="true">{{ perde > 0 ? '!' : '✓' }}</div>
    <div>
      <h2 v-if="perde > 0">
        O modelo perde da referência ingênua em {{ perde }} de
        {{ d.placar.length }} horizontes
      </h2>
      <h2 v-else>O modelo bate a referência ingênua em todos os horizontes</h2>
      <p>
        Preço semanal de diesel é próximo de um passeio aleatório. Que o naive
        seja difícil de bater é resultado conhecido em séries de preço — e
        mostrar isso é decisão de produto, não descuido.
        <strong>Quem exibe só a previsão está escondendo o mesmo resultado.</strong>
      </p>
    </div>
  </section>

  <section class="cartao surge d2">
    <div class="cartao-cab">
      <h2>Erro por horizonte</h2>
      <div class="leg">
        <span><i class="l l-mod"></i> modelo</span>
        <span><i class="l l-nai"></i> naive</span>
      </div>
    </div>
    <div class="tab-rolagem">
      <table class="tab">
        <thead>
          <tr>
            <th>Horizonte</th>
            <th>Comparação do erro médio (MAE)</th>
            <th class="n">Modelo</th>
            <th class="n">Naive</th>
            <th class="n">RMSE</th>
            <th class="n">Cobertura</th>
            <th class="n">n</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in d.placar" :key="l.horizonte">
            <td>
              +{{ l.horizonte }} {{ l.horizonte === 1 ? 'semana' : 'semanas' }}
            </td>
            <td class="barras">
              <span class="par">
                <i class="b b-mod" :style="{ width: larg(l.mae, l) + '%' }"></i>
                <i class="b b-nai" :style="{ width: larg(l.maeNaive, l) + '%' }"></i>
              </span>
            </td>
            <td class="n">{{ l.mae.toFixed(4) }}</td>
            <td class="n">{{ l.maeNaive.toFixed(4) }}</td>
            <td class="n">{{ l.rmse.toFixed(4) }}</td>
            <td class="n">
              <span class="cob" :class="{ baixa: l.cobertura < 75 }">{{ l.cobertura.toFixed(1) }}%</span>
            </td>
            <td class="n">{{ inteiro(l.n) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="grade g-2 surge d3" style="margin-top: 14px">
    <section class="cartao explica">
      <h3>O que cada métrica diz</h3>
      <dl>
        <dt>MAE</dt><dd>erro médio em R$/L. É o número mais direto: quanto, em média, a previsão errou.</dd>
        <dt>RMSE</dt><dd>pesa mais os erros grandes. Se está muito acima do MAE, existem erros ocasionais severos.</dd>
        <dt>Cobertura</dt><dd>quantas vezes o realizado caiu dentro da faixa P10–P90. Deveria ser ~80%.</dd>
        <dt>n</dt><dd>quantas previsões já têm alvo realizado. Métrica com n pequeno não é métrica.</dd>
      </dl>
    </section>

    <section class="cartao explica defeito">
      <h3>Defeito conhecido, registrado</h3>
      <p>
        A faixa P10–P90 deveria conter o realizado em cerca de
        <strong>80%</strong> dos casos. Na medição ela fica na casa dos
        <strong>60%</strong>: está estreita demais, ou seja,
        <strong>promete mais confiança do que entrega</strong>.
      </p>
      <p>
        Está aqui como falha em vez de omitido. A correção é na estimativa dos
        quantis e está pendente.
      </p>
    </section>
  </div>
</template>

<style scoped>
.veredito { display: flex; gap: 14px; padding: 16px 18px; margin-bottom: 14px; align-items: flex-start; }
.veredito.ruim { background: var(--atencao-veu); border-color: color-mix(in srgb, var(--atencao) 32%, transparent); }
.veredito.bom { background: var(--cai-veu); border-color: color-mix(in srgb, var(--cai) 32%, transparent); }
.v-icone {
  flex: none;
  width: 26px; height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--mono);
  font-weight: 700;
  font-size: 14px;
  margin-top: 1px;
}
.ruim .v-icone { background: var(--atencao); color: var(--fundo); }
.bom .v-icone { background: var(--cai); color: var(--fundo); }
.veredito h2 { margin-bottom: 5px; }
.veredito p { font-size: 13.5px; color: var(--tinta-2); max-width: 82ch; line-height: 1.55; }
.veredito strong { color: var(--tinta); font-weight: 600; }

.leg { display: flex; gap: 14px; font-size: 11.5px; color: var(--tinta-2); }
.leg span { display: inline-flex; align-items: center; gap: 5px; }
.l { width: 12px; height: 8px; border-radius: 2px; flex: none; }
.l-mod { background: var(--serie-voce); }
.l-nai { background: var(--serie-mercado); }

.barras { min-width: 190px; width: 40%; }
.par { display: flex; flex-direction: column; gap: 2px; }
.b { display: block; height: 8px; border-radius: 0 3px 3px 0; min-width: 3px; }
.b-mod { background: var(--serie-voce); }
.b-nai { background: var(--serie-mercado); }

.cob.baixa { color: var(--atencao); font-weight: 600; }

.explica { padding: 16px 18px; }
.explica h3 { margin-bottom: 9px; }
.explica dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 13.5px; }
.explica dt { font-family: var(--mono); font-size: 11.5px; color: var(--tinta-3); text-transform: uppercase; letter-spacing: 0.06em; padding-top: 3px; }
.explica dd { margin: 0; color: var(--tinta-2); line-height: 1.5; }
.explica p { font-size: 13.5px; color: var(--tinta-2); line-height: 1.55; }
.explica p + p { margin-top: 9px; }
.explica strong { color: var(--tinta); font-weight: 600; }
.defeito { border-color: color-mix(in srgb, var(--sobe) 30%, transparent); }
.defeito h3 { color: var(--sobe); }
</style>

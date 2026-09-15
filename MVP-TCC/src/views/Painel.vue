<script setup lang="ts">
/**
 * Painel: preço da região + posição da empresa nela.
 *
 * Hierarquia deliberada — UM número dominante, e não quatro cartões de peso
 * igual. O olho precisa de um ponto de entrada; quatro cartões iguais não têm
 * ponto de entrada nenhum.
 */
import { computed } from 'vue';
import Cabeca from '../components/Cabeca.vue';
import ReguaPreco from '../components/ReguaPreco.vue';
import GraficoSerie from '../components/GraficoSerie.vue';
import { atual } from '../lib/estado';
import { inteiro, moeda, nf } from '../lib/formato';

const d = computed(() => atual.value);
const acima = computed(() => d.value.benchmark.diferencaPercentual > 0);

/**
 * Faixa do PERÍODO, não da semana.
 *
 * A régua compara duas coisas que têm de estar no mesmo quadro: o preço médio
 * que a empresa pagou e a média da região — ambos sobre as mesmas 78 semanas.
 * Comparar a média histórica da empresa com o preço de HOJE daria uma leitura
 * invertida sempre que a série subisse, que é o erro que o produto existe para
 * não cometer.
 */
const periodo = computed(() => {
  const janela = d.value.serie.slice(-78);
  const valores = janela.map((p) => p.valor);
  const lo = Math.min(...valores, d.value.benchmark.precoPago);
  const hi = Math.max(...valores, d.value.benchmark.precoPago);
  const folga = (hi - lo) * 0.08 || 0.05;
  return { min: lo - folga, max: hi + folga, semanas: janela.length };
});
</script>

<template>
  <Cabeca
    titulo="Preço da sua região"
    :sub="`Levantamento semanal, preço médio de revenda do diesel S-10 em ${d.organizacao.uf}.`"
  />

  <!-- HERÓI: o número, a régua e a leitura, num bloco só -->
  <section class="cartao heroi surge d1">
    <div class="heroi-topo">
      <div class="num-principal">
        <div class="rot">Preço médio {{ d.organizacao.uf }}</div>
        <div class="valorao num">
          {{ nf(d.atual.uf) }}<i>R$/L</i>
        </div>
        <div class="delta">
          <span
            class="chip"
            :class="d.atual.variacao > 0 ? 'chip-sobe' : d.atual.variacao < 0 ? 'chip-cai' : 'chip-neutro'"
          >
            {{ d.atual.variacao > 0 ? '▲ +' : d.atual.variacao < 0 ? '▼ −' : '' }}{{ nf(Math.abs(d.atual.variacao)) }}
          </span>
          <span class="rot">vs semana anterior</span>
        </div>
      </div>

      <dl class="secundarios">
        <div>
          <dt class="rot">{{ d.organizacao.municipio }}</dt>
          <dd class="num">{{ nf(d.atual.municipio) }}</dd>
        </div>
        <div>
          <dt class="rot">Postos pesquisados</dt>
          <dd class="num">{{ inteiro(d.atual.postos) }}</dd>
        </div>
        <div>
          <dt class="rot">Amplitude da UF</dt>
          <dd class="num">{{ nf(d.atual.max - d.atual.min, 2) }}</dd>
        </div>
      </dl>
    </div>

    <div class="regua-caixa">
      <div class="regua-cab">
        <h2>Sua posição no período</h2>
        <span class="rot">últimas {{ periodo.semanas }} semanas</span>
      </div>
      <ReguaPreco
        :min="periodo.min"
        :max="periodo.max"
        :uf="d.benchmark.precoRegiao"
        :municipio="d.atual.municipio"
        :pago="d.benchmark.precoPago"
        :nome-municipio="d.organizacao.municipio"
        rotulo-referencia="média da região no período"
      />
      <div class="legenda">
        <span><i class="ic ic-mercado"></i> média da região, ponderada pelos seus litros</span>
        <span><i class="ic ic-losango"></i> {{ d.organizacao.municipio }} nesta semana</span>
        <span><i class="ic ic-voce"></i> seu preço médio pago</span>
      </div>
    </div>
  </section>

  <div class="grade g-2 dupla surge d2">
    <section class="cartao">
      <div class="cartao-cab">
        <h2>Série semanal</h2>
        <span class="rot">últimas 104 semanas</span>
      </div>
      <div class="cartao-corpo">
        <GraficoSerie :serie="d.serie" :altura="230" />
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-cab">
        <h2>Benchmark</h2>
        <span class="rot">preço pago vs média da região</span>
      </div>
      <div class="cartao-corpo">
        <div class="veredito" :class="acima ? 'v-acima' : 'v-abaixo'">
          <div class="v-num num">
            {{ Math.abs(d.benchmark.diferencaPercentual).toFixed(1) }}<i>%</i>
          </div>
          <div class="v-txt">
            <strong>{{ acima ? 'acima' : 'abaixo' }}</strong> da média da sua região
            <div class="v-sub">
              {{ acima ? 'Excedente' : 'Economia' }} de
              <b class="num">R$ {{ moeda(Math.abs(d.benchmark.excedente)) }}</b>
              sobre {{ inteiro(d.benchmark.litros) }} litros
            </div>
          </div>
        </div>

        <table class="tab compacta">
          <tbody>
            <tr>
              <td>Preço médio pago</td>
              <td class="n">{{ nf(d.benchmark.precoPago) }}</td>
            </tr>
            <tr>
              <td>Média da região, ponderada pelos seus litros</td>
              <td class="n">{{ nf(d.benchmark.precoRegiao) }}</td>
            </tr>
            <tr>
              <td>Abastecimentos considerados</td>
              <td class="n">{{ d.benchmark.compras }}</td>
            </tr>
            <tr>
              <td>Volume total</td>
              <td class="n">{{ inteiro(d.benchmark.litros) }} L</td>
            </tr>
          </tbody>
        </table>

        <p class="nota">
          A média da região é <strong>ponderada pelos seus litros</strong>, não a
          média simples das semanas: semanas em que você comprou mais pesam mais.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.heroi { margin-bottom: 14px; overflow: hidden; }
.heroi-topo {
  display: flex;
  flex-wrap: wrap;
  gap: 22px 40px;
  align-items: flex-start;
  padding: 20px 20px 18px;
}

.num-principal { flex: 0 0 auto; }
.valorao {
  font-size: clamp(46px, 8vw, 68px);
  font-weight: 600;
  line-height: 0.95;
  letter-spacing: -0.035em;
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.valorao i {
  font-style: normal;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--tinta-3);
}
.delta { margin-top: 11px; display: flex; align-items: center; gap: 8px; }

.secundarios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 34px;
  margin: 6px 0 0;
  padding-left: 40px;
  border-left: 1px solid var(--linha);
}
.secundarios div { min-width: 92px; }
.secundarios dt { margin-bottom: 3px; }
.secundarios dd { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }

.regua-caixa {
  padding: 8px 20px 18px;
  border-top: 1px solid var(--linha);
  background: var(--superficie-2);
}

.regua-cab {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0 14px;
}
.regua-cab h2 { font-size: 14.5px; }

.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--tinta-2);
}
.legenda span { display: inline-flex; align-items: center; gap: 6px; }
.ic { width: 10px; height: 10px; flex: none; display: inline-block; }
.ic-mercado { width: 3px; height: 13px; border-radius: 2px; background: var(--serie-mercado); }
.ic-voce { width: 4px; height: 13px; border-radius: 2px; background: var(--serie-voce); }
.ic-losango {
  width: 9px; height: 9px;
  transform: rotate(45deg);
  border: 2px solid var(--serie-mercado);
  background: var(--superficie);
  border-radius: 2px;
}

.dupla { align-items: start; }

.veredito {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: var(--r-2);
  margin-bottom: 14px;
}
.v-acima { background: var(--sobe-veu); border: 1px solid color-mix(in srgb, var(--sobe) 26%, transparent); }
.v-abaixo { background: var(--cai-veu); border: 1px solid color-mix(in srgb, var(--cai) 26%, transparent); }
.v-num {
  font-size: 38px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  display: flex;
  align-items: baseline;
}
.v-num i { font-style: normal; font-size: 17px; margin-left: 2px; }
.v-acima .v-num { color: var(--sobe); }
.v-abaixo .v-num { color: var(--cai); }
.v-txt { font-size: 14px; line-height: 1.4; }
.v-sub { color: var(--tinta-2); font-size: 13px; margin-top: 2px; }

.tab.compacta td { padding: 7px 0; }
.tab.compacta tr:first-child td { border-top: 0; }

.nota {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--tinta-3);
  line-height: 1.5;
}

@media (max-width: 720px) {
  .secundarios { padding-left: 0; border-left: 0; width: 100%; }
}
</style>

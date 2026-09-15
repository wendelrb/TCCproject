<script setup lang="ts">
/**
 * Previsão 1–4 semanas.
 *
 * A tela entrega TRÊS coisas por horizonte — ponto, faixa e classe — e nunca só
 * a primeira. Um ponto solto convida a ler como certeza; a faixa é o que torna
 * a previsão honesta, e a classe é o que a torna acionável.
 */
import { computed } from 'vue';
import Cabeca from '../components/Cabeca.vue';
import GraficoSerie from '../components/GraficoSerie.vue';
import { atual } from '../lib/estado';
import { dataBr, nf } from '../lib/formato';

const d = computed(() => atual.value);

const ROTULO: Record<string, string> = { ALTA: 'alta', ESTAVEL: 'estável', QUEDA: 'queda' };
const SETA: Record<string, string> = { ALTA: '▲', ESTAVEL: '●', QUEDA: '▼' };

/** Largura relativa da faixa, para desenhar a barrinha de incerteza. */
function faixaRel(p10: number, p90: number): number {
  const maior = Math.max(...d.value.previsoes.map((f) => f.p90 - f.p10));
  return maior <= 0 ? 0 : ((p90 - p10) / maior) * 100;
}
</script>

<template>
  <Cabeca
    titulo="Previsão 1–4 semanas"
    sub="Ponto, faixa P10–P90 e classe. A faixa é parte da resposta, não um detalhe."
  />

  <div class="grade g-4 surge d1">
    <article v-for="f in d.previsoes" :key="f.horizonte" class="cartao prev">
      <div class="prev-topo">
        <span class="rot">+{{ f.horizonte }} {{ f.horizonte === 1 ? 'semana' : 'semanas' }}</span>
        <span class="classe" :class="`c-${f.classe.toLowerCase()}`">
          {{ SETA[f.classe] }} {{ ROTULO[f.classe] }}
        </span>
      </div>

      <div class="prev-valor num">{{ nf(f.valor) }}</div>
      <div class="prev-alvo rot">semana de {{ dataBr(f.semanaAlvo) }}</div>

      <div class="faixa-linha">
        <span class="num f-lim">{{ nf(f.p10) }}</span>
        <span class="f-trilho"><i :style="{ width: faixaRel(f.p10, f.p90) + '%' }"></i></span>
        <span class="num f-lim">{{ nf(f.p90) }}</span>
      </div>
      <div class="rot f-rot">faixa p10–p90</div>
    </article>
  </div>

  <section class="cartao surge d2" style="margin-top: 14px">
    <div class="cartao-cab">
      <h2>Histórico e projeção</h2>
      <div class="leg">
        <span><i class="l l-obs"></i> observado</span>
        <span><i class="l l-prev"></i> previsto</span>
        <span><i class="l l-area"></i> faixa p10–p90</span>
      </div>
    </div>
    <div class="cartao-corpo">
      <GraficoSerie :serie="d.serie" :previsoes="d.previsoes" :altura="260" :janela="52" />
    </div>
  </section>

  <section class="cartao aviso surge d3">
    <h3>Como ler a faixa</h3>
    <p>
      A faixa sai dos <strong>quantis empíricos dos resíduos</strong> do próprio
      modelo — os erros que ele cometeu de verdade, não uma distribuição
      assumida. Quando o modelo vem errando sistematicamente para o mesmo lado,
      a faixa <strong>desloca</strong> e pode até não conter o ponto. Isso não é
      inconsistência: é a faixa denunciando viés, que é exatamente o tipo de
      coisa que este produto se propõe a não esconder.
    </p>
  </section>
</template>

<style scoped>
.prev { padding: 14px 15px 15px; }
.prev-topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

.classe {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: var(--r-1);
  border: 1px solid transparent;
  white-space: nowrap;
}
.c-alta { background: var(--sobe-veu); color: var(--sobe); border-color: color-mix(in srgb, var(--sobe) 26%, transparent); }
.c-queda { background: var(--cai-veu); color: var(--cai); border-color: color-mix(in srgb, var(--cai) 26%, transparent); }
.c-estavel { background: var(--superficie-2); color: var(--tinta-2); border-color: var(--linha); }

.prev-valor {
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin-top: 12px;
}
.prev-alvo { margin-top: 3px; }

.faixa-linha {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.f-lim { font-size: 11.5px; color: var(--tinta-3); }
.f-trilho {
  flex: 1 1 auto;
  height: 5px;
  border-radius: 99px;
  background: var(--superficie-3);
  overflow: hidden;
}
.f-trilho i { display: block; height: 100%; background: var(--serie-mercado); border-radius: 99px; min-width: 6px; }
.f-rot { margin-top: 6px; }

.leg { display: flex; gap: 14px; font-size: 11.5px; color: var(--tinta-2); flex-wrap: wrap; }
.leg span { display: inline-flex; align-items: center; gap: 5px; }
.l { width: 14px; height: 2px; background: var(--serie-mercado); flex: none; border-radius: 2px; }
.l-prev { background: repeating-linear-gradient(90deg, var(--serie-mercado) 0 3px, transparent 3px 7px); }
.l-area { height: 9px; background: var(--serie-mercado-veu); border: 1px solid color-mix(in srgb, var(--serie-mercado) 30%, transparent); border-radius: 2px; }

.aviso { margin-top: 14px; padding: 16px 18px; }
.aviso h3 { margin-bottom: 6px; }
.aviso p { font-size: 14px; color: var(--tinta-2); max-width: 78ch; line-height: 1.6; }
.aviso strong { color: var(--tinta); font-weight: 600; }
</style>

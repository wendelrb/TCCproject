<script setup lang="ts">
/**
 * Série semanal + previsão.
 *
 * Um eixo só (nunca dois) — o erro número um em gráfico de série. Preço e
 * previsão compartilham a mesma escala porque são a mesma grandeza.
 *
 * Mede o container com ResizeObserver e desenha em pixels, em vez de escalar um
 * viewBox fixo: assim a espessura do traço e o tamanho do texto não deformam
 * quando o cartão muda de largura.
 *
 * A camada de hover não é enfeite — um gráfico em HTML é interativo por
 * natureza, e sem ela o leitor não consegue ler valor de ponto nenhum.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ponto, Previsao } from '../dados/exemplo';
import { eixoData, nf } from '../lib/formato';

const props = withDefaults(
  defineProps<{
    serie: readonly Ponto[];
    previsoes?: readonly Previsao[];
    altura?: number;
    janela?: number;
  }>(),
  { previsoes: () => [], altura: 220, janela: 104 },
);

const caixa = ref<HTMLElement | null>(null);
const largura = ref(720);
let observador: ResizeObserver | null = null;

onMounted(() => {
  if (caixa.value === null) return;
  observador = new ResizeObserver((e) => {
    const w = e[0]?.contentRect.width ?? 720;
    largura.value = Math.max(280, w);
  });
  observador.observe(caixa.value);
});
onBeforeUnmount(() => observador?.disconnect());

const M = { t: 12, d: 46, b: 24, e: 8 };

const pontos = computed(() => props.serie.slice(-props.janela));

interface Traco {
  readonly x: number;
  readonly y: number;
  readonly p: Ponto;
}

const escala = computed(() => {
  const obs = pontos.value;
  const prev = props.previsoes;
  const valores: number[] = obs.map((p) => p.valor);
  for (const f of prev) valores.push(f.p10, f.p90, f.valor);

  const lo = Math.min(...valores);
  const hi = Math.max(...valores);
  const folga = (hi - lo) * 0.12 || 0.1;
  const yMin = lo - folga;
  const yMax = hi + folga;

  const total = obs.length + prev.length;
  const w = largura.value - M.e - M.d;
  const h = props.altura - M.t - M.b;

  const x = (i: number): number => M.e + (total <= 1 ? w / 2 : (i / (total - 1)) * w);
  const y = (v: number): number => M.t + h - ((v - yMin) / (yMax - yMin)) * h;

  return { x, y, yMin, yMax, w, h };
});

const tracos = computed<Traco[]>(() =>
  pontos.value.map((p, i) => ({ x: escala.value.x(i), y: escala.value.y(p.valor), p })),
);

const caminho = computed(() =>
  tracos.value.map((t, i) => `${i === 0 ? 'M' : 'L'}${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(' '),
);

/** Continuação prevista: começa no último observado para não haver salto visual. */
const caminhoPrevisto = computed(() => {
  if (props.previsoes.length === 0) return '';
  const base = tracos.value[tracos.value.length - 1];
  if (base === undefined) return '';
  const n = pontos.value.length;
  const partes = [`M${base.x.toFixed(1)},${base.y.toFixed(1)}`];
  props.previsoes.forEach((f, i) => {
    partes.push(`L${escala.value.x(n + i).toFixed(1)},${escala.value.y(f.valor).toFixed(1)}`);
  });
  return partes.join(' ');
});

const areaFaixa = computed(() => {
  if (props.previsoes.length === 0) return '';
  const base = tracos.value[tracos.value.length - 1];
  if (base === undefined) return '';
  const n = pontos.value.length;
  const cima = [`M${base.x.toFixed(1)},${base.y.toFixed(1)}`];
  const baixo: string[] = [];
  props.previsoes.forEach((f, i) => {
    const x = escala.value.x(n + i);
    cima.push(`L${x.toFixed(1)},${escala.value.y(f.p90).toFixed(1)}`);
    baixo.unshift(`L${x.toFixed(1)},${escala.value.y(f.p10).toFixed(1)}`);
  });
  return `${cima.join(' ')} ${baixo.join(' ')} Z`;
});

/** Cinco marcas de eixo, arredondadas — grade recessiva, nunca protagonista. */
const marcasY = computed(() => {
  const { yMin, yMax, y } = escala.value;
  const passo = (yMax - yMin) / 4;
  return [0, 1, 2, 3, 4].map((i) => {
    const v = yMin + passo * i;
    return { v, y: y(v) };
  });
});

const marcasX = computed(() => {
  const t = tracos.value;
  if (t.length === 0) return [];
  const qtd = largura.value < 520 ? 3 : 6;
  const passo = Math.max(1, Math.floor((t.length - 1) / (qtd - 1)));
  const saida: { x: number; r: string }[] = [];
  for (let i = 0; i < t.length; i += passo) {
    const item = t[i];
    if (item !== undefined) saida.push({ x: item.x, r: eixoData(item.p.semana, t.length > 30) });
  }
  return saida;
});

const ultimo = computed(() => tracos.value[tracos.value.length - 1] ?? null);

/* ---------------- hover ---------------- */

const idx = ref<number | null>(null);
const foco = computed(() => (idx.value === null ? null : tracos.value[idx.value] ?? null));

function mover(ev: MouseEvent): void {
  const alvo = ev.currentTarget as SVGRectElement | null;
  if (alvo === null || tracos.value.length === 0) return;
  const r = alvo.getBoundingClientRect();
  const x = ev.clientX - r.left;
  let melhor = 0;
  let dist = Infinity;
  tracos.value.forEach((t, i) => {
    const d = Math.abs(t.x - x);
    if (d < dist) {
      dist = d;
      melhor = i;
    }
  });
  idx.value = melhor;
}

const posDica = computed(() => {
  const f = foco.value;
  if (f === null) return { left: '0px', top: '0px' };
  const meia = 74;
  const x = Math.min(Math.max(f.x, meia + 4), largura.value - meia - 4);
  return { left: `${x}px`, top: `${Math.max(4, f.y - 58)}px` };
});
</script>

<template>
  <div class="graf" ref="caixa">
    <svg
      :width="largura"
      :height="altura"
      role="img"
      :aria-label="`Série semanal do preço médio de revenda, ${pontos.length} semanas`"
    >
      <!-- grade -->
      <g>
        <line
          v-for="m in marcasY"
          :key="`g${m.v}`"
          :x1="M.e"
          :x2="largura - M.d"
          :y1="m.y"
          :y2="m.y"
          class="grade-l"
        />
        <text
          v-for="m in marcasY"
          :key="`t${m.v}`"
          :x="largura - M.d + 8"
          :y="m.y + 3.5"
          class="eixo"
        >{{ nf(m.v, 2) }}</text>
      </g>

      <!-- faixa P10–P90 -->
      <path v-if="areaFaixa" :d="areaFaixa" class="faixa" />

      <!-- linha observada -->
      <path :d="caminho" class="linha" />

      <!-- previsão: tracejada, porque não é observação -->
      <path v-if="caminhoPrevisto" :d="caminhoPrevisto" class="linha-prev" />

      <!-- ponto final rotulado: rótulo direto em vez de número em cada ponto -->
      <g v-if="ultimo">
        <circle :cx="ultimo.x" :cy="ultimo.y" r="4" class="ponta" />
      </g>

      <!-- eixo x -->
      <text
        v-for="m in marcasX"
        :key="m.r"
        :x="m.x"
        :y="altura - 6"
        class="eixo eixo-x"
      >{{ m.r }}</text>

      <!-- crosshair -->
      <g v-if="foco">
        <line :x1="foco.x" :x2="foco.x" :y1="M.t" :y2="altura - M.b" class="cruz" />
        <circle :cx="foco.x" :cy="foco.y" r="5" class="foco" />
      </g>

      <rect
        :x="0"
        :y="0"
        :width="largura"
        :height="altura"
        fill="transparent"
        @mousemove="mover"
        @mouseleave="idx = null"
      />
    </svg>

    <div v-if="foco" class="dica" :style="posDica">
      <div class="dica-d">{{ eixoData(foco.p.semana) }}</div>
      <div class="dica-v num">R$ {{ nf(foco.p.valor) }}</div>
    </div>
  </div>
</template>

<style scoped>
.graf { position: relative; width: 100%; }
svg { display: block; overflow: visible; }

.grade-l { stroke: var(--linha); stroke-width: 1; }
.eixo {
  font-family: var(--mono);
  font-size: 10px;
  fill: var(--tinta-3);
  font-variant-numeric: tabular-nums;
}
.eixo-x { text-anchor: middle; }

.linha { fill: none; stroke: var(--serie-mercado); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.linha-prev {
  fill: none;
  stroke: var(--serie-mercado);
  stroke-width: 2;
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  opacity: 0.85;
}
.faixa { fill: var(--serie-mercado-veu); stroke: none; }

.ponta { fill: var(--serie-mercado); stroke: var(--superficie); stroke-width: 2; }

.cruz { stroke: var(--linha-forte); stroke-width: 1; stroke-dasharray: 2 3; }
.foco { fill: var(--serie-mercado); stroke: var(--superficie); stroke-width: 2.5; }

.dica {
  position: absolute;
  transform: translateX(-50%);
  background: var(--superficie);
  border: 1px solid var(--linha-forte);
  border-radius: var(--r-1);
  box-shadow: var(--sombra-2);
  padding: 6px 10px;
  pointer-events: none;
  white-space: nowrap;
}
.dica-d { font-family: var(--mono); font-size: 10px; color: var(--tinta-3); letter-spacing: 0.06em; }
.dica-v { font-size: 14px; font-weight: 600; }
</style>

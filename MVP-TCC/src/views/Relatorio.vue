<script setup lang="ts">
/**
 * Relatório mensal.
 *
 * A barra divergente com zero no centro é a forma certa aqui: o dado tem
 * POLARIDADE (acima ou abaixo da média), e barra empilhada a partir da esquerda
 * esconderia justamente o sinal.
 */
import { computed } from 'vue';
import Cabeca from '../components/Cabeca.vue';
import { atual } from '../lib/estado';
import { inteiro, mesBr, moeda, nf, pct } from '../lib/formato';

const d = computed(() => atual.value);

const maiorDif = computed(() =>
  Math.max(...d.value.relatorio.map((m) => Math.abs(m.diferencaPercentual)), 0.1),
);

const pior = computed(() =>
  [...d.value.relatorio].sort((a, b) => b.diferencaPercentual - a.diferencaPercentual)[0],
);
const melhor = computed(() =>
  [...d.value.relatorio].sort((a, b) => a.diferencaPercentual - b.diferencaPercentual)[0],
);

const totais = computed(() => {
  const r = d.value.relatorio;
  return {
    litros: r.reduce((s, m) => s + m.litros, 0),
    gasto: r.reduce((s, m) => s + m.valorTotal, 0),
    excedente: r.reduce((s, m) => s + m.excedente, 0),
  };
});

function csv(): void {
  const cab = 'mes;compras;litros;gasto;preco_pago;preco_regiao;diferenca_pct;excedente';
  const linhas = d.value.relatorio.map((m) =>
    [m.mes, m.compras, m.litros, m.valorTotal, m.precoPago, m.precoRegiao,
     m.diferencaPercentual.toFixed(2), m.excedente].join(';'),
  );
  const texto = `${cab}\n${linhas.join('\n')}\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'relatorio-mensal-EXEMPLO.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Cabeca titulo="Relatório mensal" sub="Preço pago versus média da região, mês a mês.">
    <template #acoes>
      <button class="btn" @click="csv">Exportar CSV</button>
    </template>
  </Cabeca>

  <div class="grade g-3 surge d1">
    <div class="cartao kpi">
      <span class="rot">Volume no período</span>
      <b class="num">{{ inteiro(totais.litros) }} <i>L</i></b>
    </div>
    <div class="cartao kpi">
      <span class="rot">Gasto total</span>
      <b class="num">R$ {{ moeda(totais.gasto) }}</b>
    </div>
    <div class="cartao kpi" :class="totais.excedente > 0 ? 'k-mau' : 'k-bom'">
      <span class="rot">{{ totais.excedente > 0 ? 'Excedente' : 'Economia' }} sobre a região</span>
      <b class="num">R$ {{ moeda(Math.abs(totais.excedente)) }}</b>
    </div>
  </div>

  <section v-if="pior && melhor" class="cartao leitura surge d2">
    <h3>Leitura do período</h3>
    <p>
      Seu pior mês foi <strong>{{ mesBr(pior.mes) }}</strong>, pagando
      <strong class="acima">{{ pct(pior.diferencaPercentual) }}</strong> em relação à média
      da região; o melhor foi <strong>{{ mesBr(melhor.mes) }}</strong>, com
      <strong :class="melhor.diferencaPercentual > 0 ? 'acima' : 'abaixo'">{{ pct(melhor.diferencaPercentual) }}</strong>.
      Fechar essa diferença no volume do período vale
      <strong class="num">R$
        {{ moeda(Math.abs((pior.diferencaPercentual - melhor.diferencaPercentual) / 100 * totais.gasto)) }}</strong>.
    </p>
  </section>

  <section class="cartao surge d3">
    <div class="cartao-cab">
      <h2>Mês a mês</h2>
      <span class="rot">barra à direita = pagou acima</span>
    </div>
    <div class="tab-rolagem">
      <table class="tab">
        <thead>
          <tr>
            <th>Mês</th>
            <th class="n">Abast.</th>
            <th class="n">Litros</th>
            <th class="n">Gasto</th>
            <th class="n">Pago</th>
            <th class="n">Região</th>
            <th class="col-div">Diferença</th>
            <th class="n">Excedente</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in d.relatorio" :key="m.mes">
            <td>{{ mesBr(m.mes) }}</td>
            <td class="n">{{ m.compras }}</td>
            <td class="n">{{ inteiro(m.litros) }}</td>
            <td class="n">{{ moeda(m.valorTotal) }}</td>
            <td class="n">{{ nf(m.precoPago) }}</td>
            <td class="n">{{ nf(m.precoRegiao) }}</td>
            <td class="col-div">
              <span class="div-trilho">
                <i class="eixo-zero"></i>
                <i
                  class="div-b"
                  :class="m.diferencaPercentual > 0 ? 'acima' : 'abaixo'"
                  :style="
                    m.diferencaPercentual > 0
                      ? { left: '50%', width: (Math.abs(m.diferencaPercentual) / maiorDif) * 50 + '%' }
                      : { right: '50%', width: (Math.abs(m.diferencaPercentual) / maiorDif) * 50 + '%' }
                  "
                ></i>
                <b class="div-v num" :class="m.diferencaPercentual > 0 ? 'acima' : 'abaixo'">
                  {{ pct(m.diferencaPercentual) }}
                </b>
              </span>
            </td>
            <td class="n" :class="m.excedente > 0 ? 'mau' : 'bom'">
              {{ moeda(Math.abs(m.excedente)) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.btn {
  padding: 6px 13px;
  border-radius: var(--r-1);
  border: 1px solid var(--linha-forte);
  background: var(--superficie);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn:hover { background: var(--superficie-2); border-color: var(--marca); color: var(--marca); }

.kpi { padding: 13px 15px; display: flex; flex-direction: column; gap: 5px; }
.kpi b { font-size: 24px; font-weight: 600; letter-spacing: -0.025em; }
.kpi b i { font-style: normal; font-size: 13px; color: var(--tinta-3); font-weight: 500; }
.k-mau b { color: var(--sobe); }
.k-bom b { color: var(--cai); }

.leitura { padding: 15px 17px; margin: 14px 0; }
.leitura h3 { margin-bottom: 6px; }
.leitura p { font-size: 14px; color: var(--tinta-2); line-height: 1.6; max-width: 84ch; }
.leitura strong { color: var(--tinta); font-weight: 600; }
.acima { color: var(--sobe); }
.abaixo { color: var(--cai); }

.col-div { min-width: 170px; }
.div-trilho { position: relative; display: block; height: 20px; }
.eixo-zero { position: absolute; left: 50%; top: 2px; bottom: 2px; width: 1px; background: var(--linha-forte); }
.div-b {
  position: absolute;
  top: 6px;
  height: 8px;
  border-radius: 3px;
  min-width: 2px;
}
.div-b.acima { background: var(--sobe); border-radius: 0 3px 3px 0; }
.div-b.abaixo { background: var(--cai); border-radius: 3px 0 0 3px; }
.div-v {
  position: absolute;
  right: 0;
  top: 1px;
  font-size: 11.5px;
  font-weight: 600;
}
.n.mau { color: var(--sobe); }
.n.bom { color: var(--cai); }
</style>

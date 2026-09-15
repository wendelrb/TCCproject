<script setup lang="ts">
/**
 * Casca do aplicativo: barra superior + trilho de navegação + conteúdo.
 *
 * O trilho agrupa por INTENÇÃO (mercado / decisão / confiança / dados), não em
 * lista plana. O agrupamento comunica que o produto tem partes com propósitos
 * diferentes — é o que separa "painel de sistema" de "menu de links".
 */
import { ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { DADOS } from './dados/exemplo';
import { alternarTema, atual, indiceOrg, tema } from './lib/estado';
import { dataBr } from './lib/formato';

const rota = useRoute();
const aberto = ref(false);

const GRUPOS = [
  {
    titulo: 'Mercado',
    itens: [
      { para: '/', rotulo: 'Preço e benchmark', icone: 'M3 17l5-6 4 3 6-8' },
      { para: '/previsao', rotulo: 'Previsão 1–4 semanas', icone: 'M3 12h5l2-5 3 10 2-5h6' },
    ],
  },
  {
    titulo: 'Decisão',
    itens: [{ para: '/simulador', rotulo: 'Simulador de compra', icone: 'M5 5h14v6H5zM5 15h9v4H5z' }],
  },
  {
    titulo: 'Confiança',
    itens: [{ para: '/placar', rotulo: 'Placar de acurácia', icone: 'M4 19V9m5 10V5m5 14v-7m5 7V8' }],
  },
  {
    titulo: 'Dados',
    itens: [
      { para: '/relatorio', rotulo: 'Relatório mensal', icone: 'M6 3h9l4 4v14H6zM15 3v4h4' },
      { para: '/importar', rotulo: 'Importar abastecimentos', icone: 'M12 16V4m-5 5l5-5 5 5M4 20h16' },
    ],
  },
] as const;
</script>

<template>
  <div class="app">
    <header class="barra">
      <button class="hamburguer" aria-label="Menu" @click="aberto = !aberto">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>

      <RouterLink to="/" class="marca">
        <span class="marca-icone" aria-hidden="true">
          <svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" /><path d="M8 22V10h7a4 4 0 0 1 0 8h-3v4z" class="m-b"/><circle cx="23" cy="20" r="2.5" class="m-b" opacity=".85"/></svg>
        </span>
        <span class="marca-txt"><b>Atlas</b> <em>Diesel S-10</em></span>
      </RouterLink>

      <span class="selo selo-ficticio" title="Protótipo: nenhum número desta tela é dado da ANP">
        dados de exemplo
      </span>

      <div class="cresce"></div>

      <span class="semana rot">
        semana <b class="num">{{ dataBr(atual.atual.semana) }}</b>
      </span>

      <label class="sel">
        <span class="sr">Organização</span>
        <select v-model.number="indiceOrg">
          <option v-for="(d, i) in DADOS" :key="d.organizacao.id" :value="i">
            {{ d.organizacao.nome }} · {{ d.organizacao.uf }}
          </option>
        </select>
      </label>

      <button class="icone" :aria-label="`Tema ${tema}`" @click="alternarTema">
        <svg v-if="tema === 'escuro'" viewBox="0 0 24 24" width="17" height="17">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="17" height="17">
          <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5z" />
        </svg>
      </button>
    </header>

    <div class="corpo">
      <nav class="trilho" :class="{ aberto }" aria-label="Navegação principal">
        <div v-for="g in GRUPOS" :key="g.titulo" class="grupo">
          <div class="rot grupo-t">{{ g.titulo }}</div>
          <RouterLink
            v-for="i in g.itens"
            :key="i.para"
            :to="i.para"
            class="item"
            :class="{ ativo: rota.path === i.para }"
            @click="aberto = false"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path :d="i.icone" /></svg>
            <span>{{ i.rotulo }}</span>
          </RouterLink>
        </div>
      </nav>

      <main class="conteudo">
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="rota.path + indiceOrg" />
        </RouterView>

        <footer class="rodape">
          <strong>Protótipo.</strong> Os números desta interface são gerados por
          um PRNG determinístico e <strong>não</strong> são dados da ANP nem
          métricas do produto. A forma dos dados é a mesma da série real — trocar
          por dado verdadeiro é substituir um arquivo.
        </footer>
      </main>
    </div>

    <div v-if="aberto" class="veu" @click="aberto = false"></div>
  </div>
</template>

<style scoped>
.app { min-height: 100%; display: flex; flex-direction: column; }

/* ---------- barra ---------- */
.barra {
  position: sticky;
  top: 0;
  z-index: 40;
  height: var(--barra-h);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: color-mix(in srgb, var(--superficie) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--linha);
}
.cresce { flex: 1 1 auto; }

.marca { display: inline-flex; align-items: center; gap: 9px; }
.marca-icone svg { width: 24px; height: 24px; display: block; }
.marca-icone rect { fill: var(--marca); }
.marca-icone .m-b { fill: var(--marca-tinta); }
.marca-txt { font-size: 14.5px; color: var(--tinta-2); letter-spacing: -0.01em; white-space: nowrap; }
.marca-txt b { color: var(--tinta); font-weight: 600; font-size: 15.5px; letter-spacing: -0.02em; }
.marca-txt em { font-style: normal; color: var(--tinta-3); font-size: 12.5px; margin-left: 2px; }

.semana { white-space: nowrap; }
.semana b { color: var(--tinta-2); font-size: 11.5px; font-weight: 600; letter-spacing: 0; }

.sel select {
  font: inherit;
  font-size: 13px;
  max-width: 210px;
  padding: 5px 9px;
  border-radius: var(--r-1);
  border: 1px solid var(--linha-forte);
  background: var(--superficie);
  color: var(--tinta);
  cursor: pointer;
}
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

.icone, .hamburguer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border: 1px solid var(--linha);
  background: var(--superficie);
  border-radius: var(--r-1);
  cursor: pointer;
  flex: none;
}
.icone:hover, .hamburguer:hover { background: var(--superficie-2); }
.icone svg, .hamburguer svg { fill: none; stroke: var(--tinta-2); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.hamburguer { display: none; }

/* ---------- trilho ---------- */
.corpo { flex: 1 1 auto; display: grid; grid-template-columns: var(--trilho-w) minmax(0, 1fr); }

.trilho {
  position: sticky;
  top: var(--barra-h);
  height: calc(100vh - var(--barra-h));
  overflow-y: auto;
  padding: 16px 12px 24px;
  border-right: 1px solid var(--linha);
  background: var(--superficie);
}
.grupo + .grupo { margin-top: 18px; }
.grupo-t { padding: 0 10px 7px; }

.item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: var(--r-1);
  font-size: 13.5px;
  color: var(--tinta-2);
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s;
}
.item svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; opacity: 0.75; }
.item:hover { background: var(--superficie-2); color: var(--tinta); }
.item.ativo {
  background: var(--marca-veu);
  color: var(--marca);
  border-color: color-mix(in srgb, var(--marca) 26%, transparent);
  font-weight: 600;
}
.item.ativo svg { opacity: 1; }

/* ---------- conteúdo ---------- */
.conteudo { padding: 22px 24px 60px; max-width: 1180px; }

.rodape {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--linha);
  font-size: 12.5px;
  color: var(--tinta-3);
  max-width: 76ch;
}
.rodape strong { color: var(--tinta-2); font-weight: 600; }

.veu { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 30; }

@media (max-width: 860px) {
  .hamburguer { display: inline-flex; }
  .corpo { grid-template-columns: minmax(0, 1fr); }
  .trilho {
    position: fixed;
    z-index: 35;
    left: 0;
    top: var(--barra-h);
    width: 260px;
    transform: translateX(-102%);
    transition: transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1);
    box-shadow: var(--sombra-3);
  }
  .trilho.aberto { transform: none; }
  .conteudo { padding: 18px 14px 50px; }
  .marca-txt, .semana { display: none; }
}
@media (max-width: 480px) {
  .sel select { max-width: 130px; }
}
</style>

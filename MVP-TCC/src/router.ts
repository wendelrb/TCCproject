import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

/**
 * vue-router é a única dependência além do Vue.
 * Justificativa: seis telas com URL própria, botão voltar e link direto — sem
 * roteador isso vira estado em variável, e o protótipo perde a usabilidade que
 * ele existe para demonstrar.
 */
const rotas: RouteRecordRaw[] = [
  { path: '/', name: 'painel', component: () => import('./views/Painel.vue') },
  { path: '/previsao', name: 'previsao', component: () => import('./views/Previsao.vue') },
  { path: '/simulador', name: 'simulador', component: () => import('./views/Simulador.vue') },
  { path: '/placar', name: 'placar', component: () => import('./views/Placar.vue') },
  { path: '/relatorio', name: 'relatorio', component: () => import('./views/Relatorio.vue') },
  { path: '/importar', name: 'importar', component: () => import('./views/Importar.vue') },
  { path: '/:resto(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes: rotas,
  scrollBehavior: () => ({ top: 0 }),
});

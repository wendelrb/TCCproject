/** Estado global mínimo do protótipo — sem biblioteca, é um módulo reativo. */
import { computed, ref, watch } from 'vue';
import { DADOS, type Conjunto } from '../dados/exemplo';

const CHAVE_TEMA = 'mesa-tema';

export const indiceOrg = ref(0);
export const atual = computed<Conjunto>(() => DADOS[indiceOrg.value] ?? (DADOS[0] as Conjunto));

export type Tema = 'sistema' | 'claro' | 'escuro';
export const tema = ref<Tema>('sistema');

function aplicar(t: Tema): void {
  const raiz = document.documentElement;
  if (t === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', t);
}

export function iniciarTema(): void {
  // localStorage pode lançar em janela privativa; a preferência é conveniência,
  // não estado do produto, então falhar aqui não pode derrubar a tela.
  try {
    const g = localStorage.getItem(CHAVE_TEMA);
    if (g === 'claro' || g === 'escuro' || g === 'sistema') tema.value = g;
  } catch {
    /* segue com o padrão */
  }
  aplicar(tema.value);
}

watch(tema, (t) => {
  aplicar(t);
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    /* preferência não persiste; a tela continua correta */
  }
});

export function alternarTema(): void {
  tema.value = tema.value === 'escuro' ? 'claro' : 'escuro';
}

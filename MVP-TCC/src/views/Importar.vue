<script setup lang="ts">
/**
 * Importar abastecimentos.
 *
 * A recusa de dado pessoal é FUNCIONALIDADE, não limitação — e por isso ela é
 * demonstrada aqui, não escondida numa política de privacidade.
 *
 * A validação acontece sobre o CABEÇALHO, antes de qualquer célula ser lida.
 * Do rejeitado guarda-se o NOME da coluna para a mensagem; nunca o valor. Este
 * protótipo respeita a mesma regra: o conteúdo da linha não é exibido.
 */
import { computed, ref } from 'vue';
import Cabeca from '../components/Cabeca.vue';

const PERMITIDAS = ['data', 'uf', 'municipio', 'litros', 'valor total', 'produto'] as const;

const TOKENS_PESSOAIS = [
  'PLACA', 'CPF', 'CNPJ', 'MOTORISTA', 'CONDUTOR', 'NOME', 'CNH', 'RG',
  'DOCUMENTO', 'TELEFONE', 'CELULAR', 'EMAIL', 'E MAIL', 'ENDERECO',
  'MATRICULA', 'FUNCIONARIO', 'CARTAO', 'RASTREADOR',
] as const;

const EXEMPLO_BOM =
  'data;uf;municipio;litros;valor total;produto\n' +
  '06/07/2026;SP;Campinas;1200;7440,00;DIESEL S10\n' +
  '13/07/2026;SP;Campinas;800;4992,00;DIESEL S10';

const EXEMPLO_RUIM =
  'data;uf;municipio;litros;valor total;produto;placa;motorista\n' +
  '06/07/2026;SP;Campinas;1200;7440,00;DIESEL S10;ABC1D23;João\n' +
  '13/07/2026;SP;Campinas;800;4992,00;DIESEL S10;XYZ9K88;Maria';

const texto = ref(EXEMPLO_BOM);

/** Normaliza acento, caixa e separadores — "e-mail" e "e mail" caem na mesma regra. */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const analise = computed(() => {
  const primeira = texto.value.split(/\r?\n/)[0] ?? '';
  const colunas = primeira.split(/[;,\t]/).map((c) => c.trim()).filter((c) => c !== '');
  if (colunas.length === 0) return null;

  const rejeitadas: { nome: string; token: string }[] = [];
  for (const c of colunas) {
    const k = chave(c);
    const t = TOKENS_PESSOAIS.find((tok) => k === tok || k.includes(tok));
    if (t !== undefined) rejeitadas.push({ nome: c, token: t });
  }

  const presentes = colunas.map(chave);
  const faltando = PERMITIDAS.filter((p) => !presentes.includes(chave(p)));

  // Quantidade de linhas de dado — contagem, jamais conteúdo.
  const linhas = texto.value.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1;

  return {
    colunas,
    rejeitadas,
    faltando,
    linhas: Math.max(0, linhas),
    aceito: rejeitadas.length === 0 && faltando.length === 0,
  };
});
</script>

<template>
  <Cabeca
    titulo="Importar abastecimentos"
    sub="A validação acontece no cabeçalho, antes de qualquer célula ser lida."
  />

  <div class="grade g-2 surge d1">
    <section class="cartao">
      <div class="cartao-cab">
        <h2>Seu arquivo</h2>
        <div class="atalhos">
          <button class="mini" @click="texto = EXEMPLO_BOM">exemplo válido</button>
          <button class="mini alerta" @click="texto = EXEMPLO_RUIM">exemplo com placa</button>
        </div>
      </div>
      <div class="cartao-corpo">
        <textarea v-model="texto" spellcheck="false" rows="7" aria-label="Conteúdo CSV"></textarea>
        <p class="nota">
          Isto é um protótipo: nada é enviado a lugar nenhum. No produto, o
          arquivo original <strong>não é persistido</strong> — ele pode conter
          justamente as colunas recusadas.
        </p>
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-cab"><h2>Resultado da validação</h2></div>
      <div class="cartao-corpo">
        <template v-if="analise">
          <div class="veredito" :class="analise.aceito ? 'ok' : 'nao'">
            <div class="v-ic">{{ analise.aceito ? '✓' : '✕' }}</div>
            <div>
              <strong>{{ analise.aceito ? 'Arquivo aceito' : 'Arquivo recusado' }}</strong>
              <div class="v-sub">
                {{ analise.colunas.length }} colunas · {{ analise.linhas }} linhas de dado
              </div>
            </div>
          </div>

          <div v-if="analise.rejeitadas.length" class="bloco perigo">
            <h3>Dado pessoal detectado</h3>
            <p>
              O arquivo inteiro foi recusado. Estas colunas não podem ser
              enviadas:
            </p>
            <ul>
              <li v-for="r in analise.rejeitadas" :key="r.nome">
                <code>{{ r.nome }}</code>
                <span class="motivo">contém “{{ r.token.toLowerCase() }}”</span>
              </li>
            </ul>
            <p class="miudo">
              Guardamos apenas o <strong>nome</strong> da coluna, para esta
              mensagem e para auditoria. <strong>Nunca o valor.</strong> Repare
              que nenhuma placa aparece aqui, embora esteja no texto ao lado.
            </p>
          </div>

          <div v-if="analise.faltando.length" class="bloco atencao">
            <h3>Colunas obrigatórias ausentes</h3>
            <ul class="inline">
              <li v-for="f in analise.faltando" :key="f"><code>{{ f }}</code></li>
            </ul>
          </div>

          <div v-if="analise.aceito" class="bloco sucesso">
            <h3>Pronto para importar</h3>
            <p>
              As seis colunas permitidas estão presentes e nenhuma coluna de dado
              pessoal foi encontrada.
            </p>
          </div>
        </template>
      </div>
    </section>
  </div>

  <section class="cartao escopo surge d2">
    <h3>Por que só seis colunas</h3>
    <p>
      A importação aceita <strong>exclusivamente</strong>
      <code v-for="p in PERMITIDAS" :key="p">{{ p }}</code>.
      Isso é decisão de escopo, não sugestão: é o que permite vender para uma
      empresa com receio de LGPD. A conversa deixa de ser sobre como os dados
      serão protegidos e passa a ser sobre <strong>quais dados nem chegam a ser
      pedidos</strong>.
    </p>
  </section>
</template>

<style scoped>
.atalhos { display: flex; gap: 6px; }
.mini {
  font-family: var(--mono);
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: var(--r-1);
  border: 1px solid var(--linha-forte);
  background: var(--superficie);
  cursor: pointer;
  color: var(--tinta-2);
}
.mini:hover { border-color: var(--marca); color: var(--marca); }
.mini.alerta:hover { border-color: var(--sobe); color: var(--sobe); }

textarea {
  width: 100%;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.65;
  padding: 11px 12px;
  border-radius: var(--r-1);
  border: 1px solid var(--linha-forte);
  background: var(--superficie-2);
  color: var(--tinta);
  resize: vertical;
}

.nota { margin-top: 10px; font-size: 12.5px; color: var(--tinta-3); line-height: 1.5; }
.nota strong { color: var(--tinta-2); font-weight: 600; }

.veredito {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border-radius: var(--r-2);
  margin-bottom: 14px;
}
.veredito.ok { background: var(--cai-veu); border: 1px solid color-mix(in srgb, var(--cai) 28%, transparent); }
.veredito.nao { background: var(--sobe-veu); border: 1px solid color-mix(in srgb, var(--sobe) 28%, transparent); }
.v-ic {
  flex: none;
  width: 24px; height: 24px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-weight: 700; font-size: 13px;
}
.ok .v-ic { background: var(--cai); color: var(--fundo); }
.nao .v-ic { background: var(--sobe); color: var(--fundo); }
.veredito strong { font-size: 14.5px; font-weight: 600; }
.v-sub { font-size: 12.5px; color: var(--tinta-2); }

.bloco { padding: 12px 13px; border-radius: var(--r-2); border: 1px solid var(--linha); }
.bloco + .bloco { margin-top: 10px; }
.bloco h3 { font-size: 13.5px; margin-bottom: 5px; }
.bloco p { font-size: 13px; color: var(--tinta-2); line-height: 1.5; }
.bloco ul { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
.bloco ul.inline { flex-direction: row; flex-wrap: wrap; gap: 6px; }
.bloco li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.motivo { color: var(--tinta-3); font-size: 12px; }

.perigo { background: var(--sobe-veu); border-color: color-mix(in srgb, var(--sobe) 28%, transparent); }
.perigo h3 { color: var(--sobe); }
.atencao { background: var(--atencao-veu); border-color: color-mix(in srgb, var(--atencao) 28%, transparent); }
.atencao h3 { color: var(--atencao); }
.sucesso { background: var(--cai-veu); border-color: color-mix(in srgb, var(--cai) 28%, transparent); }
.sucesso h3 { color: var(--cai); }

.miudo { margin-top: 9px; font-size: 12px; color: var(--tinta-3); line-height: 1.5; }
.miudo strong { color: var(--tinta-2); font-weight: 600; }

code {
  font-family: var(--mono);
  font-size: 11.5px;
  background: var(--superficie-3);
  border: 1px solid var(--linha);
  border-radius: 4px;
  padding: 1px 5px;
}
.escopo { margin-top: 14px; padding: 16px 18px; }
.escopo h3 { margin-bottom: 6px; }
.escopo p { font-size: 14px; color: var(--tinta-2); line-height: 1.65; max-width: 84ch; }
.escopo code { margin: 0 2px; }
.escopo strong { color: var(--tinta); font-weight: 600; }
</style>

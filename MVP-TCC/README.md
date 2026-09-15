# Atlas — front do MVP

Interface de inteligência de preço de diesel S-10 para transportadoras e
indústrias com frota própria.

**Vue 3 + Vite + TypeScript** — a mesma stack do projeto que já estava no
repositório, para esta versão cair direto no lugar do scaffold.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # vue-tsc + vite build
```

---

## O que mudou em relação ao ponto de partida

O projeto anterior era o template inicial do Vite (`HelloWorld.vue` com os logos
do Vue e do Vite e um contador). O que foi **preservado** dele:

- stack e versões: Vue 3.5, Vite 8, TypeScript;
- caminho da pasta (`MVP-TCC/`) e divisão de `tsconfig` em app/node;
- entrada em `src/main.ts` montando `App.vue` em `#app`;
- convenção de pastas do Vue: `src/components/`, `src/views/`.

O que foi **construído**: seis telas, roteamento, sistema de design, dois
gráficos escritos à mão e o conjunto de dados de exemplo.

---

## Estrutura

```
src/
  main.ts            entrada — monta App e aplica o tema salvo
  App.vue            casca: barra superior + trilho de navegação
  router.ts          seis rotas com URL própria
  estilo/
    tokens.css       ÚNICA fonte de cor, tipo e espaço (claro + escuro)
    base.css         reset, utilitários, cartão, chip, tabela, grade
  components/
    Cabeca.vue       título + subtítulo de tela
    ReguaPreco.vue   ★ a peça central
    GraficoSerie.vue série + previsão, com hover
  views/
    Painel.vue       preço da região + benchmark
    Previsao.vue     1–4 semanas com faixa e classe
    Simulador.vue    vale a pena antecipar a compra?
    Placar.vue       acurácia contra a referência ingênua
    Relatorio.vue    mês a mês + exportação CSV
    Importar.vue     validação e recusa de dado pessoal
  dados/exemplo.ts   ⚠ dados FICTÍCIOS, gerados por PRNG determinístico
  lib/
    estado.ts        organização selecionada + tema
    formato.ts       formatação pt-BR
```

Uma dependência além do Vue: **vue-router**. Seis telas com URL própria, botão
voltar e link direto — sem roteador isso vira estado em variável, e o protótipo
perde justamente a usabilidade que ele existe para demonstrar.

---

## As três decisões de design que sustentam o resto

### 1. A régua de preço

Um cartão que diz "R$ 6,78" responde *quanto custa*. Não responde *isso é caro?*.

A régua responde as duas de uma vez: posiciona a média da região e o preço que a
empresa pagou **na mesma escala**. A distância entre os dois pinos é,
literalmente, o produto.

Detalhe que não é detalhe: os dois valores comparados vêm do **mesmo período**.
Comparar a média histórica da empresa com o preço da semana atual daria leitura
invertida toda vez que a série subisse.

### 2. Duas cores de série, validadas

Todo gráfico do produto compara **o mercado** com **você** — dois papéis, duas
cores. Rodadas no validador de contraste e daltonismo:

| | mercado | você | resultado |
|---|---|---|---|
| claro | `#0d9488` | `#4f46e5` | ALL CHECKS PASS · CVD ΔE 22,1 |
| escuro | `#11a396` | `#6366f1` | ALL CHECKS PASS · CVD ΔE 20,2 |

Quatro matizes foram testadas antes e **falharam** a separação para
deuteranopia. Vermelho, âmbar e verde ficam reservados para **estado**
(alta/queda/alerta) e nunca viram série — senão a cor perde o significado.

Onde há direção, sempre há **seta e sinal** junto da cor. A leitura sobrevive em
preto e branco.

### 3. Claro e escuro desenhados, não invertidos

O tema escuro tem passos próprios, escolhidos e validados contra a superfície
escura. Segue a preferência do sistema e aceita troca manual, que persiste.

---

## Acessibilidade

- foco visível em todo elemento interativo;
- gráfico com `role="img"` e rótulo descritivo;
- `prefers-reduced-motion` respeitado;
- alvos de toque ≥ 32 px; trilho vira gaveta abaixo de 860 px;
- identidade nunca só por cor.

---

## ⚠ Sobre os dados

**Nenhum número desta interface é dado da ANP.** Tudo em `src/dados/exemplo.ts`
sai de um PRNG determinístico — é síntese, e o arquivo é escrito de forma que
isso fique óbvio para quem o abre.

A **forma** dos dados é a mesma da série real já ingerida no projeto Atlas
(701 semanas, 27 UFs, desde 2012). Trocar por dado verdadeiro é substituir o
objeto `DADOS` pelo export do banco — os tipos já batem.

# Contrato de integração com um modelo externo

Este documento existe para responder a uma pergunta específica: **como um modelo
treinado fora deste repositório (por exemplo, em Python) alimenta a API e as
telas daqui.**

A resposta curta: **ele não roda dentro do nosso sistema. Ele entrega um
arquivo.** O resto deste documento é o formato desse arquivo e o porquê.

---

## 1. Por que arquivo e não uma API HTTP

O jeito que primeiro ocorre a todo mundo é o modelo virar um serviço (FastAPI,
Flask) e a web chamar por HTTP a cada carregamento de tela. Não vamos por aí, por
quatro razões:

1. **A stack é fechada.** O `CLAUDE.md` determina Next.js + TypeScript +
   Supabase, com ingestão e previsão em TypeScript nas Edge Functions, e diz
   textualmente: *não introduza Python*. Um serviço Python no deploy é Python na
   stack, mesmo que o código viva noutro repositório.
2. **Previsão de preço semanal não é consulta em tempo real.** O dado de entrada
   muda **uma vez por semana**. Chamar um modelo a cada request para recalcular
   algo que só muda às segundas é acoplamento sem benefício: se o serviço cair,
   a tela cai junto — por um número que já estava decidido há dias.
3. **Sem registro imutável não existe placar.** A tabela `forecasts` é imutável
   por trigger justamente para que o placar de acurácia seja auditável. Uma
   previsão calculada na hora da renderização não deixa rastro, e um número de
   acurácia sem rastro não pode ser publicado.
4. **Reprodutibilidade do TCC.** Um arquivo com hash entra no
   `DATA_PROVENANCE.md` e ainda estará lá na defesa. Um endpoint que rodava na
   máquina de alguém, não.

O modelo externo, portanto, roda **onde já roda**, no ritmo dele, e **deposita o
resultado**. Nós validamos, gravamos e pontuamos.

---

## 2. Onde o encaixe já existe

Não é preciso mudar o schema para receber um modelo de fora. Ele já é agnóstico:

- `forecast_runs` guarda **uma execução**: qual modelo, qual commit, até que data
  os dados iam (`dados_ate`), e de qual semana se está prevendo
  (`semana_origem`).
- `forecasts` guarda **as previsões daquela execução**, com `modelo_versao` como
  texto livre.
- `v_forecast_placar` já agrupa por `modelo_versao`.

Consequência prática: assim que o modelo externo gravar linhas com
`modelo_versao = 'arima-colega-v1'`, **ele aparece no placar ao lado do naive
sozinho**, sem alterar uma linha das telas. O naive já entra nessa mesma tabela
como um modelo qualquer — foi desenhado assim para que "modelo vs. referência"
fosse uma consulta só.

O que falta é um adaptador: ler o arquivo, validar, gravar. Nada além disso.

---

## 3. O formato do arquivo

Um CSV com cabeçalho (ou JSON com as mesmas chaves). Uma linha por
`UF × horizonte`.

```csv
modelo_versao,uf,semana_origem,dados_ate,horizonte_semanas,semana_alvo,valor_previsto,p10,p90
arima-colega-v1,SP,2026-08-10,2026-08-10,1,2026-08-17,6.1234,6.0512,6.1988
arima-colega-v1,SP,2026-08-10,2026-08-10,2,2026-08-24,6.1401,6.0233,6.2570
arima-colega-v1,MG,2026-08-10,2026-08-10,1,2026-08-17,5.9870,5.9110,6.0620
```

### Campos

| Campo | Tipo | Regra |
|---|---|---|
| `modelo_versao` | texto | Identifica o modelo **e a versão**. Mudou hiperparâmetro, mudou a versão. Não reutilize o nome. |
| `uf` | 2 letras maiúsculas | Ver a questão em aberto na seção 5. |
| `semana_origem` | `YYYY-MM-DD` | Segunda-feira da semana a partir da qual se prevê. |
| `dados_ate` | `YYYY-MM-DD` | **Data de corte.** Nenhuma informação publicada depois entrou na execução. |
| `horizonte_semanas` | 1 a 4 | |
| `semana_alvo` | `YYYY-MM-DD` | Deve bater com `semana_origem + horizonte × 7 dias`. Nós conferimos. |
| `valor_previsto` | decimal, 4 casas | R$/litro, diesel S-10. Ponto decimal, não vírgula. |
| `p10`, `p90` | decimal, 4 casas | Limites do intervalo. Só se exige `p10 <= p90`. |

### O campo que mais importa

`dados_ate` é a **prova auditável de que não houve vazamento**. A regra do
projeto é que nenhuma feature usada para prever `t+h` pode usar informação
publicada depois de `t` — e isso **inclui escalonador, seleção de janela e
qualquer ajuste de hiperparâmetro**. Um `StandardScaler` ajustado na série
inteira antes do split já viola.

Não é burocracia: é a diferença entre uma acurácia que sobrevive em produção e
uma que evapora. Se `dados_ate` for maior que `semana_origem`, a linha é
rejeitada pela própria constraint da tabela.

### `p10` e `p90` podem "engolir" o ponto?

Podem ficar **os dois acima ou os dois abaixo** de `valor_previsto`. Isso é
permitido de propósito (migration `…006`): quando o modelo vem errando
sistematicamente para o mesmo lado, o intervalo de resíduos desloca e denuncia o
viés. A constraint exige apenas `p10 <= p90`.

### O que **não** mandar

Nada de `acuracia`, `mae`, `rmse` ou `coverage` no arquivo. **Não vamos importar
métrica pronta.** As métricas são recalculadas aqui, do zero, sobre o realizado
da ANP, com o mesmo protocolo aplicado a todos os modelos. Isso não é
desconfiança: é a única forma de a comparação ter sentido. Métrica calculada por
um lado e métrica calculada pelo outro não são comparáveis, mesmo quando as duas
estão certas.

---

## 4. Como a pontuação acontece depois

1. O adaptador grava a execução e as previsões (imutáveis a partir daí).
2. Semanas depois, quando a ANP publica o realizado, `forecast_outcomes` é
   preenchido.
3. `v_forecast_placar` calcula erro, erro absoluto e se caiu dentro do intervalo
   — por linha, sem agregação.
4. A tela do placar mostra o modelo externo **ao lado** do naive.

Se o modelo externo perder do naive, **a tela vai dizer isso**. Está escrito no
`CLAUDE.md` e não é negociável. Não é hostilidade com o modelo de ninguém: um
produto que promete honestidade sobre previsão e esconde a derrota não tem
produto nenhum.

---

## 5. Duas questões em aberto — precisam de resposta antes do adaptador

### 5.1 Granularidade: Brasil ou UF?

**Este é o bloqueio real.** O nosso schema é por **UF** (e município, para o
benchmark), porque o produto vende exatamente isso: *"o preço da SUA região e o
quanto VOCÊ pagou acima dela"*. Uma previsão do preço médio do Brasil não
responde a essa pergunta — o cliente compra em Campinas, não no Brasil.

Se o modelo externo hoje prevê a **série agregada nacional**, há três saídas:

| Saída | Custo | Consequência |
|---|---|---|
| Retreinar por UF (uma série por UF) | Trabalho no lado do modelo | É o que encaixa direto. 27 séries, mesmo pipeline. |
| Começar pelas UFs de maior volume (SP, MG, PR, RS, GO) | Menor | Já é suficiente para a demo e para o TCC |
| Criar um nível `BR` no schema | Trabalho no nosso lado | Entra, mas **não alimenta o benchmark regional** — vira número de contexto, não de decisão |

Não dá para escolher por ele. **Pergunta a fazer:** a série de treino é por UF ou
é o agregado Brasil?

### 5.2 O intervalo existe?

Se o modelo entrega só o ponto, `p10`/`p90` têm que sair de algum lugar honesto —
tipicamente os quantis empíricos dos resíduos walk-forward do próprio modelo,
calculados **só com erros cujo alvo já se realizou** até cada origem. Se ele já
calcula intervalo, ótimo, manda. Se não calcula, dá para derivar aqui, mas
precisa ser dito, porque o intervalo passa a ser nosso e não dele.

---

## 6. Se ainda assim for por HTTP

Cenário possível: o modelo é pesado, ou a ideia é reusá-lo fora deste produto.
Nesse caso o desenho continua sendo **assíncrono, semanal**, não em tempo real:

```
Cron semanal (Supabase)
   └─> chama POST /prever  {semana_origem, dados_ate, ufs:[...]}
       <── responde o MESMO payload da seção 3
   └─> valida e grava em forecast_runs + forecasts
```

A web **nunca** chama o serviço do modelo. Ela lê o Postgres, como já faz. O
serviço externo pode estar fora do ar durante a semana inteira sem derrubar uma
tela sequer. E vale o mesmo: nada de métrica pronta no payload.

---

## 7. Estado atual (2026-08-20)

Para não haver dúvida sobre o que existe:

- **A web existe** — 7 telas em Next.js, lendo o Postgres com RLS.
- **A camada de previsão existe** — Edge Function `forecast`, motor
  walk-forward em TypeScript, com placar.
- **O adaptador para modelo externo NÃO existe.** Ninguém consome o modelo de
  ninguém ainda.
- **A série real da ANP NÃO foi ingerida** — egresso bloqueado no ambiente;
  `DATA_PROVENANCE.md` sem entrada válida. Todo número visível hoje é fictício,
  de demonstração, e não pode ser citado como métrica do produto.

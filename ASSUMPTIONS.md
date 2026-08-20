# ASSUMPTIONS.md — decisões ambíguas

Formato obrigatório para cada entrada: **a dúvida**, **a decisão**, **a alternativa
descartada**. Exigido por `/CLAUDE.md` § PROCESSO.

Status: `DECIDIDA` (vale) · `PENDENTE` (proposta, aguarda o dono do produto).

---

## A-001 — Onde roda o teste automatizado de isolamento RLS

- **Status:** DECIDIDA (aprovada em 2026-08-14)
- **Dúvida:** o ambiente não tem daemon Docker (`/var/run/docker.sock` ausente) nem a
  CLI `supabase`, então `supabase start` está indisponível. Rodar contra a nuvem custa
  dinheiro e exige credencial.
- **Decisão:** migrations e testes rodam contra um **Postgres 16 local**, com um *shim*
  que recria o contrato do Supabase consumido pelas policies (schema `auth`, roles
  `anon`/`authenticated`/`service_role` com BYPASSRLS, `auth.uid()` lendo
  `request.jwt.claims`). O shim vive em `/tests/sql`, **nunca** em
  `/supabase/migrations`.
- **Alternativa descartada:** projeto Supabase dedicado na nuvem — custo, acoplamento a
  credencial e teste não reproduzível offline.
- **Risco aceito:** local é PG **16**, Supabase é **17**. A semântica de RLS usada é
  idêntica, mas a paridade não é integral. **As migrations ainda não foram aplicadas a
  nenhum projeto Supabase real** — isso precisa acontecer antes do primeiro deploy.

## A-002 — `EXISTS` sobre tabela de associação quebra a policy

- **Status:** DECIDIDA
- **Dúvida:** `using (exists (select 1 from users_organizations ...))` devolve zero
  linhas quando `users_organizations` também tem RLS — a subconsulta é filtrada junto.
- **Decisão:** pertencimento via função **`SECURITY DEFINER` / `STABLE`** com
  `search_path` fixo e `revoke from public`. Verificado empiricamente: com `EXISTS`
  direto, A e B viam 0 linhas; com a função, A vê só A e B só B.
- **Alternativa descartada:** deixar `users_organizations` sem RLS — expõe o mapa de
  quem pertence a qual organização, que é dado de cliente.

## A-003 — Fixtures de teste não são "dados sintéticos"

- **Status:** DECIDIDA
- **Dúvida:** `/CLAUDE.md` proíbe gerar dados sintéticos. Um teste de isolamento entre
  organizações exige duas organizações com linhas. Conflito aparente.
- **Decisão:** a proibição vale para **preencher tabela de produto** e para **fabricar
  número de métrica**. Fixtures de teste vivem só no banco descartável
  (`tcc_rls_test`, derrubado e recriado a cada execução) e nunca entram em banco real.
  O arquivo `tests/fixtures.ts` traz esse aviso no topo.
- **Alternativa descartada:** testar isolamento contra dados reais de ANP — não ajuda,
  porque preço da ANP é dado público sem tenant; o que precisa de prova é a tabela de
  cliente, que só tem dado quando o cliente importa.

## A-004 — Escrita em `organizations` / `users_organizations`

- **Status:** DECIDIDA
- **Dúvida:** criar organização e convidar membro precisa de policy para `authenticated`?
- **Decisão:** **não na Tarefa 1.** Só policy de `select`; escrita fica com o
  `service_role` via Edge Function. Onboarding e convite não estão no escopo desta
  tarefa e uma policy de `insert` mal desenhada aqui é escalada de privilégio.
- **Alternativa descartada:** liberar `insert` para autenticado desde já — abriria
  criação de organização arbitrária sem regra de negócio definida.

## A-005 — `forecasts` imutável, `forecast_outcomes` mutável

- **Status:** DECIDIDA
- **Dúvida:** a SPEC exige previsão imutável. E o realizado, quando a ANP revisa a
  semana já preenchida?
- **Decisão:** `forecasts` é imutável por **trigger** (vale inclusive para
  `service_role`: BYPASSRLS pula policy, não pula trigger). `forecast_outcomes` é
  mutável de propósito — se o realizado for revisado, ele acompanha, com
  `atualizado_em`. O que não pode mudar nunca é a previsão.
- **Alternativa descartada:** imutabilizar também o realizado — travaria o placar num
  valor que a própria fonte corrigiu.

## A-006 — UF e município na mesma tabela de preços

- **Status:** DECIDIDA
- **Decisão:** tabela única com `nivel` (`UF`/`MUNICIPIO`), `check` de coerência e
  **índices únicos parciais** por nível — que é o que dá idempotência à ingestão.
- **Alternativa descartada:** duas tabelas — duplicaria toda consulta de série e todo
  código de previsão.

## A-007 — Revisão de semana já publicada pela ANP

- **Status:** DECIDIDA
- **Dúvida:** upsert simples apagaria o valor **como era conhecido na hora da previsão**,
  e a regra de não-vazamento temporal depende disso.
- **Decisão:** trigger `before update` compara só os **campos de valor**; se mudaram,
  arquiva o anterior em `fuel_prices_revisoes` e incrementa `revisao`. Se não mudaram
  (reingestão da mesma semana), é no-op — `coletado_em` sozinho **não** caracteriza
  revisão, senão a ingestão deixaria de ser idempotente.
- **Alternativa descartada:** upsert destrutivo — perderia a vintage e tornaria a
  auditoria de vazamento impossível depois do fato.

## A-008 — Identidade do município

- **Status:** DECIDIDA
- **Dúvida:** a ANP publica nome de município, não código IBGE. Casar por nome é frágil.
- **Decisão:** `municipio_norm` (caixa alta, sem acento) é a **chave de casamento e de
  unicidade**; `municipio_ibge` é FK **anulável** para a tabela `municipios`, preenchida
  quando resolve. Município que não casar não bloqueia a carga inteira — a Tarefa 2
  **reporta** os não resolvidos em vez de inventar código.
- **Alternativa descartada:** `municipio_ibge NOT NULL` — um nome divergente derrubaria
  a ingestão de todas as UFs.
- **Consequência:** a tabela `municipios` introduz o **IBGE como fonte externa** e vai
  exigir entrada em `DATA_PROVENANCE.md` na Tarefa 2. Nasce vazia aqui.

## A-009 — Desdobramento de `desvio_padrao` e `num_postos`

- **Status:** DECIDIDA
- **Decisão:** colunas separadas para revenda e distribuição, mais mínimo e máximo de
  cada bloco. O máximo de revenda serve direto ao benchmark ("você pagou acima do teto
  da sua região").
- **Alternativa descartada:** uma coluna só, como no enunciado — ambígua sobre a qual
  bloco pertence, e a ambiguidade só apareceria depois de carregar 3 anos de série.
- **A confirmar na Tarefa 2:** a estrutura exata do arquivo da ANP, contra o arquivo
  real. Não foi verificada nesta tarefa e não está sendo afirmada.

## A-010 — Naive gravado na própria tabela de previsões

- **Status:** DECIDIDA
- **Decisão:** o baseline entra em `forecasts` como `modelo_versao` próprio. O placar
  "modelo vs naive" vira uma query sobre o mesmo registro imutável.
- **Alternativa descartada:** calcular o naive na hora do relatório — permitiria que o
  baseline mudasse depois do fato, que é exatamente o que a tabela imutável evita.

## A-011 — `forecast_runs.dados_ate` e previsão oficial

- **Status:** DECIDIDA
- **Decisão:** toda execução grava a **data de corte** dos dados. Índice único parcial
  garante **uma previsão oficial** por UF × horizonte × semana-alvo × modelo;
  reexecução por correção de bug grava run nova, mas não reescreve o que já conta para
  o placar.
- **Alternativa descartada:** deixar a última execução prevalecer — permitiria melhorar
  o placar reexecutando depois de conhecer o realizado.

## A-012 — Idempotência da importação de CSV

- **Status:** DECIDIDA
- **Dúvida:** deduplicar linha a linha evitaria importação dupla, mas dois
  abastecimentos idênticos no mesmo dia são legítimos.
- **Decisão:** unicidade no **lote** (`organization_id` + hash do conteúdo). Reenviar o
  mesmo arquivo colide; linhas repetidas legítimas são preservadas.
- **Alternativa descartada:** unicidade por linha — descartaria dado real do cliente.

## A-013 — Visibilidade de preços e previsões

- **Status:** DECIDIDA
- **Decisão:** `fuel_prices`, `fx_rates`, `forecasts` e afins são legíveis por
  **qualquer autenticado**, sem recorte por UF contratada. RLS habilitada com policy de
  leitura e **nenhuma** policy de escrita: só `service_role` escreve.
- **Alternativa descartada:** recorte por UF contratada — não existe entidade de
  contrato na v1; seria inventar modelo comercial sem decisão do dono do produto.

## A-014 — Restrição de privacidade imposta pelo schema

- **Status:** DECIDIDA
- **Decisão:** `fuel_purchases` não tem coluna para dado pessoal, e um teste trava o
  **conjunto exato** de colunas — migration futura que adicione `placa` quebra a suíte.
  De rejeitado, `import_batches.colunas_rejeitadas` guarda só os **nomes**. O CSV
  original não é persistido.
- **Alternativa descartada:** guardar o arquivo original para reprocessar — o arquivo é
  justamente onde os dados pessoais estariam.

## A-015 — `semana_fim` quando a coluna não vem no arquivo

- **Status:** DECIDIDA
- **Dúvida:** o schema exige `semana_fim NOT NULL` e maior que `semana_inicio`. Nem toda
  vintage do arquivo traz a coluna de data final.
- **Decisão:** quando ausente (ou incoerente), deriva `semana_inicio + 6` e **conta
  quantas linhas foram derivadas**, expondo o número no relatório da execução. Derivação
  silenciosa seria dado inventado sem rastro.
- **Alternativa descartada:** descartar a linha — jogaria fora preço real por causa de
  metadado ausente.

## A-016 — Contrato de colunas declarado sem verificação contra a fonte

- **Status:** DECIDIDA, com dívida explícita
- **Dúvida:** o egresso para o host da ANP está bloqueado, então os nomes de coluna em
  `_shared/anp/colunas.ts` são **candidatos declarados, não observados**.
- **Decisão:** resolver coluna **por nome**, com casamento exato tendo precedência sobre
  aproximado, e **falhar alto** listando cabeçalho recebido versus esperado quando um
  campo obrigatório não resolve. Jamais assumir posição fixa de coluna.
- **Alternativa descartada:** indexar por posição — funcionaria no primeiro arquivo e
  carregaria número na coluna errada, em silêncio, no primeiro que mudasse de layout.
- **Dívida QUITADA em 2026-08-20.** A primeira execução contra o arquivo real
  (`SEMANAL_ESTADOS-DESDE_2013.xlsx`, sha `d526889b…`) **confirmou o contrato inteiro**.
  Cabeçalho observado, linha 16 da planilha:

  ```
  DATA INICIAL | DATA FINAL | REGIÃO | ESTADO | PRODUTO |
  NÚMERO DE POSTOS PESQUISADOS | UNIDADE DE MEDIDA | PREÇO MÉDIO REVENDA |
  DESVIO PADRÃO REVENDA | PREÇO MÍNIMO REVENDA | PREÇO MÁXIMO REVENDA |
  MARGEM MÉDIA REVENDA | COEF DE VARIAÇÃO REVENDA | PREÇO MÉDIO DISTRIBUIÇÃO |
  DESVIO PADRÃO DISTRIBUIÇÃO | PREÇO MÍNIMO DISTRIBUIÇÃO |
  PREÇO MÁXIMO DISTRIBUIÇÃO | COEF DE VARIAÇÃO DISTRIBUIÇÃO
  ```

  Todos os campos obrigatórios e opcionais resolveram por **casamento exato** (a
  normalização de acentos já dava conta de `PREÇO` → `PRECO`). Nenhum resolveu por
  aproximação — o relatório de `colunasAproximadas` saiu vazio. Três colunas do arquivo
  não têm campo correspondente e foram ignoradas: `REGIÃO`, `MARGEM MÉDIA REVENDA` e os
  dois coeficientes de variação.

  Duas descobertas que só a execução real traria:
  - o arquivo de estados **não tem coluna `MUNICIPIO`** — por isso `municipio` é
    opcional no contrato, e a ausência classifica a linha como nível `UF`. Funcionou;
  - `OLEO DIESEL` aparece em paralelo ao `OLEO DIESEL S10` durante todo o período
    (18.851 contra 18.902 linhas). É o diesel comum (S500), produto diferente. O
    classificador marcou como `SUSPEITO` e descartou — que é o certo. Confirmação
    humana registrada em `source_breaks`.

## A-017 — Dependências novas

- **Status:** DECIDIDA
- `npm:postgres@3.4.5` (Edge Function): cliente Postgres para upsert em lote —
  `supabase-js` não expressa `ON CONFLICT` sobre índice parcial, que é o mecanismo de
  idempotência definido na Tarefa 1.
- `deno` (devDependency): verificar por `deno check` que o entry da Edge Function
  realmente compila no runtime em que vai rodar, em vez de supor.
- **Alternativa descartada:** deixar o entry Deno fora de qualquer checagem de tipos —
  entregaria código de produção que ninguém compilou.

## A-018 — `municipio_ibge` fica nulo nesta fase

- **Status:** DECIDIDA
- **Dúvida:** A-008 previa enriquecer com código IBGE a partir da tabela `municipios`.
- **Decisão:** a ingestão grava `municipio_ibge` nulo enquanto `municipios` estiver
  vazia. O casamento e a unicidade seguem por `municipio_norm`, como A-008 já definia.
- **Alternativa descartada:** bloquear a ingestão até haver IBGE — a fonte do IBGE está
  atrás do mesmo bloqueio de rede, e travaria a série inteira por um enriquecimento.

## A-019 — Demo navegável com dados fictícios (emenda ao CLAUDE.md)

- **Status:** DECIDIDA pelo dono do produto em 2026-08-14
- **Dúvida:** o dono pediu para "simular" o sistema. `/CLAUDE.md` proíbe dado sintético
  em tabela, e ele próprio determina que só o dono pode alterá-lo. Instrução pontual não
  bastava: precisava ser emenda consciente.
- **Decisão:** emenda de escopo estreito escrita no próprio `CLAUDE.md`, permitindo dado
  fictício **só** na demo, com quatro condições cumulativas — banco separado com trava
  contra Supabase real, marcação visível em toda tela, placar rotulado FICTÍCIO, e
  proibição de citar qualquer número da demo como métrica.
- **Alternativa descartada:** popular o schema de produção com dado de exemplo e
  "lembrar de limpar depois" — é assim que número falso vira citação real.
- **Risco residual assumido pelo dono:** o placar de acurácia aparece na demo (opção
  escolhida entre omitir e marcar). Marca d'água mitiga, não elimina, a chance de um
  print virar slide sem contexto.

## A-020 — O intervalo P10–P90 pode não conter o ponto previsto

- **Status:** DECIDIDA
- **Dúvida:** a constraint original exigia `p10 <= valor_previsto <= p90`. O backtest
  do motor violou isso em 14 de 422 previsões, todas do modelo `drift`.
- **Investigação:** não era bug de cálculo. O intervalo vem dos **quantis empíricos
  dos resíduos** walk-forward (SPEC §5). Quando o modelo vinha errando sistematicamente
  para o mesmo lado, os resíduos são todos do mesmo sinal e o intervalo desloca.
- **Decisão:** manter o cálculo fiel à SPEC e **relaxar a constraint** para `p10 <= p90`
  (migration `20260814120006`). Ponto fora do próprio intervalo é **sinal de viés do
  modelo**, e este produto promete não esconder isso.
- **Alternativa descartada:** corrigir o ponto pelo resíduo mediano para forçá-lo para
  dentro do intervalo. Deixaria o gráfico mais bonito mudando o modelo definido na SPEC
  — exatamente o "ajustar até vencer" que o CLAUDE.md proíbe.
- **Pendência de produto:** decidir como a tela comunica esse caso ao cliente. Hoje ela
  apenas desenha; não rotula o viés.

## A-021 — Seleção de modelo é online, não global

- **Status:** DECIDIDA
- **Dúvida:** escolher entre naive/drift/mm3 "por walk-forward por UF" admite duas
  leituras: escolher um vencedor olhando a série toda, ou reescolher a cada origem.
- **Decisão:** **reescolher a cada origem**, usando só erros cujo ALVO já se realizou
  até aquela origem. Vale igual para os resíduos que formam o intervalo.
- **Alternativa descartada:** escolher o melhor modelo na série inteira e depois
  "avaliar" nela — é vazamento, e produz acurácia que evapora em produção. O teste de
  não-vazamento em `tests/previsao.test.ts` existe para travar isso: ele muta o futuro
  da série e exige que nenhuma previsão anterior mude.

## A-022 — Modelo externo entra por arquivo, não por chamada em tempo real

- **Status:** DECIDIDA
- **Dúvida:** o modelo treinado fora deste repositório (Python, do colega de projeto)
  deve ser exposto como serviço HTTP consumido pela web, ou deve depositar resultado?
- **Decisão:** **contrato de arquivo** (`docs/CONTRATO_MODELO.md`). O modelo externo
  roda onde já roda e entrega CSV/JSON com `modelo_versao, uf, semana_origem, dados_ate,
  horizonte_semanas, semana_alvo, valor_previsto, p10, p90`. Um adaptador em TypeScript
  valida e grava em `forecast_runs` + `forecasts`. A web só lê o Postgres.
- **Alternativa descartada:** a web chamar o modelo por HTTP a cada request. Colocaria
  Python na stack (vedado pelo CLAUDE.md), acoplaria a disponibilidade da tela à de um
  serviço externo para recalcular um número que só muda uma vez por semana, e não
  deixaria registro imutável — sem o qual o placar de acurácia não pode existir.
- **Não negociado:** métrica pronta (`mae`, `rmse`, `coverage`) **não** é importada.
  Toda métrica é recalculada aqui sobre o realizado da ANP, com o mesmo protocolo para
  todos os modelos. Métrica calculada de um lado não é comparável com a do outro.
- **Bloqueio em aberto:** granularidade. O schema é por UF porque o produto vende preço
  regional; se o modelo externo prevê o agregado Brasil, ele não encaixa sem retreino por
  UF ou sem um nível `BR` que não alimenta o benchmark. Pergunta pendente ao autor do
  modelo.

## A-023 — Leitor de .xlsx próprio, sem dependência nova

- **Status:** DECIDIDA
- **Dúvida:** a ANP publica `.xlsx`, e o pipeline só lia CSV. Instalar uma
  biblioteca de planilha, pedir conversão manual para CSV, ou escrever o leitor?
- **Decisão:** **escrever o leitor** (`_shared/anp/xlsx.ts`). Um `.xlsx` é um ZIP com
  XML dentro, e a plataforma já traz `DecompressionStream('deflate-raw')` (Node 18+ e
  Deno). O subconjunto necessário — ZIP, sharedStrings, styles e células — é pequeno e
  estável. O projeto já escreve o próprio leitor de CSV pelo mesmo motivo.
- **Alternativa descartada 1:** biblioteca de planilha. A regra do CLAUDE.md pede
  justificativa por dependência, e as bibliotecas do gênero trazem superfície muito
  maior do que o necessário para ler uma tabela retangular.
- **Alternativa descartada 2:** pedir ao usuário que abra no Excel e exporte CSV.
  Quebra a idempotência (passo manual não é reproduzível) e a proveniência (o hash
  registrado deixaria de ser o do arquivo da fonte).
- **Consequência que quase virou bug:** o leitor emite número em formato **BR**
  (vírgula decimal). No XML do xlsx o decimal é ponto, e `numeroBr` — usada por todo o
  resto do pipeline — trata ponto como separador de MILHAR. Emitir `6.199` faria
  `numeroBr` devolver `6199`: preço mil vezes maior, sem erro, sem descarte. A
  conversão acontece na saída do leitor e tem teste dedicado.
- **Também tratado:** célula vazia não existe no XML do xlsx. Ler por ordem de
  aparição desloca a linha e carrega preço na coluna do município. O leitor preenche
  pelo índice da referência (`r="C7"`), com teste.

## A-024 — O formato do arquivo é decidido pelo conteúdo, não pela extensão

- **Status:** DECIDIDA
- **Dúvida:** `scripts/ingest-anp.ts` recebe caminhos e URLs. Decidir CSV vs xlsx pelo
  sufixo do nome ou pelos primeiros bytes?
- **Decisão:** pelos **primeiros bytes** (`PK\x03\x04` = ZIP = xlsx). Órgão público já
  publicou arquivo com extensão trocada; confiar no nome é confiar no rótulo em vez de
  olhar dentro da caixa.
- **Alternativa descartada:** `endsWith('.xlsx')`. Falha silenciosamente exatamente no
  caso em que mais importa acertar — arquivo mal nomeado na fonte.


## A-025 — A demo fictícia e a série real vivem em bancos separados

- **Status:** DECIDIDA
- **Dúvida:** com a ANP finalmente ingerida, os dados reais devem entrar no `tcc_demo`,
  que já tem a série fictícia e as duas organizações de demonstração?
- **Decisão:** **não.** Banco separado, `tcc_real`. A emenda de 2026-08-14 ao CLAUDE.md
  autoriza dado fictício **sob a condição de viver em banco separado**; misturar as duas
  séries na mesma tabela destruiria a condição e tornaria impossível dizer, olhando uma
  linha, se ela é real ou inventada.
- **Alternativa descartada:** uma coluna `ficticio boolean` na mesma tabela. Um `where`
  esquecido em qualquer consulta contamina relatório, e o custo do erro aqui é publicar
  número inventado como métrica de produto.
- **Pendência:** `app/lib/pgurl.ts` força o banco `tcc_demo`. Para a interface abrir
  sobre a série real é preciso decidir se a demo passa a ter dois modos (real e
  fictício, com marcação distinta em tela) ou se vira só real. **Decisão do dono do
  produto**, não tomada aqui.

## A-026 — O intervalo P10–P90 está descalibrado, e isso fica registrado

- **Status:** ABERTA — defeito medido, correção não decidida
- **Fato medido** (backtest de 2026-08-20 sobre a série real, 27 UFs, 701 semanas):
  a cobertura nominal do intervalo é 80% e a **observada é 61,8%**, degradando de 64,1%
  em h=1 para 59,9% em h=4. Está registrado em `docs/resultados/BACKTEST_ANP_2026-08-20.md`.
- **Causa provável:** os quantis empíricos dos resíduos da janela de treino subestimam a
  volatilidade futura da série, que tem choques (greve, mudança de política de preços).
- **Por que não foi corrigido agora:** corrigir exige mudar o método de intervalo, o que
  é decisão de produto e de escopo — e o CLAUDE.md proíbe ajustar até o número agradar.
  Alargar a banda por um fator escolhido a posteriori seria exatamente isso.
- **O que NÃO fazer:** multiplicar o intervalo por uma constante calibrada no próprio
  backtest. Seria vazamento — a constante teria visto o futuro que ela deveria prever.

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

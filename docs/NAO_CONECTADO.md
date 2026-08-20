# O que ainda não está conectado

Lista viva do que a demo **simula** e do que depende de coisa externa que este
ambiente não alcança. Atualizada em 2026-08-20.

Regra que vale aqui: nada nesta lista pode ser apresentado como funcionando.

---

## 1. ANP — série real de preços · BLOQUEADO POR REDE

- **O que falta:** o levantamento semanal de preços, diesel S-10, por UF e município.
- **Por quê:** `www.gov.br` é negado pela política de egresso do ambiente
  (`403` no CONNECT, confirmado por `curl` e pela ferramenta de fetch).
- **O que existe pronto:** o pipeline inteiro (`supabase/functions/ingest-anp` +
  `scripts/ingest-anp.ts`), testado contra fixtures, com falha alta se o cabeçalho
  não bater. Desde 2026-08-20 lê **.xlsx**, que é o formato em que a ANP publica
  (`_shared/anp/xlsx.ts`, sem dependência nova).
- **Consequência:** `DATA_PROVENANCE.md` segue **sem nenhuma entrada válida**, e o
  contrato de colunas em `_shared/anp/colunas.ts` continua sendo **hipótese, não
  observação** (A-016) — agora corroborada por um parser de terceiro que roda
  contra o arquivo real, o que ainda não é o mesmo que ter rodado nós.
- **Como destravar:** passo a passo em `docs/INGESTAO_ANP.md`. Ou liberar
  `*.gov.br` no ambiente (Network access → Custom), ou baixar o arquivo numa
  máquina com rede e rodar `scripts/ingest-anp.ts` contra ele.

## 2. IBGE — tabela de municípios · BLOQUEADO POR REDE

- **O que falta:** código IBGE ↔ nome ↔ UF, para preencher `municipios`.
- **Consequência:** `fuel_prices.municipio_ibge` e `fuel_purchases.municipio_ibge`
  ficam nulos; o casamento de município roda por nome normalizado (A-008, A-018).
- Mesmo bloqueio da ANP, mesmo destravamento.

## 3. Banco Central — PTAX (Tarefa 3) · NÃO INICIADO

- `ingest-fx` não foi escrita. O host do BCB provavelmente esbarra na mesma política.
- `fx_rates` existe no schema e está vazia.

## 4. Brent · BLOQUEADO POR DECISÃO, NÃO POR REDE

- Não implementar sem verificar a licença da fonte e reportar ao dono do produto.
  Cotação de portal financeiro em geral proíbe redistribuição. A v1 funciona sem.

## 5. Resend — envio do alerta semanal · NÃO CONECTADO

- **O que existe:** o template (`_shared/email/alertaSemanal.ts`), renderizado na
  tela `/alerta`. O template **recusa** gerar corpo sem link de descadastro.
- **O que falta:** chave da Resend, o job semanal (Supabase Cron), a tabela de log de
  envio, e o processamento real do descadastro. Nenhum e-mail foi enviado.

## 6. Supabase real — nenhum deploy · NÃO APLICADO

- As migrations **nunca rodaram** contra um projeto Supabase. Tudo foi verificado
  contra Postgres **16** local com shim; o Supabase roda **17** (A-001).
- Supabase Auth não roda aqui (sem Docker): a identidade da demo vem de cookie. Da
  claim em diante, a RLS é a real.

## 7. Importação de CSV — valida, mas não grava

- A tela `/importar` roda a validação de verdade, inclusive a recusa por dado
  pessoal, e mostra o que *seria* gravado. A persistência do lote ainda não existe.

---

## O que NÃO está nesta lista, porque é real

- Schema, migrations e RLS multi-tenant, com teste de isolamento automatizado.
- O motor de previsão e o backtest walk-forward: o algoritmo é real e testado,
  incluindo o teste de não-vazamento temporal. **O que é fictício é a série de
  entrada**, e portanto todo número que sai dele na demo.
- O validador de importação, com teste provando que valor de coluna pessoal não
  vaza para o resultado.

# SPEC — Inteligência de preço de diesel (v1 comercial)

> Regras invioláveis: ver `/CLAUDE.md`. Decisões ambíguas: ver `/ASSUMPTIONS.md`.
> Proveniência de dados: ver `/DATA_PROVENANCE.md`.

---

## 1. Contexto e objetivo

**Cliente:** transportadoras e indústrias que compram diesel S-10 em volume.

**Problema:** elas não sabem se o preço que estão pagando é bom, nem se compensa
antecipar a compra.

**Princípio da v1:** o produto precisa **entregar valor mesmo quando a previsão erra**.
Por isso o benchmark e o placar de acurácia têm precedência sobre a sofisticação do
modelo.

### Ordem de importância das entregas

| # | Entrega | Por quê |
|---|---|---|
| 1 | Preço do diesel S-10 por UF e município, atualizado semanalmente | Base factual; vale por si só |
| 2 | Benchmark: "você pagou X% acima da média da sua região" | Valor imediato, independe de previsão |
| 3 | Previsão de 1 a 4 semanas com intervalo e classe (alta/estável/queda) | Diferencial |
| 4 | Placar de acurácia do próprio modelo, visível no produto | Honestidade como feature |
| 5 | Alerta semanal por e-mail | Recorrência / hábito |
| 6 | Importação de abastecimentos por CSV | Alimenta o benchmark |
| 7 | Relatório mensal exportável | Artefato para levar à diretoria |

### Fora de escopo na v1

Integração com ERP/TMS · cartão de abastecimento · telemetria · otimização de rota ·
previsão por posto individual · app mobile · cobrança automatizada · qualquer modelo de
machine learning complexo.

### Restrição de privacidade (decisão fechada)

A importação de abastecimentos aceita **somente** `data`, `UF`, `município`, `litros`,
`valor total`, `produto`. Qualquer coluna com placa, nome de motorista, CPF ou outro
dado pessoal é **rejeitada com mensagem clara ao usuário**. Não se armazena
"por precaução". Detalhamento em `/CLAUDE.md`.

---

## 3. Stack

| Camada | Tecnologia |
|---|---|
| Front | Next.js (App Router) + TypeScript + Ant Design |
| Back / dados | Supabase — Postgres, Auth, RLS, Cron + Edge Functions |
| Ingestão e previsão | TypeScript nas Edge Functions — **sem Python** |
| E-mail | Resend |

### Estrutura de diretórios

```
/docs/SPEC.md
/CLAUDE.md
/supabase/migrations
/supabase/functions/ingest-anp
/supabase/functions/ingest-fx
/supabase/functions/forecast
/app
/tests
```

---

## 4. Fontes de dados e licença

### ANP — Levantamento de Preços de Combustíveis

Série **semanal** por município e por UF, produto **óleo diesel S-10**. Público.

Riscos conhecidos, que são **quebras de série e precisam ser documentados**:
- **Mudança de nomenclatura do produto** ao longo do tempo.
- **Mudança de metodologia da pesquisa.**

### USD/BRL — PTAX

API de dados abertos do **Banco Central**. Público.

### Brent

**NÃO implementar sem antes verificar e reportar a licença da fonte pretendida.**
Cotação de portal financeiro geralmente **proíbe redistribuição**.
**A v1 funciona sem Brent.**

### Registro obrigatório

Toda fonte acima, ao ser efetivamente ingerida, gera entrada em `DATA_PROVENANCE.md`
com URL, licença, data de coleta, período coberto, unidade e hash do arquivo.

---

## 5. Modelo de previsão da v1 (simples de propósito)

### Previsão pontual

- **Naive com drift** e **média móvel curta**.
- Escolha entre eles por **walk-forward por UF**.
- **Sem divisão aleatória, jamais.**

### Intervalo P10–P90

Quantis empíricos dos **resíduos walk-forward**, calculados **por UF e por horizonte**.

### Classe alta / estável / queda

**Banda de estabilidade explícita** (ex.: `|Δ| < R$ 0,02/L`), **calibrada pelo ruído
histórico da própria UF**.

### Registro imutável

Toda previsão é gravada em **tabela imutável**, com o **realizado preenchido depois**.
**Sem esse registro não existe placar de acurácia.**

### Honestidade obrigatória

Se o modelo escolhido **não estiver batendo o naive** numa UF nas últimas 12 semanas,
**o produto mostra isso** em vez de esconder.

### Métricas do backtest

RMSE · MAE · MASE · acurácia direcional · cobertura empírica do intervalo (PICP).

**Por UF, não só agregado.** O naive aparece na mesma tabela como referência.

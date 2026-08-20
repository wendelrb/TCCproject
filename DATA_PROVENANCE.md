# DATA_PROVENANCE.md — proveniência das fontes externas

Exigido por `/CLAUDE.md` § DADOS. **Toda** fonte externa efetivamente ingerida precisa
de uma entrada aqui com: URL, licença, data de coleta, período coberto, unidade e hash
do arquivo.

---

## Estado atual

**Nenhuma fonte externa foi coletada até aqui.** Este arquivo está deliberadamente sem
entradas. As entradas serão criadas a partir de downloads reais — nunca preenchidas de
memória.

## Tentativas de coleta

### 2026-08-14 — ANP: BLOQUEADA pela política de egresso

Tentativa de iniciar a Tarefa 2. O host da ANP é **inalcançável a partir deste
ambiente** — não é instabilidade da fonte, é negação de política da rede.

- `curl https://www.gov.br/anp/pt-br` → `curl: (56) CONNECT tunnel failed, response 403`
- Ferramenta de fetch do harness → `EGRESS_BLOCKED: Access to www.gov.br is blocked by
  the network egress proxy`
- Diagnóstico do próprio proxy (`$HTTPS_PROXY/__agentproxy/status`):
  `{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial
  or upstream failure)","host":"www.gov.br:443"}`

**Nada foi ingerido e nenhum dado foi fabricado para contornar.** A ingestão da ANP fica
parada até que `www.gov.br` (e o host que sirva os arquivos de dados abertos da ANP)
seja liberado na política de egresso do ambiente, ou até que os arquivos cheguem por
outro caminho autorizado.

O pipeline (`supabase/functions/ingest-anp` + `scripts/ingest-anp.ts`) foi construído e
testado contra fixtures, mas **nunca executado contra a fonte**. Enquanto não rodar:

- o contrato de colunas em `_shared/anp/colunas.ts` é **hipótese**, não observação
  (A-016);
- nenhuma linha desta tabela de proveniência pode ser preenchida, porque não há arquivo,
  não há hash e não há período coberto para registrar.

Quando a fonte abrir, a primeira execução ou confirma o contrato ou falha listando o
cabeçalho real — e é ela que gera a primeira entrada válida aqui.

### 2026-08-20 — bloqueio reconfirmado; formato da fonte identificado

O egresso continua negado (`403` no CONNECT para `www.gov.br`, `dados.gov.br` e
`servicodados.ibge.gov.br`, verificado nesta data).

Duas coisas mudaram, e nenhuma delas é dado coletado:

1. **O formato da fonte foi identificado: `.xlsx`, não CSV.** O pipeline passou a
   ler xlsx (`_shared/anp/xlsx.ts`). Antes disso, a ingestão real não teria como
   acontecer nem com a rede aberta.
2. **Uma URL da ANP foi confirmada indiretamente**, pelo código de um projeto de
   terceiro que roda contra a fonte real
   (`github.com/PabloAOliveira/MachineLearning-MVP`, `src/data/anp.py`):

   ```
   https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/
     precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/
     semanal-brasil-desde-2013.xlsx
   ```

   **Isto é o agregado BRASIL** — não serve para o nosso produto, que é por UF e
   município. As URLs dos arquivos por estado e por município **não foram
   verificadas** e não devem ser escritas aqui até que alguém baixe o arquivo.

Nada disso vira entrada de proveniência: **não há arquivo, não há hash, não há
período coberto.** Entrada só nasce de download real.

---

## Fontes previstas (ainda não ingeridas, sem entrada válida)

| Fonte | Tarefa | Situação |
|---|---|---|
| ANP — Levantamento de Preços de Combustíveis (diesel S-10, semanal, UF e município) | 2 | Não coletada |
| Banco Central — PTAX USD/BRL | 3 | Não coletada |
| IBGE — tabela de municípios (código IBGE ↔ nome ↔ UF) | 2, se aprovada | Não coletada; ver questão de schema em aberto |
| Brent | — | **Bloqueada.** Não implementar sem verificar a licença e reportar ao dono do produto. A v1 funciona sem Brent. |

---

## Modelo de entrada (a preencher quando houver coleta real)

```
### <nome da fonte>
- URL exata baixada:
- Licença / termos de uso (link e resumo de uma linha):
- Permite redistribuição? (sim / não / não verificado)
- Data e hora da coleta (UTC):
- Período coberto pelo arquivo:
- Unidade e moeda:
- SHA-256 do arquivo bruto:
- Quebras conhecidas (nomenclatura, metodologia):
```

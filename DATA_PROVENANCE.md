# DATA_PROVENANCE.md — proveniência das fontes externas

Exigido por `/CLAUDE.md` § DADOS. **Toda** fonte externa efetivamente ingerida precisa
de uma entrada aqui com: URL, licença, data de coleta, período coberto, unidade e hash
do arquivo.

---

## Estado atual

**A ANP foi coletada em 2026-08-20.** Os arquivos foram baixados pelo dono do produto,
numa rede sem o bloqueio de egresso deste ambiente, e entregues à sessão. As entradas
abaixo saíram dessa coleta real — nenhuma foi preenchida de memória.

As demais fontes (PTAX, IBGE, Brent) continuam **não coletadas**.

---

## ANP — Levantamento de Preços de Combustíveis (série semanal)

Fonte comum a todos os arquivos:

- **Página:** https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis
  → série histórica do levantamento de preços, intervalo semanal
- **Órgão:** ANP — Superintendência de Defesa da Concorrência, Sistema de Levantamento
  de Preços
- **Data da coleta (UTC):** 2026-08-20
- **Forma da coleta:** download manual pelo dono do produto; arquivos entregues à
  sessão. **O egresso deste ambiente continua bloqueado para `*.gov.br`** — a sessão
  não baixou nada por conta própria.
- **Unidade:** R$/l (coluna `UNIDADE DE MEDIDA`, valor `R$/l` em todas as linhas)
- **Produto extraído:** `OLEO DIESEL S10` → enum `DIESEL_S10`. A grafia exata publicada
  fica em `produto_fonte`.
- **Licença / termos de uso:** ⚠️ **NÃO VERIFICADA.** Dado público da ANP, publicado como
  série histórica aberta, mas os termos não foram lidos. Verificar antes de qualquer
  redistribuição do dado bruto — usar internamente para o TCC é outra coisa.

### `SEMANAL_ESTADOS-DESDE_2013.xlsx`

- **SHA-256:** `d526889b145a1fde870b9e82184e2aa9305ed68bcc211ccc68ca7ccb8aa073e3`
- **Tamanho:** 11,9 MB · **Aba:** `ESTADOS - DESDE 30.12.2012`
- **Período coberto:** 2012-12-30 a 2026-08-09 (701 semanas distintas)
- **Nível:** UF (27 unidades federativas)
- **Extraído:** 114.210 linhas lidas, **18.902 aceitas** (diesel S-10), 95.308
  descartadas por `OUTRO_PRODUTO`

### `semanal-municipios-2022_a_2023.xlsx`

- **SHA-256:** `c1993bafcde32abbcf067e635c8bdd220430b4df84d56a2a1846e97fd566d436`
- **Período coberto:** 2022-01-02 a 2023-12-24 (103 semanas)
- **Extraído:** 249.445 lidas, **40.194 aceitas**

### `SEMANAL_MUNICIPIOS-2024_A_2025.xlsx`

- **SHA-256:** `dc3f5aa7f297b9221c7962403c192e2edadc6158eec3e872d8358d8a87ace5e4`
- **Período coberto:** 2023-12-31 a 2025-12-28 (105 semanas)
- **Extraído:** 228.404 lidas, **38.502 aceitas**

### `SEMANAL_MUNICIPIOS-2026-Site.xlsx`

- **SHA-256:** `65163779ab6de2cd65b8da267220a22efb3a5193c8b4302778f1f3affb633457`
- **Período coberto:** 2026-01-04 a 2026-08-09 (32 semanas)
- **Extraído:** 75.321 lidas, **12.163 aceitas**

### Resultado consolidado no banco

| Nível | Linhas | UFs | Municípios | Período |
|---|---|---|---|---|
| UF | 18.902 | 27 | — | 2012-12-30 a 2026-08-09 |
| MUNICIPIO | 90.859 | 27 | 458 | 2022-01-02 a 2026-08-09 |

Faixa de preço observada: R$ 2,1300 a R$ 9,2700 por litro. Zero preços nulos, zero
contagens de posto nulas. 8.380 linhas de UF sem preço de distribuição — coerente com a
quebra de metodologia de 18/8/2020 registrada em `source_breaks`.

**Idempotência verificada:** a segunda execução da ingestão do arquivo de estados
devolveu `inseridas=0 atualizadas=18902`, com a tabela permanecendo em 18.902 linhas e
zero revisões arquivadas.

### Quebras conhecidas

Sete, transcritas do preâmbulo do próprio arquivo e carregadas em `source_breaks` por
`scripts/quebras-anp.sql`. As três interrupções de pesquisa que a ANP descreve em texto
**batem exatamente** com os gaps que `analisarCadencia` detectou sozinho a partir das
datas — duas evidências independentes que concordam:

| Período | Tipo | O quê |
|---|---|---|
| 2015-08-16 a 2015-08-22 | COBERTURA | sem pesquisa (troca de contrato) |
| 2017-07-30 a 2017-12-30 | COBERTURA | 501 → 459 municípios; grupos A/B quinzenais |
| 2018-05-27 a 2018-06-02 | COBERTURA | ~85% menos revendas (greve dos caminhoneiros) |
| 2020-08-18 a 2020-10-17 | COBERTURA | sem pesquisa por dois meses |
| a partir de 2020-08-18 | METODOLOGIA | preços de distribuição deixam de ser coletados |
| a partir de 2022-05-08 | METODOLOGIA | duas casas decimais (Resolução ANP 858/2021) |
| todo o período | NOMENCLATURA | `OLEO DIESEL` (S500) publicado em paralelo ao S10 |

### Arquivos recebidos e NÃO ingeridos

| Arquivo | Motivo |
|---|---|
| `SEMANAL_REGIOES-DESDE_2013.xlsx` (sha `58a2706a…`) | nível região; o schema é UF e município |
| `semanal-municipio-2013-a-2017.xls` | formato OLE2, não lido |
| `semanal-municipios-2013-2014.xlsb` | formato binário xlsb, não lido |
| `semanal-municipios-2015-a-2017.xlsb` | formato binário xlsb, não lido |
| `semanal-municipios-2018-a-2021.xlsb` | formato binário xlsb, não lido |

Consequência: a série por **município** começa em 2022. A série por **UF**, que é a que
alimenta o backtest, cobre 2012-12-30 em diante.

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
   município.

3. **A lista de arquivos da página foi conferida** (captura de tela da página da
   ANP enviada pelo dono do produto, 2026-08-20). Nomes observados, ainda **não
   baixados**:

   | Arquivo | Formato | Última modificação |
   |---|---|---|
   | `semanal-estados-desde-2013.xlsx` | xlsx | 14/08/2026 |
   | `semanal-municipios-2026.xlsx` | xlsx | 14/08/2026 |
   | `semanal-brasil-desde-2013.xlsx` | xlsx | 14/08/2026 |
   | `semanal-regioes-desde-2013.xlsx` | xlsx | 14/08/2026 |
   | `semanal-municipio-2024-2025.xlsx` | xlsx | 05/01/2026 |
   | `semanal-municipios-2022-2024.xlsx` | xlsx | 29/08/2024 |
   | `semanal-municipios-2022_a_2023.xlsx` | xlsx | 22/08/2024 |
   | `semanal-municipios-2013-2014.xlsb` | xlsb | 29/07/2025 |
   | `semanal-municipios-2015-a-2017.xlsb` | xlsb | 29/07/2025 |
   | `semanal-municipio-2018-a-2021.xlsb` | xlsb | 02/07/2025 |
   | `semanal-municipio-2013-a-2017.xls` | xls | 02/07/2025 |

   A série por UF (`semanal-estados-desde-2013.xlsx`) é a que interessa primeiro.
   A série por município só existe em xlsx a partir de 2022 — antes disso é .xlsb
   ou .xls, formatos que o leitor não interpreta (`docs/INGESTAO_ANP.md` §3.1).

   **Nome de arquivo observado não é dado coletado.** Nenhuma URL completa foi
   confirmada por download, e a licença de uso ainda não foi lida.

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

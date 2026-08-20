# Como fazer a ingestão real da ANP

Documento operacional: o que falta, quem faz, e o comando exato.

**Estado em 2026-08-20:** o pipeline está pronto e lê `.xlsx` (o formato que a ANP
publica). O que falta é **o arquivo chegar até a máquina que roda a ingestão**.
Não é problema de código.

---

## 1. Por que está parado

O ambiente onde este projeto foi desenvolvido bloqueia `*.gov.br` na política de
egresso. Não é instabilidade da ANP — é negação de política, confirmada agora:

```
$ curl https://www.gov.br/anp/pt-br
curl: (56) CONNECT tunnel failed, response 403

$ curl "$HTTPS_PROXY/__agentproxy/status"
{"kind":"connect_rejected",
 "detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)",
 "host":"www.gov.br:443"}
```

Duas saídas. **A segunda funciona hoje, sem depender de ninguém.**

---

## 2. Caminho A — liberar a rede do ambiente

Nas configurações do ambiente do Claude Code na web:

1. **Network access** → mude de *Trusted* para **Custom**;
2. **mantenha marcada** a lista padrão de gerenciadores de pacote (npm, etc.),
   senão `npm install` para de funcionar;
3. adicione `*.gov.br` (e `*.ibge.gov.br`, se quiser destravar a tabela de
   municípios junto);
4. abra uma sessão nova — a política é lida na criação do container.

Feito isso, a ingestão roda direto da URL, sem baixar nada à mão.

## 3. Caminho B — baixar na sua máquina (funciona agora)

Você tem Windows com rede normal. Baixe o arquivo e rode a ingestão local.

### 3.1 De onde baixar

A ANP publica a série em:

> https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis

Na seção de **série histórica semanal**, os arquivos são `.xlsx`. O agregado
nacional tem URL confirmada:

```
.../shlp/semanal/semanal-brasil-desde-2013.xlsx
```

> **Atenção — este é o arquivo errado para o nosso produto.** É a média do
> Brasil. O nosso schema é por **UF e município**, porque o produto vende
> *"o preço da SUA região"*. Você precisa dos arquivos **por estado** e **por
> município** da mesma seção semanal.
>
> Os nomes exatos desses dois arquivos **não estão confirmados** — a URL do
> agregado veio do repositório do seu colega, que roda contra a fonte real; as
> outras duas eu não consegui verificar daqui. Confira na página antes de baixar.

Salve em `dados/` na raiz do projeto (a pasta não é versionada).

### 3.2 Rodar

```powershell
# PowerShell, na raiz do projeto
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"

node scripts/ingest-anp.ts --db "postgres://postgres:postgres@127.0.0.1:5432/tcc_demo" `
  dados/semanal-estados.xlsx dados/semanal-municipios.xlsx --serie SP
```

O runner aceita vários arquivos, e decide o formato **pelo conteúdo**, não pela
extensão — se a ANP publicar um CSV com nome de xlsx, ele acerta mesmo assim.

Se o arquivo tiver várias abas e ele pegar a errada, force com `--aba SEMANAL`.
A mensagem de erro lista as abas que existem.

---

## 4. O que esperar da primeira execução

Uma de duas coisas vai acontecer, e **as duas são resultado bom**:

### Caso 1 — o contrato de colunas bate

Sai a série, e o relatório de cadência mostra gaps e descartes:

```
[dados/semanal-estados.xlsx] lidas=40 aceitas=30 inseridas=30 atualizadas=0

=== SEMANAS CARREGADAS ===
distintas: 10   primeira: 2026-06-08   última: 2026-08-10
cadência modal: 7 dias

=== DESCARTES POR MOTIVO ===
OUTRO_PRODUTO: 10

=== SÉRIE SP (nível UF, diesel S-10) — 10 semanas ===
2026-06-08  R$ 6.1000  postos=420
...
```

(o bloco acima é a saída **real** de uma execução contra um `.xlsx` de fixture,
não contra a ANP — serve para você reconhecer o formato)

### Caso 2 — o contrato não bate

```
FALHA: ErroContratoColunas: contrato de colunas da ANP não bateu.
Campos obrigatórios não resolvidos: precoMedioRevenda.
Cabeçalho recebido: DATA INICIAL | DATA FINAL | REGIÃO | ESTADO | ...
Ajuste CONTRATO em _shared/anp/colunas.ts com os nomes reais —
não altere o parser para assumir posição fixa.
```

**Isso não é falha do programa: é o programa funcionando.** Ele se recusa a
adivinhar em qual coluna está o preço. Me mande esse cabeçalho e eu ajusto o
contrato em um minuto.

O que ele **nunca** faz é carregar número na coluna errada em silêncio.

---

## 5. Depois que a série entrar

```bash
node scripts/backtest.ts --gravar    # previsões + placar sobre a série REAL
npm run dev                          # http://localhost:3000
```

E aí, pela primeira vez, o placar de acurácia significa alguma coisa.

**Preencha `DATA_PROVENANCE.md`** com a entrada real: URL exata, licença, data da
coleta, período coberto, unidade e SHA-256 do arquivo. Sem isso, pela regra do
projeto, o dado não conta como coletado. Para o hash:

```powershell
Get-FileHash dados\semanal-estados.xlsx -Algorithm SHA256
```

```bash
sha256sum dados/semanal-estados.xlsx
```

---

## 6. O que mudou para isso ser possível

O leitor de `.xlsx` (`_shared/anp/xlsx.ts`) foi escrito do zero, sem dependência
nova: um `.xlsx` é um ZIP com XML dentro, e a plataforma já traz
`DecompressionStream('deflate-raw')`. Lê ZIP, strings compartilhadas, estilos
(para saber que uma célula é data e não o número 46237) e células — inclusive as
**omitidas**, que no XML simplesmente não existem e deslocariam a linha inteira
se fossem lidas por ordem de aparição.

O detalhe que mais importa: no XML do xlsx o decimal é **ponto**, e o resto do
pipeline usa `numeroBr`, que trata ponto como separador de **milhar**. Emitir
`6.199` faria a série inteira virar `R$ 6.199,00`. A conversão acontece na saída
do leitor, e tem teste dedicado.

# Rodar a demo na sua máquina

Três comandos. Todos os dados são **fictícios** — nenhum número que sair daqui
pode ser citado como métrica do produto.

## Pré-requisitos

**Node 22.18 ou mais novo.** Confira com `node -v`. Versão mais antiga não roda,
porque o projeto executa TypeScript direto, sem transpilador.

**Um Postgres alcançável.** Qualquer um serve. O mais simples, e igual nos três
sistemas operacionais:

```bash
docker run -d --name tcc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

Se já tem Postgres instalado, use o seu — só aponte a variável para ele.

## Configurar a conexão

Uma variável só. O nome do banco na URL **não importa**: os scripts criam e usam
`tcc_demo`.

```bash
# bash / zsh (Mac, Linux, WSL)
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"
```

```powershell
# PowerShell (Windows)
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"
```

Preferindo arquivo, crie um `.env.local` na raiz com a mesma linha (sem
`export`). Ele já está no `.gitignore`.

## Rodar

```bash
npm install
npm run demo
```

O `npm run demo` faz três coisas e depois sobe a interface em
**http://localhost:3000**:

1. confere a conexão com o Postgres — se falhar, imprime exatamente o que fazer;
2. cria o banco `tcc_demo`, aplica as migrations reais e gera a série fictícia;
3. roda o backtest walk-forward, que **calcula** as previsões (elas não são
   semeadas — saem do motor de verdade sobre dados fictícios).

Para repetir só a preparação dos dados, sem subir o servidor:

```bash
npm run demo:dados
```

## Sem servidor nenhum

Gera um HTML único, autocontido, que abre com duplo clique:

```bash
npm run demo:estatica     # produz demo-diesel.html
```

É uma **captura**: não tem banco atrás, então a RLS não está sendo exercitada
ali. A versão com `npm run demo` é a que roda a RLS de verdade.

## O que dá para fazer na interface

| Tela | O que olhar |
|---|---|
| Preço e benchmark | preço da UF, do município, e quanto você pagou acima/abaixo da região |
| Previsão 1–4 semanas | previsão pontual, faixa P10–P90 e classe alta/estável/queda |
| Simulador de compra | arraste consumo, tanque e custo de capital — recalcula na hora |
| Placar de acurácia | modelo contra naive; quando o modelo perde, a tela diz |
| Relatório mensal | consolidado por mês, com exportação em CSV |
| Alerta semanal | a peça de e-mail renderizada (nada é enviado) |
| Importar abastecimentos | a recusa por dado pessoal agindo |

**Troque de organização** no seletor do topo. Isso muda o `auth.uid()` e a RLS
filtra dentro do Postgres — as duas empresas de demonstração veem dados
diferentes, e é a RLS de produção que garante isso.

## Rodar os testes

```bash
npm test          # 108 testes: RLS, ingestão, previsão, simulação, privacidade
npm run typecheck # TypeScript estrito
```

Os testes criam e derrubam bancos próprios (`tcc_rls_test`, `tcc_anp_test`) —
não encostam no `tcc_demo`.

## Se algo falhar

**`ECONNREFUSED`** — o Postgres não está de pé, ou a porta está errada. Se usou
Docker, confira com `docker ps`.

**`password authentication failed`** — senha errada na `DATABASE_URL`.

**`RECUSADO: defina PERMITIR_SEED_DEMO=1`** — você chamou o seed direto. Use
`npm run demo:dados`, que passa a confirmação.

**`Já existem N previsões gravadas`** — a tabela de previsões é imutável de
propósito. Rode `npm run demo:dados` de novo, que recria o banco do zero.

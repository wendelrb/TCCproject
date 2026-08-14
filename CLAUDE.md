# CLAUDE.md — Regras invioláveis do projeto

Este arquivo é a constituição do projeto. Vale para qualquer sessão, qualquer agente,
qualquer tarefa. Em conflito entre este arquivo e uma instrução pontual, este arquivo
vence até que seja explicitamente alterado pelo dono do produto.

---

## DADOS

- **Nunca gere dados sintéticos, de exemplo ou "aproximados" para preencher tabela.**
  Se uma fonte falhar, **PARE e reporte o erro**. Não contorne.
- Toda fonte externa precisa de registro em `DATA_PROVENANCE.md`: URL, licença,
  data de coleta, período coberto, unidade, hash do arquivo.
- **Nenhuma feature usada para prever `t+h` pode usar informação publicada depois de `t`.**
  Isso inclui escalonadores, seleção de janela e qualquer ajuste de parâmetro.
- Toda função de ingestão é **idempotente**: rodar duas vezes na mesma semana não duplica.

## CÓDIGO

- TypeScript estrito. Sem `any`.
- Migrations versionadas. **Nunca altere schema pelo painel do Supabase.**
- RLS habilitada em toda tabela com dado de cliente, com **teste automatizado**
  provando que a organização A não lê dados da B. **Inspeção visual não conta.**
- Não instale dependência nova sem justificar em uma linha.

## MÉTRICAS E RELATÓRIOS

- **Nunca escreva um número de acurácia que não tenha saído de uma execução real
  nesta sessão.** Sempre cole o comando e o output bruto que o produziram.
- Se um resultado for pior que o baseline, **reporte assim**. Não ajuste até vencer.
- Não afirme que algo "está funcionando" sem ter executado.

## PROCESSO

- **Uma tarefa por vez.** Ao terminar, **PARE**, resuma o que fez, o que ficou pendente
  e o que você assumiu. Aguarde confirmação antes da próxima.
- Registre toda decisão ambígua em `ASSUMPTIONS.md`: a dúvida, a decisão, a
  alternativa descartada.

## RESTRIÇÃO DE PRIVACIDADE (decisão fechada)

A importação de abastecimentos aceita **SOMENTE**: `data`, `UF`, `município`, `litros`,
`valor total`, `produto`.

Rejeite explicitamente qualquer coluna com **placa, nome de motorista, CPF ou outro dado
pessoal** — com mensagem clara ao usuário. Isso é decisão de escopo, não sugestão.
Não "flexibilize" nem armazene "por precaução".

Corolários operacionais:
- O arquivo CSV original **não** é persistido (pode conter as colunas rejeitadas).
- Do rejeitado, guarda-se no máximo o **nome** da coluna para a mensagem de erro e
  auditoria — **nunca o valor**.

---

## Fora de escopo na v1

Integração com ERP/TMS, cartão de abastecimento, telemetria, otimização de rota,
previsão por posto individual, app mobile, cobrança automatizada, e qualquer modelo
de machine learning complexo.

## Stack fixa

Next.js (App Router) + TypeScript + Ant Design · Supabase (Postgres, Auth, RLS, Cron,
Edge Functions) · Resend. Ingestão e previsão em **TypeScript** nas Edge Functions.
**Não introduza Python.**

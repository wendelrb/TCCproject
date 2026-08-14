# DATA_PROVENANCE.md — proveniência das fontes externas

Exigido por `/CLAUDE.md` § DADOS. **Toda** fonte externa efetivamente ingerida precisa
de uma entrada aqui com: URL, licença, data de coleta, período coberto, unidade e hash
do arquivo.

---

## Estado atual

**Nenhuma fonte externa foi coletada até aqui.** Este arquivo está deliberadamente sem
entradas: a Tarefa 1 é apenas schema e multi-tenancy, sem ingestão. As entradas serão
criadas na Tarefa 2 (ANP) e na Tarefa 3 (PTAX), a partir de downloads reais — nunca
preenchidas de memória.

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

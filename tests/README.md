# Testes

## Pré-requisito: um Postgres para o teste falar

Os testes aplicam as **migrations reais** de `/supabase/migrations` num banco
descartável (`tcc_rls_test`), derrubado e recriado a cada execução. Nenhum banco de
produção é tocado.

O ambiente não tem daemon Docker, então `supabase start` não está disponível — ver
`ASSUMPTIONS.md` A-001. Subindo um cluster local:

```bash
PGD=/var/lib/postgresql/16/tcc
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-p 55432' -l $PGD/../pg.log start"
```

Conexão configurável por `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE_TESTE`.
Default: `127.0.0.1:55432`, usuário `postgres`.

## Rodando

```bash
npm run typecheck   # tsc --noEmit, strict, sem any
npm test            # suíte completa
npm run test:rls    # só isolamento multi-tenant
```

Node 22.18+ executa `.ts` nativamente — não há transpilador no caminho.

## O que a suíte prova

| Bloco | Prova |
|---|---|
| Isolamento de leitura | A lê só A, B lê só B, usuário sem organização lê zero, `anon` sem privilégio |
| Isolamento de escrita | `INSERT` com organização alheia barrado; `UPDATE`/`DELETE` cross-org afetam zero linhas; linha não pode ser movida para outra organização |
| Membresia | A não descobre quem pertence à organização de B |
| `service_role` | Enxerga tudo (BYPASSRLS), como o job de e-mail vai precisar |
| Imutabilidade | `forecasts` recusa `UPDATE`/`DELETE` **inclusive para `service_role`** |
| Idempotência | Reingestão da mesma semana colide; revisão de valor arquiva o anterior |
| Guardas estruturais | Toda tabela do `public` com RLS; conjunto de colunas de `fuel_purchases` travado |

## Teste de mutação

Um teste que nunca falhou não prova nada. Para verificar que a suíte tem dentes,
enfraqueça uma policy e confirme o vermelho:

```bash
sed -i "s|for select to authenticated using (public.eh_membro(organization_id));|for select to authenticated using (true);|g" \
  supabase/migrations/20260814120005_abastecimentos.sql
npm test        # esperado: 5 falhas, todas no bloco de isolamento de leitura
git checkout -- supabase/migrations/20260814120005_abastecimentos.sql
```

## Demo navegável (dados FICTÍCIOS)

Autorizada pela emenda de 2026-08-14 no `CLAUDE.md`. Ver `ASSUMPTIONS.md` A-019.

```bash
./scripts/pg-local.sh
PERMITIR_SEED_DEMO=1 node scripts/seed-demo.ts   # sem a variável, recusa rodar
npx next build --no-lint && npx next start -p 3000
```

Rotas: `/` preço e benchmark · `/previsao` · `/placar` · `/importar`
(`?validar=pessoal` e `?validar=conforme` deixam os dois desfechos endereçáveis).

A troca de organização no topo muda o `auth.uid()` e a RLS de produção filtra de
verdade — não é mock. Nenhum número dessas telas é métrica do produto.

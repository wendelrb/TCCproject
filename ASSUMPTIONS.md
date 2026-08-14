# ASSUMPTIONS.md — decisões ambíguas

Formato obrigatório para cada entrada: **a dúvida**, **a decisão**, **a alternativa
descartada**. Exigido por `/CLAUDE.md` § PROCESSO.

Status possíveis: `DECIDIDA` (já vale) · `PENDENTE` (proposta, aguarda o dono do produto).

---

## A-001 — Onde roda o teste automatizado de isolamento RLS

- **Status:** PENDENTE
- **Dúvida:** `/CLAUDE.md` exige teste automatizado provando que a organização A não lê
  dados da B. O ambiente desta sessão **não tem daemon Docker** (`/var/run/docker.sock`
  ausente) nem a CLI `supabase`, então `supabase start` está indisponível. Rodar contra
  um projeto Supabase na nuvem custa dinheiro e exige credencial.
- **Decisão proposta:** rodar migrations e testes contra um **Postgres 16 local**
  (já instalado na imagem), com um *shim* que recria o contrato do Supabase usado pelas
  policies: schema `auth`, roles `anon` / `authenticated` / `service_role`, e
  `auth.uid()` lendo `current_setting('request.jwt.claims')`. O shim vive em
  `/tests`, **nunca** em `/supabase/migrations`, para não vazar para produção.
- **Alternativa descartada:** criar projeto Supabase dedicado e testar na nuvem —
  descartado por custo, por acoplar o CI a uma credencial e por tornar o teste não
  reproduzível offline. Reversível: o mesmo SQL de teste roda contra a nuvem sem
  alteração.
- **Risco aceito e registrado:** Postgres local é **16**; os projetos Supabase do dono
  rodam **17**. A semântica de RLS usada aqui é idêntica entre as duas versões, mas a
  paridade não é integral. Mitigação: as migrations também serão aplicadas ao projeto
  Supabase real antes do primeiro deploy.

---

## A-002 — `EXISTS` sobre tabela de associação quebra a policy

- **Status:** DECIDIDA
- **Dúvida:** a forma idiomática de policy multi-tenant (`EXISTS (select 1 from
  users_organizations ...)`) devolve **zero linhas** quando `users_organizations`
  também tem RLS ligada — a subconsulta é filtrada junto.
- **Decisão:** a checagem de pertencimento passa por função
  **`SECURITY DEFINER` / `STABLE`** com `search_path` fixo, e as policies chamam essa
  função. Verificado empiricamente nesta sessão: com `EXISTS` direto, A e B viram
  0 linhas; com a função, A viu só A, B só B, e um terceiro usuário não viu nada.
- **Alternativa descartada:** deixar `users_organizations` sem RLS para o `EXISTS`
  funcionar — descartado porque expõe o mapa de quem pertence a qual organização, que é
  dado de cliente.

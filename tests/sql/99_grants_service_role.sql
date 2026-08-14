-- SHIM DE TESTE (pós-migrations) — no Supabase real, service_role recebe grants
-- amplos no schema public por default privileges. As migrations não concedem
-- nada a ele de propósito: em produção quem concede é a plataforma.
--
-- Roda DEPOIS das migrations, para cobrir as tabelas recém-criadas.

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

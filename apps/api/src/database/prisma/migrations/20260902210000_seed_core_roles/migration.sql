-- Catalogo fixo de papeis (RoleKey) — nao e dado de demonstracao, e dado de
-- referencia obrigatorio: nenhum cadastro (passageiro, organizador, staff)
-- funciona sem essas 4 linhas existirem. Por isso mora numa migration, nao
-- so no seed de demonstracao (que roda apenas em dev/manual, nao no CI).
INSERT INTO "roles" ("id", "key", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'PASSENGER', 'Passageiro', 'Cliente que reserva cruzeiros', now(), now()),
  (gen_random_uuid()::text, 'ORGANIZER_ADMIN', 'Administrador do Organizador', 'Gerencia cruzeiros, navios e equipe de um organizador', now(), now()),
  (gen_random_uuid()::text, 'ORGANIZER_STAFF', 'Operador do Organizador', 'Acesso operacional restrito (ex: check-in) dentro de um organizador', now(), now()),
  (gen_random_uuid()::text, 'PLATFORM_ADMIN', 'Administrador da Plataforma', 'Gestao global do SeaPass (aprovacao de organizadores, moderacao)', now(), now())
ON CONFLICT ("key") DO NOTHING;

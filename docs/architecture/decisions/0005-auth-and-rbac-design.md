# ADR-0005: Autenticação e RBAC — decisões de design

## Status
Aceito

## Contexto
O SeaPass precisa autenticar 4 perfis (Passenger, Organizer Admin, Organizer Staff, Platform
Admin) e controlar acesso tanto por papel quanto por posse de recurso (um organizador só edita
os próprios cruzeiros). A stack já havia decidido "JWT (access + refresh)" em
`docs/architecture/stack-and-structure.md`, mas não o formato exato do refresh token nem como o
RBAC seria modelado — isso é o que este ADR fecha.

## Decisões

### Refresh token opaco + hash HMAC, não um segundo JWT
Um refresh token JWT autocontido não pode ser revogado sem um blocklist (o que anula a vantagem
de ser stateless). Como logout/rotação/revogação precisam ser imediatos e reais, o refresh token
é um valor aleatório opaco (`crypto.randomBytes`), guardado no banco só como hash HMAC-SHA256
(nunca em texto puro — mesmo princípio de nunca guardar senha em claro). `JWT_REFRESH_SECRET`
funciona como pepper do HMAC, não como chave de assinatura de JWT.

### Refresh token em cookie httpOnly, access token no corpo da resposta
O access token vai no corpo da resposta (o frontend guarda em memória, nunca em
`localStorage`/`sessionStorage` — evita roubo via XSS). O refresh token vai em cookie `httpOnly`,
`sameSite=lax`, escopado a `path=/auth` — inacessível a JavaScript do browser e nunca reenviado
para fora dos próprios endpoints de auth. CORS já está configurado com `credentials: true` desde
o bootstrap (`main.ts`) para suportar isso entre `localhost:3000` e `localhost:3333`.

### Rotação de refresh token com detecção de reuso
Cada `/auth/refresh` revoga o token apresentado e emite um par novo (rotação). Se um token já
revogado for reapresentado, é tratado como sinal de roubo de sessão: todos os refresh tokens
ativos do usuário são revogados imediatamente, forçando novo login em todos os dispositivos.
Verificado com teste de integração real (não só unitário) — ver `test/integration/auth.e2e-spec.ts`.

### RBAC via tabela `Role` + `UserRole`, não enum fixo em `User`
Já decidido na modelagem de dados (ver `docs/product/BACKLOG.md`); este ADR só reafirma o motivo
no contexto de autenticação: `UserRole.organizerId` opcional é o que permite um mesmo usuário ter
o papel `ORGANIZER_ADMIN` escopado a um organizador específico, sem precisar de uma tabela
separada de "admins por organizador". Nenhuma tabela `Permission` dinâmica — os 4 papéis são
fixos e checados em código (`RolesGuard` + `@Roles(...)`).

### Guards globais, "seguro por padrão"
`JwtAuthGuard` e `RolesGuard` são registrados globalmente via `APP_GUARD`, não por controller.
Toda rota exige token válido a menos que explicitamente marcada `@Public()`. A alternativa (opt-in
por controller) foi descartada porque um endpoint novo esquecido de proteger fica **aberto** por
omissão — o oposto do que se quer. **Custo real dessa escolha**: ao implementar o RBAC, esquecer
de marcar `HealthController` como `@Public()` quebrou o health check (passou a exigir token) —
pego imediatamente ao testar manualmente com `curl` contra a API real, corrigido antes de seguir.
Fica registrado aqui como lembrete: guard global por padrão é mais seguro, mas exige auditar toda
rota pública existente ao introduzi-lo.

### Controle de posse de recurso no service, não num guard genérico
Verificação de "este cruzeiro pertence ao organizador do chamador" é código explícito no service
(`CruisesService.findByIdForOrganizer`, etc.), não um guard genérico por reflection. Mais
verboso, mas cada regra de posse é auditável lendo o método — não haveria um jeito realmente
genérico de expressar "compare `recurso.organizerId` com o do token" para recursos com formas de
posse diferentes (`Cruise.organizerId` direto, `Ticket` posse via `bookingGuest.booking.cruise.organizerId`)
sem herança de reflection difícil de revisar. Quando o recurso não pertence ao chamador, a
resposta é `404`, não `403` — evita confirmar a outro organizador que o recurso existe.

### Validação com Zod aplicada ao parâmetro, não ao método
`@UsePipes(pipe)` no nível do método do NestJS aplica o pipe a **todos** os parâmetros do
handler — incluindo `@CurrentUser()` (decorator customizado) e `@Param()`, não só `@Body()`. Isso
quebrou de verdade `POST /organizers/me/staff` durante o teste manual (o Zod tentava validar o
payload do JWT contra o schema do corpo da requisição e falhava com "password: Required"). Todos
os controllers foram corrigidos para aplicar o pipe direto no parâmetro:
`@Body(new ZodValidationPipe(Schema)) body: Input`, que só afeta aquele parâmetro.

### Catálogo de papéis (`roles`) mora numa migration, não só no seed de demonstração
O CI (`.github/workflows/ci.yml`, job `integration-tests`) roda `pnpm db:migrate` antes dos
testes, mas **nunca** `pnpm db:seed` — o seed é dado de demonstração (organizadores, navio,
cruzeiro de exemplo), não algo que faça sentido rodar em CI. O problema: como todo cadastro
(`register`/`register/organizer`) depende de `role.findUniqueOrThrow({ where: { key } })`, e as 4
linhas de `roles` só existiam via seed, **nenhum cadastro funcionaria em CI**, mesmo com a
migration em dia — um banco corretamente migrado ainda seria incapaz de autenticar ninguém. Isso
só não apareceu rodando os testes localmente porque o Postgres usado para testar já tinha sido
semeado numa etapa anterior do desenvolvimento.

Corrigido tratando o catálogo de papéis como o que ele é — **dado de referência obrigatório**,
não dado de demonstração — movendo-o para dentro de uma migration
(`20260902210000_seed_core_roles`, `INSERT ... ON CONFLICT ("key") DO NOTHING`). `pnpm db:seed`
continua populando as mesmas 4 linhas via upsert (redundante-mas-inofensivo, não depende de rodar
depois da migration). Verificado reproduzindo o cenário exato do CI: banco novo → só
`prisma migrate deploy` (sem seed) → suíte de integração inteira → 14/14 testes passam.

## Consequências
- Logout e revogação de sessão são imediatos e reais (não dependem de esperar o access token
  expirar).
- Roubo de refresh token é detectável e mitigado automaticamente (reuso revoga tudo).
- Adicionar um novo endpoint protegido por papel é uma linha (`@Roles(...)`); esquecer de marcar
  um endpoint como público quebra visivelmente em teste manual/automatizado, não silenciosamente
  em produção.
- Toda a superfície de auth (registro, login, refresh, logout, reset de senha, RBAC, posse de
  recurso, 401 vs 403) foi testada de ponta a ponta contra Postgres/Redis reais, não só com mocks
  — ver `test/integration/auth.e2e-spec.ts` e `test/integration/rbac.e2e-spec.ts`.

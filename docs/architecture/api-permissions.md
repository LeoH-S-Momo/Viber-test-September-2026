# SeaPass — Autenticação, Autorização e Matriz de Permissões da API

> Complementa [`docs/architecture/stack-and-structure.md`](stack-and-structure.md). Documenta como
> autenticação/RBAC foram implementados e exatamente quais endpoints cada perfil pode acessar.

---

## 1. Modelo de autenticação

- **Access token**: JWT assinado (`JWT_ACCESS_SECRET`), vida curta (`JWT_ACCESS_EXPIRES_IN`,
  padrão 15 min). Enviado pelo cliente como `Authorization: Bearer <token>`. O payload já inclui
  os papéis do usuário (`roles: [{ key, organizerId }]`), então checar permissão não exige
  consulta ao banco a cada request.
- **Refresh token**: **opaco** (não é um JWT) — 48 bytes aleatórios, gerado com
  `crypto.randomBytes`. Guardado no banco (`refresh_tokens`) apenas como **hash HMAC-SHA256**
  (`JWT_REFRESH_SECRET` como pepper), nunca em texto puro. Entregue ao cliente via **cookie
  httpOnly** (`seapass_refresh_token`), `secure` em produção, `sameSite=lax`, escopado a
  `path=/auth` — nunca acessível a JavaScript no browser (mitiga roubo via XSS) e nunca enviado
  para fora dos próprios endpoints de auth.
- **Rotação + detecção de reuso**: cada `POST /auth/refresh` revoga o token apresentado e emite
  um par novo. Se um token **já revogado** for reapresentado (sinal de token roubado sendo
  reusado), a API revoga **todos** os refresh tokens ativos daquele usuário como defesa — força
  novo login em todo lugar.
- **Hash de senha**: `bcryptjs`, custo 10. Nunca texto puro, nunca reversível.
- **Troca de senha revoga sessões**: `POST /auth/reset-password` bem-sucedido revoga todos os
  refresh tokens do usuário (mesma lógica de "sessão pode estar comprometida").

## 2. RBAC

- 4 papéis fixos (`RoleKey`): `PASSENGER`, `ORGANIZER_ADMIN`, `ORGANIZER_STAFF`, `PLATFORM_ADMIN`
  — ver `docs/product/BACKLOG.md` para o porquê de não existir uma tabela `Permission` dinâmica.
- Um usuário pode ter múltiplos papéis (`UserRole`), cada um opcionalmente escopado a um
  organizador (`organizerId`) — é assim que `ORGANIZER_ADMIN`/`ORGANIZER_STAFF` sabem a qual
  organizador pertencem.
- **Protegido por padrão**: `JwtAuthGuard` é global (`APP_GUARD`) — toda rota exige token válido
  a menos que marcada com `@Public()`. Isso é deliberado: um endpoint esquecido sem decorator fica
  fechado, não aberto.
- **`@Roles(...)`**: `RolesGuard` (também global) bloqueia quando o handler declara papéis
  exigidos e o usuário não tem nenhum deles. Sem `@Roles`, qualquer usuário autenticado passa.
- **Controle por recurso**: além do papel, vários endpoints verificam **posse** do recurso (ex:
  um `ORGANIZER_ADMIN` só edita cruzeiros do próprio `organizerId`). Isso é feito explicitamente
  no service (não por um guard genérico) — mais simples de auditar que "mágica" por reflection.
  Quando o recurso pertence a outro organizador, a resposta é **404** (não 403), para não revelar
  a outro organizador que o recurso existe.
- **401 vs 403**: sem token (ou token inválido/expirado) → `401 Unauthorized`. Token válido mas
  sem o papel exigido → `403 Forbidden`. Essa distinção é verificada em teste de integração.

## 3. Tratamento de erros

- `AllExceptionsFilter` (global) garante que nenhum erro não tratado vaze detalhes internos —
  erros conhecidos do Prisma (`P2002` conflito de unicidade, `P2025` não encontrado) viram
  respostas HTTP limpas; qualquer outro erro vira `500` genérico, com o erro real só no log do
  servidor.
- **Sem enumeração de contas**: `/auth/login` retorna a mesma mensagem genérica
  ("Credenciais inválidas") tanto para e-mail inexistente quanto para senha errada.
  `/auth/forgot-password` sempre responde com sucesso, exista ou não o e-mail.
- Logs nunca incluem senha em texto puro (`redact` configurado no `pino-http` para
  `req.body.password`/`adminPassword`/`newPassword`).

## 4. Recuperação de senha (ambiente de desenvolvimento)

Não há serviço de e-mail integrado. `POST /auth/forgot-password` gera e persiste (hash) um token
de uso único e, **apenas quando `NODE_ENV !== "production"`**, devolve o token bruto no corpo da
resposta (`devToken`) e também loga como warning — para permitir demonstrar o fluxo completo
(`/auth/forgot-password` → `/auth/reset-password`) sem depender de um provedor de e-mail externo.
Em produção, `devToken` nunca aparece na resposta; o envio por e-mail é um passo a implementar
antes de operar contra usuários reais.

## 5. Matriz de permissões

`🌐` público (sem token) · `🔒` qualquer usuário autenticado · `Rn` papel específico

| Método | Rota | Quem acessa | Regra de posse do recurso |
|---|---|---|---|
| POST | `/auth/register` | 🌐 | — |
| POST | `/auth/register/organizer` | 🌐 | Cria `Organizer` com status `PENDING` |
| POST | `/auth/login` | 🌐 | — |
| POST | `/auth/refresh` | 🌐 (via cookie) | — |
| POST | `/auth/logout` | 🌐 (via cookie) | — |
| POST | `/auth/forgot-password` | 🌐 | — |
| POST | `/auth/reset-password` | 🌐 | — |
| GET | `/auth/me` | 🔒 | — |
| GET | `/health` | 🌐 | — |
| GET | `/cruises` | 🌐 | Só cruzeiros `PUBLISHED` |
| GET | `/cruises/:slug` | 🌐 | Só cruzeiros `PUBLISHED` |
| POST | `/cruises` | `ORGANIZER_ADMIN` | O `shipId` enviado precisa pertencer ao organizador do chamador |
| PATCH | `/cruises/:id` | `ORGANIZER_ADMIN` | O cruzeiro precisa pertencer ao organizador do chamador (404 se não) |
| POST | `/events` | `ORGANIZER_ADMIN` | O `cruiseId` enviado precisa pertencer ao organizador do chamador |
| POST | `/organizers/me/staff` | `ORGANIZER_ADMIN` | Sempre cria o staff no organizador do próprio chamador |
| GET | `/organizers/me/cruises/:cruiseId/occupancy` | `ORGANIZER_ADMIN` | Cruzeiro precisa pertencer ao chamador |
| GET | `/organizers/me/cruises/:cruiseId/sales` | `ORGANIZER_ADMIN` | Cruzeiro precisa pertencer ao chamador |
| GET | `/bookings/me` | `PASSENGER` | Sempre filtrado por `userId` do chamador |
| GET | `/tickets/me` | `PASSENGER` | Sempre filtrado pelas reservas do chamador |
| POST | `/tickets/:id/check-in` | `ORGANIZER_STAFF`, `ORGANIZER_ADMIN` | O ticket precisa pertencer a um cruzeiro do organizador do chamador |
| GET | `/admin/organizers` | `PLATFORM_ADMIN` | Acesso global |
| PATCH | `/admin/organizers/:id/approve` | `PLATFORM_ADMIN` | Acesso global |
| PATCH | `/admin/organizers/:id/suspend` | `PLATFORM_ADMIN` | Acesso global |
| GET | `/admin/audit-logs` | `PLATFORM_ADMIN` | Acesso global |

### Por perfil (o que cada um pode fazer hoje)

- **Passenger**: cadastro/login próprios; consultar catálogo de cruzeiros (público, não precisa
  nem de conta); ver suas próprias reservas e tickets. *(Criar reserva/pagamento fica para a
  próxima etapa — ver `docs/product/BACKLOG.md`.)*
- **Organizer (admin)**: tudo que um Organizer Staff faz, mais: criar/editar cruzeiros do próprio
  organizador, cadastrar eventos, convidar operadores (staff), consultar vendas e ocupação.
- **Staff (organizer)**: check-in de tickets nos cruzeiros do próprio organizador. Deliberadamente
  **não** pode convidar outro staff, criar cruzeiros nem ver vendas — isso é `ORGANIZER_ADMIN`.
- **Admin (plataforma)**: acesso global — listar/aprovar/suspender qualquer organizador, ver o
  audit log completo. Não tem (ainda) endpoints de escrita sobre cruzeiros/reservas de terceiros.

## 6. Documentação interativa (Swagger)

`GET /docs` — cada endpoint protegido está marcado com o cadeado do Swagger UI (`@ApiBearerAuth`).
Fluxo para testar manualmente: `POST /auth/login` → copiar `accessToken` da resposta → botão
"Authorize" no topo do Swagger UI → colar o token (sem prefixo `Bearer`, o Swagger adiciona
sozinho). O refresh token não aparece no Swagger porque viaja em cookie httpOnly, não em header.

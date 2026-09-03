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

### Auth / plataforma

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
| GET | `/admin/organizers` | `PLATFORM_ADMIN` | Acesso global |
| PATCH | `/admin/organizers/:id/approve` \| `/suspend` | `PLATFORM_ADMIN` | Acesso global |
| GET | `/admin/audit-logs` | `PLATFORM_ADMIN` | Acesso global |

### Catálogo — Ships / Decks / Cabin Categories / Cabins

| Método | Rota | Quem acessa | Regra de posse |
|---|---|---|---|
| GET | `/ships`, `/ships/:id` | 🌐 | — |
| POST | `/ships` | `ORGANIZER_ADMIN` | Cria para o organizador do chamador |
| PATCH | `/ships/:id` | `ORGANIZER_ADMIN` | Navio precisa pertencer ao chamador |
| GET | `/ships/:shipId/decks` | 🌐 | — |
| POST | `/ships/:shipId/decks` | `ORGANIZER_ADMIN` | Navio precisa pertencer ao chamador |
| PATCH | `/decks/:id` | `ORGANIZER_ADMIN` | Via navio do deck |
| GET | `/ships/:shipId/cabin-categories` | 🌐 | — |
| POST | `/ships/:shipId/cabin-categories` | `ORGANIZER_ADMIN` | Navio precisa pertencer ao chamador |
| PATCH | `/cabin-categories/:id` | `ORGANIZER_ADMIN` | Via navio da categoria |
| GET | `/decks/:deckId/cabins` | 🌐 | — |
| POST | `/decks/:deckId/cabins` | `ORGANIZER_ADMIN` | Deck precisa pertencer ao chamador |
| PATCH | `/cabins/:id` | `ORGANIZER_ADMIN` | Via deck/navio da cabine |

### Catálogo — Venues / Restaurants

| Método | Rota | Quem acessa | Regra de posse |
|---|---|---|---|
| GET | `/ships/:shipId/venues` | 🌐 | — |
| POST | `/ships/:shipId/venues` | `ORGANIZER_ADMIN` | Navio precisa pertencer ao chamador |
| PATCH | `/venues/:id` | `ORGANIZER_ADMIN` | Via navio do venue |
| GET | `/ships/:shipId/restaurants` | 🌐 | — |
| POST | `/ships/:shipId/restaurants` | `ORGANIZER_ADMIN` | Navio precisa pertencer ao chamador |
| PATCH | `/restaurants/:id` | `ORGANIZER_ADMIN` | Via navio do restaurante |

### Catálogo — Ports / Artists (dado de referência compartilhado)

| Método | Rota | Quem acessa | Por quê |
|---|---|---|---|
| GET | `/ports`, `/ports/:id` | 🌐 | — |
| POST/PATCH | `/ports`, `/ports/:id` | `PLATFORM_ADMIN` | Curadoria centralizada — porto não pertence a organizador |
| GET | `/artists`, `/artists/:id` | 🌐 | — |
| POST/PATCH | `/artists`, `/artists/:id` | `ORGANIZER_ADMIN` | Compartilhado entre organizadores, mas qualquer um pode cadastrar um novo ao montar sua programação |

### Catálogo — Cruises (o núcleo)

| Método | Rota | Quem acessa | Regra de posse / negócio |
|---|---|---|---|
| GET | `/cruises` | 🌐 | Só `PUBLISHED`, filtros ignoram `status` enviado |
| GET | `/cruises/:slug` | 🌐 | 404 se não for `PUBLISHED` |
| POST | `/cruises` | `ORGANIZER_ADMIN` | `shipId` precisa pertencer ao chamador |
| PATCH | `/cruises/:id` | `ORGANIZER_ADMIN` | Cruzeiro precisa pertencer ao chamador. **Não** inclui `status` |
| POST | `/cruises/:id/pricing` | `ORGANIZER_ADMIN` | Cruzeiro do chamador; categoria precisa ser do mesmo navio |
| POST | `/cruises/:id/publish` | `ORGANIZER_ADMIN` | Cruzeiro do chamador **e** precisa estar `DRAFT` com ≥1 escala e ≥1 preço (409 se não) |
| POST | `/cruises/:id/unpublish` | `ORGANIZER_ADMIN` | Cruzeiro do chamador **e** precisa estar `PUBLISHED` (409 se não) |
| GET | `/cruises/:cruiseId/itinerary-stops` | 🌐 | — |
| POST | `/cruises/:cruiseId/itinerary-stops` | `ORGANIZER_ADMIN` | Cruzeiro precisa pertencer ao chamador |
| PATCH | `/itinerary-stops/:id` | `ORGANIZER_ADMIN` | Via cruzeiro da escala |
| GET | `/events` (filtros `cruiseId`, `category`), `/events/:id` | 🌐 | — |
| POST | `/events` | `ORGANIZER_ADMIN` | `cruiseId` precisa pertencer ao chamador; venue precisa ser do mesmo navio |
| PATCH | `/events/:id` | `ORGANIZER_ADMIN` | Via cruzeiro do evento |
| GET | `/cruises/:cruiseId/experiences` | 🌐 | — |
| POST | `/experiences` | `ORGANIZER_ADMIN` | `cruiseId` precisa pertencer ao chamador |
| PATCH | `/experiences/:id` | `ORGANIZER_ADMIN` | Via cruzeiro da experiência |
| GET | `/organizers/me/cruises` (filtros + `status`) | `ORGANIZER_ADMIN` | Só os próprios — em **qualquer** status, diferente do `/cruises` público |
| GET | `/organizers/me/cruises/:cruiseId/occupancy` \| `/sales` | `ORGANIZER_ADMIN` | Cruzeiro precisa pertencer ao chamador |

**Filtros de `GET /cruises`** (e `/organizers/me/cruises`): `theme`, `destination` (nome do porto
de embarque OU de qualquer escala, case-insensitive, sensível a acento), `embarkationFrom`/`embarkationTo`,
`minPrice`/`maxPrice` (contra qualquer categoria de cabine do cruzeiro), `organizerId`, `status`
(só o endpoint do organizador honra), `page`/`pageSize` (paginado sempre), `sortBy`
(`embarkationDate`|`title`|`createdAt`|`price`) + `sortOrder` (`asc`|`desc`).

### Reservas / Tickets (leitura — checkout ainda não implementado)

| Método | Rota | Quem acessa | Regra de posse |
|---|---|---|---|
| GET | `/bookings/me` | `PASSENGER` | Sempre filtrado por `userId` do chamador |
| GET | `/tickets/me` | `PASSENGER` | Sempre filtrado pelas reservas do chamador |
| POST | `/tickets/:id/check-in` | `ORGANIZER_STAFF`, `ORGANIZER_ADMIN` | Ticket precisa ser de um cruzeiro do organizador do chamador |
| POST | `/organizers/me/staff` | `ORGANIZER_ADMIN` | Sempre cria o staff no organizador do próprio chamador |

### Por perfil (o que cada um pode fazer hoje)

- **Passenger**: cadastro/login próprios; descobrir o catálogo inteiro (cruzeiros publicados,
  navios, itinerário, eventos, restaurantes, experiências — tudo público, não precisa nem de
  conta); ver suas próprias reservas e tickets. *(Criar reserva/pagamento fica para a próxima
  etapa — ver `docs/product/BACKLOG.md`.)*
- **Organizer (admin)**: tudo que um Organizer Staff faz, mais: gerenciar o navio inteiro (decks,
  cabines, categorias, venues, restaurantes); criar/editar/publicar/despublicar os próprios
  cruzeiros com itinerário, preço e eventos; convidar operadores (staff); consultar vendas e
  ocupação. Tudo escopado ao próprio organizador — nunca vê ou edita recurso de outro (404, não
  403, quando tenta).
- **Staff (organizer)**: check-in de tickets nos cruzeiros do próprio organizador. Deliberadamente
  **não** pode convidar outro staff, gerenciar navio/cruzeiro nem ver vendas — isso é
  `ORGANIZER_ADMIN`.
- **Admin (plataforma)**: acesso global — listar/aprovar/suspender qualquer organizador, curar o
  catálogo de portos, ver o audit log completo. Não tem (ainda) endpoints de escrita sobre
  cruzeiros/reservas de terceiros.

## 6. Documentação interativa (Swagger)

`GET /docs` — cada endpoint protegido está marcado com o cadeado do Swagger UI (`@ApiBearerAuth`).
Fluxo para testar manualmente: `POST /auth/login` → copiar `accessToken` da resposta → botão
"Authorize" no topo do Swagger UI → colar o token (sem prefixo `Bearer`, o Swagger adiciona
sozinho). O refresh token não aparece no Swagger porque viaja em cookie httpOnly, não em header.

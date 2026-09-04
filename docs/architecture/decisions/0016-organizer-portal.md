# ADR-0016: Portal do organizador (dashboard, gestão de catálogo e isolamento multi-tenant)

## Status
Aceito

## Contexto
Até esta etapa o organizador só tinha, no frontend, a tela de check-in do Staff — toda a gestão do
próprio catálogo (navios, cruzeiros, eventos, restaurantes, experiências) só existia via API, sem
interface nenhuma, e não havia visão nenhuma de negócio (receita, ocupação, reservas). O pedido é
explícito: um painel completo — Dashboard, Cruzeiros, Navios, Eventos, Restaurantes, Experiências,
Reservas, Passageiros, Relatórios — com **isolamento de dados garantido no backend** (Organizer A
nunca visualiza ou altera dados do Organizer B) e testes dedicados a essa garantia.

## O que já existia vs. o que é novo
A maior parte do catálogo (Ships/Cruises/Events/Restaurants/Experiences) já tinha `POST`/`PATCH`
com checagem de posse (`findOwnedByOrganizerOrThrow`/`findByIdForOrganizer`, sempre `404`, nunca
`403`, para não revelar a existência do recurso a quem não é dono — ver ADR-0005) — mas **nenhuma
rota "minhas coisas"** existia para Eventos, Restaurantes ou Experiências (só Ships tinha um filtro
`?organizerId=`, e Cruises já tinha `/organizers/me/cruises`), e **reservas/passageiros nunca foram
expostos a um organizador** — só ao próprio passageiro (`/bookings/me`). Dashboard/relatórios
também não existiam, além de duas métricas já prontas (`.../occupancy`, `.../sales`, escopadas a UM
cruzeiro por vez).

## Isolamento multi-tenant — sempre no `where`, nunca depois da consulta
Princípio único, aplicado em toda rota nova: o filtro de organizador entra na condição da própria
consulta Prisma (`cruise: { organizerId }`, `ship: { organizerId }`), nunca como um `.filter()`
depois de buscar tudo. Um `cruiseId`/`shipId` de outro organizador passado como filtro opcional
(`GET /organizers/me/bookings?cruiseId=...`, `.../dashboard?cruiseId=...`) nunca "vaza" dados
alheios: a condição combinada (`organizerId` MEU **e** `cruiseId` pedido) simplesmente não bate com
nenhuma linha do outro organizador. Ainda assim, cada rota que aceita um `cruiseId` explícito chama
`requireOwnedCruise` primeiro — não porque a consulta precisasse disso pra ser segura, mas para
devolver um `404` claro (mesma convenção do resto do catálogo) em vez de uma lista vazia silenciosa
quando o id pedido é de outro organizador.

`OrganizersService.getDashboard` leva isso ao extremo: `cruiseIds` (a lista usada em TODA consulta
subsequente) é sempre derivado de `organizerId` primeiro — todos os cruzeiros do organizador, ou
apenas um já validado por `requireOwnedCruise` — nunca de um id cru vindo da query. Isolamento por
construção, não por checagem espalhada.

## Dashboard — as dez métricas pedidas
`GET /organizers/me/dashboard` (filtros opcionais `cruiseId`, `from`, `to`):
- **Receita**, **ticket médio**: somadas/derivadas das reservas `CONFIRMED` no período (por
  `confirmedAt`, não `createdAt` — é quando o dinheiro de fato entrou).
- **Reservas**: total criado no período (`createdAt`) + quantas confirmaram, separadamente — a
  diferença entre os dois já é um sinal de conversão.
- **Cancelamentos**: contagem de `CANCELLED` por `cancelledAt` no período.
- **Passageiros**: `BookingGuest` das reservas confirmadas em escopo.
- **Ocupação** (geral e por categoria de cabine): cada cruzeiro conta sua própria capacidade —
  a mesma cabine física pode aparecer em cruzeiros (sailings) diferentes, cada um com seu próprio
  inventário vendável, então a capacidade nunca é deduplicada entre cruzeiros.
- **Vendas por período**: reservas confirmadas agrupadas por dia (`confirmedAt`), calculado em
  JavaScript (não SQL bruto) — o volume de dados de um organizador não justifica a complexidade
  extra de uma agregação por data no Postgres.
- **Eventos/experiências mais procurados**: `groupBy` de `EventReservation`/`BookingExperience`,
  ordenado por soma de `partySize`, com filtro relacional (`event: { cruiseId: { in: cruiseIds } }`)
  — o mesmo princípio de isolamento por construção.

## Arquitetura: tudo dentro de `OrganizersController`, reutilizando os services do catálogo
Em vez de duplicar lógica de posse em cada módulo, as novas rotas "minhas coisas" moram no
`OrganizersController` já existente (`/organizers/me/...`) e delegam para os services do catálogo
(`ShipsService.findMany(organizerId)` já existia pronto; `EventsService`/`RestaurantsService`/
`ExperiencesService` ganharam um `findManyForOrganizer` novo cada, filtrando por `cruise.organizerId`/
`ship.organizerId`). `CatalogModule` passou a exportar esses três services (antes só exportava
`ShipsService`/`CruisesService`) para o `OrganizersModule` poder injetá-los. Reservas e passageiros
(`listBookings`/`listPassengers`) são novos em `OrganizersService`, seguindo o mesmo padrão de
paginação (`toPageResult`/`toSkipTake`) já usado no resto do catálogo.

Todas as rotas são `@Roles(RoleKey.ORGANIZER_ADMIN)` — Staff continua restrito a check-in, mesma
fronteira de responsabilidade já estabelecida.

## Frontend: barra lateral + páginas por área
`apps/web/src/app/(organizer)/organizador/` ganhou um `layout.tsx` (Container + barra lateral,
`features/organizer/organizer-sidebar.tsx`) que só aparece para `ORGANIZER_ADMIN` — Staff continua
vendo `/organizador/check-in` em tela cheia, sem a barra lateral, sem mudança nenhuma no fluxo já
verificado em ADR-0013. Nove páginas novas (Dashboard, Cruzeiros, Novo Cruzeiro, Editar Cruzeiro,
Navios, Eventos, Restaurantes, Experiências, Reservas, Passageiros, Relatórios), cada uma protegida
por `<RequireRole roles={['ORGANIZER_ADMIN']}>` — o layout decide se mostra a barra lateral, nunca
substitui essa checagem por página.

**Gráficos** (`recharts`, novo na dependência do `apps/web`) seguindo a skill de visualização de
dados deste ambiente: um eixo só por gráfico (nunca dois eixos-Y); vendas por período como barra de
série única; ocupação por categoria como barra empilhada de duas séries (Reservado/Disponível, azul
+ cinza neutro, sempre com legenda); eventos/experiências mais procurados como ranking horizontal de
série única, cor uniforme (a identidade já vem do rótulo no eixo, não da cor). Paleta categórica
validada pela própria skill (`scripts/validate_palette.js`) — a paleta de marca do produto
(`brand-*`, um teal desaturado) falhou o piso de croma do validador para uso em marca de gráfico, daí
a escolha de cores específicas de gráfico (azul/laranja/aqua) em vez de reaproveitar `brand-*`
diretamente; `accent-*`/`brand-*` continuam exclusivos do resto da interface (botões, badges).

## "Criar e editar seus cruzeiros através de formulários reais"
Único form explicitamente pedido — `cruzeiros/novo` (navio, título, tema, descrição, datas, portos
de embarque/desembarque) e `cruzeiros/[id]` (os mesmos campos editáveis, exceto `shipId` — trocar de
navio depois de criado não é suportado pelo backend de propósito, `UpdateCruiseSchema` não tem esse
campo) mais um painel de precificação por categoria de cabine (`POST .../pricing`) e o botão
publicar/despublicar — sem isso o organizador nunca conseguiria tirar um cruzeiro novo do estado
`DRAFT`, já que `CreateCruiseSchema` não aceita preço na criação. Navios, Eventos, Restaurantes e
Experiências também ganharam formulários reais de criação (não só leitura) — não eram estritamente
pedidos por nome, mas sem eles o organizador não conseguiria popular o catálogo por trás dos
cruzeiros que o pedido pede pra gerenciar; edição desses quatro fica fora de escopo desta etapa.

## Testes de autorização multi-tenant
`apps/api/test/integration/organizer-portal.e2e-spec.ts` (30 testes): cria DOIS organizadores
completos (A e B, cada um com navio/cruzeiro/evento/restaurante/experiência/reserva confirmada
próprios) e prova, pra cada rota nova, que A nunca vê nada de B (`GET` das sete listas "minhas coisas"
+ dashboard, incluindo o caso de passar o `cruiseId` de B como filtro — sempre `404`, nunca os dados
dele). Também estende a cobertura pra rotas de ESCRITA do catálogo que já tinham a checagem de posse
no código mas nunca tinham sido testadas isoladamente (Decks, CabinCategories, Cabins, Venues — só
Cruises/Ships/Events/Experiences já tinham algum teste antes desta etapa): PATCH/POST em qualquer
recurso de B usando o token de A sempre `404` (ou `403` no caso pontual de `DiningSlot`, que diverge
da convenção — divergência pré-existente, não corrigida aqui por não ter sido pedida, só documentada).
Setup dos dois organizadores é **sequencial** (não `Promise.all`) — mesma lição de ADR-0014/0015:
duas rajadas simultâneas de dezenas de conexões HTTP no setup produzem `ECONNRESET` esporádico no
loopback do Windows, sem relação com a lógica sob teste.

## Consequências
- **Infraestrutura local precisou ser reconstruída ao retomar a sessão** — Postgres/Redis não
  estavam mais acessíveis (nem Docker, nem WSL, nem instalação nativa encontrada). Resolvido com
  PostgreSQL 17 nativo (via `winget`, funcionou de primeira) e um build portátil de Redis para
  Windows (zip sem instalador — o MSI do Memurai falhou por uma ACL quebrada em
  `C:\Windows\Temp` nesta máquina, não relacionada ao projeto). Com a infra de pé, a suíte de
  integração completa rodou 100% (115 testes, 11 suítes) contra dados reais, isolamento multi-tenant
  incluso — ver `docs/DEVLOG.md` para o relato completo.
- Editar Navios/Eventos/Restaurantes/Experiências (não só criar) fica para uma etapa futura — o
  pedido original citava "criar e editar" só para cruzeiros.
- `DiningSlot` continua com a divergência de `403` em vez de `404` em posse cruzada — sinalizado,
  não corrigido, por ser um ajuste de convenção fora do pedido desta etapa.

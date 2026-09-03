# ADR-0008: Mapa interativo do navio (decks, cabines, instalações)

## Status
Aceito

## Contexto
Pedido explícito por um dos "principais diferenciais visuais" do produto: um mapa navegável por
deck, mostrando cabines, teatro, restaurantes, bares, piscinas, áreas de lazer e outras venues,
com zoom, seleção de cabine/instalação, tooltip, painel de detalhe, legenda e estados reais de
disponibilidade de cabine — sem "criar um componente impossível de manter" e com dados/visual/regra
de negócio separados.

O catálogo já tinha `Deck` e `Cabin` como entidades reais (não só `CabinCategory` — ver
[ADR-0006](0006-catalog-layering.md)), cada `Cabin` com `code`, `status` (ACTIVE/MAINTENANCE/
RETIRED) e uma `CabinCategory`. `Venue`/`Restaurant` já tinham `deckId` opcional. O que faltava:
qualquer dado espacial (posição/geometria) para desenhar uma planta, uma forma de calcular
disponibilidade de cabine por cruzeiro (nunca implementada), e uma categorização de `Venue` que
distinguisse teatro/bar/piscina/lounge/área de lazer (hoje só um nome livre).

## Decisão 1: geometria calculada, não armazenada
Nenhum campo de coordenada (x/y/largura/altura) foi adicionado a `Cabin`, `Deck`, `Venue` ou
`Restaurant`. Em vez disso, `apps/web/src/features/ship-map/layout/deck-layout-engine.ts` é uma
função pura — `computeDeckLayout(deck)` — que recebe os dados reais do deck (cabines agrupadas por
categoria, venues, restaurantes) e calcula uma planta esquemática determinística: casco do navio
como uma silhueta fixa (`hull-shape.ts`), cabines em duas faixas (bombordo/boreste) ao longo do
casco, e venues/restaurantes empacotados no espaço central por um algoritmo simples "em
prateleiras" (shelf packing).

**Por quê:** o pedido é explícito — "não precisa representar um navio real com precisão
arquitetônica, mas deve parecer uma representação plausível e profissional." Armazenar coordenadas
exigiria autoria manual por cabine/venue (não escala para navios cadastrados por organizadores no
futuro, e não há editor de planta no escopo) ou dados fabricados sem significado real, o que
contradiria "integre com a API real" — coordenadas inventadas não são "reais", so decoração. A
função de layout deriva tudo de dados genuinamente cadastrados (categoria, quantidade de cabines,
capacidade de venue), é pura (sem React/DOM, testável isoladamente — ver
`deck-layout-engine.test.ts`, 8 casos cobrindo agrupamento por categoria, ausência de sobreposição,
clamping de largura e determinismo) e funciona automaticamente para qualquer novo navio/deck sem
trabalho de autoria extra.

## Decisão 2: `Venue.type` — categorização real, não decorativa
Adicionado `enum VenueType { THEATER LOUNGE BAR POOL LEISURE OTHER }` e a coluna
`Venue.type` (migration `20260903125431_add_venue_type`, default `OTHER`). Sem isto, não havia
como o mapa (ou a legenda, ou o ícone no tooltip) distinguir "teatro" de "bar" de "piscina" — só
um nome livre em `Venue.name`. Os venues de seed existentes foram reclassificados (Teatro Ondas →
THEATER, Lounge Riff → LOUNGE, Palco do Deck → LEISURE) e dois novos foram adicionados (Bar Maré
Alta → BAR, Piscina Vista Mar → POOL) para que todas as categorias pedidas explicitamente
("bares", "piscinas", "áreas de lazer") tenham pelo menos um exemplo real no mapa, não inventado
no frontend.

## Decisão 3: disponibilidade de cabine — 4 estados, calculados por cruzeiro
Novo endpoint público `GET /cruises/:slug/deck-map` (`CruisesController.deckMap` →
`CruisesService.getDeckMap`) retorna os decks do navio com cada cabine anotada com `price`
(cruzado com `CruiseCabinPricing` da categoria, para ESTE cruzeiro) e `availability`, um de
`AVAILABLE | ON_HOLD | BOOKED | UNAVAILABLE`, resolvido por `CabinAvailabilityPolicy` (domain puro,
`apps/api/.../catalog/domain/cabin-availability.policy.ts`, testado isoladamente):

- `UNAVAILABLE` — `Cabin.status !== ACTIVE` (manutenção/aposentada), independente de reserva.
- `BOOKED` — existe `Booking` `CONFIRMED` para esta cabine neste cruzeiro.
- `ON_HOLD` — existe `Booking` `PENDING` cujo `holdExpiresAt` ainda não passou.
- `AVAILABLE` — nenhum dos casos acima, **incluindo** um hold `PENDING` já expirado (mesma regra
  já documentada no comentário de `Booking.holdExpiresAt` no schema: "expirado, a reserva volta
  para disponível se nunca sair de PENDING" — esta é a primeira funcionalidade a de fato consumir
  essa regra).

Isto não é apenas leitura de um campo: `CabinsRepository.findActiveBookingsForCruise` busca as
reservas `PENDING`/`CONFIRMED` do cruzeiro e o service cruza por `cabinId` — a mesma cabine física
pode estar `BOOKED` num cruzeiro e `AVAILABLE` noutro, o que só faz sentido calculado por sailing,
nunca como propriedade isolada da cabine.

**Dados de demonstração**: o seed agora cria uma reserva `CONFIRMED` (cabine 6202 → BOOKED), uma
`PENDING` com hold válido por 10 minutos a partir do momento do seed (cabine 8302 → ON_HOLD,
renovado a cada reseed) e marca uma cabine como `MAINTENANCE` (10402 → UNAVAILABLE) — sem isto, os
4 estados nunca apareceriam de fato na UI, só na teoria.

## Decisão 4: seleção de cabine preparada para checkout, não implementada
`ShipMap` aceita um prop opcional `onSelectCabin?: (cabin, deck) => void`. Quando fornecido, o
painel de detalhe da cabine mostra um botão "Selecionar cabine" (desabilitado se a cabine não
estiver `AVAILABLE`) que invoca o callback. A página de detalhe do cruzeiro (uso atual, só
informativo) não passa esse prop — o mapa funciona hoje puramente como visualização/consulta. Isto
é o ponto de extensão pedido ("prepare a arquitetura para posteriormente permitir seleção de
cabine no checkout") sem construir nenhuma lógica de checkout real (fora de escopo, como já
definido em turnos anteriores desta conversa) nem estado especulativo (não há Context/Provider
global — a seleção vive como state local de `ShipMap`, promovida a Context só se/quando um
segundo consumidor precisar dela).

## Decisão 5: separação dados / visualização / regra de negócio
- **Dados**: `types/ship-map.ts` (tipos espelhando a resposta real da API) e
  `services/ship-map.service.ts` (fetch, mesmo padrão `ServiceResult<T>` do ADR-0007 — reaproveitado
  via um novo `lib/api-client.ts` compartilhado, para não duplicar `getApiBaseUrl`/tratamento de
  404 entre `cruises.service.ts` e `ship-map.service.ts`).
- **Regra de negócio derivada (mas ainda "dado", não visual)**: `layout/deck-layout-engine.ts` —
  geometria pura, sem React.
- **Visualização**: um componente por responsabilidade — `deck-selector`, `deck-plan` (orquestra
  SVG + zoom/pan via `use-zoom-pan.ts`, um hook próprio de ~60 linhas em vez de uma dependência
  nova, dado o escopo pequeno), `deck-plan-cabin`/`deck-plan-facility` (um elemento cada),
  `map-tooltip`, `map-detail-panel`, `map-legend`. Nenhum arquivo ultrapassa uma única
  responsabilidade clara — o objetivo explícito de "evitar um componente impossível de manter".

## Achado técnico real: `fill-*`/`stroke-*` do Tailwind não afetam elementos HTML comuns
Durante a verificação visual (Playwright), o casco do navio e as cabines apareciam pretos/sem cor
— rastreado a duas causas: (1) o dev server do Next, rodando havia horas com dezenas de edições
nesta conversa, tinha o pipeline de CSS corrompido (`.css` do HMR devolvendo 404) — resolvido
reiniciando o processo com `.next` limpo; (2) um bug real: a legenda de disponibilidade reusava as
mesmas classes `fill-emerald-200 stroke-emerald-600` definidas para os `<rect>` SVG num `<span>`
HTML comum — `fill`/`stroke` são propriedades CSS que só têm efeito em elementos SVG, então o swatch
da legenda não tinha cor nenhuma. Corrigido separando `className` (SVG) de `swatchClassName`
(HTML, `bg-*`/`border-*`) em `availability-meta.ts`.

## Consequências
- Qualquer novo navio/deck cadastrado pelo organizador (via `POST /ships/:id/decks` e
  `POST /decks/:id/cabins`, já existentes) ganha automaticamente uma planta plausível no mapa, sem
  nenhum trabalho de autoria de layout.
- `Venue.type` é um campo real de catálogo agora, não só usado pelo mapa — outras superfícies
  (busca/filtro por tipo de venue, por exemplo) podem reaproveitá-lo depois.
- A disponibilidade calculada aqui é a mesma que um futuro fluxo de checkout precisará reutilizar
  — `CabinAvailabilityPolicy` já existe isolada em `domain/`, pronta para ser chamada também na
  validação de "esta cabine ainda está livre?" no momento de criar uma reserva.
- Cobertura de teste em 3 camadas: `cabin-availability.policy.spec.ts` (8 casos, domínio puro),
  `deck-layout-engine.test.ts` (8 casos, geometria pura), teste de integração real em
  `catalog.e2e-spec.ts` (cria deck/cabine/reserva via Prisma+API contra Postgres real e verifica
  `GET /cruises/:slug/deck-map`), e `tests/e2e/ship-map.spec.ts` (Playwright, troca de deck,
  seleção de cabine, legenda) — mais inspeção visual manual dos 4 estados de disponibilidade,
  zoom, tooltip e responsividade mobile.

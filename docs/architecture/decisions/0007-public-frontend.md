# ADR-0007: Frontend público (descoberta e detalhe de cruzeiros)

## Status
Aceito

## Contexto
O pedido foi para um frontend público "que pareça um produto real de turismo/eventos, não um
CRUD administrativo": Home, exploração de cruzeiros com busca/filtros, e página de detalhe
completa (hero, itinerário, atrações, eventos, experiências, restaurantes, categorias de
cabine), com estados explícitos de loading/erro/vazio/sucesso e integração real com a API
(sem dados mockados onde a API já existe).

## Decisão: Server Components + `searchParams` na URL, não TanStack Query
As páginas de listagem (`/cruzeiros`) e detalhe (`/cruzeiros/[slug]`) são Server Components que
leem os parâmetros de busca (Next 15: `searchParams`/`params` chegam como `Promise`, precisam de
`await`) e chamam a API diretamente no servidor via `fetch` com `next: { revalidate: 30 }`
(ISR-like). Os filtros (`CruiseFilters`) são um Client Component que só manipula a URL via
`router.push` — todo o estado de busca vive na URL, não em client state.

**Por que não TanStack Query (usado em outras partes do projeto para client state):** a listagem
e o detalhe são conteúdo primariamente de leitura, indexável e compartilhável por link — uma
página de catálogo de turismo se beneficia de SSR real (HTML já populado no primeiro request,
URL como fonte da verdade dos filtros, sem cascata de loading no cliente). TanStack Query faria
sentido para partes autenticadas/interativas do produto (carrinho, minha conta), não para o
catálogo público.

## Decisão: tipos TypeScript simples (não Zod) para as respostas de leitura
`src/types/cruise.ts` define `interface`s que espelham o formato real devolvido por
`GET /cruises` e `GET /cruises/:slug` — não são schemas Zod como os DTOs de escrita
(`packages/contracts`). Não há validação de runtime nessas respostas.

**Justificativa:** são dados de exibição, não de entrada do usuário; o formato é controlado pelo
mesmo monorepo dos dois lados (frontend e backend evoluem juntos, tipos quebram em typecheck se
divergirem). Validar em runtime aqui teria custo (bundle, CPU) sem ganho real de segurança — ao
contrário de um formulário de reserva/pagamento, onde a entrada vem de fora e Zod se justifica.

## Decisão: padrão `ServiceResult<T>` em vez de lançar exceções
`src/services/cruises.service.ts` nunca deixa uma falha de rede/API vazar como exceção não
tratada — todo fetch é envolvido em `try/catch` e retorna
`{ ok: true, data } | { ok: false, message }`. Cada página decide o que fazer com `ok: false`
(renderiza `<ErrorState>` inline) e distingue "API fora do ar" (`ok: false`) de "recurso não
encontrado" (`ok: true, data: null`, que dispara `notFound()` do Next.js) — dois estados
diferentes que a UI trata de forma diferente (erro genérico vs. página 404 dedicada).

## Decisão: primitivos de UI em `apps/web/src/components/ui/`, não em `packages/ui`
Os componentes de UI genéricos (`Button`, `Badge`, `Skeleton`, `Container`, `EmptyState`,
`ErrorState`, `CoverArt`, `SectionHeading`) vivem dentro de `apps/web`, não no workspace
`packages/ui` já existente no monorepo.

**Justificativa:** Tailwind v4 escaneia automaticamente a árvore de arquivos do próprio app em
busca de classes utilizadas; componentes vivendo num package irmão exigiriam configuração
adicional (`@source` explícito) para não terem suas classes podadas do CSS final. Como nenhum
outro app do monorepo consome esses componentes ainda, o custo de configurar detecção
cross-package não se paga — se um segundo app precisar dos mesmos primitivos no futuro, faz
sentido promovê-los para `packages/ui` nesse momento.

## Decisão: "Atrações do navio" = `Ship.venues`
O pedido lista "atrações" como uma seção separada da página de detalhe, ao lado de eventos,
experiências e restaurantes. O catálogo (ADR-0006) não tem uma entidade "Atração" — o mais
próximo semanticamente são os `Venue`s do navio (teatro, lounge, deck de shows: os espaços onde
eventos acontecem). A seção "Atrações do navio" (`CruiseVenues`) lista os `ship.venues` do
cruzeiro. Eventos, experiências e restaurantes continuam como seções próprias, já que são
entidades distintas no catálogo.

## Pré-requisitos de backend feitos nesta etapa
- **Busca livre (`q`)**: `CruiseQuerySchema` ganhou um campo opcional `q` (título/tema/descrição,
  case-insensitive) para a caixa de busca da listagem não fingir uma capacidade que a API não
  tinha — sem isso, a busca seria só cosmética ou reaproveitaria `theme` de forma confusa.
- **Refatoração de `buildCruiseWhere` para `AND: Prisma.CruiseWhereInput[]`**: adicionar o `OR`
  de `q` do jeito que `destination` já fazia (`where.OR = [...]` direto) faria a segunda
  atribuição sobrescrever a primeira sempre que os dois filtros fossem usados juntos. Corrigido
  acumulando cada filtro (incluindo os dois grupos `OR`) como uma entrada independente de um
  array `AND`, sem alterar o comportamento dos filtros já existentes (coberto pelos testes
  unitários do repository).
- **`CRUISE_DETAIL_INCLUDE` enriquecido** com `ship.venues` e `ship.restaurants` (+ `diningSlots`
  de cada restaurante) para a página de detalhe montar as seções de atrações e restaurantes a
  partir de uma única chamada a `GET /cruises/:slug`, em vez de round-trips adicionais no
  cliente.

## Consequências
- Filtros, busca, ordenação e paginação são todos parte da URL — voltar/avançar no navegador e
  compartilhar um link preservam o estado da busca, sem esforço extra.
- Os quatro estados pedidos (loading/erro/vazio/sucesso) existem em pontos distintos e
  intencionais: `loading.tsx` por rota (Suspense automático do App Router) para loading,
  `ServiceResult.ok === false` → `<ErrorState>` para erro, lista vazia → `<EmptyState>` dentro de
  `<CruiseGrid>` para vazio, e o próprio conteúdo populado para sucesso — verificado
  manualmente (Playwright) nos quatro casos contra a API real, incluindo com a API
  propositalmente derrubada para forçar o estado de erro.
- Sem cover images reais nos dados de seed, `CoverArt` gera um gradiente determinístico por
  cruzeiro (hash do slug) em vez de mostrar um ícone de imagem quebrada — visual parece
  intencional, não incompleto.

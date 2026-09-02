# @seapass/web

Frontend único (Next.js 15, App Router, TypeScript) que serve os três públicos do SeaPass através de *route groups* protegidos por RBAC:

- `(public)` — catálogo, busca, página de cruzeiro/navio/itinerário (SSR/ISR para SEO).
- `(auth)` — login e cadastro.
- `(passenger)` — conta, reservas, ingressos digitais (requer sessão de passageiro).
- `(organizer)` — painel do organizador (requer role `organizer`).
- `(admin)` — painel administrativo global (requer role `admin`).

Ver `docs/architecture/stack-and-structure.md` na raiz do monorepo para a justificativa completa da stack e das convenções.

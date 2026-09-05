# components/

Componentes React de UI genéricos e reutilizáveis **dentro desta app** (composições específicas do SeaPass que não são genéricas o bastante para viver em `packages/ui`).

Convenção: arquivo em `kebab-case.tsx` (ex.: `error-state.tsx`), exportando um componente
`PascalCase` (ex.: `ErrorState`) — um componente por arquivo. Testes unitários ficam
centralizados em `apps/web/tests/unit/` (não colocalizados com o componente), ver
`vitest.config.ts`.

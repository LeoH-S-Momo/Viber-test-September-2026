# common/

Código transversal reutilizado por múltiplos módulos:

- `guards/` — `JwtAuthGuard`, `RolesGuard`, `OrganizerOwnershipGuard` (garante que um organizador só acesse seus próprios recursos).
- `decorators/` — `@CurrentUser()`, `@Roles(...)`.
- `filters/` — exception filters (erro padronizado de API).
- `interceptors/` — logging, transformação de resposta.
- `pipes/` — validação de parâmetros via schemas Zod (`ZodValidationPipe`).

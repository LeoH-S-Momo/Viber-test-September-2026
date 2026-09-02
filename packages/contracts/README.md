# @seapass/contracts

Fonte única de verdade do contrato entre `apps/web` e `apps/api`: schemas Zod (`z.object(...)`) por domínio, com os tipos TypeScript inferidos via `z.infer<...>`.

O backend usa os schemas para validar entrada (`ZodValidationPipe`) e o frontend para tipar request/response na camada `services/`, eliminando duplicação de tipos e drift entre as duas apps.

```
src/
  booking/    # CreateBookingSchema, BookingResponseSchema, ...
  cruise/     # CruiseSchema, CabinCategorySchema, ...
  user/       # UserSchema, AuthTokensSchema, ...
  index.ts    # barrel de exportacao
```

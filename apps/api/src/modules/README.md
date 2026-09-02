# modules/

Um módulo NestJS por domínio de negócio, cada um com a estrutura interna padrão:

```
modules/<nome>/
  <nome>.module.ts
  <nome>.controller.ts
  <nome>.service.ts
  dto/                # entrada/saida especificas do modulo (quando nao vem de @seapass/contracts)
  <nome>.controller.spec.ts   # teste unitario (mocka o service)
  <nome>.service.spec.ts      # teste unitario (mocka o repository/prisma)
```

Módulos planejados: `auth`, `users`, `organizers`, `ships`, `cruises`, `cabins`, `itineraries`, `events`, `restaurants`, `bookings`, `payments`, `tickets`, `notifications`, `admin`.

Regra de dependência: um módulo só acessa dados de outro através do `service` exportado por ele (nunca importando o repository/Prisma de outro módulo diretamente), para manter os limites de domínio claros.

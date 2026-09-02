# services/

Camada de acesso à API do SeaPass (`@seapass/api`). Cada arquivo mapeia um recurso REST (`cruises.service.ts`, `bookings.service.ts`) e usa os schemas de `@seapass/contracts` para tipar request/response — nenhuma chamada `fetch` deve ser feita fora desta camada.

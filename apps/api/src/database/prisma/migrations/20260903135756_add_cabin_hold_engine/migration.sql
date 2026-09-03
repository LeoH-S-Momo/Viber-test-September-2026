-- Renomeia BookingStatus.PENDING para HELD (preserva os dados das linhas
-- existentes — o Postgres apenas rerotula o valor do enum, sem precisar de
-- UPDATE/backfill).
ALTER TYPE "BookingStatus" RENAME VALUE 'PENDING' TO 'HELD';

-- Garante, no nivel do banco, que nunca existam duas reservas ativas (HELD
-- ou CONFIRMED) para a mesma cabine no mesmo cruzeiro ao mesmo tempo — mesmo
-- que um bug futuro no codigo da aplicacao pule a transacao/lock, o Postgres
-- recusa o INSERT/UPDATE que violaria isto. E um indice UNICO PARCIAL (nao
-- um @@unique comum do Prisma, que nao suporta filtro WHERE) porque reservas
-- CANCELLED/REFUNDED/COMPLETED precisam poder se acumular livremente para a
-- mesma cabine+cruzeiro (tentativas anteriores expiradas ou canceladas nao
-- podem bloquear uma nova tentativa).
CREATE UNIQUE INDEX "booking_active_cabin_per_cruise" ON "bookings" ("cabinId", "cruiseId") WHERE "status" IN ('HELD', 'CONFIRMED');

-- Novos estados do dominio de Booking (ver ADR-0010). Separado numa
-- migration propria porque o Postgres nao permite usar um valor de enum
-- recem-criado (ex: no WHERE de um indice) na MESMA transacao em que ele
-- foi adicionado.
ALTER TYPE "BookingStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

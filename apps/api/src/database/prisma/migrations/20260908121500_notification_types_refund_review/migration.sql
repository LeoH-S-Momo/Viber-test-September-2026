-- Novos tipos de notificacao: reembolso, review enviada (pro organizador) e review moderada
-- (pro passageiro).
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_MODERATED';

# jobs/

Processors BullMQ (fila sobre Redis) para trabalho assíncrono: geração do ingresso digital após pagamento aprovado, envio de notificações, expiração do hold temporário de cabine. Cada processor mapeia uma fila (`payment-confirmed.processor.ts`, `cabin-hold-expiration.processor.ts`).

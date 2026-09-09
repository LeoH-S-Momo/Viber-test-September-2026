import { createHmac } from 'node:crypto';

// WebhooksService importa BookingsService (pra reconsultar o gateway via confirmPaymentByTransactionId),
// que por sua vez importa @nestjs/bullmq — ESM-only, ts-jest nao consegue parsear (mesmo motivo
// documentado em bookings.service.spec.ts). Este teste so precisa da assinatura do decorator.
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue:
    () =>
    (): void => {
      /* no-op: nao usamos o container de DI do Nest neste teste */
    },
}));

import { WebhooksService } from '../../src/modules/webhooks/application/webhooks.service';

const SECRET = 'test-only-webhook-secret-32-characters-min';

function buildService() {
  const configService = { get: jest.fn().mockReturnValue(SECRET) };
  const webhookEventsRepository = {
    findByEventId: jest.fn(),
    create: jest.fn(),
    markProcessed: jest.fn(),
    markError: jest.fn(),
  };
  const bookingsService = { confirmPaymentByTransactionId: jest.fn() };

  const service = new WebhooksService(
    configService as never,
    webhookEventsRepository as never,
    bookingsService as never,
  );

  return { service, webhookEventsRepository, bookingsService };
}

function sign(rawBody: string): string {
  return createHmac('sha256', SECRET).update(Buffer.from(rawBody)).digest('hex');
}

describe('WebhooksService', () => {
  describe('verifySignature', () => {
    it('aceita uma assinatura HMAC-SHA256 valida sobre o corpo cru', () => {
      const { service } = buildService();
      const rawBody = Buffer.from('{"gatewayTransactionId":"FAKE-1","outcome":"APPROVED"}');
      expect(service.verifySignature(rawBody, sign(rawBody.toString()))).toBe(true);
    });

    it('rejeita quando o header de assinatura esta ausente', () => {
      const { service } = buildService();
      expect(service.verifySignature(Buffer.from('{}'), undefined)).toBe(false);
    });

    it('rejeita uma assinatura que nao corresponde ao corpo (corpo alterado depois de assinado)', () => {
      const { service } = buildService();
      const signature = sign('{"gatewayTransactionId":"FAKE-1"}');
      expect(service.verifySignature(Buffer.from('{"gatewayTransactionId":"FAKE-2"}'), signature)).toBe(false);
    });

    it('rejeita uma assinatura de tamanho/formato invalido sem lancar', () => {
      const { service } = buildService();
      expect(service.verifySignature(Buffer.from('{}'), 'nao-e-hex-valido')).toBe(false);
    });
  });

  describe('handlePaymentEvent', () => {
    it('e idempotente: um eventId ja processado nunca reconsulta o gateway', async () => {
      const { service, webhookEventsRepository, bookingsService } = buildService();
      webhookEventsRepository.findByEventId.mockResolvedValue({ id: 'evt-1', eventId: 'evt-1' });

      const result = await service.handlePaymentEvent('evt-1', 'mock-gateway', {}, 'FAKE-1');

      expect(result).toEqual({ duplicate: true, found: true });
      expect(bookingsService.confirmPaymentByTransactionId).not.toHaveBeenCalled();
      expect(webhookEventsRepository.create).not.toHaveBeenCalled();
    });

    it('marca erro e devolve found:false quando o id de transacao e desconhecido', async () => {
      const { service, webhookEventsRepository, bookingsService } = buildService();
      webhookEventsRepository.findByEventId.mockResolvedValue(null);
      bookingsService.confirmPaymentByTransactionId.mockResolvedValue(null);

      const result = await service.handlePaymentEvent('evt-2', 'mock-gateway', {}, 'FAKE-UNKNOWN');

      expect(result).toEqual({ duplicate: false, found: false });
      expect(webhookEventsRepository.create).toHaveBeenCalledWith({
        provider: 'mock-gateway',
        eventId: 'evt-2',
        payload: {},
      });
      expect(webhookEventsRepository.markError).toHaveBeenCalled();
      expect(webhookEventsRepository.markProcessed).not.toHaveBeenCalled();
    });

    it('reconsulta o gateway (via BookingsService) e marca processado quando a transacao existe', async () => {
      const { service, webhookEventsRepository, bookingsService } = buildService();
      webhookEventsRepository.findByEventId.mockResolvedValue(null);
      bookingsService.confirmPaymentByTransactionId.mockResolvedValue({ id: 'booking-1', status: 'CONFIRMED' });

      const result = await service.handlePaymentEvent('evt-3', 'mock-gateway', { outcome: 'APPROVED' }, 'FAKE-1');

      expect(result).toEqual({ duplicate: false, found: true });
      expect(bookingsService.confirmPaymentByTransactionId).toHaveBeenCalledWith('FAKE-1');
      expect(webhookEventsRepository.markProcessed).toHaveBeenCalledWith('evt-3');
    });
  });
});

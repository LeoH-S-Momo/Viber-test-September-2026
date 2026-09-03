import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Checkout completo via PaymentGateway (ver
 * docs/architecture/decisions/0012-checkout-payment-gateway.md) contra
 * Postgres/Redis reais: aprovacao/recusa/timeout simulados pelo
 * FakePaymentGateway, idempotencia de verdade (corrida via `Promise.all`),
 * recalculo de preco no servidor, e emissao assincrona de ticket. O fluxo
 * geral de hospedes/adicionais/cupom ja e coberto por
 * booking-domain.e2e-spec.ts — este arquivo foca no que e novo aqui: o
 * gateway em si.
 */
describe('Checkout via PaymentGateway (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseId: string;
  let cruiseSlug: string;
  let cabinCategoryId: string;
  let cachedDeckId: string;
  let organizerAuth: { Authorization: string };
  let passengerAToken: string;
  let passengerBToken: string;
  let cabinSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('checkout-gw');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Checkout Gateway Test Admin',
      })
      .expect(201);
    organizerAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const port = await prisma.port.create({ data: { name: `Porto ${label}`, country: 'Brasil' } });

    const ship = await request(server())
      .post('/ships')
      .set(organizerAuth)
      .send({ name: `Navio ${label}`, passengerCapacity: 500 })
      .expect(201);

    const category = await request(server())
      .post(`/ships/${ship.body.id}/cabin-categories`)
      .set(organizerAuth)
      .send({ name: 'Interna', maxOccupancy: 2 })
      .expect(201);
    cabinCategoryId = category.body.id;

    const deck = await request(server())
      .post(`/ships/${ship.body.id}/decks`)
      .set(organizerAuth)
      .send({ number: 1, name: `Deck ${label}` })
      .expect(201);

    const cruise = await request(server())
      .post('/cruises')
      .set(organizerAuth)
      .send({
        shipId: ship.body.id,
        title: `Cruzeiro ${label}`,
        theme: 'Teste',
        embarkationDate: '2027-10-01T12:00:00Z',
        disembarkationDate: '2027-10-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(201);
    cruiseId = cruise.body.id;
    cruiseSlug = cruise.body.slug;

    await request(server())
      .post(`/cruises/${cruiseId}/itinerary-stops`)
      .set(organizerAuth)
      .send({ portId: port.id, dayNumber: 1, isEmbarkation: true })
      .expect(201);
    await request(server())
      .post(`/cruises/${cruiseId}/pricing`)
      .set(organizerAuth)
      .send({ cabinCategoryId, price: 2000 })
      .expect(201);
    await request(server()).post(`/cruises/${cruiseId}/publish`).set(organizerAuth).expect(200);
    cachedDeckId = deck.body.id;

    const passengerA = await request(server())
      .post('/auth/register')
      .send({ email: `passenger-a.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro A' })
      .expect(201);
    passengerAToken = passengerA.body.accessToken;

    const passengerB = await request(server())
      .post('/auth/register')
      .send({ email: `passenger-b.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro B' })
      .expect(201);
    passengerBToken = passengerB.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  /** Cada teste usa uma cabine nova — evita interferencia entre os cenarios (fica mais simples do que limpar estado). */
  async function createFreshCabin(): Promise<string> {
    cabinSeq += 1;
    const cabin = await request(server())
      .post(`/decks/${cachedDeckId}/cabins`)
      .set(organizerAuth)
      .send({ cabinCategoryId, code: `CK${cabinSeq}` })
      .expect(201);
    return cabin.body.id as string;
  }

  async function holdWithGuest(token: string, cabinId: string): Promise<string> {
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .send()
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guests: [{ fullName: 'Titular Gateway', documentType: 'PASSPORT', documentNumber: 'GW123456', isPrimary: true }] })
      .expect(200);

    return hold.body.id as string;
  }

  async function waitForTicket(bookingGuestId: string, attempts = 20): Promise<{ qrCode: string } | null> {
    for (let i = 0; i < attempts; i += 1) {
      const ticket = await prisma.ticket.findUnique({ where: { bookingGuestId } });
      if (ticket) return ticket;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  it('approves a synchronous method (PIX) directly within checkout — no separate confirm-payment needed — and later issues a ticket', async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);

    const checkout = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');
    expect(checkout.body.confirmedAt).not.toBeNull();

    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(payment.status).toBe('APPROVED');
    expect(payment.paidAt).not.toBeNull();
    expect(payment.simulatedTransactionId).toMatch(/^FAKE-/);

    const availability = await request(server())
      .get(`/cruises/${cruiseSlug}/cabins/${cabinId}/availability`)
      .expect(200);
    expect(availability.body.availability).toBe('BOOKED');

    // "Emitir o ticket posteriormente" (ver ADR-0012) — assincrono via BullMQ, entao pode nao
    // existir no instante da resposta do checkout; poll curto ate o worker processar o job.
    const guest = await prisma.bookingGuest.findFirstOrThrow({ where: { bookingId } });
    const ticket = await waitForTicket(guest.id);
    expect(ticket).not.toBeNull();
    expect(ticket?.qrCode).toMatch(/^TICKET-/);
  });

  it('declines the payment and releases (cancels) the booking — the cabin becomes available again', async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);

    const checkout = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .set('Idempotency-Key', unique('decline-key') + '::decline')
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(200);
    expect(checkout.body.status).toBe('CANCELLED');
    expect(checkout.body.cancellationReason).toMatch(/recusado/);

    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(payment.status).toBe('DECLINED');
    expect(payment.failureReason).not.toBeNull();

    const availability = await request(server())
      .get(`/cruises/${cruiseSlug}/cabins/${cabinId}/availability`)
      .expect(200);
    expect(availability.body.availability).toBe('AVAILABLE');
  });

  it('leaves the booking PAYMENT_PENDING on a gateway timeout, and retrying with the SAME Idempotency-Key reveals the real outcome instead of charging twice', async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);
    const idempotencyKey = unique('timeout-key') + '::timeout';

    const firstAttempt = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(200);
    // Timeout: nao sabemos o que aconteceu — a reserva NUNCA e confirmada nem cancelada as cegas.
    expect(firstAttempt.body.status).toBe('PAYMENT_PENDING');

    const pendingPayment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(pendingPayment.status).toBe('PENDING');

    // Retry com a MESMA chave — o gateway (FakePaymentGateway) revela que, do lado dele, a
    // cobranca tinha sido aprovada — sem cobrar uma segunda vez (ver PaymentGateway/ADR-0012).
    const retry = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(200);
    expect(retry.body.status).toBe('CONFIRMED');

    const payments = await prisma.payment.findMany({ where: { bookingId } });
    expect(payments).toHaveLength(1); // nunca criou uma segunda tentativa — reaproveitou a mesma.
    expect(payments[0]?.status).toBe('APPROVED');
  });

  it('treats N truly concurrent checkout requests with the SAME Idempotency-Key as one single attempt (never double-charges)', async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);
    const idempotencyKey = unique('concurrent-key');

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server())
          .post(`/bookings/${bookingId}/checkout`)
          .set('Authorization', `Bearer ${passengerAToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ paymentMethod: 'PIX' }),
      ),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.every((r) => r.body.status === 'CONFIRMED')).toBe(true);

    const payments = await prisma.payment.findMany({ where: { bookingId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe('APPROVED');
  });

  it('recalculates the price on the SERVER at checkout time — a price change after updateDetails is picked up, never trusting the previously stored total', async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);

    const beforePriceChange = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(Number(beforePriceChange.totalAmount)).toBeCloseTo(2000 * 1.05 + 50, 2); // 2000 + 5% + taxa de embarque (1 passageiro)

    // O organizador muda o preco da cabine DEPOIS que o passageiro ja informou os hospedes.
    await request(server())
      .post(`/cruises/${cruiseId}/pricing`)
      .set(organizerAuth)
      .send({ cabinCategoryId, price: 3000 })
      .expect(201);

    const checkout = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);

    // Usa o preco NOVO (3000), nunca o antigo (2000) que ainda estava salvo em Booking.totalAmount.
    const expectedTotal = 3000 * 1.05 + 50;
    expect(Number(checkout.body.totalAmount)).toBeCloseTo(expectedTotal, 2);

    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(Number(payment.amount)).toBeCloseTo(expectedTotal, 2);

    // Devolve o preco original para nao afetar outros testes deste arquivo.
    await request(server())
      .post(`/cruises/${cruiseId}/pricing`)
      .set(organizerAuth)
      .send({ cabinCategoryId, price: 2000 })
      .expect(201);
  });

  it("rejects another user's attempt to check out someone else's booking (404, not 403)", async () => {
    const cabinId = await createFreshCabin();
    const bookingId = await holdWithGuest(passengerAToken, cabinId);

    await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(404);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });
});

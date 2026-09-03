import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Dominio completo de Booking (ver ADR-0010): hospedes, adicionais, cupom,
 * checkout e confirmacao de pagamento simulado — contra Postgres/Redis
 * reais. O teste de concorrencia de hold em si vive em
 * cabin-hold-concurrency.e2e-spec.ts; o ciclo de vida basico (hold/cancel/
 * release/expire) vive em bookings.e2e-spec.ts. Este arquivo cobre a parte
 * nova: "informa passageiros -> seleciona adicionais -> checkout".
 */
describe('Booking domain (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseId: string;
  let cruiseSlug: string;
  let cabinId: string;
  let maintenanceCabinId: string;
  let cabinCategoryMaxOccupancy: number;
  let includedExperienceId: string;
  let paidExperienceId: string;
  let otherCruiseExperienceId: string;
  let validCouponCode: string;
  let expiredCouponCode: string;
  let exhaustedCouponCode: string;
  let minPurchaseCouponCode: string;
  let perUserLimitCouponCode: string;
  let otherCruiseOnlyCouponCode: string;
  let passengerAToken: string;
  let passengerBToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('bookingdomain');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Booking Domain Test Admin',
      })
      .expect(201);
    const orgAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const port = await prisma.port.create({ data: { name: `Porto ${label}`, country: 'Brasil' } });

    const ship = await request(server())
      .post('/ships')
      .set(orgAuth)
      .send({ name: `Navio ${label}`, passengerCapacity: 500 })
      .expect(201);

    cabinCategoryMaxOccupancy = 2;
    const category = await request(server())
      .post(`/ships/${ship.body.id}/cabin-categories`)
      .set(orgAuth)
      .send({ name: 'Interna', maxOccupancy: cabinCategoryMaxOccupancy })
      .expect(201);

    const deck = await request(server())
      .post(`/ships/${ship.body.id}/decks`)
      .set(orgAuth)
      .send({ number: 1, name: `Deck ${label}` })
      .expect(201);

    const cabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '101' })
      .expect(201);
    cabinId = cabin.body.id;

    const maintenanceCabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '102', status: 'MAINTENANCE' })
      .expect(201);
    maintenanceCabinId = maintenanceCabin.body.id;

    const cruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
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
      .set(orgAuth)
      .send({ portId: port.id, dayNumber: 1, isEmbarkation: true })
      .expect(201);
    await request(server())
      .post(`/cruises/${cruiseId}/pricing`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, price: 2000 })
      .expect(201);
    await request(server()).post(`/cruises/${cruiseId}/publish`).set(orgAuth).expect(200);

    const includedExperience = await prisma.experience.create({
      data: { cruiseId, title: `Inclusa ${label}`, isIncluded: true },
    });
    includedExperienceId = includedExperience.id;

    const paidExperience = await prisma.experience.create({
      data: { cruiseId, title: `Paga ${label}`, isIncluded: false, price: 150 },
    });
    paidExperienceId = paidExperience.id;

    // Cruzeiro diferente, so pra provar que uma Experience de outro
    // cruzeiro nao pode ser selecionada aqui.
    const otherCruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
      .send({
        shipId: ship.body.id,
        title: `Outro Cruzeiro ${label}`,
        theme: 'Teste',
        embarkationDate: '2027-11-01T12:00:00Z',
        disembarkationDate: '2027-11-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(201);
    const otherExperience = await prisma.experience.create({
      data: { cruiseId: otherCruise.body.id, title: `Externa ${label}`, isIncluded: false, price: 50 },
    });
    otherCruiseExperienceId = otherExperience.id;

    validCouponCode = `VALID-${label}`;
    await prisma.coupon.create({
      data: {
        code: validCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId }] },
      },
    });

    expiredCouponCode = `EXPIRED-${label}`;
    await prisma.coupon.create({
      data: {
        code: expiredCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2021-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId }] },
      },
    });

    exhaustedCouponCode = `EXHAUSTED-${label}`;
    await prisma.coupon.create({
      data: {
        code: exhaustedCouponCode,
        discountType: 'FIXED_AMOUNT',
        discountValue: 50,
        maxUses: 1,
        usedCount: 1,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId }] },
      },
    });

    minPurchaseCouponCode = `MINPUR-${label}`;
    await prisma.coupon.create({
      data: {
        code: minPurchaseCouponCode,
        discountType: 'FIXED_AMOUNT',
        discountValue: 100,
        minPurchaseAmount: 999999,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId }] },
      },
    });

    perUserLimitCouponCode = `PERUSER-${label}`;
    await prisma.coupon.create({
      data: {
        code: perUserLimitCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 5,
        maxUsesPerUser: 1,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId }] },
      },
    });

    otherCruiseOnlyCouponCode = `OTHERCR-${label}`;
    await prisma.coupon.create({
      data: {
        code: otherCruiseOnlyCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruises: { create: [{ cruiseId: otherCruise.body.id }] },
      },
    });

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

  async function holdFreshCabin(token: string) {
    const res = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .send()
      .expect(201);
    return res.body.id as string;
  }

  it('never allows a booking to be created for an unavailable cabin (maintenance)', async () => {
    await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${maintenanceCabinId}/hold`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(409);
  });

  it('never allows a booking to be created for a cabin that is already HELD/CONFIRMED by someone else', async () => {
    const firstBookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send()
      .expect(409);

    await request(server())
      .post(`/bookings/${firstBookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  it('runs the full flow end to end: hold -> details (guests+addon+coupon) -> checkout -> confirm-payment -> CONFIRMED', async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    const detailsRes = await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [
          { fullName: 'Titular da Reserva', documentType: 'PASSPORT', documentNumber: 'AB123456', isPrimary: true },
          { fullName: 'Acompanhante', documentType: 'NATIONAL_ID', documentNumber: '12345678900', isPrimary: false },
        ],
        experienceIds: [paidExperienceId, includedExperienceId],
        couponCode: validCouponCode,
      })
      .expect(200);

    // subtotal = 2000 (cabine) + 150 (paga) + 0 (inclusa) = 2150
    // desconto = 10% de 2150 = 215, taxavel = 1935
    // taxa = 5% de 1935 (96.75) + taxa de embarque de 50 x 2 passageiros (100) = 196.75
    // total = 1935 + 196.75 = 2131.75 — ver PricingEngine (ADR-0011)
    expect(Number(detailsRes.body.subtotalAmount)).toBe(2150);
    expect(Number(detailsRes.body.discountAmount)).toBe(215);
    expect(Number(detailsRes.body.feeAmount)).toBeCloseTo(196.75, 2);
    expect(Number(detailsRes.body.totalAmount)).toBeCloseTo(2131.75, 2);
    expect(detailsRes.body.guests).toHaveLength(2);
    expect(detailsRes.body.experiences).toHaveLength(2);

    // BOLETO e assincrono na vida real — o FakePaymentGateway simula isso devolvendo PENDING no
    // proprio checkout (metodos sincronos como PIX/cartao ja aprovariam aqui — ver
    // checkout-payment-gateway.e2e-spec.ts — e ADR-0012).
    const checkoutRes = await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ paymentMethod: 'BOLETO' })
      .expect(200);
    expect(checkoutRes.body.status).toBe('PAYMENT_PENDING');

    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(payment.status).toBe('PENDING');
    expect(payment.method).toBe('BOLETO');
    expect(Number(payment.amount)).toBeCloseTo(2131.75, 2);

    const confirmRes = await request(server())
      .post(`/bookings/${bookingId}/confirm-payment`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
    expect(confirmRes.body.status).toBe('CONFIRMED');
    expect(confirmRes.body.confirmedAt).not.toBeNull();

    const approvedPayment = await prisma.payment.findFirstOrThrow({ where: { bookingId } });
    expect(approvedPayment.status).toBe('APPROVED');
    expect(approvedPayment.paidAt).not.toBeNull();

    const availability = await request(server())
      .get(`/cruises/${cruiseSlug}/cabins/${cabinId}/availability`)
      .expect(200);
    expect(availability.body.availability).toBe('BOOKED');

    await request(server())
      .post(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ reason: 'limpeza de teste' })
      .expect(200);
  });

  it('rejects a guest list larger than the cabin category capacity', async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: Array.from({ length: cabinCategoryMaxOccupancy + 1 }, (_, i) => ({
          fullName: `Hospede ${i}`,
          documentType: 'PASSPORT',
          documentNumber: `DOC${i}`,
          isPrimary: i === 0,
        })),
      })
      .expect(400);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  it('rejects a guest list with zero or more than one primary guest', async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [
          { fullName: 'Hospede Um', documentType: 'PASSPORT', documentNumber: 'DOC001', isPrimary: false },
          { fullName: 'Hospede Dois', documentType: 'PASSPORT', documentNumber: 'DOC002', isPrimary: false },
        ],
      })
      .expect(400);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  it('rejects an experience that belongs to a different cruise', async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [{ fullName: 'Titular', documentType: 'PASSPORT', documentNumber: 'AB1', isPrimary: true }],
        experienceIds: [otherCruiseExperienceId],
      })
      .expect(409);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  // As 7 regras de cupom (ver CouponPolicy/ADR-0011) exercitadas contra a
  // pilha inteira, nao so a policy pura — "cupom valido" ja e coberto pelo
  // teste de fluxo completo acima (aplica VALID-* com sucesso).
  it.each([
    ['expired coupon (cupom expirado)', () => expiredCouponCode, 409, /expirado/],
    ['exhausted coupon (limite atingido)', () => exhaustedCouponCode, 409, /limite de usos/],
    ['nonexistent coupon (cupom inexistente)', () => 'NAO-EXISTE-9999', 404, /nao encontrado/],
    ['coupon below its minimum purchase value (valor minimo)', () => minPurchaseCouponCode, 409, /valor minimo/],
    ['coupon scoped to a different cruise (cupom incompativel)', () => otherCruiseOnlyCouponCode, 409, /nao e valido para este cruzeiro/],
  ])('rejects a %s', async (_label, getCoupon, expectedStatus, messagePattern) => {
    const bookingId = await holdFreshCabin(passengerAToken);

    const res = await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [{ fullName: 'Titular', documentType: 'PASSPORT', documentNumber: 'AB1', isPrimary: true }],
        couponCode: getCoupon(),
      })
      .expect(expectedStatus);
    expect(res.body.message).toMatch(messagePattern);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  it('rejects a coupon once the user has already redeemed it up to its per-user limit (cupom ja utilizado)', async () => {
    // maxUsesPerUser: 1 — o passageiro precisa ter UMA reserva ja confirmada
    // (mesmo que depois cancelada — ver countUserCouponUsage: `confirmedAt`
    // nunca e limpo, para nao dar pra "resetar" um cupom de primeira compra
    // so cancelando e refazendo a reserva) com este cupom antes que a
    // segunda tentativa seja rejeitada.
    const firstBookingId = await holdFreshCabin(passengerAToken);
    await request(server())
      .put(`/bookings/${firstBookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [{ fullName: 'Titular', documentType: 'PASSPORT', documentNumber: 'PU1', isPrimary: true }],
        couponCode: perUserLimitCouponCode,
      })
      .expect(200);
    // PIX resolve (aprova) dentro do proprio checkout — ver ADR-0012 — sem precisar de confirm-payment.
    const checkoutRes = await request(server())
      .post(`/bookings/${firstBookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkoutRes.body.status).toBe('CONFIRMED');
    // Libera a cabine (so uma cabine de teste neste arquivo) antes de tentar
    // uma segunda reserva — o limite por usuario sobrevive ao cancelamento.
    await request(server())
      .post(`/bookings/${firstBookingId}/cancel`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ reason: 'limpeza de teste' })
      .expect(200);

    const secondBookingId = await holdFreshCabin(passengerAToken);
    const res = await request(server())
      .put(`/bookings/${secondBookingId}/details`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        guests: [{ fullName: 'Titular', documentType: 'PASSPORT', documentNumber: 'PU2', isPrimary: true }],
        couponCode: perUserLimitCouponCode,
      })
      .expect(409);
    expect(res.body.message).toMatch(/ja utilizou este cupom/);

    await request(server())
      .post(`/bookings/${secondBookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);

    // Um segundo usuario, que nunca usou o cupom, ainda pode — o limite e por usuario, nao global.
    const thirdBookingId = await holdFreshCabin(passengerBToken);
    await request(server())
      .put(`/bookings/${thirdBookingId}/details`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send({
        guests: [{ fullName: 'Titular B', documentType: 'PASSPORT', documentNumber: 'PU3', isPrimary: true }],
        couponCode: perUserLimitCouponCode,
      })
      .expect(200);
    await request(server())
      .post(`/bookings/${thirdBookingId}/release`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send()
      .expect(200);
  });

  it('rejects checkout before any guest has been informed', async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .post(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(409);

    await request(server())
      .post(`/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send()
      .expect(200);
  });

  it("rejects another user from editing/checking out someone else's booking (404, not 403)", async () => {
    const bookingId = await holdFreshCabin(passengerAToken);

    await request(server())
      .put(`/bookings/${bookingId}/details`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send({ guests: [{ fullName: 'Intruso', documentType: 'PASSPORT', documentNumber: 'X1234', isPrimary: true }] })
      .expect(404);

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

  describe('idempotencia da criacao de hold', () => {
    it('a sequential retry with the same Idempotency-Key returns the same booking, not a duplicate', async () => {
      const key = unique('idem-seq');

      const first = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .set('Idempotency-Key', key)
        .send()
        .expect(201);

      const second = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .set('Idempotency-Key', key)
        .send()
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const count = await prisma.booking.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);

      await request(server())
        .post(`/bookings/${first.body.id}/release`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);
    });

    it('two truly concurrent requests with the same Idempotency-Key both resolve to the same single booking', async () => {
      const key = unique('idem-race');

      const [first, second] = await Promise.all([
        request(server())
          .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
          .set('Authorization', `Bearer ${passengerAToken}`)
          .set('Idempotency-Key', key)
          .send(),
        request(server())
          .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
          .set('Authorization', `Bearer ${passengerAToken}`)
          .set('Idempotency-Key', key)
          .send(),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).toBe(second.body.id);

      const count = await prisma.booking.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);

      await request(server())
        .post(`/bookings/${first.body.id}/release`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);
    });
  });
});

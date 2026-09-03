import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Ciclo de vida completo do motor de hold (ver ADR-0009) contra Postgres
 * real: consulta -> hold -> confirmar/cancelar/liberar, checagem de posse
 * entre usuarios de verdade, e o fechamento do ciclo de expiracao (hold
 * expirado nao trava a cabine pra sempre). O teste de concorrencia em si
 * (N tentativas simultaneas) vive em cabin-hold-concurrency.e2e-spec.ts.
 */
describe('Cabin hold lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseSlug: string;
  let draftCruiseSlug: string;
  let cabinAId: string;
  let cabinBId: string;
  let maintenanceCabinId: string;
  let passengerAToken: string;
  let passengerAId: string;
  let passengerBToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('bookings');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Bookings Test Admin',
      })
      .expect(201);
    const orgAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const port = await prisma.port.create({ data: { name: `Porto ${label}`, country: 'Brasil' } });

    const ship = await request(server())
      .post('/ships')
      .set(orgAuth)
      .send({ name: `Navio ${label}`, passengerCapacity: 500 })
      .expect(201);

    const category = await request(server())
      .post(`/ships/${ship.body.id}/cabin-categories`)
      .set(orgAuth)
      .send({ name: 'Interna', maxOccupancy: 2 })
      .expect(201);

    const deck = await request(server())
      .post(`/ships/${ship.body.id}/decks`)
      .set(orgAuth)
      .send({ number: 1, name: `Deck ${label}` })
      .expect(201);

    const cabinA = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '101' })
      .expect(201);
    cabinAId = cabinA.body.id;

    const cabinB = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '102' })
      .expect(201);
    cabinBId = cabinB.body.id;

    const maintenanceCabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '103', status: 'MAINTENANCE' })
      .expect(201);
    maintenanceCabinId = maintenanceCabin.body.id;

    // Cruzeiro publicado (usado pela maioria dos testes de hold real).
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

    await request(server())
      .post(`/cruises/${cruise.body.id}/itinerary-stops`)
      .set(orgAuth)
      .send({ portId: port.id, dayNumber: 1, isEmbarkation: true })
      .expect(201);
    await request(server())
      .post(`/cruises/${cruise.body.id}/pricing`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, price: 1500 })
      .expect(201);
    await request(server()).post(`/cruises/${cruise.body.id}/publish`).set(orgAuth).expect(200);
    cruiseSlug = cruise.body.slug;

    // Segundo cruzeiro, deliberadamente NUNCA publicado — usado so pelo
    // teste que confirma que hold em cruzeiro DRAFT e rejeitado. Precisa
    // ser uma entidade separada da acima: reusar o mesmo cruzeiro (so
    // guardando o slug antes de publicar) faria esse teste, apos o
    // `publish` acima ja ter rodado no beforeAll, criar um hold de
    // verdade em vez de ser rejeitado.
    const draftCruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
      .send({
        shipId: ship.body.id,
        title: `Cruzeiro Rascunho ${label}`,
        theme: 'Teste',
        embarkationDate: '2027-11-01T12:00:00Z',
        disembarkationDate: '2027-11-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(201);
    draftCruiseSlug = draftCruise.body.slug;

    const passengerA = await request(server())
      .post('/auth/register')
      .send({ email: `passenger-a.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro A' })
      .expect(201);
    passengerAToken = passengerA.body.accessToken;
    passengerAId = passengerA.body.user.id;

    const passengerB = await request(server())
      .post('/auth/register')
      .send({ email: `passenger-b.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro B' })
      .expect(201);
    passengerBToken = passengerB.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('consulta de disponibilidade', () => {
    it('reports AVAILABLE for a fresh cabin with no bookings', async () => {
      const res = await request(server())
        .get(`/cruises/${cruiseSlug}/cabins/${cabinAId}/availability`)
        .expect(200);
      expect(res.body).toEqual({ cabinId: cabinAId, availability: 'AVAILABLE' });
    });

    it('reports UNAVAILABLE for a cabin under maintenance, with no auth required (public route)', async () => {
      const res = await request(server())
        .get(`/cruises/${cruiseSlug}/cabins/${maintenanceCabinId}/availability`)
        .expect(200);
      expect(res.body.availability).toBe('UNAVAILABLE');
    });

    it('404s for a cruise that does not exist', async () => {
      await request(server()).get(`/cruises/no-such-cruise/cabins/${cabinAId}/availability`).expect(404);
    });
  });

  describe('criacao de hold', () => {
    it('requires authentication', async () => {
      await request(server()).post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`).send().expect(401);
    });

    it('404s when the cruise is not published (DRAFT)', async () => {
      await request(server())
        .post(`/cruises/${draftCruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(404);
    });

    it('409s when the cabin is under maintenance', async () => {
      await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${maintenanceCabinId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(409);
    });

    it('creates a HELD booking priced from the real cruise pricing, with a future holdExpiresAt', async () => {
      const res = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(201);

      expect(res.body).toMatchObject({ status: 'HELD', cabinId: cabinBId, userId: passengerAId });
      // preco base 1500 + 5% de taxa de servico (ver BookingPricingPolicy.FEE_RATE, ADR-0010) — sem desconto/adicional ainda.
      expect(Number(res.body.subtotalAmount)).toBe(1500);
      expect(Number(res.body.discountAmount)).toBe(0);
      expect(Number(res.body.feeAmount)).toBeCloseTo(75, 2);
      expect(Number(res.body.totalAmount)).toBeCloseTo(1575, 2);
      expect(new Date(res.body.holdExpiresAt).getTime()).toBeGreaterThan(Date.now());

      await request(server())
        .post(`/bookings/${res.body.id}/release`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);
    });
  });

  /**
   * Hold + hospede + checkout com PIX — o `FakePaymentGateway` (ver ADR-0012)
   * aprova metodos sincronos (PIX/cartao) DENTRO do proprio checkout, sem
   * precisar de um `confirm-payment` separado — devolve a reserva ja
   * CONFIRMED. O fluxo completo do motor de preco/cupom/gateway vive em
   * booking-domain.e2e-spec.ts e checkout-payment-gateway.e2e-spec.ts.
   */
  async function holdAndCheckout(token: string): Promise<string> {
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .send()
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guests: [{ fullName: 'Titular Teste', documentType: 'PASSPORT', documentNumber: 'AB123456', isPrimary: true }] })
      .expect(200);

    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');

    return hold.body.id as string;
  }

  describe('confirmacao de pagamento, cancelamento e posse', () => {
    it('resolves BOLETO as PENDING at checkout, then confirm-payment (simulando o webhook) confirma a reserva e a cabine reporta BOOKED', async () => {
      const hold = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(201);
      await request(server())
        .put(`/bookings/${hold.body.id}/details`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ guests: [{ fullName: 'Titular Boleto', documentType: 'PASSPORT', documentNumber: 'BL123456', isPrimary: true }] })
        .expect(200);

      const checkout = await request(server())
        .post(`/bookings/${hold.body.id}/checkout`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ paymentMethod: 'BOLETO' })
        .expect(200);
      // Boleto e assincrono na vida real — o FakePaymentGateway simula isso devolvendo PENDING
      // no proprio checkout (ver ADR-0012), nao aprovando na hora como PIX/cartao fariam.
      expect(checkout.body.status).toBe('PAYMENT_PENDING');

      await request(server())
        .post(`/bookings/${hold.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);

      const availability = await request(server())
        .get(`/cruises/${cruiseSlug}/cabins/${cabinBId}/availability`)
        .expect(200);
      expect(availability.body.availability).toBe('BOOKED');

      await request(server())
        .post(`/bookings/${hold.body.id}/cancel`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ reason: 'Limpeza pos-teste' })
        .expect(200);
    });

    it("rejects another user confirming/cancelling/releasing someone else's booking with 404 (not 403)", async () => {
      const hold = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(201);

      await request(server())
        .post(`/bookings/${hold.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send()
        .expect(404);
      await request(server())
        .post(`/bookings/${hold.body.id}/cancel`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send()
        .expect(404);
      await request(server())
        .post(`/bookings/${hold.body.id}/release`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send()
        .expect(404);

      // A reserva de A continua intacta e ainda pode ser liberada por A.
      await request(server())
        .post(`/bookings/${hold.body.id}/release`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);
    });

    it('rejects releasing an already-CONFIRMED booking, pointing to cancel instead', async () => {
      const bookingId = await holdAndCheckout(passengerAToken); // ja CONFIRMED — PIX resolve no proprio checkout.

      const release = await request(server())
        .post(`/bookings/${bookingId}/release`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(409);
      expect(release.body.message).toMatch(/cancelamento/);

      await request(server())
        .post(`/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(200);
    });
  });

  describe('expiracao', () => {
    it('closes the cycle: an expired HELD booking becomes EXPIRED (not CANCELLED) and lets a new hold succeed', async () => {
      const hold = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(201);

      // Simula o prazo ja tendo passado (sem esperar CABIN_HOLD_MINUTES de verdade).
      await prisma.booking.update({
        where: { id: hold.body.id },
        data: { holdExpiresAt: new Date(Date.now() - 1000) },
      });

      const availability = await request(server())
        .get(`/cruises/${cruiseSlug}/cabins/${cabinBId}/availability`)
        .expect(200);
      expect(availability.body.availability).toBe('AVAILABLE');

      const newHold = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send()
        .expect(201);

      const oldBooking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.body.id } });
      expect(oldBooking.status).toBe('EXPIRED');
      expect(oldBooking.cancellationReason).toMatch(/expirado/);

      await request(server())
        .post(`/bookings/${newHold.body.id}/release`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send()
        .expect(200);
    });

    it('checkout is rejected once the hold has expired, not silently accepted', async () => {
      const hold = await request(server())
        .post(`/cruises/${cruiseSlug}/cabins/${cabinBId}/hold`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send()
        .expect(201);

      await prisma.booking.update({
        where: { id: hold.body.id },
        data: { holdExpiresAt: new Date(Date.now() - 1000) },
      });

      const checkout = await request(server())
        .post(`/bookings/${hold.body.id}/checkout`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ paymentMethod: 'PIX' })
        .expect(409);
      expect(checkout.body.message).toMatch(/expirou/);
    });
  });
});

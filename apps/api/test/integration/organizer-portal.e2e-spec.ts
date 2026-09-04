import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Painel do organizador (ver ADR-0016): dashboard, listas "minhas" de
 * navios/eventos/restaurantes/experiencias, reservas e passageiros — e,
 * acima de tudo, a garantia EXPLICITAMENTE pedida de isolamento
 * multi-tenant: "Organizer A nao pode consultar ou alterar dados do
 * Organizer B", aplicada no backend. Este arquivo cria DOIS organizadores
 * completos (A e B), cada um com seu proprio mundo (navio, cruzeiro, evento,
 * restaurante, experiencia, passageiro com reserva confirmada) e prova, para
 * cada rota nova E para as rotas de escrita do catalogo ja existentes, que A
 * nunca ve nem altera nada de B.
 */
describe('Organizer portal — dashboard, listas e isolamento multi-tenant (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  interface OrganizerWorld {
    orgAuth: { Authorization: string };
    shipId: string;
    deckId: string;
    cabinCategoryId: string;
    cabinId: string;
    venueId: string;
    artistId: string;
    eventId: string;
    restaurantId: string;
    diningSlotId: string;
    experienceId: string;
    cruiseId: string;
    cruiseSlug: string;
    bookingId: string;
    passengerAuth: { Authorization: string };
    totalAmount: string;
  }

  async function buildOrganizerWorld(labelPrefix: string): Promise<OrganizerWorld> {
    const label = unique(labelPrefix);

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Admin Multi-Tenant',
      })
      .expect(201);
    const orgAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const ports = await request(server()).get('/ports').expect(200);
    const portId = (ports.body.data ?? ports.body)[0].id as string;

    const ship = await request(server())
      .post('/ships')
      .set(orgAuth)
      .send({ name: `Navio ${label}`, passengerCapacity: 400 })
      .expect(201);

    const category = await request(server())
      .post(`/ships/${ship.body.id}/cabin-categories`)
      .set(orgAuth)
      .send({ name: 'Standard', maxOccupancy: 3 })
      .expect(201);

    const deck = await request(server())
      .post(`/ships/${ship.body.id}/decks`)
      .set(orgAuth)
      .send({ number: 3, name: `Deck ${label}` })
      .expect(201);

    const cabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: 'MT01' })
      .expect(201);

    const venue = await request(server())
      .post(`/ships/${ship.body.id}/venues`)
      .set(orgAuth)
      .send({ name: `Salao ${label}`, type: 'THEATER', capacity: 150 })
      .expect(201);

    const artist = await request(server()).post('/artists').set(orgAuth).send({ name: `Artista ${label}` }).expect(201);

    const restaurant = await request(server())
      .post(`/ships/${ship.body.id}/restaurants`)
      .set(orgAuth)
      .send({ name: `Restaurante ${label}` })
      .expect(201);

    const diningSlot = await request(server())
      .post(`/restaurants/${restaurant.body.id}/dining-slots`)
      .set(orgAuth)
      .send({ label: 'Turno unico', startTime: '1970-01-01T19:00:00.000Z', endTime: '1970-01-01T21:00:00.000Z', capacity: 20 })
      .expect(201);

    const cruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
      .send({
        shipId: ship.body.id,
        title: `Cruzeiro ${label}`,
        theme: 'Isolamento',
        embarkationDate: '2027-11-01T12:00:00Z',
        disembarkationDate: '2027-11-05T12:00:00Z',
        embarkationPortId: portId,
        disembarkationPortId: portId,
      })
      .expect(201);

    await request(server())
      .post(`/cruises/${cruise.body.id}/itinerary-stops`)
      .set(orgAuth)
      .send({ portId, dayNumber: 1, isEmbarkation: true })
      .expect(201);
    await request(server())
      .post(`/cruises/${cruise.body.id}/pricing`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, price: 1800 })
      .expect(201);

    const event = await request(server())
      .post('/events')
      .set(orgAuth)
      .send({
        cruiseId: cruise.body.id,
        venueId: venue.body.id,
        artistId: artist.body.id,
        title: `Show ${label}`,
        startAt: '2027-11-02T20:00:00.000Z',
        endAt: '2027-11-02T22:00:00.000Z',
        capacity: 50,
      })
      .expect(201);

    const experience = await request(server())
      .post('/experiences')
      .set(orgAuth)
      .send({ cruiseId: cruise.body.id, title: `Experiencia ${label}`, capacity: 20 })
      .expect(201);

    await request(server()).post(`/cruises/${cruise.body.id}/publish`).set(orgAuth).expect(200);

    const passenger = await request(server())
      .post('/auth/register')
      .send({ email: `passenger.${label}@example.com`, password: 'SenhaForte123', fullName: `Passageiro ${label}` })
      .expect(201);
    const passengerAuth = { Authorization: `Bearer ${passenger.body.accessToken}` };

    const hold = await request(server())
      .post(`/cruises/${cruise.body.slug}/cabins/${cabin.body.id}/hold`)
      .set(passengerAuth)
      .send()
      .expect(201);
    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set(passengerAuth)
      .send({ guests: [{ fullName: `Titular ${label}`, documentType: 'PASSPORT', documentNumber: unique('DOC'), isPrimary: true }] })
      .expect(200);
    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set(passengerAuth)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');

    return {
      orgAuth,
      shipId: ship.body.id,
      deckId: deck.body.id,
      cabinCategoryId: category.body.id,
      cabinId: cabin.body.id,
      venueId: venue.body.id,
      artistId: artist.body.id,
      eventId: event.body.id,
      restaurantId: restaurant.body.id,
      diningSlotId: diningSlot.body.id,
      experienceId: experience.body.id,
      cruiseId: cruise.body.id,
      cruiseSlug: cruise.body.slug,
      bookingId: hold.body.id,
      passengerAuth,
      totalAmount: checkout.body.totalAmount,
    };
  }

  let orgA: OrganizerWorld;
  let orgB: OrganizerWorld;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Sequencial de proposito (nao Promise.all) — duas rajadas simultaneas de dezenas de
    // conexoes HTTP `connection: close` no setup produzem ECONNRESET esporadico no loopback
    // do Windows, sem relacao nenhuma com a logica sob teste (mesma licao de ADR-0014).
    orgA = await buildOrganizerWorld('tenant-a');
    orgB = await buildOrganizerWorld('tenant-b');
  }, 90_000);

  afterAll(async () => {
    await app.close();
  });

  describe('leitura: listas "minhas" nunca incluem dados de outro organizador', () => {
    it('GET /organizers/me/ships', async () => {
      const res = await request(server()).get('/organizers/me/ships').set(orgA.orgAuth).expect(200);
      const ids = res.body.map((s: { id: string }) => s.id);
      expect(ids).toContain(orgA.shipId);
      expect(ids).not.toContain(orgB.shipId);
    });

    it('GET /organizers/me/events', async () => {
      const res = await request(server()).get('/organizers/me/events').set(orgA.orgAuth).expect(200);
      const ids = res.body.map((e: { id: string }) => e.id);
      expect(ids).toContain(orgA.eventId);
      expect(ids).not.toContain(orgB.eventId);
    });

    it('GET /organizers/me/restaurants', async () => {
      const res = await request(server()).get('/organizers/me/restaurants').set(orgA.orgAuth).expect(200);
      const ids = res.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(orgA.restaurantId);
      expect(ids).not.toContain(orgB.restaurantId);
    });

    it('GET /organizers/me/experiences', async () => {
      const res = await request(server()).get('/organizers/me/experiences').set(orgA.orgAuth).expect(200);
      const ids = res.body.map((e: { id: string }) => e.id);
      expect(ids).toContain(orgA.experienceId);
      expect(ids).not.toContain(orgB.experienceId);
    });

    it('GET /organizers/me/cruises', async () => {
      const res = await request(server()).get('/organizers/me/cruises').set(orgA.orgAuth).expect(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(orgA.cruiseId);
      expect(ids).not.toContain(orgB.cruiseId);
    });

    it('GET /organizers/me/cruises/:cruiseId devolve o detalhe do proprio cruzeiro, mas 404 pro cruzeiro de outro organizador', async () => {
      await request(server()).get(`/organizers/me/cruises/${orgA.cruiseId}`).set(orgA.orgAuth).expect(200);
      await request(server()).get(`/organizers/me/cruises/${orgB.cruiseId}`).set(orgA.orgAuth).expect(404);
    });

    it('GET /organizers/me/bookings', async () => {
      const res = await request(server()).get('/organizers/me/bookings').set(orgA.orgAuth).expect(200);
      const ids = res.body.data.map((b: { id: string }) => b.id);
      expect(ids).toContain(orgA.bookingId);
      expect(ids).not.toContain(orgB.bookingId);
    });

    it('GET /organizers/me/bookings?cruiseId=<outro organizador> devolve 404, nunca as reservas do outro', async () => {
      await request(server()).get(`/organizers/me/bookings?cruiseId=${orgB.cruiseId}`).set(orgA.orgAuth).expect(404);
    });

    it('GET /organizers/me/passengers', async () => {
      const res = await request(server()).get('/organizers/me/passengers').set(orgA.orgAuth).expect(200);
      const bookingIds = res.body.data.map((g: { booking: { id: string } }) => g.booking.id);
      expect(bookingIds).toContain(orgA.bookingId);
      expect(bookingIds).not.toContain(orgB.bookingId);
    });

    it('GET /organizers/me/passengers?cruiseId=<outro organizador> devolve 404', async () => {
      await request(server()).get(`/organizers/me/passengers?cruiseId=${orgB.cruiseId}`).set(orgA.orgAuth).expect(404);
    });
  });

  describe('dashboard: metricas de A nunca incluem receita/reservas de B', () => {
    it('a receita do dashboard geral de A reflete so a reserva de A', async () => {
      const res = await request(server()).get('/organizers/me/dashboard').set(orgA.orgAuth).expect(200);
      expect(Number(res.body.revenue)).toBeCloseTo(Number(orgA.totalAmount), 2);
      expect(res.body.confirmedBookingsCount).toBe(1);
      expect(res.body.passengersCount).toBe(1);
    });

    it('o dashboard de B nao contem a receita de A (numeros diferentes, cada um so com o proprio)', async () => {
      const [resA, resB] = await Promise.all([
        request(server()).get('/organizers/me/dashboard').set(orgA.orgAuth).expect(200),
        request(server()).get('/organizers/me/dashboard').set(orgB.orgAuth).expect(200),
      ]);
      expect(Number(resA.body.revenue)).toBeCloseTo(Number(orgA.totalAmount), 2);
      expect(Number(resB.body.revenue)).toBeCloseTo(Number(orgB.totalAmount), 2);
    });

    it('passar o cruiseId de OUTRO organizador no filtro do dashboard devolve 404, nunca os dados dele', async () => {
      await request(server()).get(`/organizers/me/dashboard?cruiseId=${orgB.cruiseId}`).set(orgA.orgAuth).expect(404);
    });

    it('top eventos/experiencias do dashboard de A citam o evento/experiencia de A, nunca o de B', async () => {
      await request(server())
        .post(`/bookings/${orgA.bookingId}/event-reservations/${orgA.eventId}`)
        .set(orgA.passengerAuth)
        .send({ partySize: 1 })
        .expect(200);

      const res = await request(server()).get('/organizers/me/dashboard').set(orgA.orgAuth).expect(200);
      const eventIds = res.body.topEvents.map((e: { eventId: string }) => e.eventId);
      expect(eventIds).toContain(orgA.eventId);
      expect(eventIds).not.toContain(orgB.eventId);
    });
  });

  describe('escrita: PATCH/POST em recurso de OUTRO organizador nunca e permitido (404, sem revelar existencia)', () => {
    it('PATCH /ships/:id de outro organizador', async () => {
      await request(server()).patch(`/ships/${orgB.shipId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('PATCH /decks/:id de outro organizador', async () => {
      await request(server()).patch(`/decks/${orgB.deckId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('PATCH /cabin-categories/:id de outro organizador', async () => {
      await request(server()).patch(`/cabin-categories/${orgB.cabinCategoryId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('PATCH /cabins/:id de outro organizador', async () => {
      await request(server()).patch(`/cabins/${orgB.cabinId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('PATCH /venues/:id de outro organizador', async () => {
      await request(server()).patch(`/venues/${orgB.venueId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('PATCH /restaurants/:id de outro organizador', async () => {
      await request(server()).patch(`/restaurants/${orgB.restaurantId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('POST /restaurants/:id/dining-slots de outro organizador nunca cria a linha', async () => {
      const res = await request(server())
        .post(`/restaurants/${orgB.restaurantId}/dining-slots`)
        .set(orgA.orgAuth)
        .send({ label: 'Invasao', startTime: '1970-01-01T19:00:00.000Z', endTime: '1970-01-01T21:00:00.000Z', capacity: 10 });
      expect([403, 404]).toContain(res.status);
    });

    it('PATCH /dining-slots/:id de outro organizador', async () => {
      const res = await request(server()).patch(`/dining-slots/${orgB.diningSlotId}`).set(orgA.orgAuth).send({});
      expect([403, 404]).toContain(res.status);
    });

    it('PATCH /cruises/:id de outro organizador', async () => {
      await request(server()).patch(`/cruises/${orgB.cruiseId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('POST /cruises/:id/pricing de outro organizador', async () => {
      await request(server())
        .post(`/cruises/${orgB.cruiseId}/pricing`)
        .set(orgA.orgAuth)
        .send({ cabinCategoryId: orgB.cabinCategoryId, price: 1 })
        .expect(404);
    });

    it('POST /cruises/:id/publish e /unpublish de outro organizador', async () => {
      await request(server()).post(`/cruises/${orgB.cruiseId}/publish`).set(orgA.orgAuth).expect(404);
      await request(server()).post(`/cruises/${orgB.cruiseId}/unpublish`).set(orgA.orgAuth).expect(404);
    });

    it('PATCH /events/:id de outro organizador', async () => {
      await request(server()).patch(`/events/${orgB.eventId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('POST /events (criar sob o cruzeiro de outro organizador)', async () => {
      await request(server())
        .post('/events')
        .set(orgA.orgAuth)
        .send({
          cruiseId: orgB.cruiseId,
          venueId: orgA.venueId,
          title: 'Invasao',
          startAt: '2027-11-02T20:00:00.000Z',
          endAt: '2027-11-02T22:00:00.000Z',
        })
        .expect(404);
    });

    it('PATCH /experiences/:id de outro organizador', async () => {
      await request(server()).patch(`/experiences/${orgB.experienceId}`).set(orgA.orgAuth).send({}).expect(404);
    });

    it('POST /experiences (criar sob o cruzeiro de outro organizador)', async () => {
      await request(server())
        .post('/experiences')
        .set(orgA.orgAuth)
        .send({ cruiseId: orgB.cruiseId, title: 'Invasao' })
        .expect(404);
    });
  });

  describe('direto no banco: nenhuma reserva/hospede de B aparece nos dados agregados de A', () => {
    it('a soma de passageiros do dashboard de A bate com o numero real de BookingGuest das reservas de A, nunca incluindo B', async () => {
      const guestsA = await prisma.bookingGuest.count({ where: { booking: { cruiseId: orgA.cruiseId } } });
      const res = await request(server()).get('/organizers/me/dashboard').set(orgA.orgAuth).expect(200);
      expect(res.body.passengersCount).toBe(guestsA);
    });
  });
});

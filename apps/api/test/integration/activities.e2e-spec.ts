import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Experiencia interna do cruzeiro (ver
 * docs/architecture/decisions/0014-onboard-activity-reservations.md) contra
 * Postgres real: prova que a estrategia de `SELECT ... FOR UPDATE` no
 * Event/DiningSlot de fato impede overbooking sob concorrencia verdadeira
 * (Promise.all, sem await entre os disparos — mesmo padrao de
 * cabin-hold-concurrency.e2e-spec.ts), e que conflitos de horario na agenda
 * do proprio passageiro sao rejeitados.
 */
describe('Onboard activities — event/dining reservations (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  let cruiseId: string;
  let cruiseSlug: string;
  let cabinCategoryId: string;
  let deckId: string;
  let shipId: string;
  let venueId: string;
  let artistId: string;
  let restaurantId: string;
  let orgAuth: { Authorization: string };
  let passengerTokens: string[];
  let cabinSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('activities');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Activities Test Admin',
      })
      .expect(201);
    orgAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const port = await prisma.port.create({ data: { name: `Porto ${label}`, country: 'Brasil' } });

    const ship = await request(server())
      .post('/ships')
      .set(orgAuth)
      .send({ name: `Navio ${label}`, passengerCapacity: 500 })
      .expect(201);
    shipId = ship.body.id;

    const category = await request(server())
      .post(`/ships/${shipId}/cabin-categories`)
      .set(orgAuth)
      .send({ name: 'Interna', maxOccupancy: 4 })
      .expect(201);
    cabinCategoryId = category.body.id;

    const deck = await request(server())
      .post(`/ships/${shipId}/decks`)
      .set(orgAuth)
      .send({ number: 1, name: `Deck ${label}` })
      .expect(201);
    deckId = deck.body.id;

    const venue = await request(server())
      .post(`/ships/${shipId}/venues`)
      .set(orgAuth)
      .send({ name: `Teatro ${label}`, type: 'THEATER', capacity: 500 })
      .expect(201);
    venueId = venue.body.id;

    // Artistas sao dado de referencia compartilhado, criacao restrita a PLATFORM_ADMIN desde o
    // hardening de ADR-0020 — organizador nao consegue mais criar via API, semeado direto.
    const artist = await prisma.artist.create({ data: { name: `Artista ${label}` } });
    artistId = artist.id;

    const restaurant = await request(server())
      .post(`/ships/${shipId}/restaurants`)
      .set(orgAuth)
      .send({ name: `Restaurante ${label}`, cuisineType: 'Internacional' })
      .expect(201);
    restaurantId = restaurant.body.id;

    const cruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
      .send({
        shipId,
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
      .send({ cabinCategoryId, price: 2000 })
      .expect(201);
    await request(server()).post(`/cruises/${cruiseId}/publish`).set(orgAuth).expect(200);

    const passengerCount = 10;
    const registrations = await Promise.all(
      Array.from({ length: passengerCount }, (_, i) =>
        request(server())
          .post('/auth/register')
          .send({ email: `passenger-${i}.${label}@example.com`, password: 'SenhaForte123', fullName: `Passageiro ${i}` })
          .expect(201),
      ),
    );
    passengerTokens = registrations.map((r) => r.body.accessToken as string);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  async function freshCabin(): Promise<string> {
    cabinSeq += 1;
    const cabin = await request(server())
      .post(`/decks/${deckId}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId, code: `AC${cabinSeq}` })
      .expect(201);
    return cabin.body.id as string;
  }

  /** Reserva + hospede + checkout PIX (aprova sincrono) — devolve uma reserva CONFIRMED de verdade. */
  async function confirmedBooking(token: string): Promise<string> {
    const cabinId = await freshCabin();
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set(auth(token))
      .send()
      .expect(201);
    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set(auth(token))
      .send({ guests: [{ fullName: 'Titular Atividades', documentType: 'PASSPORT', documentNumber: unique('DOC'), isPrimary: true }] })
      .expect(200);
    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set(auth(token))
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');
    return hold.body.id as string;
  }

  async function createEvent(capacity: number, startAt: string, endAt: string): Promise<string> {
    const event = await request(server())
      .post('/events')
      .set(orgAuth)
      .send({ cruiseId, venueId, artistId, title: unique('Show'), startAt, endAt, capacity })
      .expect(201);
    return event.body.id as string;
  }

  /**
   * Cria N reservas CONFIRMED, uma por token, SEQUENCIALMENTE — a corrida de
   * verdade que estes testes provam esta no burst final de reservas de
   * atividade (Promise.all logo abaixo), nao no setup. Criar os bookings em
   * serie evita rajadas de dezenas de conexoes HTTP `connection: close`
   * simultaneas no loopback do Windows, que produzem ECONNRESET esporadico
   * sem relacao nenhuma com a logica sob teste.
   */
  async function confirmedBookingsSequential(tokens: string[]): Promise<string[]> {
    const bookingIds: string[] = [];
    for (const token of tokens) {
      bookingIds.push(await confirmedBooking(token));
    }
    return bookingIds;
  }

  async function createDiningSlot(capacity: number, startTime: string, endTime: string): Promise<string> {
    const slot = await request(server())
      .post(`/restaurants/${restaurantId}/dining-slots`)
      .set(orgAuth)
      .send({ label: unique('Turno'), startTime, endTime, capacity })
      .expect(201);
    return slot.body.id as string;
  }

  describe('reserving an event', () => {
    it('reserves successfully and shows up on the booking (adicionar a sua viagem)', async () => {
      const eventId = await createEvent(10, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);

      const reservation = await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 2 })
        .expect(200);
      expect(reservation.body.status).toBe('CONFIRMED');
      expect(reservation.body.partySize).toBe(2);

      const booking = await request(server()).get(`/bookings/${bookingId}`).set(auth(passengerTokens[0]!)).expect(200);
      expect(booking.body.eventReservations).toHaveLength(1);
      expect(booking.body.eventReservations[0].eventId).toBe(eventId);
    });

    it('rejects a single request whose party size exceeds the available capacity', async () => {
      const eventId = await createEvent(3, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);

      const res = await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 4 })
        .expect(409);
      expect(res.body.message).toMatch(/[Cc]apacidade/);
    });

    it('rejects reserving an event that belongs to a different cruise', async () => {
      // Segundo cruzeiro, mesmo navio, so pra ter um Event de outro cruiseId.
      const port = await prisma.port.create({ data: { name: unique('Porto B'), country: 'Brasil' } });
      const otherCruise = await request(server())
        .post('/cruises')
        .set(orgAuth)
        .send({
          shipId,
          title: unique('Outro cruzeiro'),
          theme: 'Teste',
          embarkationDate: '2028-01-01T12:00:00Z',
          disembarkationDate: '2028-01-05T12:00:00Z',
          embarkationPortId: port.id,
          disembarkationPortId: port.id,
        })
        .expect(201);
      const otherEvent = await request(server())
        .post('/events')
        .set(orgAuth)
        .send({
          cruiseId: otherCruise.body.id,
          venueId,
          artistId,
          title: unique('Show de outro cruzeiro'),
          startAt: '2028-01-02T20:00:00.000Z',
          endAt: '2028-01-02T22:00:00.000Z',
          capacity: 10,
        })
        .expect(201);

      const bookingId = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${otherEvent.body.id}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 1 })
        .expect(409);
    });

    it("404s when reserving on someone else's booking (never reveals it exists to a non-owner)", async () => {
      const eventId = await createEvent(10, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[1]!))
        .send({ partySize: 1 })
        .expect(404);
    });

    it('retrying the exact same reservation (same party size) is an idempotent no-op, not a conflict', async () => {
      const eventId = await createEvent(10, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 2 })
        .expect(200);
      const retry = await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 2 })
        .expect(200);
      expect(retry.body.status).toBe('CONFIRMED');

      const rows = await prisma.eventReservation.findMany({ where: { eventId, bookingId } });
      expect(rows).toHaveLength(1);
    });

    it('cancelling then reserving again frees and reclaims capacity', async () => {
      const eventId = await createEvent(1, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const bookingA = await confirmedBooking(passengerTokens[0]!);
      const bookingB = await confirmedBooking(passengerTokens[1]!);

      const first = await request(server())
        .post(`/bookings/${bookingA}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 1 })
        .expect(200);

      await request(server())
        .post(`/bookings/${bookingB}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[1]!))
        .send({ partySize: 1 })
        .expect(409);

      await request(server())
        .post(`/bookings/${bookingA}/event-reservations/${first.body.id}/cancel`)
        .set(auth(passengerTokens[0]!))
        .send()
        .expect(200);

      await request(server())
        .post(`/bookings/${bookingB}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[1]!))
        .send({ partySize: 1 })
        .expect(200);
    });
  });

  describe('overbooking prevention under real concurrency', () => {
    it('lets exactly `capacity` worth of N truly concurrent event reservations succeed, rejects the rest', async () => {
      const capacity = 5;
      const eventId = await createEvent(capacity, '2027-10-03T20:00:00.000Z', '2027-10-03T22:00:00.000Z');
      // 8 reservas CONFIRMED distintas (bookings diferentes) disputando 5 vagas, 1 pessoa cada.
      const bookingIds = await confirmedBookingsSequential(passengerTokens.slice(0, 8));

      const responses = await Promise.all(
        bookingIds.map((bookingId, i) =>
          request(server())
            .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
            .set(auth(passengerTokens[i]!))
            .send({ partySize: 1 }),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 200);
      const rejected = responses.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(capacity);
      expect(rejected).toHaveLength(bookingIds.length - capacity);

      // A garantia de verdade e o estado do banco, nao so a resposta HTTP.
      const sum = await prisma.eventReservation.aggregate({
        where: { eventId, status: 'CONFIRMED' },
        _sum: { partySize: true },
      });
      expect(sum._sum.partySize).toBe(capacity);
    });

    it('lets exactly `capacity` worth of N truly concurrent dining reservations succeed for the same date, rejects the rest', async () => {
      const capacity = 4;
      const diningSlotId = await createDiningSlot(capacity, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const reservationDate = '2027-10-03T00:00:00.000Z';
      const bookingIds = await confirmedBookingsSequential(passengerTokens.slice(0, 7));

      const responses = await Promise.all(
        bookingIds.map((bookingId, i) =>
          request(server())
            .post(`/bookings/${bookingId}/dining-reservations`)
            .set(auth(passengerTokens[i]!))
            .send({ diningSlotId, partySize: 1, reservationDate }),
        ),
      );

      const succeeded = responses.filter((r) => r.status === 200);
      const rejected = responses.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(capacity);
      expect(rejected).toHaveLength(bookingIds.length - capacity);

      const sum = await prisma.diningReservation.aggregate({
        where: { diningSlotId, status: 'CONFIRMED' },
        _sum: { partySize: true },
      });
      expect(sum._sum.partySize).toBe(capacity);
    });
  });

  describe('dining reservations', () => {
    it('rejects a reservation date outside the cruise sailing period', async () => {
      const diningSlotId = await createDiningSlot(20, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);
      const res = await request(server())
        .post(`/bookings/${bookingId}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 2, reservationDate: '2027-11-01T00:00:00.000Z' })
        .expect(409);
      expect(res.body.message).toMatch(/período do cruzeiro/);
    });

    it('rejects a party size beyond the remaining capacity for that specific date, but allows it on a different date', async () => {
      const diningSlotId = await createDiningSlot(2, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const bookingA = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingA}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 2, reservationDate: '2027-10-02T00:00:00.000Z' })
        .expect(200);

      const bookingB = await confirmedBooking(passengerTokens[1]!);
      await request(server())
        .post(`/bookings/${bookingB}/dining-reservations`)
        .set(auth(passengerTokens[1]!))
        .send({ diningSlotId, partySize: 1, reservationDate: '2027-10-02T00:00:00.000Z' })
        .expect(409);

      // Mesmo slot, DATA diferente — capacidade e por dia, nao global do slot.
      await request(server())
        .post(`/bookings/${bookingB}/dining-reservations`)
        .set(auth(passengerTokens[1]!))
        .send({ diningSlotId, partySize: 1, reservationDate: '2027-10-03T00:00:00.000Z' })
        .expect(200);
    });
  });

  describe('conflitos de horario na agenda do passageiro', () => {
    it('rejects a dining reservation that overlaps an event already on the same booking', async () => {
      const eventId = await createEvent(10, '2027-10-04T19:30:00.000Z', '2027-10-04T21:00:00.000Z');
      const diningSlotId = await createDiningSlot(20, '1970-01-01T20:00:00.000Z', '1970-01-01T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);

      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 1 })
        .expect(200);

      const res = await request(server())
        .post(`/bookings/${bookingId}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 1, reservationDate: '2027-10-04T00:00:00.000Z' })
        .expect(409);
      expect(res.body.message).toMatch(/[Cc]onflito de horário/);
    });

    it('allows two activities on the same booking when they only touch at the boundary (no gap needed)', async () => {
      const eventId = await createEvent(10, '2027-10-04T19:00:00.000Z', '2027-10-04T20:00:00.000Z');
      const diningSlotId = await createDiningSlot(20, '1970-01-01T20:00:00.000Z', '1970-01-01T22:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);

      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 1 })
        .expect(200);

      await request(server())
        .post(`/bookings/${bookingId}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 1, reservationDate: '2027-10-04T00:00:00.000Z' })
        .expect(200);
    });
  });

  describe('availability', () => {
    it('reflects reserved party size for an event', async () => {
      const eventId = await createEvent(10, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const before = await request(server()).get(`/events/${eventId}/availability`).expect(200);
      expect(before.body).toEqual({ capacity: 10, reserved: 0, available: 10 });

      const bookingId = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 3 })
        .expect(200);

      const after = await request(server()).get(`/events/${eventId}/availability`).expect(200);
      expect(after.body).toEqual({ capacity: 10, reserved: 3, available: 7 });
    });

    it('reflects reserved party size for a dining slot on a given date', async () => {
      const diningSlotId = await createDiningSlot(10, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const before = await request(server())
        .get(`/dining-slots/${diningSlotId}/availability`)
        .query({ date: '2027-10-03T00:00:00.000Z' })
        .expect(200);
      expect(before.body).toEqual({ capacity: 10, reserved: 0, available: 10 });

      const bookingId = await confirmedBooking(passengerTokens[0]!);
      await request(server())
        .post(`/bookings/${bookingId}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 4, reservationDate: '2027-10-03T00:00:00.000Z' })
        .expect(200);

      const after = await request(server())
        .get(`/dining-slots/${diningSlotId}/availability`)
        .query({ date: '2027-10-03T00:00:00.000Z' })
        .expect(200);
      expect(after.body).toEqual({ capacity: 10, reserved: 4, available: 6 });
    });

    it('rejects a non-parseable date query param with 400 instead of a raw 500', async () => {
      const diningSlotId = await createDiningSlot(10, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      await request(server())
        .get(`/dining-slots/${diningSlotId}/availability`)
        .query({ date: 'nao-e-uma-data' })
        .expect(400);
    });

    it('cancelling the whole booking frees the capacity held by its event/dining reservations (bug found and fixed in the 2026-09-05 general review)', async () => {
      const eventId = await createEvent(10, '2027-10-02T20:00:00.000Z', '2027-10-02T22:00:00.000Z');
      const diningSlotId = await createDiningSlot(10, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const bookingId = await confirmedBooking(passengerTokens[0]!);

      await request(server())
        .post(`/bookings/${bookingId}/event-reservations/${eventId}`)
        .set(auth(passengerTokens[0]!))
        .send({ partySize: 3 })
        .expect(200);
      await request(server())
        .post(`/bookings/${bookingId}/dining-reservations`)
        .set(auth(passengerTokens[0]!))
        .send({ diningSlotId, partySize: 4, reservationDate: '2027-10-03T00:00:00.000Z' })
        .expect(200);

      const beforeCancel = await request(server()).get(`/events/${eventId}/availability`).expect(200);
      expect(beforeCancel.body).toEqual({ capacity: 10, reserved: 3, available: 7 });

      await request(server())
        .post(`/bookings/${bookingId}/cancel`)
        .set(auth(passengerTokens[0]!))
        .send({})
        .expect(200);

      const afterEvent = await request(server()).get(`/events/${eventId}/availability`).expect(200);
      expect(afterEvent.body).toEqual({ capacity: 10, reserved: 0, available: 10 });

      const afterDining = await request(server())
        .get(`/dining-slots/${diningSlotId}/availability`)
        .query({ date: '2027-10-03T00:00:00.000Z' })
        .expect(200);
      expect(afterDining.body).toEqual({ capacity: 10, reserved: 0, available: 10 });
    });
  });

  describe('dining slot management (organizer)', () => {
    it('rejects (404, not 403 — see ADR-0005) creating a dining slot for a restaurant owned by a different organizer', async () => {
      const otherOrg = await request(server())
        .post('/auth/register/organizer')
        .send({
          organizerName: unique('Outro Organizador'),
          organizerEmail: `${unique('outro-org')}@example.com`,
          adminEmail: `${unique('outro-admin')}@example.com`,
          adminPassword: 'SenhaForte123',
          adminFullName: 'Outro Admin',
        })
        .expect(201);

      await request(server())
        .post(`/restaurants/${restaurantId}/dining-slots`)
        .set(auth(otherOrg.body.accessToken))
        .send({ label: 'Invasao', startTime: '1970-01-01T19:00:00.000Z', endTime: '1970-01-01T21:00:00.000Z', capacity: 10 })
        .expect(404);
    });

    it('updates an existing dining slot capacity', async () => {
      const diningSlotId = await createDiningSlot(10, '1970-01-01T19:00:00.000Z', '1970-01-01T21:00:00.000Z');
      const updated = await request(server())
        .patch(`/dining-slots/${diningSlotId}`)
        .set(orgAuth)
        .send({ capacity: 25 })
        .expect(200);
      expect(updated.body.capacity).toBe(25);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Requer Postgres/Redis reais. Prova, contra o motor real (nao mockado),
 * que a estrategia de concorrencia do ADR-0009 (transacao + `SELECT ...
 * FOR UPDATE` na cabine + expiracao inline + indice unico parcial) de fato
 * impede overbooking: dispara N tentativas de hold verdadeiramente
 * concorrentes (via `Promise.all`, sem await entre elas) para a MESMA
 * cabine, de N usuarios diferentes, e verifica que so uma vence.
 */
describe('Cabin hold concurrency (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseId: string;
  let cruiseSlug: string;
  let cabinId: string;
  let passengerTokens: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('concurrency');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Concurrency Test Admin',
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

    const cabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId: category.body.id, code: '101' })
      .expect(201);
    cabinId = cabin.body.id;

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

    // N passageiros distintos — cada "tentativa concorrente" e uma pessoa real diferente.
    const passengerCount = 12;
    const registrations = await Promise.all(
      Array.from({ length: passengerCount }, (_, i) =>
        request(server())
          .post('/auth/register')
          .send({
            email: `passenger-${i}.${label}@example.com`,
            password: 'SenhaForte123',
            fullName: `Passageiro Concorrente ${i}`,
          })
          .expect(201),
      ),
    );
    passengerTokens = registrations.map((r) => r.body.accessToken as string);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  async function activeBookingsForCabin() {
    return prisma.booking.findMany({
      where: { cabinId, cruiseId, status: { in: ['HELD', 'CONFIRMED'] } },
    });
  }

  it('lets exactly one of N truly concurrent hold attempts on the same cabin succeed', async () => {
    expect(await activeBookingsForCabin()).toHaveLength(0);

    // Promise.all sem await entre os disparos — todas as N requisicoes saem
    // "ao mesmo tempo", exercitando de verdade a corrida no Postgres (nao
    // uma simulacao sequencial disfarcada de concorrente).
    const responses = await Promise.all(
      passengerTokens.map((token) =>
        request(server())
          .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
          .set('Authorization', `Bearer ${token}`)
          .send(),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(passengerTokens.length - 1);
    expect(conflicted.every((r) => /reservada|processo de reserva/.test(r.body.message))).toBe(true);

    // A garantia de verdade nao e so a resposta HTTP — e o estado do banco.
    const active = await activeBookingsForCabin();
    expect(active).toHaveLength(1);
    expect(active[0]?.status).toBe('HELD');

    // Limpa para os proximos testes deste arquivo.
    await prisma.booking.update({
      where: { id: active[0]!.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Limpeza de teste.' },
    });
  });

  it('allows a fresh concurrent race to succeed again after the winning hold is released (lock does not leak)', async () => {
    expect(await activeBookingsForCabin()).toHaveLength(0);

    const responses = await Promise.all(
      passengerTokens.map((token) =>
        request(server())
          .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
          .set('Authorization', `Bearer ${token}`)
          .send(),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(passengerTokens.length - 1);
    // Deliberadamente sem limpeza aqui — o proximo teste usa este HELD
    // que sobrou (Jest roda os `it` deste arquivo em ordem sequencial).
  });

  it('confirming payment concurrently N times is safe: idempotent by state, no double side effect', async () => {
    const active = await activeBookingsForCabin();
    const booking = active[0];
    expect(booking).toBeDefined();

    // Descobre quem e o dono de verdade pra usar o token certo.
    const owner = await prisma.booking.findUniqueOrThrow({ where: { id: booking!.id } });
    const ownerIndex = registrationIndexForUser(owner.userId);
    const token = passengerTokens[ownerIndex];

    // Precisa de hospede + checkout antes de o pagamento poder ser confirmado.
    await request(server())
      .put(`/bookings/${booking!.id}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        guests: [{ fullName: 'Titular Concorrencia', documentType: 'PASSPORT', documentNumber: 'CT123456', isPrimary: true }],
      })
      .expect(200);
    await request(server())
      .post(`/bookings/${booking!.id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(server())
          .post(`/bookings/${booking!.id}/confirm-payment`)
          .set('Authorization', `Bearer ${token}`)
          .send(),
      ),
    );

    // confirmPayment e idempotente por estado (ADR-0010) — nao ha "perdedor" aqui: um
    // retry de callback de gateway ja processado devolve o estado atual, nao um erro.
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.every((r) => r.body.status === 'CONFIRMED')).toBe(true);

    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking!.id } });
    expect(confirmed.status).toBe('CONFIRMED');

    // A prova de que nao houve efeito colateral duplicado: um unico Payment aprovado.
    const payments = await prisma.payment.findMany({ where: { bookingId: booking!.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe('APPROVED');

    await prisma.booking.update({
      where: { id: booking!.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Limpeza de teste.' },
    });
  });

  it('lets exactly one of N concurrent release attempts on the same HELD booking succeed', async () => {
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${passengerTokens[0]}`)
      .send()
      .expect(201);

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(server())
          .post(`/bookings/${hold.body.id}/release`)
          .set('Authorization', `Bearer ${passengerTokens[0]}`)
          .send(),
      ),
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(responses.length - 1);

    const released = await prisma.booking.findUniqueOrThrow({ where: { id: hold.body.id } });
    expect(released.status).toBe('CANCELLED');
  });

  // Mapa userId -> indice do array de tokens, construido a partir dos
  // registros feitos no beforeAll (mesma ordem de passengerTokens).
  const userIdByIndex: Record<number, string> = {};
  function registrationIndexForUser(userId: string): number {
    const known = Object.entries(userIdByIndex).find(([, id]) => id === userId);
    if (known) return Number(known[0]);
    // Preenchido sob demanda: decodifica o JWT (sem verificar assinatura,
    // so leitura) pra achar o indice correspondente da primeira vez.
    for (let i = 0; i < passengerTokens.length; i += 1) {
      const payload = JSON.parse(Buffer.from(passengerTokens[i]!.split('.')[1]!, 'base64url').toString());
      userIdByIndex[i] = payload.sub;
      if (payload.sub === userId) return i;
    }
    throw new Error(`Nenhum token corresponde ao userId ${userId}`);
  }
});

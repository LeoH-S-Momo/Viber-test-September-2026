import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Requer Postgres/Redis reais (ver infra/docker-compose.test.yml). Monta um
 * fixture proprio (organizador + navio + 3 cruzeiros, 2 publicados com
 * precos/temas/destinos diferentes e 1 em DRAFT) uma vez em `beforeAll` e
 * reusa entre os testes de descoberta — nao depende do seed de demonstracao.
 */
describe('Catalog discovery (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cheapCruiseId: string;
  let expensiveCruiseId: string;
  let draftCruiseId: string;
  let organizerId: string;
  let portA: { id: string; name: string };
  let portB: { id: string; name: string };
  let shipId: string;
  let bookedCabinId: string;
  let freeCabinId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('catalog');
    const register = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Catalog Test Admin',
      })
      .expect(201);
    const token = register.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };
    organizerId = register.body.user.roles[0].organizerId;

    portA = await prisma.port.create({ data: { name: `Porto A ${label}`, country: 'Brasil' } });
    portB = await prisma.port.create({ data: { name: `Porto B ${label}`, country: 'Brasil' } });

    const ship = await request(server())
      .post('/ships')
      .set(auth)
      .send({ name: `Navio ${label}`, passengerCapacity: 500 })
      .expect(201);
    shipId = ship.body.id;

    const category = await request(server())
      .post(`/ships/${ship.body.id}/cabin-categories`)
      .set(auth)
      .send({ name: 'Interna', maxOccupancy: 2 })
      .expect(201);

    async function createPublishedCruise(opts: {
      title: string;
      theme: string;
      price: number;
      embarkationPortId: string;
      embarkationDate: string;
    }) {
      const cruise = await request(server())
        .post('/cruises')
        .set(auth)
        .send({
          shipId: ship.body.id,
          title: opts.title,
          theme: opts.theme,
          embarkationDate: opts.embarkationDate,
          disembarkationDate: '2027-12-31T12:00:00Z',
          embarkationPortId: opts.embarkationPortId,
          disembarkationPortId: opts.embarkationPortId,
        })
        .expect(201);

      await request(server())
        .post(`/cruises/${cruise.body.id}/itinerary-stops`)
        .set(auth)
        .send({ portId: opts.embarkationPortId, dayNumber: 1, isEmbarkation: true })
        .expect(201);
      await request(server())
        .post(`/cruises/${cruise.body.id}/pricing`)
        .set(auth)
        .send({ cabinCategoryId: category.body.id, price: opts.price })
        .expect(201);
      await request(server())
        .post(`/cruises/${cruise.body.id}/publish`)
        .set(auth)
        .expect(200);

      return cruise.body.id as string;
    }

    cheapCruiseId = await createPublishedCruise({
      title: `Cruzeiro Barato ${label}`,
      theme: `TemaX-${label}`,
      price: 500,
      embarkationPortId: portA.id,
      embarkationDate: '2027-10-01T12:00:00Z',
    });
    expensiveCruiseId = await createPublishedCruise({
      title: `Cruzeiro Caro ${label}`,
      theme: `TemaX-${label}`,
      price: 8000,
      embarkationPortId: portB.id,
      embarkationDate: '2027-11-01T12:00:00Z',
    });

    const deck = await request(server())
      .post(`/ships/${shipId}/decks`)
      .set(auth)
      .send({ number: 5, name: `Deck ${label}` })
      .expect(201);

    const bookedCabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(auth)
      .send({ cabinCategoryId: category.body.id, code: '101' })
      .expect(201);
    bookedCabinId = bookedCabin.body.id;

    const freeCabin = await request(server())
      .post(`/decks/${deck.body.id}/cabins`)
      .set(auth)
      .send({ cabinCategoryId: category.body.id, code: '102' })
      .expect(201);
    freeCabinId = freeCabin.body.id;

    // So precisamos de uma reserva CONFIRMED pra testar a projecao de
    // disponibilidade no deck-map — sem hospedes/checkout, direto via
    // Prisma (o fluxo completo de reserva e testado em bookings.e2e-spec.ts).
    const passenger = await prisma.user.findFirstOrThrow({ where: { email: `admin.${label}@example.com` } });
    await prisma.booking.create({
      data: {
        userId: passenger.id,
        cruiseId: cheapCruiseId,
        cabinId: bookedCabinId,
        status: 'CONFIRMED',
        subtotalAmount: 500,
        totalAmount: 500,
      },
    });

    const draft = await request(server())
      .post('/cruises')
      .set(auth)
      .send({
        shipId: ship.body.id,
        title: `Cruzeiro Rascunho ${label}`,
        theme: `TemaX-${label}`,
        embarkationDate: '2027-09-01T12:00:00Z',
        disembarkationDate: '2027-09-05T12:00:00Z',
        embarkationPortId: portA.id,
        disembarkationPortId: portA.id,
      })
      .expect(201);
    draftCruiseId = draft.body.id;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('never returns a DRAFT cruise on the public catalog', async () => {
    // organizerId escopa a este teste — ver comentario em "sorts by price ascending and descending".
    const res = await request(server()).get(`/cruises?pageSize=100&organizerId=${organizerId}`).expect(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);

    expect(ids).toContain(cheapCruiseId);
    expect(ids).toContain(expensiveCruiseId);
    expect(ids).not.toContain(draftCruiseId);
  });

  it('404s a draft cruise detail even by its slug', async () => {
    const draft = await prisma.cruise.findUniqueOrThrow({ where: { id: draftCruiseId } });
    await request(server()).get(`/cruises/${draft.slug}`).expect(404);
  });

  it('filters by price range', async () => {
    const res = await request(server())
      .get(`/cruises?minPrice=1000&maxPrice=10000&pageSize=100&organizerId=${organizerId}`)
      .expect(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);

    expect(ids).toContain(expensiveCruiseId);
    expect(ids).not.toContain(cheapCruiseId);
  });

  it('filters by destination (port name)', async () => {
    const res = await request(server())
      .get(`/cruises?destination=${encodeURIComponent(portB.name)}&pageSize=100`)
      .expect(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);

    expect(ids).toContain(expensiveCruiseId);
    expect(ids).not.toContain(cheapCruiseId);
  });

  it('filters by embarkation period', async () => {
    const res = await request(server())
      .get(
        `/cruises?embarkationFrom=2027-10-15T00:00:00Z&embarkationTo=2027-11-15T00:00:00Z&pageSize=100&organizerId=${organizerId}`,
      )
      .expect(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);

    expect(ids).toContain(expensiveCruiseId);
    expect(ids).not.toContain(cheapCruiseId);
  });

  it('sorts by price ascending and descending', async () => {
    // Filtra por organizerId (escopado a este teste) em vez de listar sem filtro: com varios
    // arquivos de integracao rodando em paralelo (cada um cria/publica seus proprios cruzeiros),
    // a paginacao padrao poderia nao conter os dois cruzeiros deste teste especifico.
    const asc = await request(server())
      .get(`/cruises?sortBy=price&sortOrder=asc&pageSize=100&organizerId=${organizerId}`)
      .expect(200);
    const ascIds = asc.body.data.map((c: { id: string }) => c.id);
    expect(ascIds.indexOf(cheapCruiseId)).toBeLessThan(ascIds.indexOf(expensiveCruiseId));

    const desc = await request(server())
      .get(`/cruises?sortBy=price&sortOrder=desc&pageSize=100&organizerId=${organizerId}`)
      .expect(200);
    const descIds = desc.body.data.map((c: { id: string }) => c.id);
    expect(descIds.indexOf(expensiveCruiseId)).toBeLessThan(descIds.indexOf(cheapCruiseId));
  });

  it('deck-map cross-references cabins with real pricing and a real booking for this cruise', async () => {
    const cheap = await prisma.cruise.findUniqueOrThrow({ where: { id: cheapCruiseId } });

    const res = await request(server()).get(`/cruises/${cheap.slug}/deck-map`).expect(200);
    const cabins = res.body.flatMap((deck: { cabins: unknown[] }) => deck.cabins) as Array<{
      id: string;
      price: string | null;
      availability: string;
    }>;

    const booked = cabins.find((c) => c.id === bookedCabinId);
    const free = cabins.find((c) => c.id === freeCabinId);

    expect(booked).toMatchObject({ availability: 'BOOKED' });
    expect(free).toMatchObject({ availability: 'AVAILABLE' });
    expect(Number(booked?.price)).toBe(500);
    expect(Number(free?.price)).toBe(500);
  });

  it('deck-map 404s for a draft cruise, same rule as the public catalog', async () => {
    const draft = await prisma.cruise.findUniqueOrThrow({ where: { id: draftCruiseId } });
    await request(server()).get(`/cruises/${draft.slug}/deck-map`).expect(404);
  });

  it('paginates results', async () => {
    const page1 = await request(server())
      .get('/cruises?pageSize=1&page=1&sortBy=title&sortOrder=asc')
      .expect(200);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.meta.page).toBe(1);
    expect(page1.body.meta.total).toBeGreaterThanOrEqual(2);

    const page2 = await request(server())
      .get('/cruises?pageSize=1&page=2&sortBy=title&sortOrder=asc')
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
  });
});

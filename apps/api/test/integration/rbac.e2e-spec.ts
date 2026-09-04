import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleKey } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { UsersService } from '../../src/modules/users/users.service';

/**
 * Requer Postgres/Redis reais (ver infra/docker-compose.test.yml). Tudo aqui
 * e criado dentro do proprio teste (via API publica, ou via UsersService no
 * caso do platform admin, que nao tem endpoint de auto-cadastro) — nao
 * depende do seed de demonstracao, que so roda em dev/manual, nao no CI.
 */
describe('RBAC (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    usersService = app.get(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const unique = (label: string) => `${label}.${Date.now()}.${Math.random().toString(36).slice(2)}`;

  async function registerPassenger() {
    const email = `${unique('passenger')}@example.com`;
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: 'Passageiro' })
      .expect(201);
    return { email, accessToken: res.body.accessToken as string };
  }

  async function registerOrganizer(name: string) {
    const label = unique(name);
    const res = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: label,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Admin Organizador',
      })
      .expect(201);
    return {
      accessToken: res.body.accessToken as string,
      organizerId: res.body.user.roles[0].organizerId as string,
    };
  }

  it('passenger cannot reach organizer- or admin-only endpoints', async () => {
    const { accessToken } = await registerPassenger();

    await request(server())
      .post('/organizers/me/staff')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'x@x.com', password: 'SenhaForte123', fullName: 'X' })
      .expect(403);

    await request(server())
      .get('/admin/organizers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('unauthenticated requests to protected endpoints get 401, not 403', async () => {
    await request(server()).get('/bookings/me').expect(401);
    await request(server()).get('/admin/organizers').expect(401);
  });

  it('an organizer admin can manage their own organizer but not another one', async () => {
    const orgA = await registerOrganizer('orga');
    const orgB = await registerOrganizer('orgb');

    // Port e dado de referencia curado pelo admin da plataforma (ver
    // docs/architecture/api-permissions.md) — criado direto no banco aqui de
    // proposito, nao e o que este teste esta verificando.
    const port = await prisma.port.create({
      data: { name: `Porto ${unique('port')}`, country: 'Brasil' },
    });

    const shipRes = await request(server())
      .post('/ships')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Navio de Teste', passengerCapacity: 100 })
      .expect(201);
    const shipId = shipRes.body.id;

    const categoryRes = await request(server())
      .post(`/ships/${shipId}/cabin-categories`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Interna', maxOccupancy: 2 })
      .expect(201);

    const cruiseTitle = `Cruzeiro ${unique('cruise')}`;
    const createCruise = await request(server())
      .post('/cruises')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({
        shipId,
        title: cruiseTitle,
        theme: 'Teste',
        embarkationDate: '2027-05-01T12:00:00Z',
        disembarkationDate: '2027-05-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(201);
    const cruiseId = createCruise.body.id;

    // Sem itinerario/preco a publicacao e recusada (regra de negocio, nao RBAC).
    await request(server())
      .post(`/cruises/${cruiseId}/publish`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(409);

    await request(server())
      .post(`/cruises/${cruiseId}/itinerary-stops`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ portId: port.id, dayNumber: 1, isEmbarkation: true })
      .expect(201);
    await request(server())
      .post(`/cruises/${cruiseId}/pricing`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ cabinCategoryId: categoryRes.body.id, price: 1500 })
      .expect(201);

    // orgA consegue publicar o proprio cruzeiro
    const published = await request(server())
      .post(`/cruises/${cruiseId}/publish`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');

    // orgB NAO consegue editar/publicar/despublicar — nem sabe que o recurso existe (404, nao 403)
    await request(server())
      .patch(`/cruises/${cruiseId}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ title: 'Sequestrado' })
      .expect(404);
    await request(server())
      .post(`/cruises/${cruiseId}/unpublish`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(404);

    // orgB tambem nao pode usar o navio de orgA para criar um cruzeiro — 404
    // (nao 403), mesmo principio de nao revelar a existencia do recurso.
    await request(server())
      .post('/cruises')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({
        shipId,
        title: 'Nao deveria existir',
        theme: 'Teste',
        embarkationDate: '2027-06-01T12:00:00Z',
        disembarkationDate: '2027-06-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(404);

    // O catalogo publico mostra o cruzeiro publicado, mas nao aparece para quem nao esta logado
    // como se fosse de outro organizador — so confirma que esta visivel e com o preco certo.
    // Filtra por `q` (busca livre pelo titulo, unico por teste) em vez de listar sem filtro: com
    // varios arquivos de integracao rodando em paralelo (cada um cria/publica seus proprios
    // cruzeiros), a paginacao padrao (20 por pagina) pode nao conter este cruzeiro especifico.
    const publicList = await request(server())
      .get(`/cruises?q=${encodeURIComponent(cruiseTitle)}`)
      .expect(200);
    const found = publicList.body.data.find((c: { id: string }) => c.id === cruiseId);
    expect(found).toBeDefined();
    expect(found.cabinPricings[0].price).toBe('1500');
  });

  it('organizer staff can check in a ticket but cannot invite other staff', async () => {
    const org = await registerOrganizer('staffscope');

    const inviteRes = await request(server())
      .post('/organizers/me/staff')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({
        email: `staff.${unique('s')}@example.com`,
        password: 'SenhaForte123',
        fullName: 'Staff',
      })
      .expect(201);
    expect(inviteRes.body.roles).toEqual([
      { key: 'ORGANIZER_STAFF', organizerId: org.organizerId },
    ]);

    const staffLogin = await request(server())
      .post('/auth/login')
      .send({
        email: inviteRes.body.email,
        password: 'SenhaForte123',
      })
      .expect(200);

    // staff NAO pode convidar outro staff (isso e ORGANIZER_ADMIN only)
    await request(server())
      .post('/organizers/me/staff')
      .set('Authorization', `Bearer ${staffLogin.body.accessToken}`)
      .send({ email: 'outro@x.com', password: 'SenhaForte123', fullName: 'Outro' })
      .expect(403);
  });

  it('platform admin can list and approve organizers; nobody else can', async () => {
    // Nao ha endpoint de auto-cadastro para PLATFORM_ADMIN (por design — ver
    // docs/architecture/api-permissions.md), entao criamos direto via UsersService,
    // do mesmo jeito que o seed de demonstracao faz.
    const adminEmail = `admin.${unique('platform')}@example.com`;
    const passwordHash = await usersService.hashPassword('SenhaForte123');
    await usersService.createUserWithRole({
      email: adminEmail,
      passwordHash,
      fullName: 'Platform Admin de Teste',
      roleKey: RoleKey.PLATFORM_ADMIN,
    });
    const admin = await request(server())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'SenhaForte123' })
      .expect(200);

    const org = await registerOrganizer('pendingorg');

    await request(server())
      .patch(`/admin/organizers/${org.organizerId}/approve`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .expect(403);

    const approved = await request(server())
      .patch(`/admin/organizers/${org.organizerId}/approve`)
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('an organizer cannot create/edit Artist (shared reference data) — only PLATFORM_ADMIN can (hardening, ver ADR-0020)', async () => {
    const org = await registerOrganizer('artistguard');
    const adminEmail = `admin.${unique('platform')}@example.com`;
    const passwordHash = await usersService.hashPassword('SenhaForte123');
    await usersService.createUserWithRole({
      email: adminEmail,
      passwordHash,
      fullName: 'Platform Admin de Teste',
      roleKey: RoleKey.PLATFORM_ADMIN,
    });
    const admin = await request(server())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'SenhaForte123' })
      .expect(200);

    await request(server())
      .post('/artists')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ name: `Artista ${unique('org')}` })
      .expect(403);

    const created = await request(server())
      .post('/artists')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .send({ name: `Artista ${unique('admin')}` })
      .expect(201);

    await request(server())
      .patch(`/artists/${created.body.id}`)
      .set('Authorization', `Bearer ${org.accessToken}`)
      .send({ name: 'Sequestrado' })
      .expect(403);
  });

  it('a coupon scoped to one organizer cannot be redeemed on another organizer cruise (hardening, ver ADR-0020)', async () => {
    const orgA = await registerOrganizer('couponowner');
    const orgB = await registerOrganizer('couponvictim');

    const port = await prisma.port.create({ data: { name: `Porto ${unique('port')}`, country: 'Brasil' } });

    async function buildPublishedCruise(orgAuth: string, label: string) {
      const ship = await request(server())
        .post('/ships')
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ name: `Navio ${label}`, passengerCapacity: 200 })
        .expect(201);
      const category = await request(server())
        .post(`/ships/${ship.body.id}/cabin-categories`)
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ name: 'Interna', maxOccupancy: 2 })
        .expect(201);
      const deck = await request(server())
        .post(`/ships/${ship.body.id}/decks`)
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ number: 1, name: `Deck ${label}` })
        .expect(201);
      const cabin = await request(server())
        .post(`/decks/${deck.body.id}/cabins`)
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ cabinCategoryId: category.body.id, code: 'CP01' })
        .expect(201);
      const cruise = await request(server())
        .post('/cruises')
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({
          shipId: ship.body.id,
          title: `Cruzeiro ${label}`,
          theme: 'Teste',
          embarkationDate: '2027-08-01T12:00:00Z',
          disembarkationDate: '2027-08-05T12:00:00Z',
          embarkationPortId: port.id,
          disembarkationPortId: port.id,
        })
        .expect(201);
      await request(server())
        .post(`/cruises/${cruise.body.id}/itinerary-stops`)
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ portId: port.id, dayNumber: 1, isEmbarkation: true })
        .expect(201);
      await request(server())
        .post(`/cruises/${cruise.body.id}/pricing`)
        .set('Authorization', `Bearer ${orgAuth}`)
        .send({ cabinCategoryId: category.body.id, price: 2000 })
        .expect(201);
      await request(server()).post(`/cruises/${cruise.body.id}/publish`).set('Authorization', `Bearer ${orgAuth}`).expect(200);
      return { slug: cruise.body.slug as string, cabinId: cabin.body.id as string };
    }

    const cruiseB = await buildPublishedCruise(orgB.accessToken, unique('cruiseb'));

    // Cupom criado escopado ao Organizador A — nao tem nenhuma relacao com o cruzeiro do B.
    const coupon = await prisma.coupon.create({
      data: {
        code: unique('CROSSORG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20),
        organizerId: orgA.organizerId,
        discountType: 'PERCENTAGE',
        discountValue: 50,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
      },
    });

    const passenger = await registerPassenger();
    const hold = await request(server())
      .post(`/cruises/${cruiseB.slug}/cabins/${cruiseB.cabinId}/hold`)
      .set('Authorization', `Bearer ${passenger.accessToken}`)
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${passenger.accessToken}`)
      .send({
        guests: [{ fullName: 'Passageiro Cupom', documentType: 'PASSPORT', documentNumber: unique('DOC'), isPrimary: true }],
        experienceIds: [],
        couponCode: coupon.code,
      })
      .expect(409); // ConflictException — "Este cupom nao e valido para este cruzeiro."
  });
});

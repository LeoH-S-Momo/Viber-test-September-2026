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

    // orgA cria um navio (via seed helper direto no banco, ja que ship/cabin ainda
    // nao tem endpoint publico de escrita) para poder criar um cruzeiro de teste.
    const ship = await prisma.ship.create({
      data: { organizerId: orgA.organizerId, name: 'Navio de Teste', passengerCapacity: 100 },
    });
    const port = await prisma.port.create({
      data: { name: `Porto ${unique('port')}`, country: 'Brasil' },
    });

    const createCruise = await request(server())
      .post('/cruises')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({
        shipId: ship.id,
        title: `Cruzeiro ${unique('cruise')}`,
        theme: 'Teste',
        embarkationDate: '2027-05-01T12:00:00Z',
        disembarkationDate: '2027-05-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(201);

    // orgA consegue atualizar o proprio cruzeiro
    await request(server())
      .patch(`/cruises/${createCruise.body.id}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    // orgB NAO consegue — nem sabe que o recurso existe (404, nao 403)
    await request(server())
      .patch(`/cruises/${createCruise.body.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ title: 'Sequestrado' })
      .expect(404);

    // orgB tambem nao pode usar o navio de orgA para criar um cruzeiro
    await request(server())
      .post('/cruises')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({
        shipId: ship.id,
        title: 'Nao deveria existir',
        theme: 'Teste',
        embarkationDate: '2027-06-01T12:00:00Z',
        disembarkationDate: '2027-06-05T12:00:00Z',
        embarkationPortId: port.id,
        disembarkationPortId: port.id,
      })
      .expect(403);
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
});

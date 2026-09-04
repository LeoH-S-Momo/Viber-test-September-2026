import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleKey } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { UsersService } from '../../src/modules/users/users.service';

/**
 * Painel administrativo global (ver docs/architecture/decisions/0018-admin-panel.md):
 * RBAC (so PLATFORM_ADMIN), os 13 modulos (listagem + busca + filtros +
 * paginacao + detalhes + acoes administrativas) e a trilha de auditoria
 * (quem fez, o que fez, quando fez, qual recurso foi afetado). Contra
 * Postgres/Redis reais.
 */
describe('Admin panel (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const server = () => app.getHttpServer();
  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let adminToken: string;
  let adminUserId: string;

  let orgAuth: { Authorization: string };
  let organizerId: string;
  let staffAuth: { Authorization: string };
  let staffUserId: string;

  let passengerToken: string;
  let passengerUserId: string;

  let shipId: string;
  let deckId: string;
  let cabinCategoryId: string;
  let cruiseId: string;
  let cruiseSlug: string;
  let eventId: string;
  let restaurantId: string;
  let experienceId: string;

  let cabinSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const usersService = app.get(UsersService);

    const label = unique('adminpanel');

    // Platform admin — sem endpoint de auto-cadastro por design (ver docs/architecture/api-permissions.md).
    const adminEmail = `admin.${label}@example.com`;
    const passwordHash = await usersService.hashPassword('SenhaForte123');
    const adminUser = await usersService.createUserWithRole({
      email: adminEmail,
      passwordHash,
      fullName: 'Platform Admin de Teste',
      roleKey: RoleKey.PLATFORM_ADMIN,
    });
    adminUserId = adminUser.id;
    const adminLogin = await request(server())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'SenhaForte123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    // Organizador + staff + catalogo completo, do mesmo jeito que os outros e2e (ver check-in.e2e-spec.ts).
    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `orgadmin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Admin Organizador Teste',
      })
      .expect(201);
    orgAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };
    organizerId = orgRegister.body.user.roles[0].organizerId;

    // Um organizador recem-registrado fica PENDING (ver rbac.e2e-spec.ts) — aprovado aqui
    // pra que o restante da suite (filtro `status=APPROVED`, etc.) reflita um organizador real.
    await request(server())
      .patch(`/admin/organizers/${organizerId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const staffInvite = await request(server())
      .post('/organizers/me/staff')
      .set(orgAuth)
      .send({ email: `staff.${label}@example.com`, password: 'SenhaForte123', fullName: 'Staff Teste' })
      .expect(201);
    staffUserId = staffInvite.body.id;
    const staffLogin = await request(server())
      .post('/auth/login')
      .send({ email: staffInvite.body.email, password: 'SenhaForte123' })
      .expect(200);
    staffAuth = { Authorization: `Bearer ${staffLogin.body.accessToken}` };

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
      .send({ name: 'Interna', maxOccupancy: 2 })
      .expect(201);
    cabinCategoryId = category.body.id;

    const deck = await request(server())
      .post(`/ships/${shipId}/decks`)
      .set(orgAuth)
      .send({ number: 1, name: `Deck ${label}` })
      .expect(201);
    deckId = deck.body.id;

    const cruise = await request(server())
      .post('/cruises')
      .set(orgAuth)
      .send({
        shipId,
        title: `Cruzeiro ${label}`,
        theme: 'Teste',
        embarkationDate: '2027-11-01T12:00:00Z',
        disembarkationDate: '2027-11-05T12:00:00Z',
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
      .send({ cabinCategoryId, price: 1800 })
      .expect(201);
    await request(server()).post(`/cruises/${cruiseId}/publish`).set(orgAuth).expect(200);

    // Venue/Artist/Event/Restaurant/Experience — sem endpoint de criacao dedicado testado aqui
    // (o painel admin so LE estes recursos, ver AdminCatalogService), entao semeados direto no
    // banco, do mesmo jeito que Port acima e no restante da suite de integracao.
    const venue = await prisma.venue.create({ data: { shipId, name: `Teatro ${label}`, type: 'THEATER' } });
    const event = await prisma.event.create({
      data: {
        cruiseId,
        venueId: venue.id,
        title: `Show ${label}`,
        startAt: new Date('2027-11-02T20:00:00Z'),
        endAt: new Date('2027-11-02T22:00:00Z'),
      },
    });
    eventId = event.id;

    const restaurant = await prisma.restaurant.create({ data: { shipId, name: `Restaurante ${label}` } });
    restaurantId = restaurant.id;

    const experience = await prisma.experience.create({
      data: { cruiseId, title: `Passeio ${label}`, price: '150.00', capacity: 20 },
    });
    experienceId = experience.id;

    // Passageiro com uma reserva CONFIRMED + ticket emitido (usada pelos modulos de vendas).
    const passenger = await request(server())
      .post('/auth/register')
      .send({ email: `passenger.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro Teste' })
      .expect(201);
    passengerToken = passenger.body.accessToken;
    passengerUserId = passenger.body.user.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  async function createFreshCabin(): Promise<string> {
    cabinSeq += 1;
    const cabin = await request(server())
      .post(`/decks/${deckId}/cabins`)
      .set(orgAuth)
      .send({ cabinCategoryId, code: `AD${cabinSeq}` })
      .expect(201);
    return cabin.body.id as string;
  }

  /** Mesmo fluxo de check-in.e2e-spec.ts: PIX aprova no proprio checkout, ticket emitido async via BullMQ. */
  async function confirmBookingWithTicket(guestName: string, documentNumber: string) {
    const cabinId = await createFreshCabin();
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send()
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ guests: [{ fullName: guestName, documentType: 'PASSPORT', documentNumber, isPrimary: true }] })
      .expect(200);

    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');

    for (let i = 0; i < 30; i += 1) {
      const guest = await prisma.bookingGuest.findFirst({ where: { bookingId: hold.body.id } });
      const ticket = guest ? await prisma.ticket.findUnique({ where: { bookingGuestId: guest.id } }) : null;
      if (ticket) return { bookingId: hold.body.id as string, ticketId: ticket.id, ticketCode: ticket.qrCode };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Ticket nao foi emitido a tempo pelo worker do BullMQ.');
  }

  function findAuditEntry(entries: Array<{ action: string; entityType: string; entityId: string }>, action: string, entityId: string) {
    return entries.find((e) => e.action === action && e.entityType && e.entityId === entityId);
  }

  async function fetchAuditLogs(query: string) {
    const res = await request(server())
      .get(`/admin/audit-logs?${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return res.body.data as Array<{ id: string; actorUserId: string | null; action: string; entityType: string; entityId: string; createdAt: string }>;
  }

  // ==========================================================================
  // RBAC
  // ==========================================================================

  it('bloqueia cada familia de rota admin para nao-autenticados (401) e para passageiros (403)', async () => {
    const routes = [
      '/admin/users',
      '/admin/organizers',
      '/admin/cruises',
      '/admin/ships',
      '/admin/cabins',
      '/admin/events',
      '/admin/restaurants',
      '/admin/experiences',
      '/admin/bookings',
      '/admin/payments',
      '/admin/tickets',
      '/admin/check-ins',
      '/admin/coupons',
      '/admin/audit-logs',
      '/admin/audit-logs/facets',
    ];

    for (const route of routes) {
      await request(server()).get(route).expect(401);
      await request(server()).get(route).set('Authorization', `Bearer ${passengerToken}`).expect(403);
    }

    // Organizer admin (nao platform admin) tambem nao acessa.
    await request(server()).get('/admin/users').set(orgAuth).expect(403);
    await request(server()).get('/admin/bookings').set(staffAuth).expect(403);
  });

  // ==========================================================================
  // USUARIOS
  // ==========================================================================

  describe('modulo Usuarios', () => {
    it('lista com busca/filtro/paginacao, mostra detalhe, suspende e reativa — cada acao com auditoria completa', async () => {
      const list = await request(server())
        .get(`/admin/users?q=${encodeURIComponent('Passageiro Teste')}&page=1&pageSize=5`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((u: { id: string }) => u.id === passengerUserId)).toBe(true);
      expect(list.body.meta.page).toBe(1);
      expect(list.body.meta.pageSize).toBe(5);

      const byStatus = await request(server())
        .get('/admin/users?status=ACTIVE')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(byStatus.body.data.every((u: { status: string }) => u.status === 'ACTIVE')).toBe(true);

      const byRole = await request(server())
        .get('/admin/users?role=PASSENGER')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(byRole.body.data.some((u: { id: string }) => u.id === passengerUserId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/users/${passengerUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.email).toContain('passenger.');
      expect(Array.isArray(detail.body.bookings)).toBe(true);
      expect(Array.isArray(detail.body.roles)).toBe(true);

      const suspended = await request(server())
        .patch(`/admin/users/${passengerUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(suspended.body.status).toBe('SUSPENDED');

      // Um usuario suspenso nao consegue mais logar — prova que a acao administrativa tem efeito real.
      await request(server())
        .post('/auth/login')
        .send({ email: detail.body.email, password: 'SenhaForte123' })
        .expect(401);

      const reactivated = await request(server())
        .patch(`/admin/users/${passengerUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(reactivated.body.status).toBe('ACTIVE');

      const relogin = await request(server())
        .post('/auth/login')
        .send({ email: detail.body.email, password: 'SenhaForte123' })
        .expect(200);
      passengerToken = relogin.body.accessToken;

      const audit = await fetchAuditLogs(`entityType=User&actorUserId=${adminUserId}`);
      expect(findAuditEntry(audit, 'user.suspended', passengerUserId)).toBeDefined();
      expect(findAuditEntry(audit, 'user.reactivated', passengerUserId)).toBeDefined();
    });

    it('apenas PLATFORM_ADMIN suspende/reativa usuarios', async () => {
      await request(server())
        .patch(`/admin/users/${passengerUserId}/suspend`)
        .set(orgAuth)
        .expect(403);
    });
  });

  // ==========================================================================
  // ORGANIZADORES
  // ==========================================================================

  describe('modulo Organizadores', () => {
    it('lista com filtro de status, mostra detalhe com contadores, suspende e reativa — com auditoria', async () => {
      const list = await request(server())
        .get('/admin/organizers?status=APPROVED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((o: { id: string }) => o.id === organizerId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/organizers/${organizerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body._count.ships).toBeGreaterThanOrEqual(1);
      expect(detail.body._count.cruises).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(detail.body.userRoles)).toBe(true);

      const suspended = await request(server())
        .patch(`/admin/organizers/${organizerId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(suspended.body.status).toBe('SUSPENDED');

      const reactivated = await request(server())
        .patch(`/admin/organizers/${organizerId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(reactivated.body.status).toBe('APPROVED');

      const audit = await fetchAuditLogs(`entityType=Organizer&actorUserId=${adminUserId}`);
      expect(findAuditEntry(audit, 'organizer.suspended', organizerId)).toBeDefined();
      expect(findAuditEntry(audit, 'organizer.reactivated', organizerId)).toBeDefined();
    });
  });

  // ==========================================================================
  // CATALOGO: Cruzeiros, Navios, Cabines, Eventos, Restaurantes, Experiencias
  // ==========================================================================

  describe('modulo Catalogo', () => {
    it('cruzeiros: lista/filtra/pagina, mostra detalhe, cancela administrativamente (com motivo) e audita', async () => {
      // Cruzeiro descartavel proprio deste teste, pra nao interferir com o cruzeiro
      // usado pelos modulos de vendas (reservas/tickets/check-ins) mais abaixo.
      const label = unique('cancelcruise');
      const port = await prisma.port.create({ data: { name: `Porto ${label}`, country: 'Brasil' } });
      const throwaway = await request(server())
        .post('/cruises')
        .set(orgAuth)
        .send({
          shipId,
          title: `Cruzeiro ${label}`,
          theme: 'Teste',
          embarkationDate: '2027-12-01T12:00:00Z',
          disembarkationDate: '2027-12-05T12:00:00Z',
          embarkationPortId: port.id,
          disembarkationPortId: port.id,
        })
        .expect(201);

      const list = await request(server())
        .get(`/admin/cruises?q=${encodeURIComponent(label)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((c: { id: string }) => c.id === throwaway.body.id)).toBe(true);

      const detail = await request(server())
        .get(`/admin/cruises/${throwaway.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.ship.name).toBeDefined();
      expect(detail.body.organizer.id).toBe(organizerId);

      const cancelled = await request(server())
        .patch(`/admin/cruises/${throwaway.body.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Violacao dos termos da plataforma' })
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');

      const byStatus = await request(server())
        .get('/admin/cruises?status=CANCELLED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(byStatus.body.data.some((c: { id: string }) => c.id === throwaway.body.id)).toBe(true);

      const audit = await fetchAuditLogs(`entityType=Cruise&actorUserId=${adminUserId}`);
      const entry = findAuditEntry(audit, 'cruise.admin_cancelled', throwaway.body.id);
      expect(entry).toBeDefined();
    });

    it('navios: lista com busca e mostra detalhe com decks/contadores', async () => {
      const list = await request(server())
        .get(`/admin/ships?organizerId=${organizerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((s: { id: string }) => s.id === shipId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/ships/${shipId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.decks.length).toBeGreaterThanOrEqual(1);
      expect(detail.body._count.cruises).toBeGreaterThanOrEqual(1);
    });

    it('cabines: lista filtrando por navio/status e mostra detalhe com historico de reservas', async () => {
      const cabinId = await createFreshCabin();

      const list = await request(server())
        .get(`/admin/cabins?shipId=${shipId}&status=ACTIVE`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((c: { id: string }) => c.id === cabinId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/cabins/${cabinId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.cabinCategory.id).toBe(cabinCategoryId);
      expect(Array.isArray(detail.body.bookings)).toBe(true);
    });

    it('eventos: lista filtrando por cruzeiro e mostra detalhe', async () => {
      const list = await request(server())
        .get(`/admin/events?cruiseId=${cruiseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((e: { id: string }) => e.id === eventId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.venue).toBeDefined();
      expect(detail.body.cruise.id).toBe(cruiseId);
    });

    it('restaurantes: lista filtrando por navio e mostra detalhe', async () => {
      const list = await request(server())
        .get(`/admin/restaurants?shipId=${shipId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((r: { id: string }) => r.id === restaurantId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/restaurants/${restaurantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.ship.id).toBe(shipId);
    });

    it('experiencias: lista filtrando por cruzeiro e mostra detalhe', async () => {
      const list = await request(server())
        .get(`/admin/experiences?cruiseId=${cruiseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((e: { id: string }) => e.id === experienceId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/experiences/${experienceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.cruise.id).toBe(cruiseId);
    });
  });

  // ==========================================================================
  // VENDAS: Reservas, Pagamentos, Tickets, Check-ins
  // ==========================================================================

  describe('modulo Vendas', () => {
    it('reservas/pagamentos/tickets/check-ins: listam/filtram/paginam e mostram detalhe rico', async () => {
      const { bookingId, ticketId, ticketCode } = await confirmBookingWithTicket('Titular Vendas', 'AD-DOC-1');

      await request(server())
        .post('/check-in/confirm')
        .set(staffAuth)
        .send({ code: ticketCode, location: 'Portao A' })
        .expect(200);

      const bookingsList = await request(server())
        .get(`/admin/bookings?status=CONFIRMED&q=${encodeURIComponent('Titular Vendas')}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(bookingsList.body.data.some((b: { id: string }) => b.id === bookingId)).toBe(true);

      const bookingDetail = await request(server())
        .get(`/admin/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(bookingDetail.body.payments.length).toBeGreaterThanOrEqual(1);
      expect(bookingDetail.body.user.id).toBe(passengerUserId);

      const paymentId = bookingDetail.body.payments[0].id as string;
      const paymentsList = await request(server())
        .get('/admin/payments?status=APPROVED&method=PIX')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(paymentsList.body.data.some((p: { id: string }) => p.id === paymentId)).toBe(true);

      const paymentDetail = await request(server())
        .get(`/admin/payments/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(paymentDetail.body.booking.id).toBe(bookingId);

      const ticketsList = await request(server())
        .get(`/admin/tickets?status=CHECKED_IN&q=${encodeURIComponent(ticketCode)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(ticketsList.body.data.some((t: { id: string }) => t.id === ticketId)).toBe(true);

      const ticketDetail = await request(server())
        .get(`/admin/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(ticketDetail.body.status).toBe('CHECKED_IN');
      expect(ticketDetail.body.checkIns.length).toBe(1);
      expect(ticketDetail.body.checkIns[0].staffUser.email).toContain('staff.');

      const checkInsList = await request(server())
        .get(`/admin/check-ins?staffUserId=${staffUserId}&q=${encodeURIComponent(ticketCode)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(checkInsList.body.data.some((c: { ticket: { qrCode: string } }) => c.ticket.qrCode === ticketCode)).toBe(true);

      const auditCheckIn = await fetchAuditLogs(`entityType=Ticket&actorUserId=${staffUserId}`);
      expect(findAuditEntry(auditCheckIn, 'ticket.checked_in', ticketId)).toBeDefined();
    });

    it('cancela uma reserva administrativamente, cancelando em cascata o ticket, e nao permite cancelar de novo', async () => {
      const { bookingId, ticketId } = await confirmBookingWithTicket('Titular Cancelamento', 'AD-DOC-2');

      const cancelled = await request(server())
        .patch(`/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Fraude detectada' })
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');

      const ticketRow = await prisma.ticket.findUnique({ where: { id: ticketId } });
      expect(ticketRow?.status).toBe('CANCELLED');

      // Reserva ja terminal — nao pode ser cancelada de novo.
      await request(server())
        .patch(`/admin/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      const audit = await fetchAuditLogs(`entityType=Booking&actorUserId=${adminUserId}`);
      const entry = findAuditEntry(audit, 'booking.admin_cancelled', bookingId);
      expect(entry).toBeDefined();
    });

    it('apenas PLATFORM_ADMIN cancela reservas administrativamente (nem o proprio organizador do cruzeiro)', async () => {
      const { bookingId } = await confirmBookingWithTicket('Titular RBAC Vendas', 'AD-DOC-3');
      await request(server())
        .patch(`/admin/bookings/${bookingId}/cancel`)
        .set(orgAuth)
        .send({})
        .expect(403);
    });
  });

  // ==========================================================================
  // CUPONS (CRUD completo — sem nenhuma superficie HTTP antes deste modulo)
  // ==========================================================================

  describe('modulo Cupons', () => {
    it('cria, lista, mostra detalhe, atualiza, desativa e reativa um cupom — com auditoria em cada passo', async () => {
      const code = unique('PROMO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

      const created = await request(server())
        .post('/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code,
          organizerId,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          validFrom: '2027-01-01T00:00:00Z',
          validUntil: '2027-12-31T23:59:59Z',
          applicableCruiseIds: [cruiseId],
        })
        .expect(201);
      expect(created.body.code).toBe(code);
      expect(created.body.isActive).toBe(true);
      const couponId = created.body.id as string;

      // Codigo duplicado e recusado.
      await request(server())
        .post('/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code,
          discountType: 'PERCENTAGE',
          discountValue: 5,
          validFrom: '2027-01-01T00:00:00Z',
          validUntil: '2027-12-31T23:59:59Z',
        })
        .expect(409);

      const list = await request(server())
        .get(`/admin/coupons?q=${encodeURIComponent(code)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((c: { id: string }) => c.id === couponId)).toBe(true);

      const detail = await request(server())
        .get(`/admin/coupons/${couponId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.applicableCruises).toHaveLength(1);
      expect(detail.body.applicableCruises[0].cruise.id).toBe(cruiseId);

      const updated = await request(server())
        .patch(`/admin/coupons/${couponId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discountValue: 15 })
        .expect(200);
      expect(updated.body.discountValue).toBe('15');

      const deactivated = await request(server())
        .patch(`/admin/coupons/${couponId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(deactivated.body.isActive).toBe(false);

      const activeList = await request(server())
        .get('/admin/coupons?isActive=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(activeList.body.data.some((c: { id: string }) => c.id === couponId)).toBe(true);

      const reactivated = await request(server())
        .patch(`/admin/coupons/${couponId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(reactivated.body.isActive).toBe(true);

      const audit = await fetchAuditLogs(`entityType=Coupon&actorUserId=${adminUserId}`);
      expect(findAuditEntry(audit, 'coupon.created', couponId)).toBeDefined();
      expect(findAuditEntry(audit, 'coupon.updated', couponId)).toBeDefined();
      expect(findAuditEntry(audit, 'coupon.deactivated', couponId)).toBeDefined();
      expect(findAuditEntry(audit, 'coupon.activated', couponId)).toBeDefined();
    });
  });

  // ==========================================================================
  // AUDITORIA — quem fez, o que fez, quando fez, qual recurso foi afetado
  // ==========================================================================

  describe('area de Auditoria', () => {
    it('filtra por action/entityType/actorUserId/intervalo de datas, pagina, e cada entrada tem actor+action+entidade+timestamp', async () => {
      const byEntity = await fetchAuditLogs('entityType=Organizer');
      expect(byEntity.length).toBeGreaterThan(0);
      for (const entry of byEntity) {
        expect(entry.id).toBeDefined();
        expect(entry.action).toBeDefined();
        expect(entry.entityType).toBe('Organizer');
        expect(entry.entityId).toBeDefined();
        expect(new Date(entry.createdAt).getTime()).not.toBeNaN();
      }

      const byAction = await fetchAuditLogs('action=organizer.suspended');
      expect(byAction.every((e) => e.action === 'organizer.suspended')).toBe(true);

      const byActor = await fetchAuditLogs(`actorUserId=${adminUserId}`);
      expect(byActor.length).toBeGreaterThan(0);
      expect(byActor.every((e) => e.actorUserId === adminUserId)).toBe(true);

      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const noneInFuture = await fetchAuditLogs(`from=${encodeURIComponent(future)}`);
      expect(noneInFuture).toHaveLength(0);

      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const someUntilNow = await fetchAuditLogs(`from=${encodeURIComponent(past)}&to=${encodeURIComponent(new Date().toISOString())}`);
      expect(someUntilNow.length).toBeGreaterThan(0);

      const page1 = await request(server())
        .get('/admin/audit-logs?page=1&pageSize=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta.page).toBe(1);
      expect(page1.body.meta.pageSize).toBe(1);
      expect(page1.body.meta.total).toBeGreaterThan(1);
    });

    it('expoe os valores distintos de action/entityType para alimentar os filtros do frontend', async () => {
      const facets = await request(server())
        .get('/admin/audit-logs/facets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(facets.body.actions).toEqual(expect.arrayContaining(['organizer.suspended', 'coupon.created']));
      expect(facets.body.entityTypes).toEqual(expect.arrayContaining(['Organizer', 'Coupon', 'User']));
    });
  });
});

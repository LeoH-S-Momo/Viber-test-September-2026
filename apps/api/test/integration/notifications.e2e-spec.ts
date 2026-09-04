import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Infraestrutura de eventos de dominio + notificacoes (ver
 * docs/architecture/decisions/0019-events-and-notifications.md) contra
 * Postgres/Redis/SMTP REAIS: cada cenario confirma tanto a linha
 * `Notification` (deliveryStatus SENT) quanto — consultando a API REST do
 * proprio MailHog — que o e-mail chegou de verdade, nao so que o job rodou
 * sem lancar erro. Porta HTTP do MailHog derivada de `SMTP_PORT`
 * (`+7000` — 1025/8025 em dev, 1026/8026 em CI, ver
 * infra/docker-compose.test.yml) pra funcionar nos dois ambientes sem hardcode.
 */
describe('Domain events + notifications (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
  // `127.0.0.1` explicito, nao `localhost` — o fetch (undici) do Node as vezes tenta `::1`
  // primeiro (Happy Eyeballs) e falha com AggregateError num Windows sem IPv6 loopback
  // consistente pro MailHog, mesmo o `curl http://localhost:...` funcionando (caminho de
  // resolucao diferente). IPv4 direto evita a ambiguidade.
  // +7000: MailHog usa SMTP :1025 / UI web :8025 por padrao (delta 7000) — mesma relacao em
  // CI (SMTP :1026 / UI :8026, ver infra/docker-compose.test.yml), entao computar a partir de
  // SMTP_PORT funciona nos dois ambientes sem hardcode.
  const mailhogUrl = `http://127.0.0.1:${smtpPort + 7000}`;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseSlug: string;
  let cruiseId: string;
  let cabinCategoryId: string;
  let deckId: string;
  let organizerAuth: { Authorization: string };
  let cabinSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('notif');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Notif Test Admin',
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
    deckId = deck.body.id;

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
      .send({ cabinCategoryId, price: 1800 })
      .expect(201);
    await request(server()).post(`/cruises/${cruiseId}/publish`).set(organizerAuth).expect(200);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  async function createFreshCabin(): Promise<string> {
    cabinSeq += 1;
    const cabin = await request(server())
      .post(`/decks/${deckId}/cabins`)
      .set(organizerAuth)
      .send({ cabinCategoryId, code: `NT${cabinSeq}` })
      .expect(201);
    return cabin.body.id as string;
  }

  async function registerPassenger(label: string) {
    const email = `passenger.${label}@example.com`;
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: 'SenhaForte123', fullName: `Passageiro ${label}` })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  /** Poll — as notificacoes nascem sincronas (a linha existe na hora), mas so ficam SENT depois do worker BullMQ rodar. */
  async function waitForNotifications(token: string, minCount: number, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    let list: Array<{ id: string; type: string; title: string; deliveryStatus: string; bookingId: string | null }> = [];
    while (Date.now() < deadline) {
      const res = await request(server())
        .get('/notifications/me?pageSize=50')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      list = res.body.data;
      if (list.length >= minCount && list.every((n) => n.deliveryStatus === 'SENT')) {
        return list;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return list;
  }

  async function findMailhogMessagesTo(email: string): Promise<Array<{ subject: string }>> {
    const res = await fetch(`${mailhogUrl}/api/v2/messages?limit=100`);
    const body = (await res.json()) as { items: Array<{ To: Array<{ Mailbox: string; Domain: string }>; Content: { Headers: { Subject: string[] } } }> };
    return body.items
      .filter((item) => item.To?.some((to) => `${to.Mailbox}@${to.Domain}` === email))
      .map((item) => ({ subject: item.Content.Headers.Subject[0] ?? '' }));
  }

  it('reserva confirmada com PIX gera BOOKING_CONFIRMED + PAYMENT_APPROVED + TICKET_AVAILABLE, todas entregues de verdade via MailHog', async () => {
    const label = unique('confirm');
    const { email, token } = await registerPassenger(label);
    const cabinId = await createFreshCabin();

    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guests: [{ fullName: `Passageiro ${label}`, documentType: 'PASSPORT', documentNumber: 'NT0001', isPrimary: true }] })
      .expect(200);

    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CONFIRMED');

    const notifications = await waitForNotifications(token, 3);
    const types = notifications.map((n) => n.type).sort();
    expect(types).toEqual(['BOOKING_CONFIRMED', 'PAYMENT_APPROVED', 'TICKET_AVAILABLE']);
    expect(notifications.every((n) => n.deliveryStatus === 'SENT')).toBe(true);
    expect(notifications.every((n) => n.bookingId === hold.body.id)).toBe(true);

    const emails = await findMailhogMessagesTo(email);
    expect(emails.length).toBeGreaterThanOrEqual(3);
    // Assunto vem MIME quoted-printable (`=?UTF-8?Q?Reserva_confirmada_=E2=80=94_...?=`) — nenhuma
    // das 3 palavras-chave abaixo tem acento, entao sobrevivem literalmente no header cru (so
    // espaco vira `_` e o travessao vira `=E2=80=94`); checar substring bruta evita decodificar
    // quoted-printable so pra isto.
    const subjects = emails.map((e) => e.subject);
    expect(subjects.some((s) => /Reserva/i.test(s) && /confirmada/i.test(s))).toBe(true);
    expect(subjects.some((s) => /Pagamento/i.test(s) && /aprovado/i.test(s))).toBe(true);
    expect(subjects.some((s) => /ingresso/i.test(s))).toBe(true);
  }, 30_000);

  it('pagamento recusado gera SO PAYMENT_DECLINED (nunca um BOOKING_CANCELLED redundante junto)', async () => {
    const label = unique('decline');
    const { token } = await registerPassenger(label);
    const cabinId = await createFreshCabin();

    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ guests: [{ fullName: `Passageiro ${label}`, documentType: 'PASSPORT', documentNumber: 'NT0002', isPrimary: true }] })
      .expect(200);

    // Sufixo `::decline` — ver FakePaymentGateway: forca o desfecho DECLINED de forma deterministica.
    const checkout = await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `${unique('decline-key')}::decline`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);
    expect(checkout.body.status).toBe('CANCELLED');

    const notifications = await waitForNotifications(token, 1);
    expect(notifications.map((n) => n.type)).toEqual(['PAYMENT_DECLINED']);
  }, 30_000);

  it('cancelamento explicito do passageiro gera SO BOOKING_CANCELLED', async () => {
    const label = unique('cancel');
    const { token } = await registerPassenger(label);
    const cabinId = await createFreshCabin();

    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const cancelled = await request(server())
      .post(`/bookings/${hold.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Mudança de planos' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const notifications = await waitForNotifications(token, 1);
    expect(notifications.map((n) => n.type)).toEqual(['BOOKING_CANCELLED']);
  }, 30_000);

  it('GET /notifications/me exige autenticacao e pagina corretamente', async () => {
    await request(server()).get('/notifications/me').expect(401);

    const label = unique('paginate');
    const { token } = await registerPassenger(label);
    const first = await request(server())
      .get('/notifications/me?page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.data).toEqual([]);
    expect(first.body.meta.page).toBe(1);
    expect(first.body.meta.pageSize).toBe(5);
    expect(first.body.meta.total).toBe(0);
  });
});

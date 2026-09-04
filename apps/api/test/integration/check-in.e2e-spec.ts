import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

/**
 * Ingresso digital e check-in (ver
 * docs/architecture/decisions/0013-digital-ticket-checkin.md) contra
 * Postgres/Redis reais: emissao automatica ao confirmar (ADR-0012),
 * localizacao/validacao por codigo, os quatro estados
 * (NOT_CHECKED_IN/CHECKED_IN/INVALID/ALREADY_USED), posse entre
 * organizadores, e a garantia de uso unico sob concorrencia de verdade.
 */
describe('Digital ticket + check-in (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const server = () => app.getHttpServer();

  let cruiseSlug: string;
  let cruiseId: string;
  let cabinCategoryId: string;
  let deckId: string;
  let organizerAuth: { Authorization: string };
  let staffAuth: { Authorization: string };
  let passengerToken: string;
  let cabinSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const label = unique('checkin');

    const orgRegister = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: `Organizer ${label}`,
        organizerEmail: `${label}@example.com`,
        adminEmail: `admin.${label}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Check-in Test Admin',
      })
      .expect(201);
    organizerAuth = { Authorization: `Bearer ${orgRegister.body.accessToken}` };

    const staffInvite = await request(server())
      .post('/organizers/me/staff')
      .set(organizerAuth)
      .send({ email: `staff.${label}@example.com`, password: 'SenhaForte123', fullName: 'Staff Embarque' })
      .expect(201);
    const staffLogin = await request(server())
      .post('/auth/login')
      .send({ email: staffInvite.body.email, password: 'SenhaForte123' })
      .expect(200);
    staffAuth = { Authorization: `Bearer ${staffLogin.body.accessToken}` };

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

    const passenger = await request(server())
      .post('/auth/register')
      .send({ email: `passenger.${label}@example.com`, password: 'SenhaForte123', fullName: 'Passageiro Embarque' })
      .expect(201);
    passengerToken = passenger.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  async function createFreshCabin(): Promise<string> {
    cabinSeq += 1;
    const cabin = await request(server())
      .post(`/decks/${deckId}/cabins`)
      .set(organizerAuth)
      .send({ cabinCategoryId, code: `CI${cabinSeq}` })
      .expect(201);
    return cabin.body.id as string;
  }

  /** Reserva confirmada de ponta a ponta (PIX aprova no proprio checkout — ver ADR-0012) + espera o ticket ser emitido (assincrono via BullMQ — ver ADR-0012/0013). */
  async function confirmBookingAndGetTicketCode(guestName: string, documentNumber: string): Promise<string> {
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
      if (ticket) return ticket.qrCode;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Ticket nao foi emitido a tempo pelo worker do BullMQ.');
  }

  it('emite o ticket automaticamente ao confirmar, associado ao hospede, com codigo seguro e as informacoes esperadas', async () => {
    const code = await confirmBookingAndGetTicketCode('Titular Ingresso', 'TK000001');
    expect(code).toMatch(/^TICKET-[0-9a-f-]{36}$/);

    const mine = await request(server()).get('/tickets/me').set('Authorization', `Bearer ${passengerToken}`).expect(200);
    const ticket = mine.body.find((t: { qrCode: string }) => t.qrCode === code);
    expect(ticket).toBeDefined();
    expect(ticket.status).toBe('ISSUED');
    expect(ticket.bookingGuest.fullName).toBe('Titular Ingresso');
    expect(ticket.bookingGuest.booking.cruise.title).toContain('Cruzeiro');
    expect(ticket.bookingGuest.booking.cabin.code).toBeDefined();
    expect(ticket.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('fluxo completo: lookup mostra NOT_CHECKED_IN, confirma o check-in, e uma segunda tentativa e ALREADY_USED', async () => {
    const code = await confirmBookingAndGetTicketCode('Fluxo Completo', 'TK000002');

    const firstLookup = await request(server())
      .post('/check-in/lookup')
      .set(staffAuth)
      .send({ code })
      .expect(200);
    expect(firstLookup.body.outcome).toBe('NOT_CHECKED_IN');
    expect(firstLookup.body.ticket).toMatchObject({ code, status: 'ISSUED', passengerName: 'Fluxo Completo' });

    const confirmRes = await request(server())
      .post('/check-in/confirm')
      .set(staffAuth)
      .send({ code, location: 'Portao 3' })
      .expect(200);
    expect(confirmRes.body.status).toBe('CHECKED_IN');

    const secondLookup = await request(server())
      .post('/check-in/lookup')
      .set(staffAuth)
      .send({ code })
      .expect(200);
    expect(secondLookup.body.outcome).toBe('ALREADY_USED');

    const secondConfirm = await request(server())
      .post('/check-in/confirm')
      .set(staffAuth)
      .send({ code })
      .expect(409);
    expect(secondConfirm.body.message).toMatch(/ja foi utilizado/);

    const checkIns = await prisma.checkIn.findMany({ where: { ticket: { qrCode: code } } });
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]?.location).toBe('Portao 3');
  });

  it('um codigo que nao existe e INVALID no lookup e 404 na confirmacao', async () => {
    const lookup = await request(server())
      .post('/check-in/lookup')
      .set(staffAuth)
      .send({ code: 'TICKET-nao-existe-nada' })
      .expect(200);
    expect(lookup.body).toEqual({ outcome: 'INVALID', ticket: null });

    const confirm = await request(server())
      .post('/check-in/confirm')
      .set(staffAuth)
      .send({ code: 'TICKET-nao-existe-nada' })
      .expect(404);
    expect(confirm.body.message).toMatch(/nao encontrado/);
  });

  it('verifica se a reserva esta confirmada: cancelar uma reserva confirmada invalida o ticket ja emitido', async () => {
    const cabinId = await createFreshCabin();
    const hold = await request(server())
      .post(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send()
      .expect(201);
    await request(server())
      .put(`/bookings/${hold.body.id}/details`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ guests: [{ fullName: 'Vai Cancelar', documentType: 'PASSPORT', documentNumber: 'TK000003', isPrimary: true }] })
      .expect(200);
    await request(server())
      .post(`/bookings/${hold.body.id}/checkout`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ paymentMethod: 'PIX' })
      .expect(200);

    let code: string | null = null;
    for (let i = 0; i < 30 && !code; i += 1) {
      const guest = await prisma.bookingGuest.findFirst({ where: { bookingId: hold.body.id } });
      const ticket = guest ? await prisma.ticket.findUnique({ where: { bookingGuestId: guest.id } }) : null;
      if (ticket) code = ticket.qrCode;
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(code).not.toBeNull();

    await request(server())
      .post(`/bookings/${hold.body.id}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ reason: 'Desisti da viagem' })
      .expect(200);

    const ticketRow = await prisma.ticket.findUnique({ where: { qrCode: code! } });
    expect(ticketRow?.status).toBe('CANCELLED');

    const lookup = await request(server()).post('/check-in/lookup').set(staffAuth).send({ code }).expect(200);
    expect(lookup.body.outcome).toBe('INVALID');

    // CheckInPolicy checa o status da RESERVA antes do status do ticket (mensagem mais informativa
    // pro staff: "a reserva nao esta confirmada" explica o PORQUE do ticket estar invalido).
    const confirm = await request(server()).post('/check-in/confirm').set(staffAuth).send({ code }).expect(409);
    expect(confirm.body.message).toMatch(/nao esta confirmada/);
  });

  it('recusa (403) um ticket de um cruzeiro de OUTRO organizador — nunca revela dados do ticket a quem nao e dono', async () => {
    const code = await confirmBookingAndGetTicketCode('Isolamento Organizador', 'TK000004');

    const otherOrgLabel = unique('otherorg');
    const otherOrg = await request(server())
      .post('/auth/register/organizer')
      .send({
        organizerName: otherOrgLabel,
        organizerEmail: `${otherOrgLabel}@example.com`,
        adminEmail: `admin.${otherOrgLabel}@example.com`,
        adminPassword: 'SenhaForte123',
        adminFullName: 'Outro Admin',
      })
      .expect(201);
    const otherOrgAuth = { Authorization: `Bearer ${otherOrg.body.accessToken}` };

    await request(server()).post('/check-in/lookup').set(otherOrgAuth).send({ code }).expect(403);
    await request(server()).post('/check-in/confirm').set(otherOrgAuth).send({ code }).expect(403);

    // O dono de verdade continua conseguindo.
    await request(server()).post('/check-in/lookup').set(staffAuth).send({ code }).expect(200);
  });

  it('recusa (403) um passageiro tentando acessar o modulo de check-in — a validacao e sempre no backend', async () => {
    const code = await confirmBookingAndGetTicketCode('Sem Acesso Staff', 'TK000005');

    await request(server())
      .post('/check-in/lookup')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ code })
      .expect(403);
    await request(server())
      .post('/check-in/confirm')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ code })
      .expect(403);
  });

  it('exige autenticacao (401) para qualquer operacao de check-in', async () => {
    await request(server()).post('/check-in/lookup').send({ code: 'TICKET-qualquer' }).expect(401);
    await request(server()).post('/check-in/confirm').send({ code: 'TICKET-qualquer' }).expect(401);
  });

  it('nao permite que um ticket seja usado duas vezes MESMO sob N tentativas de confirmacao verdadeiramente concorrentes', async () => {
    const code = await confirmBookingAndGetTicketCode('Corrida de Check-in', 'TK000006');

    // Promise.all sem await entre os disparos — todas as N requisicoes saem "ao mesmo tempo",
    // exercitando de verdade a corrida no Postgres (mesmo padrao de ADR-0009/0010/0012).
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(server()).post('/check-in/confirm').set(staffAuth).send({ code }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 200);
    const alreadyUsed = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(alreadyUsed).toHaveLength(responses.length - 1);
    expect(alreadyUsed.every((r) => /ja foi utilizado/.test(r.body.message))).toBe(true);

    // A garantia de verdade nao e so a resposta HTTP — e o estado do banco: um unico CheckIn.
    const checkIns = await prisma.checkIn.findMany({ where: { ticket: { qrCode: code } } });
    expect(checkIns).toHaveLength(1);
    const ticketRow = await prisma.ticket.findUnique({ where: { qrCode: code } });
    expect(ticketRow?.status).toBe('CHECKED_IN');
  });
});

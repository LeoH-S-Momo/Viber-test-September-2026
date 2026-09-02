import { PrismaClient, RoleKey } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Seapass@123';

async function hashPassword(): Promise<string> {
  return bcrypt.hash(TEST_PASSWORD, 10);
}

/**
 * Papeis fixos da plataforma (ver enum RoleKey no schema). Idempotente via
 * upsert — pode rodar `pnpm db:seed` de novo sem duplicar nada.
 */
async function seedRoles() {
  const roles = [
    { key: RoleKey.PASSENGER, name: 'Passageiro', description: 'Cliente que reserva cruzeiros' },
    {
      key: RoleKey.ORGANIZER_ADMIN,
      name: 'Administrador do Organizador',
      description: 'Gerencia cruzeiros, navios e equipe de um organizador',
    },
    {
      key: RoleKey.ORGANIZER_STAFF,
      name: 'Operador do Organizador',
      description: 'Acesso operacional restrito (ex: check-in) dentro de um organizador',
    },
    {
      key: RoleKey.PLATFORM_ADMIN,
      name: 'Administrador da Plataforma',
      description: 'Gestão global do SeaPass (aprovação de organizadores, moderação)',
    },
  ];

  const created: Record<RoleKey, string> = {} as Record<RoleKey, string>;
  for (const role of roles) {
    const row = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: role,
    });
    created[role.key] = row.id;
  }
  return created;
}

async function seedUsers(passwordHash: string) {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@seapass.com' },
    update: {},
    create: {
      email: 'admin@seapass.com',
      passwordHash,
      fullName: 'Admin SeaPass',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const organizerAdmin = await prisma.user.upsert({
    where: { email: 'organizador@rockinsea.com' },
    update: {},
    create: {
      email: 'organizador@rockinsea.com',
      passwordHash,
      fullName: 'Carla Mendes',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const organizerStaff = await prisma.user.upsert({
    where: { email: 'operador@rockinsea.com' },
    update: {},
    create: {
      email: 'operador@rockinsea.com',
      passwordHash,
      fullName: 'Bruno Alves',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const passenger1 = await prisma.user.upsert({
    where: { email: 'passageiro1@example.com' },
    update: {},
    create: {
      email: 'passageiro1@example.com',
      passwordHash,
      fullName: 'Fernanda Costa',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const passenger2 = await prisma.user.upsert({
    where: { email: 'passageiro2@example.com' },
    update: {},
    create: {
      email: 'passageiro2@example.com',
      passwordHash,
      fullName: 'Diego Santos',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  return { admin, organizerAdmin, organizerStaff, passenger1, passenger2 };
}

async function seedUserRoles(
  roleIds: Record<RoleKey, string>,
  users: Awaited<ReturnType<typeof seedUsers>>,
  organizerId: string,
) {
  const assignments: Array<{ userId: string; roleId: string; organizerId: string | null }> = [
    { userId: users.admin.id, roleId: roleIds.PLATFORM_ADMIN, organizerId: null },
    { userId: users.organizerAdmin.id, roleId: roleIds.ORGANIZER_ADMIN, organizerId },
    { userId: users.organizerStaff.id, roleId: roleIds.ORGANIZER_STAFF, organizerId },
    { userId: users.passenger1.id, roleId: roleIds.PASSENGER, organizerId: null },
    { userId: users.passenger2.id, roleId: roleIds.PASSENGER, organizerId: null },
  ];

  for (const assignment of assignments) {
    // upsert-por-chave-composta nao funciona aqui: o Prisma Client exige
    // `organizerId: string` (nao aceita `null`) no input de unicidade
    // composta, mesmo a coluna sendo nullable no banco — limitacao conhecida
    // do Prisma para @@unique com coluna opcional. findFirst + create
    // condicional contorna isso mantendo a idempotencia do seed.
    const existing = await prisma.userRole.findFirst({
      where: {
        userId: assignment.userId,
        roleId: assignment.roleId,
        organizerId: assignment.organizerId,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.userRole.create({ data: assignment });
    }
  }
}

async function seedOrganizers() {
  const rockInSea = await prisma.organizer.upsert({
    where: { slug: 'rock-in-sea' },
    update: {},
    create: {
      name: 'Rock in Sea',
      slug: 'rock-in-sea',
      legalName: 'Rock in Sea Produções e Turismo Ltda.',
      email: 'contato@rockinsea.com',
      phone: '+55 11 4000-1000',
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });

  // Segundo organizador, ainda pendente de aprovacao — demonstra o fluxo de
  // aprovacao do admin global (US-I1) sem precisar de dados de reserva.
  await prisma.organizer.upsert({
    where: { slug: 'eletronica-cruises' },
    update: {},
    create: {
      name: 'Eletrônica Cruises',
      slug: 'eletronica-cruises',
      legalName: 'Eletrônica Cruises Eventos Ltda.',
      email: 'contato@eletronicacruises.com',
      phone: '+55 21 4000-2000',
      status: 'PENDING',
    },
  });

  return { rockInSea };
}

async function seedPorts() {
  const santos = await prisma.port.upsert({
    where: { unLocode: 'BRSSZ' },
    update: {},
    create: { name: 'Santos', country: 'Brasil', unLocode: 'BRSSZ', timezone: 'America/Sao_Paulo' },
  });

  const ilhaGrande = await prisma.port.upsert({
    where: { unLocode: 'BRIGR' },
    update: {},
    create: {
      name: 'Ilha Grande',
      country: 'Brasil',
      unLocode: 'BRIGR',
      timezone: 'America/Sao_Paulo',
    },
  });

  const buzios = await prisma.port.upsert({
    where: { unLocode: 'BRBUZ' },
    update: {},
    create: { name: 'Búzios', country: 'Brasil', unLocode: 'BRBUZ', timezone: 'America/Sao_Paulo' },
  });

  return { santos, ilhaGrande, buzios };
}

async function seedShip(organizerId: string) {
  const ship = await prisma.ship.upsert({
    where: { imoNumber: '9876543' },
    update: {},
    create: {
      organizerId,
      name: 'MS Harmonia das Ondas',
      imoNumber: '9876543',
      description: 'Navio tematico com foco em musica ao vivo, com quatro decks de camarotes.',
      yearBuilt: 2015,
      passengerCapacity: 1200,
    },
  });

  const deckData = [
    { number: 4, name: 'Deck 4 — Camarotes Internos' },
    { number: 6, name: 'Deck 6 — Camarotes Externos' },
    { number: 8, name: 'Deck 8 — Varandas e Lounge Riff' },
    { number: 10, name: 'Deck 10 — Suítes, Teatro e Área de Lazer' },
  ];

  const decks: Record<number, string> = {};
  for (const deck of deckData) {
    const row = await prisma.deck.upsert({
      where: { shipId_number: { shipId: ship.id, number: deck.number } },
      update: { name: deck.name },
      create: { shipId: ship.id, number: deck.number, name: deck.name },
    });
    decks[deck.number] = row.id;
  }

  return { ship, decks };
}

async function seedCabinCategoriesAndCabins(shipId: string, decks: Record<number, string>) {
  const categoryData = [
    {
      slug: 'interna',
      name: 'Interna',
      maxOccupancy: 2,
      sizeSqm: 14,
      deckNumber: 4,
      codePrefix: '41',
      count: 6,
    },
    {
      slug: 'externa',
      name: 'Externa',
      maxOccupancy: 2,
      sizeSqm: 17,
      deckNumber: 6,
      codePrefix: '62',
      count: 6,
    },
    {
      slug: 'varanda',
      name: 'Varanda',
      maxOccupancy: 3,
      sizeSqm: 20,
      deckNumber: 8,
      codePrefix: '83',
      count: 6,
    },
    {
      slug: 'suite',
      name: 'Suíte',
      maxOccupancy: 4,
      sizeSqm: 32,
      deckNumber: 10,
      codePrefix: '104',
      count: 4,
    },
  ];

  const categories: Record<string, string> = {};

  for (const category of categoryData) {
    const categoryRow = await prisma.cabinCategory.upsert({
      where: { shipId_slug: { shipId, slug: category.slug } },
      update: {
        name: category.name,
        maxOccupancy: category.maxOccupancy,
        sizeSqm: category.sizeSqm,
      },
      create: {
        shipId,
        slug: category.slug,
        name: category.name,
        maxOccupancy: category.maxOccupancy,
        sizeSqm: category.sizeSqm,
      },
    });
    categories[category.slug] = categoryRow.id;

    const deckId = decks[category.deckNumber];
    if (!deckId) {
      throw new Error(`Deck ${category.deckNumber} nao foi criado antes das cabines.`);
    }
    for (let i = 1; i <= category.count; i += 1) {
      const code = `${category.codePrefix}${String(i).padStart(2, '0')}`;
      await prisma.cabin.upsert({
        where: { deckId_code: { deckId, code } },
        update: {},
        create: { deckId, cabinCategoryId: categoryRow.id, code, status: 'ACTIVE' },
      });
    }
  }

  return categories;
}

async function seedVenuesArtistsRestaurants(shipId: string, decks: Record<number, string>) {
  const teatro = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Teatro Ondas' } },
    update: {},
    create: { shipId, deckId: decks[10], name: 'Teatro Ondas', capacity: 500 },
  });

  const lounge = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Lounge Riff' } },
    update: {},
    create: { shipId, deckId: decks[8], name: 'Lounge Riff', capacity: 150 },
  });

  const deckStage = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Palco do Deck' } },
    update: {},
    create: { shipId, deckId: decks[10], name: 'Palco do Deck', capacity: 300 },
  });

  const mareAlta = await prisma.artist.upsert({
    where: { id: 'seed-artist-mare-alta' },
    update: {},
    create: {
      id: 'seed-artist-mare-alta',
      name: 'Banda Maré Alta',
      bio: 'Cover de clássicos do rock nacional e internacional.',
    },
  });

  const trioBossaRock = await prisma.artist.upsert({
    where: { id: 'seed-artist-trio-bossa-rock' },
    update: {},
    create: {
      id: 'seed-artist-trio-bossa-rock',
      name: 'Trio Acústico Bossa Rock',
      bio: 'Releituras acústicas de rock em versão bossa nova.',
    },
  });

  const restaurantePrincipal = await prisma.restaurant.upsert({
    where: { shipId_name: { shipId, name: 'Restaurante Harmonia' } },
    update: {},
    create: {
      shipId,
      deckId: decks[6],
      name: 'Restaurante Harmonia',
      cuisineType: 'Internacional',
      isIncluded: true,
    },
  });

  const churrascaria = await prisma.restaurant.upsert({
    where: { shipId_name: { shipId, name: 'Churrascaria do Mar' } },
    update: {},
    create: {
      shipId,
      deckId: decks[8],
      name: 'Churrascaria do Mar',
      cuisineType: 'Brasileira',
      isIncluded: false,
    },
  });

  await prisma.diningSlot.upsert({
    where: { restaurantId_label: { restaurantId: restaurantePrincipal.id, label: 'Primeiro turno' } },
    update: {},
    create: {
      restaurantId: restaurantePrincipal.id,
      label: 'Primeiro turno',
      startTime: new Date('1970-01-01T19:00:00Z'),
      endTime: new Date('1970-01-01T20:30:00Z'),
      capacity: 220,
    },
  });

  await prisma.diningSlot.upsert({
    where: { restaurantId_label: { restaurantId: restaurantePrincipal.id, label: 'Segundo turno' } },
    update: {},
    create: {
      restaurantId: restaurantePrincipal.id,
      label: 'Segundo turno',
      startTime: new Date('1970-01-01T21:00:00Z'),
      endTime: new Date('1970-01-01T22:30:00Z'),
      capacity: 220,
    },
  });

  await prisma.diningSlot.upsert({
    where: { restaurantId_label: { restaurantId: churrascaria.id, label: 'Jantar' } },
    update: {},
    create: {
      restaurantId: churrascaria.id,
      label: 'Jantar',
      startTime: new Date('1970-01-01T19:30:00Z'),
      endTime: new Date('1970-01-01T22:00:00Z'),
      capacity: 80,
    },
  });

  return { teatro, lounge, deckStage, mareAlta, trioBossaRock };
}

async function seedCruise(
  organizerId: string,
  shipId: string,
  ports: Awaited<ReturnType<typeof seedPorts>>,
  categories: Record<string, string>,
  venues: Awaited<ReturnType<typeof seedVenuesArtistsRestaurants>>,
) {
  const embarkationDate = new Date('2026-11-10T16:00:00Z');
  const disembarkationDate = new Date('2026-11-15T09:00:00Z');

  const cruise = await prisma.cruise.upsert({
    where: { slug: 'rock-in-sea-classicos-do-rock' },
    update: {},
    create: {
      organizerId,
      shipId,
      title: 'Rock in Sea — Clássicos do Rock',
      slug: 'rock-in-sea-classicos-do-rock',
      theme: 'Rock',
      description:
        'Cinco dias navegando pelo litoral com shows tributo aos maiores clássicos do rock, ' +
        'workshops de instrumentos e festas temáticas a bordo.',
      status: 'PUBLISHED',
      embarkationDate,
      disembarkationDate,
      embarkationPortId: ports.santos.id,
      disembarkationPortId: ports.santos.id,
    },
  });

  const itineraryDays: Array<{
    dayNumber: number;
    portId: string | null;
    isEmbarkation?: boolean;
    isDisembarkation?: boolean;
  }> = [
    { dayNumber: 1, portId: ports.santos.id, isEmbarkation: true },
    { dayNumber: 2, portId: ports.ilhaGrande.id },
    { dayNumber: 3, portId: ports.buzios.id },
    { dayNumber: 4, portId: null },
    { dayNumber: 5, portId: ports.santos.id, isDisembarkation: true },
  ];

  for (const day of itineraryDays) {
    await prisma.itineraryStop.upsert({
      where: { cruiseId_dayNumber: { cruiseId: cruise.id, dayNumber: day.dayNumber } },
      update: {},
      create: {
        cruiseId: cruise.id,
        portId: day.portId,
        dayNumber: day.dayNumber,
        isEmbarkation: day.isEmbarkation ?? false,
        isDisembarkation: day.isDisembarkation ?? false,
      },
    });
  }

  const pricing = [
    { slug: 'interna', price: 2200 },
    { slug: 'externa', price: 2800 },
    { slug: 'varanda', price: 3600 },
    { slug: 'suite', price: 5200 },
  ];

  for (const entry of pricing) {
    const cabinCategoryId = categories[entry.slug];
    if (!cabinCategoryId) {
      throw new Error(`Categoria de cabine "${entry.slug}" nao foi criada antes do pricing.`);
    }

    await prisma.cruiseCabinPricing.upsert({
      where: {
        cruiseId_cabinCategoryId: { cruiseId: cruise.id, cabinCategoryId },
      },
      update: { price: entry.price },
      create: {
        cruiseId: cruise.id,
        cabinCategoryId,
        price: entry.price,
        cancellationPolicy: 'Cancelamento gratuito até 15 dias antes do embarque.',
      },
    });
  }

  const day1 = new Date(embarkationDate);
  const day2 = new Date(embarkationDate);
  day2.setUTCDate(day2.getUTCDate() + 1);
  const day3 = new Date(embarkationDate);
  day3.setUTCDate(day3.getUTCDate() + 2);
  const day4 = new Date(embarkationDate);
  day4.setUTCDate(day4.getUTCDate() + 3);

  const events = [
    {
      title: 'Show de Abertura — Maré Alta',
      category: 'SHOW' as const,
      venueId: venues.teatro.id,
      artistId: venues.mareAlta.id,
      start: new Date(day1.setUTCHours(21, 0, 0, 0)),
      durationMin: 90,
      isIncluded: true,
    },
    {
      title: 'Roda de Violão Acústica',
      category: 'WORKSHOP' as const,
      venueId: venues.lounge.id,
      artistId: null,
      start: new Date(day2.setUTCHours(16, 0, 0, 0)),
      durationMin: 60,
      isIncluded: true,
    },
    {
      title: 'Festa Deck sob as Estrelas',
      category: 'PARTY' as const,
      venueId: venues.deckStage.id,
      artistId: null,
      start: new Date(day3.setUTCHours(22, 0, 0, 0)),
      durationMin: 120,
      isIncluded: true,
    },
    {
      title: 'Show Acústico — Bossa Rock',
      category: 'SHOW' as const,
      venueId: venues.lounge.id,
      artistId: venues.trioBossaRock.id,
      start: new Date(day4.setUTCHours(20, 0, 0, 0)),
      durationMin: 75,
      isIncluded: true,
    },
  ];

  for (const event of events) {
    const endAt = new Date(event.start.getTime() + event.durationMin * 60_000);
    const existing = await prisma.event.findFirst({
      where: { cruiseId: cruise.id, title: event.title },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await prisma.event.create({
      data: {
        cruiseId: cruise.id,
        venueId: event.venueId,
        artistId: event.artistId,
        title: event.title,
        category: event.category,
        startAt: event.start,
        endAt,
        isIncluded: event.isIncluded,
      },
    });
  }

  const experiences = [
    {
      title: 'Tour pelos Bastidores do Show',
      description: 'Conheça os bastidores do Teatro Ondas antes do show de abertura.',
      price: 150,
      isIncluded: false,
    },
    {
      title: 'Aula de Percussão',
      description: 'Oficina de percussão com a equipe musical do navio.',
      price: null,
      isIncluded: true,
    },
    {
      title: 'Degustação de Vinhos',
      description: 'Seleção de rótulos harmonizados com o cardápio do Restaurante Harmonia.',
      price: 90,
      isIncluded: false,
    },
  ];

  for (const experience of experiences) {
    const existing = await prisma.experience.findFirst({
      where: { cruiseId: cruise.id, title: experience.title },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await prisma.experience.create({
      data: {
        cruiseId: cruise.id,
        title: experience.title,
        description: experience.description,
        price: experience.price ?? undefined,
        isIncluded: experience.isIncluded,
      },
    });
  }

  return cruise;
}

async function main(): Promise<void> {
  console.log('Seeding SeaPass — dados de demonstração...');

  const passwordHash = await hashPassword();
  const roleIds = await seedRoles();
  const users = await seedUsers(passwordHash);
  const { rockInSea } = await seedOrganizers();
  await seedUserRoles(roleIds, users, rockInSea.id);

  const ports = await seedPorts();
  const { ship, decks } = await seedShip(rockInSea.id);
  const categories = await seedCabinCategoriesAndCabins(ship.id, decks);
  const venues = await seedVenuesArtistsRestaurants(ship.id, decks);
  const cruise = await seedCruise(rockInSea.id, ship.id, ports, categories, venues);

  console.log('Seed concluído com sucesso.');
  console.log('');
  console.log('Usuários de teste (senha para todos: "Seapass@123"):');
  console.log(`  - Admin da plataforma:   ${users.admin.email}`);
  console.log(`  - Admin do organizador:  ${users.organizerAdmin.email}`);
  console.log(`  - Operador do organizador: ${users.organizerStaff.email}`);
  console.log(`  - Passageiro:            ${users.passenger1.email}`);
  console.log(`  - Passageiro:            ${users.passenger2.email}`);
  console.log('');
  console.log(`Cruzeiro de demonstração: "${cruise.title}" (slug: ${cruise.slug})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, Prisma, RoleKey } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CouponPolicy } from '../../modules/pricing/domain/coupon.policy';
import { PricingEngine } from '../../modules/pricing/domain/pricing-engine';

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
    update: { type: 'THEATER' },
    create: {
      shipId,
      deckId: decks[10],
      name: 'Teatro Ondas',
      description: 'Palco principal para os shows de abertura e encerramento da viagem.',
      capacity: 500,
      type: 'THEATER',
    },
  });

  const lounge = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Lounge Riff' } },
    update: { type: 'LOUNGE' },
    create: {
      shipId,
      deckId: decks[8],
      name: 'Lounge Riff',
      description: 'Bar lounge com música ao vivo intimista, aberto até tarde.',
      capacity: 150,
      type: 'LOUNGE',
    },
  });

  const deckStage = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Palco do Deck' } },
    update: { type: 'LEISURE' },
    create: {
      shipId,
      deckId: decks[10],
      name: 'Palco do Deck',
      description: 'Área externa a céu aberto para festas e shows ao pôr do sol.',
      capacity: 300,
      type: 'LEISURE',
    },
  });

  const piscina = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Piscina Vista Mar' } },
    update: { type: 'POOL' },
    create: {
      shipId,
      deckId: decks[10],
      name: 'Piscina Vista Mar',
      description: 'Piscina principal com deck de espreguiçadeiras e vista 360° para o mar.',
      capacity: 120,
      type: 'POOL',
    },
  });

  const barMare = await prisma.venue.upsert({
    where: { shipId_name: { shipId, name: 'Bar Maré Alta' } },
    update: { type: 'BAR' },
    create: {
      shipId,
      deckId: decks[8],
      name: 'Bar Maré Alta',
      description: 'Bar de coquetéis à beira da piscina, com cardápio autoral.',
      capacity: 60,
      type: 'BAR',
    },
  });

  const mareAlta = await prisma.artist.upsert({
    where: { id: 'seed-artist-mare-alta' },
    update: {
      name: 'Maré Alta Heavy Metal Cover Band',
      bio: 'Cover dedicada aos maiores hinos do heavy metal mundial, de Black Sabbath a Iron Maiden.',
    },
    create: {
      id: 'seed-artist-mare-alta',
      name: 'Maré Alta Heavy Metal Cover Band',
      bio: 'Cover dedicada aos maiores hinos do heavy metal mundial, de Black Sabbath a Iron Maiden.',
    },
  });

  const trioBossaRock = await prisma.artist.upsert({
    where: { id: 'seed-artist-trio-bossa-rock' },
    update: {
      name: 'Trio Acústico Unplugged Metal',
      bio: 'Versões acústicas (unplugged) de clássicos do heavy metal, num formato intimista.',
    },
    create: {
      id: 'seed-artist-trio-bossa-rock',
      name: 'Trio Acústico Unplugged Metal',
      bio: 'Versões acústicas (unplugged) de clássicos do heavy metal, num formato intimista.',
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

  return { teatro, lounge, deckStage, piscina, barMare, mareAlta, trioBossaRock };
}

const HEAVY_METAL_DESCRIPTION = [
  'O Heavy Metal do Leo Sensations é um cruzeiro temático dedicado aos fãs de heavy metal e suas vertentes.',
  'A experiência combina a atmosfera de um grande navio com shows, música pesada e momentos de diversão em alto-mar.',
  'Durante a viagem, os passageiros podem vivenciar uma programação especial voltada à cultura do metal.',
  'O cruzeiro proporciona uma oportunidade única de reunir fãs, artistas e amantes do gênero em um mesmo ambiente.',
  'Além dos eventos musicais, a viagem oferece toda a estrutura e as atrações de um cruzeiro tradicional.',
  'É uma experiência criada para quem deseja celebrar o heavy metal, fazer novas amizades e viver dias inesquecíveis no mar.',
].join('\n');

/**
 * Cruzeiro principal de demonstração — o único com itinerário/eventos/experiências
 * completos e dados de reserva/hold/cabine (ver seedCabinAvailabilityDemoData).
 * `where` casa pelo slug ANTIGO de propósito: garante que rodar o seed de novo
 * num banco que já tinha "Rock in Sea — Clássicos do Rock" RENOMEIA a linha
 * existente (preservando reservas/tickets já criados) em vez de criar uma
 * segunda linha duplicada com o slug novo.
 */
async function seedHeavyMetalCruise(
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
    update: {
      title: 'Heavy Metal do Leo Sensations',
      slug: 'heavy-metal-do-leo-sensations',
      theme: 'Heavy Metal',
      description: HEAVY_METAL_DESCRIPTION,
    },
    create: {
      organizerId,
      shipId,
      title: 'Heavy Metal do Leo Sensations',
      slug: 'heavy-metal-do-leo-sensations',
      theme: 'Heavy Metal',
      description: HEAVY_METAL_DESCRIPTION,
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
      // Mantido do seed original ("Maré Alta" e o nome da banda, ver
      // seedVenuesArtistsRestaurants — funciona pra qualquer genero, sem
      // precisar de matchTitle).
      title: 'Show de Abertura — Maré Alta',
      category: 'SHOW' as const,
      venueId: venues.teatro.id,
      artistId: venues.mareAlta.id,
      start: new Date(day1.setUTCHours(21, 0, 0, 0)),
      durationMin: 90,
      isIncluded: true,
    },
    {
      title: 'Oficina de Riffs — Guitar Clinic Metal',
      matchTitle: 'Roda de Violão Acústica',
      category: 'WORKSHOP' as const,
      venueId: venues.lounge.id,
      artistId: null,
      start: new Date(day2.setUTCHours(16, 0, 0, 0)),
      durationMin: 60,
      isIncluded: true,
    },
    {
      title: 'Mosh Pit sob as Estrelas',
      matchTitle: 'Festa Deck sob as Estrelas',
      category: 'PARTY' as const,
      venueId: venues.deckStage.id,
      artistId: null,
      start: new Date(day3.setUTCHours(22, 0, 0, 0)),
      durationMin: 120,
      isIncluded: true,
    },
    {
      title: 'Unplugged Metal Night',
      matchTitle: 'Show Acústico — Bossa Rock',
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
    // Casa pelo titulo ANTIGO (`matchTitle`) quando informado, pra renomear a
    // linha ja existente em vez de criar uma duplicata — mesmo principio do
    // upsert do cruzeiro acima.
    const existing = await prisma.event.findFirst({
      where: { cruiseId: cruise.id, title: event.matchTitle ?? event.title },
      select: { id: true },
    });

    const data = {
      cruiseId: cruise.id,
      venueId: event.venueId,
      artistId: event.artistId,
      title: event.title,
      category: event.category,
      startAt: event.start,
      endAt,
      isIncluded: event.isIncluded,
    };

    if (existing) {
      await prisma.event.update({ where: { id: existing.id }, data });
    } else {
      await prisma.event.create({ data });
    }
  }

  const experiences = [
    {
      title: 'Tour pelos Bastidores do Show',
      description: 'Conheça os bastidores do Teatro Ondas antes do show de abertura.',
      price: 150,
      isIncluded: false,
    },
    {
      title: 'Aula de Bateria Extrema',
      matchTitle: 'Aula de Percussão',
      description: 'Oficina de bateria com a equipe musical do navio, focada em groove pesado e blast beats.',
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
      where: { cruiseId: cruise.id, title: experience.matchTitle ?? experience.title },
      select: { id: true },
    });

    const data = {
      cruiseId: cruise.id,
      title: experience.title,
      description: experience.description,
      price: experience.price ?? undefined,
      isIncluded: experience.isIncluded,
    };

    if (existing) {
      await prisma.experience.update({ where: { id: existing.id }, data });
    } else {
      await prisma.experience.create({ data });
    }
  }

  return cruise;
}

/**
 * Cinco cruzeiros adicionais, só pra povoar o catálogo com temas variados
 * (pedido explícito do usuário) — mais simples que o de heavy metal acima:
 * mesmo navio/organizador, itinerário padrão de 5 dias (embarque em Santos,
 * Ilha Grande, Búzios, dia de mar, desembarque em Santos) e preço por
 * categoria de cabine, sem eventos/experiências/reservas de demonstração
 * próprios (essas ficam concentradas no cruzeiro principal).
 */
async function seedAdditionalCruises(
  organizerId: string,
  shipId: string,
  ports: Awaited<ReturnType<typeof seedPorts>>,
  categories: Record<string, string>,
) {
  const cruisesData = [
    {
      slug: 'marcello-nicolielo-so-as-melhores',
      title: 'Marcello Nicolielo apresenta: Só as melhores',
      theme: 'Pop/Rock — Grandes Sucessos',
      embarkationDate: new Date('2026-12-05T16:00:00Z'),
      disembarkationDate: new Date('2026-12-10T09:00:00Z'),
      pricing: { interna: 2100, externa: 2700, varanda: 3400, suite: 4900 },
      description: [
        'O cruzeiro Marcello Nicolielo apresenta: Só as melhores reúne os maiores sucessos que marcaram gerações em uma seleção cuidadosamente escolhida por Marcello Nicolielo, um dos nomes mais respeitados na curadoria de grandes hits.',
        'A bordo, os passageiros vivem uma verdadeira viagem no tempo, com sets que passeiam entre pop, rock e MPB, sempre entoando as canções que todo mundo canta junto.',
        'A proposta é simples: nada de meio-termo, só as melhores músicas, tocadas para uma plateia que já sabe cada letra de cor.',
        'Entre um sucesso e outro, o navio se transforma em uma grande festa coletiva, com a pista de dança lotada do início ao fim da viagem.',
        'Além da trilha sonora inesquecível, a experiência conta com toda a estrutura de um cruzeiro tradicional, unindo boa música, boa companhia e o mar como cenário.',
        'É o cruzeiro certo para quem quer cantar alto, dançar sem parar e reviver, em alto-mar, as músicas que fizeram história.',
      ].join('\n'),
    },
    {
      slug: 'paulo-sudre-e-os-mutantes-agitam-o-salao',
      title: 'Paulo Sudré e os Mutantes agitam o salão',
      theme: 'Tropicália e Baile Retrô',
      embarkationDate: new Date('2027-01-15T16:00:00Z'),
      disembarkationDate: new Date('2027-01-20T09:00:00Z'),
      pricing: { interna: 1900, externa: 2500, varanda: 3200, suite: 4600 },
      description: [
        'O cruzeiro Paulo Sudré e os Mutantes agitam o salão celebra a energia contagiante da música que faz qualquer salão vibrar, unindo tropicália, psicodelia e ritmos dançantes em um só palco.',
        'Com Paulo Sudré e os Mutantes à frente da programação, os passageiros embarcam em noites de baile animado, onde ninguém fica parado e a pista nunca esfria.',
        'A viagem resgata o espírito dos grandes bailes, com arranjos coloridos, muita percussão e aquele clima descontraído de festa boa.',
        'Mais do que um show, é um convite para dançar coladinho, rir à toa e viver a bordo a mesma alegria de uma festa de salão inesquecível.',
        'Como em todo cruzeiro SeaPass, a experiência musical vem acompanhada da estrutura completa de uma viagem marítima, com conforto e boas atrações em cada deck.',
        'Ideal para quem busca diversão, dança e uma trilha sonora animada para agitar cada noite no mar.',
      ].join('\n'),
    },
    {
      slug: 'pagodao-com-thacio-moraes',
      title: 'Pagodão com Thácio Moraes',
      theme: 'Pagode',
      embarkationDate: new Date('2027-02-10T16:00:00Z'),
      disembarkationDate: new Date('2027-02-15T09:00:00Z'),
      pricing: { interna: 1800, externa: 2300, varanda: 3000, suite: 4400 },
      description: [
        'O cruzeiro Pagodão com Thácio Moraes é feito para quem não abre mão de um bom samba de raiz e de um pagode animado, do início ao fim da viagem.',
        'Com Thácio Moraes comandando o repertório, os passageiros embarcam em rodas de samba, muito pandeiro e aquele clima de resenha entre amigos que só o pagode proporciona.',
        'A programação musical passa por clássicos do gênero e sucessos atuais, sempre com espaço para o improviso e para o público cantar junto.',
        'Entre uma roda e outra, o navio ganha ares de quintal de fim de semana, com boa comida, boa bebida e samba tocando o dia inteiro.',
        'A experiência une o melhor do pagode à estrutura completa de um cruzeiro tradicional, com toda a comodidade de viajar pelo mar.',
        'Uma viagem pensada para quem quer sambar, brindar e curtir dias de muita música e descontração em alto-mar.',
      ].join('\n'),
    },
    {
      slug: 'claude-beats-24h-non-stop-techno',
      title: 'Claude beats (24h non-stop Techno)',
      theme: 'Techno',
      embarkationDate: new Date('2027-03-20T16:00:00Z'),
      disembarkationDate: new Date('2027-03-25T09:00:00Z'),
      pricing: { interna: 2400, externa: 3000, varanda: 3900, suite: 5600 },
      description: [
        'O cruzeiro Claude beats (24h non-stop Techno) é dedicado a quem vive a batida eletrônica e não quer que a festa pare nunca — literalmente.',
        'Durante toda a viagem, o navio se transforma em uma pista contínua, com sets non-stop de techno tocando 24 horas por dia, sem intervalos e sem pausas.',
        'A proposta é imersiva: DJs se revezam no palco para manter a energia sempre no máximo, criando uma experiência hipnótica que une música eletrônica e o balanço do mar.',
        'Seja de manhã, à tarde ou de madrugada, sempre há um beat pulsando em algum canto do navio, para quem quer dançar a qualquer hora do dia.',
        'Além da maratona eletrônica, os passageiros também aproveitam toda a estrutura e o conforto de um cruzeiro tradicional entre um set e outro.',
        'Uma experiência para os verdadeiros apaixonados por música eletrônica, prontos para vivenciar uma jornada sonora ininterrupta em alto-mar.',
      ].join('\n'),
    },
    {
      slug: 'the-amazing-gemini-and-the-copilots',
      title: 'The Amazing Gemini and the Copilots',
      theme: 'Glam Rock / Space Pop',
      embarkationDate: new Date('2027-04-18T16:00:00Z'),
      disembarkationDate: new Date('2027-04-23T09:00:00Z'),
      pricing: { interna: 2300, externa: 2900, varanda: 3700, suite: 5400 },
      description: [
        'O cruzeiro The Amazing Gemini and the Copilots é uma viagem musical de estética futurista, inspirada nos grandes espetáculos de glam rock e space pop dos anos 70.',
        'A bordo, a banda The Amazing Gemini and the Copilots comanda um show cheio de figurinos extravagantes, luzes coloridas e refrões grudentos que convidam todo mundo a cantar junto.',
        'A proposta é criar uma experiência lúdica e cheia de personalidade, onde cada apresentação parece vinda de um universo paralelo, brilhante e cheio de purpurina.',
        'Entre um hit e outro, o navio se transforma em um verdadeiro palco intergaláctico, com direito a fantasias, coreografias e muita interação com o público.',
        'Como em qualquer cruzeiro temático, a viagem também oferece toda a estrutura tradicional de bordo, unindo espetáculo musical e conforto em alto-mar.',
        'Perfeito para quem gosta de se divertir, se fantasiar um pouco e viver uma experiência musical extravagante e inesquecível.',
      ].join('\n'),
    },
  ];

  const cruises = [];
  for (const data of cruisesData) {
    const cruise = await prisma.cruise.upsert({
      where: { slug: data.slug },
      update: {
        title: data.title,
        theme: data.theme,
        description: data.description,
      },
      create: {
        organizerId,
        shipId,
        title: data.title,
        slug: data.slug,
        theme: data.theme,
        description: data.description,
        status: 'PUBLISHED',
        embarkationDate: data.embarkationDate,
        disembarkationDate: data.disembarkationDate,
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

    for (const [slug, price] of Object.entries(data.pricing)) {
      const cabinCategoryId = categories[slug];
      if (!cabinCategoryId) {
        throw new Error(`Categoria de cabine "${slug}" nao foi criada antes do pricing.`);
      }
      await prisma.cruiseCabinPricing.upsert({
        where: { cruiseId_cabinCategoryId: { cruiseId: cruise.id, cabinCategoryId } },
        update: { price },
        create: {
          cruiseId: cruise.id,
          cabinCategoryId,
          price,
          cancellationPolicy: 'Cancelamento gratuito até 15 dias antes do embarque.',
        },
      });
    }

    cruises.push(cruise);
  }

  return cruises;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} nao foi criado(a) antes de ser referenciado(a) no seed.`);
  }
  return value;
}

/**
 * Estados de disponibilidade reais para o mapa interativo do navio (ver
 * CabinAvailabilityPolicy) — sem isto, toda cabine apareceria como
 * disponivel e os estados BOOKED/HELD/UNAVAILABLE nunca seriam
 * demonstrados contra dados de verdade.
 */
async function seedCabinAvailabilityDemoData(
  cruiseId: string,
  decks: Record<number, string>,
  categories: Record<string, string>,
  users: Awaited<ReturnType<typeof seedUsers>>,
) {
  const deck6Id = requireValue(decks[6], 'Deck 6');
  const deck8Id = requireValue(decks[8], 'Deck 8');
  const deck10Id = requireValue(decks[10], 'Deck 10');
  const externaCategoryId = requireValue(categories.externa, 'Categoria externa');
  const varandaCategoryId = requireValue(categories.varanda, 'Categoria varanda');

  const externaCabin = await prisma.cabin.findUniqueOrThrow({
    where: { deckId_code: { deckId: deck6Id, code: '6202' } },
  });
  const varandaCabin = await prisma.cabin.findUniqueOrThrow({
    where: { deckId_code: { deckId: deck8Id, code: '8302' } },
  });
  const suiteCabin = await prisma.cabin.findUniqueOrThrow({
    where: { deckId_code: { deckId: deck10Id, code: '10402' } },
  });

  const externaPricing = await prisma.cruiseCabinPricing.findUniqueOrThrow({
    where: { cruiseId_cabinCategoryId: { cruiseId, cabinCategoryId: externaCategoryId } },
  });
  const varandaPricing = await prisma.cruiseCabinPricing.findUniqueOrThrow({
    where: { cruiseId_cabinCategoryId: { cruiseId, cabinCategoryId: varandaCategoryId } },
  });

  // Cupom de demonstracao — 10% no cruzeiro de seed, valor minimo baixo o
  // suficiente pra nunca bloquear as cabines de demonstracao, ainda com usos
  // (globais e por usuario) sobrando. Ver docs/architecture/decisions/0011-pricing-engine.md.
  const demoCoupon = await prisma.coupon.upsert({
    where: { code: 'ROCKINSEA10' },
    update: {},
    create: {
      code: 'ROCKINSEA10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minPurchaseAmount: 500,
      maxUses: 100,
      usedCount: 1,
      maxUsesPerUser: 3,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2027-12-31T23:59:59Z'),
      isActive: true,
      applicableCruises: { create: [{ cruiseId }] },
    },
  });

  const tourExperience = await prisma.experience.findFirstOrThrow({
    where: { cruiseId, title: 'Tour pelos Bastidores do Show' },
  });

  // Reserva confirmada de ponta a ponta — cabine 6202 aparece como "BOOKED"
  // no mapa, e demonstra o dominio completo (hospede titular, adicional
  // selecionado, cupom aplicado, pagamento simulado aprovado). Preco
  // calculado pelo mesmo PricingEngine/CouponPolicy usado em runtime, nao a
  // mao, pra nunca divergir da regra real. 1 hospede (o titular criado logo
  // abaixo) — entra na taxa de embarque por passageiro (ver ADR-0011).
  const confirmedAddonPrices = [tourExperience.price ?? new Prisma.Decimal(0)];
  const confirmedSubtotal = externaPricing.price.add(
    confirmedAddonPrices.reduce((sum, price) => sum.add(price), new Prisma.Decimal(0)),
  );
  const confirmedBreakdown = PricingEngine.calculate({
    cabinPrice: externaPricing.price,
    passengerCount: 1,
    addonPrices: confirmedAddonPrices,
    discountAmount: CouponPolicy.computeDiscount(demoCoupon, confirmedSubtotal),
  });
  const confirmedBooking = await prisma.booking.upsert({
    where: { id: 'seed-booking-confirmed' },
    update: { couponId: demoCoupon.id, ...confirmedBreakdown },
    create: {
      id: 'seed-booking-confirmed',
      userId: users.passenger2.id,
      cruiseId,
      cabinId: externaCabin.id,
      couponId: demoCoupon.id,
      status: 'CONFIRMED',
      ...confirmedBreakdown,
      currency: externaPricing.currency,
      confirmedAt: new Date(),
    },
  });
  await prisma.bookingGuest.upsert({
    where: { id: 'seed-guest-confirmed-primary' },
    update: {},
    create: {
      id: 'seed-guest-confirmed-primary',
      bookingId: confirmedBooking.id,
      fullName: users.passenger2.fullName,
      documentType: 'PASSPORT',
      documentNumber: 'BR' + '9'.repeat(7),
      isPrimary: true,
    },
  });
  await prisma.bookingExperience.upsert({
    where: { bookingId_experienceId: { bookingId: confirmedBooking.id, experienceId: tourExperience.id } },
    update: {},
    create: {
      bookingId: confirmedBooking.id,
      experienceId: tourExperience.id,
      priceAtBooking: tourExperience.price ?? new Prisma.Decimal(0),
    },
  });
  await prisma.payment.upsert({
    where: { simulatedTransactionId: 'SIMULATED-SEED-CONFIRMED' },
    update: { amount: confirmedBreakdown.totalAmount },
    create: {
      bookingId: confirmedBooking.id,
      method: 'CREDIT_CARD',
      status: 'APPROVED',
      amount: confirmedBreakdown.totalAmount,
      currency: externaPricing.currency,
      simulatedTransactionId: 'SIMULATED-SEED-CONFIRMED',
      paidAt: new Date(),
    },
  });

  // Hold de checkout ainda valido — cabine 8302 aparece como "HELD" (ainda
  // sem hospedes informados, representando o meio do fluxo). O hold e
  // reajustado a cada reseed para nunca aparecer expirado em dev (mesma
  // duracao do default de CABIN_HOLD_MINUTES — ver ADR-0009).
  const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const heldBreakdown = PricingEngine.calculate({
    cabinPrice: varandaPricing.price,
    passengerCount: 0,
    addonPrices: [],
    discountAmount: new Prisma.Decimal(0),
  });
  await prisma.booking.upsert({
    where: { id: 'seed-booking-pending-hold' },
    update: { holdExpiresAt, ...heldBreakdown },
    create: {
      id: 'seed-booking-pending-hold',
      userId: users.passenger1.id,
      cruiseId,
      cabinId: varandaCabin.id,
      status: 'HELD',
      ...heldBreakdown,
      currency: varandaPricing.currency,
      holdExpiresAt,
    },
  });

  // Cabine fora de operacao — 10402 aparece como "UNAVAILABLE" independente
  // de reserva (nao depende do cruzeiro, e um estado da cabine fisica).
  await prisma.cabin.update({ where: { id: suiteCabin.id }, data: { status: 'MAINTENANCE' } });
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
  const cruise = await seedHeavyMetalCruise(rockInSea.id, ship.id, ports, categories, venues);
  await seedCabinAvailabilityDemoData(cruise.id, decks, categories, users);
  const additionalCruises = await seedAdditionalCruises(rockInSea.id, ship.id, ports, categories);

  console.log('Seed concluído com sucesso.');
  console.log('');
  console.log('Usuários de teste (senha para todos: "Seapass@123"):');
  console.log(`  - Admin da plataforma:   ${users.admin.email}`);
  console.log(`  - Admin do organizador:  ${users.organizerAdmin.email}`);
  console.log(`  - Operador do organizador: ${users.organizerStaff.email}`);
  console.log(`  - Passageiro:            ${users.passenger1.email}`);
  console.log(`  - Passageiro:            ${users.passenger2.email}`);
  console.log('');
  console.log('Cruzeiros de demonstração:');
  console.log(`  - "${cruise.title}" (slug: ${cruise.slug})`);
  for (const c of additionalCruises) {
    console.log(`  - "${c.title}" (slug: ${c.slug})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

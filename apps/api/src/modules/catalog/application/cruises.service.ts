import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CruiseStatus } from '@prisma/client';
import type {
  CreateCruiseInput,
  CruiseQuery,
  SetCruiseCabinPricingInput,
  UpdateCruiseInput,
} from '@seapass/contracts';
import { generateUniqueSlug } from '../../../common/utils/slug';
import { CabinAvailabilityPolicy } from '../domain/cabin-availability.policy';
import { CruiseStatusPolicy } from '../domain/cruise-status.policy';
import { toPageResult } from '../domain/pagination';
import { CabinsRepository } from '../persistence/cabins.repository';
import { CruisesRepository } from '../persistence/cruises.repository';
import { DecksRepository } from '../persistence/decks.repository';
import { CabinCategoriesService } from './cabin-categories.service';
import { ShipsService } from './ships.service';

@Injectable()
export class CruisesService {
  constructor(
    private readonly cruisesRepository: CruisesRepository,
    private readonly decksRepository: DecksRepository,
    private readonly cabinsRepository: CabinsRepository,
    private readonly shipsService: ShipsService,
    private readonly cabinCategoriesService: CabinCategoriesService,
  ) {}

  /** Catalogo publico — nunca mostra nada alem de cruzeiros PUBLISHED, independente do que o cliente pedir. */
  async listPublished(query: CruiseQuery) {
    const { data, total } = await this.cruisesRepository.findMany(query, CruiseStatus.PUBLISHED);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  /** Gestao pelo organizador — ve os proprios cruzeiros em qualquer status. */
  async listForOrganizer(organizerId: string, query: CruiseQuery) {
    const { data, total } = await this.cruisesRepository.findMany({ ...query, organizerId });
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async findBySlugPublished(slug: string) {
    const cruise = await this.cruisesRepository.findBySlug(slug);
    if (!cruise || cruise.status !== CruiseStatus.PUBLISHED) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  /**
   * Tambem usado por outros services do catalogo (Events, Experiences,
   * ItineraryStops) para checar posse antes de criar um sub-recurso — 404
   * (nao 403) quando o cruzeiro e de outro organizador, para nao revelar a
   * existencia do recurso a quem nao e dono (ver ADR-0005).
   */
  async findByIdForOrganizer(organizerId: string, id: string) {
    const cruise = await this.cruisesRepository.findById(id);
    if (!cruise || cruise.organizerId !== organizerId) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  /** Detalhe rico (mesmo shape da pagina publica), pra alimentar o formulario de edicao — em qualquer status. */
  async findByIdForOrganizerDetailed(organizerId: string, id: string) {
    await this.findByIdForOrganizer(organizerId, id);
    return this.cruisesRepository.findByIdWithDetail(id);
  }

  async create(organizerId: string, input: CreateCruiseInput) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, input.shipId);

    const slug = await generateUniqueSlug(input.title, (candidate) =>
      this.cruisesRepository.existsBySlug(candidate),
    );

    return this.cruisesRepository.create(organizerId, slug, input);
  }

  async update(organizerId: string, id: string, input: UpdateCruiseInput) {
    await this.findByIdForOrganizer(organizerId, id);
    return this.cruisesRepository.update(id, input);
  }

  async publish(organizerId: string, id: string) {
    const cruise = await this.findByIdForOrganizer(organizerId, id);

    const readiness = await this.cruisesRepository.findPublishReadiness(id);
    if (!readiness) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }

    CruiseStatusPolicy.assertCanPublish(cruise.status, {
      hasItinerary: readiness._count.itineraryStops > 0,
      hasPricing: readiness._count.cabinPricings > 0,
    });

    return this.cruisesRepository.updateStatus(id, CruiseStatus.PUBLISHED);
  }

  async unpublish(organizerId: string, id: string) {
    const cruise = await this.findByIdForOrganizer(organizerId, id);
    CruiseStatusPolicy.assertCanUnpublish(cruise.status);
    return this.cruisesRepository.updateStatus(id, CruiseStatus.DRAFT);
  }

  /**
   * Preco por categoria de cabine, especifico deste cruzeiro (o mesmo navio
   * pode ter precos diferentes em sailings diferentes — ver schema.prisma).
   */
  async setCabinPricing(organizerId: string, cruiseId: string, input: SetCruiseCabinPricingInput) {
    const cruise = await this.findByIdForOrganizer(organizerId, cruiseId);
    const category = await this.cabinCategoriesService.findById(input.cabinCategoryId);
    if (category.shipId !== cruise.shipId) {
      throw new ConflictException('Esta categoria de cabine nao pertence ao navio deste cruzeiro.');
    }
    return this.cruisesRepository.setCabinPricing(cruiseId, input);
  }

  /**
   * Dados para o mapa interativo do navio: cada deck com suas cabines (preco
   * + disponibilidade calculados PARA ESTE cruzeiro), venues e restaurantes.
   * Publico, mesmas regras de visibilidade de findBySlugPublished (404 se o
   * cruzeiro nao existe ou nao esta PUBLISHED).
   */
  async getDeckMap(slug: string) {
    const cruise = await this.findBySlugPublished(slug);

    const [decks, activeBookings] = await Promise.all([
      this.decksRepository.findByShipWithLayout(cruise.shipId),
      this.cabinsRepository.findActiveBookingsForCruise(cruise.id),
    ]);

    const bookingByCabinId = new Map(activeBookings.map((booking) => [booking.cabinId, booking]));
    const priceByCategoryId = new Map(cruise.cabinPricings.map((pricing) => [pricing.cabinCategoryId, pricing]));

    return decks.map((deck) => ({
      id: deck.id,
      number: deck.number,
      name: deck.name,
      description: deck.description,
      cabins: deck.cabins.map((cabin) => {
        const pricing = priceByCategoryId.get(cabin.cabinCategoryId);
        return {
          id: cabin.id,
          code: cabin.code,
          cabinCategory: cabin.cabinCategory,
          price: pricing?.price ?? null,
          currency: pricing?.currency ?? null,
          availability: CabinAvailabilityPolicy.resolve(cabin.status, bookingByCabinId.get(cabin.id)),
        };
      }),
      venues: deck.venues,
      restaurants: deck.restaurants,
    }));
  }
}

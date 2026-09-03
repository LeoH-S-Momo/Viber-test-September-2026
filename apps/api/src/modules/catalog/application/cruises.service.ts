import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CruiseStatus } from '@prisma/client';
import type {
  CreateCruiseInput,
  CruiseQuery,
  SetCruiseCabinPricingInput,
  UpdateCruiseInput,
} from '@seapass/contracts';
import { generateUniqueSlug } from '../../../common/utils/slug';
import { CruiseStatusPolicy } from '../domain/cruise-status.policy';
import { toPageResult } from '../domain/pagination';
import { CruisesRepository } from '../persistence/cruises.repository';
import { CabinCategoriesService } from './cabin-categories.service';
import { ShipsService } from './ships.service';

@Injectable()
export class CruisesService {
  constructor(
    private readonly cruisesRepository: CruisesRepository,
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
}

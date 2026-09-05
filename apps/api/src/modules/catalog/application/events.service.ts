import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CreateEventInput, EventQuery, UpdateEventInput } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { DomainEvent } from '../../../domain-events/domain-events';
import { EventsRepository } from '../persistence/events.repository';
import { CruisesService } from './cruises.service';
import { VenuesService } from './venues.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly cruisesService: CruisesService,
    private readonly venuesService: VenuesService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findMany(query: EventQuery) {
    return this.eventsRepository.findMany(query);
  }

  async findManyForOrganizer(organizerId: string, cruiseId?: string) {
    if (cruiseId) {
      await this.cruisesService.findByIdForOrganizer(organizerId, cruiseId);
    }
    return this.eventsRepository.findManyForOrganizer(organizerId, cruiseId);
  }

  async findById(id: string) {
    const event = await this.eventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException('Evento nao encontrado.');
    }
    return event;
  }

  async create(organizerId: string, input: CreateEventInput, actorUserId?: string) {
    const cruise = await this.cruisesService.findByIdForOrganizer(organizerId, input.cruiseId);
    const venue = await this.venuesService.findById(input.venueId);
    if (venue.shipId !== cruise.shipId) {
      throw new NotFoundException('Espaco (venue) nao encontrado neste navio.');
    }
    const event = await this.eventsRepository.create(input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'event.created',
      entityType: 'Event',
      entityId: event.id,
      metadata: { title: event.title, cruiseId: input.cruiseId },
    });
    return event;
  }

  async update(organizerId: string, id: string, input: UpdateEventInput, actorUserId?: string) {
    const event = await this.findById(id);
    await this.cruisesService.findByIdForOrganizer(organizerId, event.cruise.id);

    // `UpdateEventSchema`'s refine so recusa quando startAt/endAt vem juntos no mesmo PATCH —
    // mesma limitacao de UpdateCruiseSchema/UpdateCouponSchema (Zod nao compara contra o valor
    // JA salvo do campo que faltou no body). Backstop: revalida o par MERGED antes de escrever
    // (achado e corrigido na revisao geral de 2026-09-05, junto da falta de validacao alguma no
    // create, ja coberta pelo novo refine do proprio schema).
    const mergedStartAt = input.startAt ?? event.startAt;
    const mergedEndAt = input.endAt ?? event.endAt;
    if (mergedEndAt <= mergedStartAt) {
      throw new ConflictException('endAt precisa ser depois de startAt.');
    }

    // So o que importa pro passageiro que ja reservou (ver "alteracao de evento" em
    // NotificationsService.notifyEventUpdated) — mudar so a descricao, por exemplo, nao merece
    // um e-mail dizendo "a programacao mudou".
    const changedFields = (['startAt', 'endAt', 'venueId'] as const).filter((field) => {
      if (input[field] === undefined) return false;
      if (field === 'venueId') return input.venueId !== event.venueId;
      return (input[field] as Date).getTime() !== event[field].getTime();
    });

    const updated = await this.eventsRepository.update(id, input);
    await this.auditLog.record({ actorUserId: actorUserId ?? null, action: 'event.updated', entityType: 'Event', entityId: id, metadata: input });
    if (changedFields.length > 0) {
      this.eventEmitter.emit(DomainEvent.EVENT_UPDATED, { eventId: id, changedFields });
    }
    return updated;
  }
}

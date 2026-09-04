import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateShipInput, UpdateShipInput } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { ShipsRepository } from '../persistence/ships.repository';

@Injectable()
export class ShipsService {
  constructor(
    private readonly shipsRepository: ShipsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  findMany(organizerId?: string) {
    return this.shipsRepository.findMany(organizerId);
  }

  async findById(id: string) {
    const ship = await this.shipsRepository.findById(id);
    if (!ship) {
      throw new NotFoundException('Navio nao encontrado.');
    }
    return ship;
  }

  /** Usado internamente por outros services do catalogo para checar posse sem expor o navio inteiro. */
  async findOwnedByOrganizerOrThrow(organizerId: string, id: string) {
    const ship = await this.shipsRepository.findById(id);
    if (!ship || ship.organizerId !== organizerId) {
      throw new NotFoundException('Navio nao encontrado.');
    }
    return ship;
  }

  async create(organizerId: string, input: CreateShipInput, actorUserId?: string) {
    const ship = await this.shipsRepository.create(organizerId, input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'ship.created',
      entityType: 'Ship',
      entityId: ship.id,
      metadata: { name: ship.name, organizerId },
    });
    return ship;
  }

  async update(organizerId: string, id: string, input: UpdateShipInput, actorUserId?: string) {
    await this.findOwnedByOrganizerOrThrow(organizerId, id);
    const ship = await this.shipsRepository.update(id, input);
    await this.auditLog.record({ actorUserId: actorUserId ?? null, action: 'ship.updated', entityType: 'Ship', entityId: id, metadata: input });
    return ship;
  }
}

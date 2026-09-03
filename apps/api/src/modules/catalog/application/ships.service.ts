import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateShipInput, UpdateShipInput } from '@seapass/contracts';
import { ShipsRepository } from '../persistence/ships.repository';

@Injectable()
export class ShipsService {
  constructor(private readonly shipsRepository: ShipsRepository) {}

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

  create(organizerId: string, input: CreateShipInput) {
    return this.shipsRepository.create(organizerId, input);
  }

  async update(organizerId: string, id: string, input: UpdateShipInput) {
    await this.findOwnedByOrganizerOrThrow(organizerId, id);
    return this.shipsRepository.update(id, input);
  }
}

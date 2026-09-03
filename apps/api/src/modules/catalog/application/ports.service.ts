import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePortInput, UpdatePortInput } from '@seapass/contracts';
import { PortsRepository } from '../persistence/ports.repository';

/**
 * Ports sao dado de referencia global (nao pertencem a um organizador) —
 * curadoria fica com o admin da plataforma, ver docs/architecture/api-permissions.md.
 */
@Injectable()
export class PortsService {
  constructor(private readonly portsRepository: PortsRepository) {}

  findMany() {
    return this.portsRepository.findMany();
  }

  async findById(id: string) {
    const port = await this.portsRepository.findById(id);
    if (!port) {
      throw new NotFoundException('Porto nao encontrado.');
    }
    return port;
  }

  create(input: CreatePortInput) {
    return this.portsRepository.create(input);
  }

  async update(id: string, input: UpdatePortInput) {
    await this.findById(id);
    return this.portsRepository.update(id, input);
  }
}

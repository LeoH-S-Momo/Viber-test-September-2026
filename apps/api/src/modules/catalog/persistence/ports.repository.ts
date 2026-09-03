import { Injectable } from '@nestjs/common';
import type { CreatePortInput, UpdatePortInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class PortsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.port.findMany({ orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.port.findUnique({ where: { id } });
  }

  create(input: CreatePortInput) {
    return this.prisma.port.create({ data: input });
  }

  update(id: string, input: UpdatePortInput) {
    return this.prisma.port.update({ where: { id }, data: input });
  }
}

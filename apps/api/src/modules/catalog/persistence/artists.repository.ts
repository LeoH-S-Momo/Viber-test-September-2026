import { Injectable } from '@nestjs/common';
import type { CreateArtistInput, UpdateArtistInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ArtistsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.artist.findMany({ orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.artist.findUnique({ where: { id } });
  }

  create(input: CreateArtistInput) {
    return this.prisma.artist.create({ data: input });
  }

  update(id: string, input: UpdateArtistInput) {
    return this.prisma.artist.update({ where: { id }, data: input });
  }
}

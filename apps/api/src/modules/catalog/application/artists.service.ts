import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateArtistInput, UpdateArtistInput } from '@seapass/contracts';
import { ArtistsRepository } from '../persistence/artists.repository';

/**
 * Artists sao dado compartilhado (nao pertencem a um organizador — a mesma
 * banda pode se apresentar em cruzeiros de organizadores diferentes),
 * diferente de Ports: qualquer ORGANIZER_ADMIN pode cadastrar um artista
 * novo ao montar a programacao do proprio cruzeiro, nao so o admin global.
 */
@Injectable()
export class ArtistsService {
  constructor(private readonly artistsRepository: ArtistsRepository) {}

  findMany() {
    return this.artistsRepository.findMany();
  }

  async findById(id: string) {
    const artist = await this.artistsRepository.findById(id);
    if (!artist) {
      throw new NotFoundException('Artista nao encontrado.');
    }
    return artist;
  }

  create(input: CreateArtistInput) {
    return this.artistsRepository.create(input);
  }

  async update(id: string, input: UpdateArtistInput) {
    await this.findById(id);
    return this.artistsRepository.update(id, input);
  }
}

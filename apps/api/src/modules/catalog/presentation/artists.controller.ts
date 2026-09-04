import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateArtistSchema,
  UpdateArtistSchema,
  type CreateArtistInput,
  type UpdateArtistInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { ArtistsService } from '../application/artists.service';

/**
 * Artistas sao dado de referencia COMPARTILHADO (a mesma banda/DJ pode se apresentar em
 * cruzeiros de organizadores diferentes, ver schema.prisma) — nao pertence a nenhum
 * organizador especifico, entao "ownership" nao se aplica. Antes desta revisao de hardening
 * (ADR-0020), `@Roles(ORGANIZER_ADMIN)` sem checagem nenhuma deixava QUALQUER organizador
 * editar/renomear o artista que aparece na programacao de OUTRO organizador — restrito a
 * PLATFORM_ADMIN agora, mesmo tratamento ja dado a Ports (outro dado de referencia global, ver
 * ports.controller.ts). Organizadores continuam podendo LER a lista pra escolher um artista ao
 * criar um evento (`GET /artists`, ainda publico) — so criar/editar fica restrito.
 */
@ApiTags('catalog/artists')
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Public()
  @Get()
  list() {
    return this.artistsService.findMany();
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.artistsService.findById(id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN)
  @Post()
  create(@Body(new ZodValidationPipe(CreateArtistSchema)) body: CreateArtistInput) {
    return this.artistsService.create(body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateArtistSchema)) body: UpdateArtistInput,
  ) {
    return this.artistsService.update(id, body);
  }
}

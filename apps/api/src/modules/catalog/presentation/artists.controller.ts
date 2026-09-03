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
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post()
  create(@Body(new ZodValidationPipe(CreateArtistSchema)) body: CreateArtistInput) {
    return this.artistsService.create(body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateArtistSchema)) body: UpdateArtistInput,
  ) {
    return this.artistsService.update(id, body);
  }
}

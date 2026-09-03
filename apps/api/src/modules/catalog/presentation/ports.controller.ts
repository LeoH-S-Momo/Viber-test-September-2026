import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { CreatePortSchema, UpdatePortSchema, type CreatePortInput, type UpdatePortInput } from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PortsService } from '../application/ports.service';

/** Ports sao dado de referencia global — criacao/edicao restrita ao admin da plataforma. */
@ApiTags('catalog/ports')
@Controller('ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Public()
  @Get()
  list() {
    return this.portsService.findMany();
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.portsService.findById(id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN)
  @Post()
  create(@Body(new ZodValidationPipe(CreatePortSchema)) body: CreatePortInput) {
    return this.portsService.create(body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePortSchema)) body: UpdatePortInput,
  ) {
    return this.portsService.update(id, body);
  }
}

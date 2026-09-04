import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CruiseQuerySchema,
  InviteStaffSchema,
  OrganizerBookingsQuerySchema,
  OrganizerDashboardQuerySchema,
  OrganizerEventsQuerySchema,
  OrganizerExperiencesQuerySchema,
  OrganizerPassengersQuerySchema,
  type CruiseQuery,
  type InviteStaffInput,
  type OrganizerBookingsQuery,
  type OrganizerDashboardQuery,
  type OrganizerEventsQuery,
  type OrganizerExperiencesQuery,
  type OrganizerPassengersQuery,
} from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../common/utils/auth-context';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CruisesService } from '../catalog/application/cruises.service';
import { EventsService } from '../catalog/application/events.service';
import { ExperiencesService } from '../catalog/application/experiences.service';
import { RestaurantsService } from '../catalog/application/restaurants.service';
import { ShipsService } from '../catalog/application/ships.service';
import { OrganizersService } from './organizers.service';

/**
 * Todas as rotas aqui sao escopadas ao organizador do proprio usuario logado
 * (`/organizers/me/...`) — nao existe endpoint para operar em outro
 * organizador; isso é reservado ao painel admin (ver AdminModule).
 */
@ApiTags('organizers')
@ApiBearerAuth()
@Controller('organizers/me')
export class OrganizersController {
  constructor(
    private readonly organizersService: OrganizersService,
    private readonly cruisesService: CruisesService,
    private readonly shipsService: ShipsService,
    private readonly eventsService: EventsService,
    private readonly restaurantsService: RestaurantsService,
    private readonly experiencesService: ExperiencesService,
  ) {}

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('staff')
  async inviteStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(InviteStaffSchema)) body: InviteStaffInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    const staff = await this.organizersService.inviteStaff(organizerId, body);
    return {
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      roles: staff.roles.map((r) => ({ key: r.role.key, organizerId: r.organizerId })),
    };
  }

  /** Gestao do proprio catalogo — ve cruzeiros em QUALQUER status (DRAFT incluso), diferente de GET /cruises publico. */
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises')
  myCruises(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(CruiseQuerySchema)) query: CruiseQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.listForOrganizer(organizerId, query);
  }

  /** Detalhe rico de UM cruzeiro proprio, em qualquer status — alimenta o formulario de edicao. */
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises/:cruiseId')
  async myCruiseDetail(@CurrentUser() user: AuthenticatedUser, @Param('cruiseId') cruiseId: string) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.findByIdForOrganizerDetailed(organizerId, cruiseId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises/:cruiseId/occupancy')
  async occupancy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cruiseId') cruiseId: string,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.getOccupancy(organizerId, cruiseId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises/:cruiseId/sales')
  async sales(@CurrentUser() user: AuthenticatedUser, @Param('cruiseId') cruiseId: string) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.getSales(organizerId, cruiseId);
  }

  /** Painel — metricas gerais (receita, ocupacao, cancelamentos, top eventos/experiencias...), filtravel por cruzeiro/periodo. Ver ADR-0016. */
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('dashboard')
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OrganizerDashboardQuerySchema)) query: OrganizerDashboardQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.getDashboard(organizerId, query);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('bookings')
  bookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OrganizerBookingsQuerySchema)) query: OrganizerBookingsQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.listBookings(organizerId, query);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('passengers')
  passengers(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OrganizerPassengersQuerySchema)) query: OrganizerPassengersQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.listPassengers(organizerId, query);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('ships')
  ships(@CurrentUser() user: AuthenticatedUser) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.shipsService.findMany(organizerId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('events')
  events(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OrganizerEventsQuerySchema)) query: OrganizerEventsQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.eventsService.findManyForOrganizer(organizerId, query.cruiseId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('restaurants')
  restaurants(@CurrentUser() user: AuthenticatedUser) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.restaurantsService.findManyForOrganizer(organizerId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('experiences')
  experiences(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OrganizerExperiencesQuerySchema)) query: OrganizerExperiencesQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.experiencesService.findManyForOrganizer(organizerId, query.cruiseId);
  }
}

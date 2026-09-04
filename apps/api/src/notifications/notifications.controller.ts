import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../modules/auth/types/jwt-payload';
import { toPageResult, toSkipTake } from '../modules/catalog/domain/pagination';
import { PrismaService } from '../database/prisma/prisma.service';

const NotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>;

/**
 * "Log de notificacoes" do proprio usuario — ver ADR-0019. So leitura (nunca
 * ha um endpoint de escrita: notificacoes so nascem de eventos de dominio,
 * ver NotificationsDomainEventsListener), qualquer papel autenticado pode
 * ver as suas (sem @Roles — mesmo espirito de `GET /tickets/me`).
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async listMine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(NotificationsQuerySchema)) query: NotificationsQuery) {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          deliveryStatus: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
          bookingId: true,
        },
      }),
      this.prisma.notification.count({ where: { userId: user.sub } }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }
}

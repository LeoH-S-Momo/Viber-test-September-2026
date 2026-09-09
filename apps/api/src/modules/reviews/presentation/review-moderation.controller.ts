import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  ModerateReviewSchema,
  ReviewModerationQuerySchema,
  type ModerateReviewInput,
  type ReviewModerationQuery,
} from '@seapass/contracts';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ReviewsService } from '../application/reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@Roles(RoleKey.ORGANIZER_ADMIN)
@Controller('organizador/reviews')
export class ReviewModerationController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ReviewModerationQuerySchema)) query: ReviewModerationQuery,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.reviewsService.listForModeration(organizerId, query.status, query.page, query.pageSize);
  }

  @Patch(':id/moderate')
  moderate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModerateReviewSchema)) body: ModerateReviewInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.reviewsService.moderate(organizerId, id, body.status, user.sub, body.note);
  }
}

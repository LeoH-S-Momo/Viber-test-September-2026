import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateReviewSchema,
  PaginationQuerySchema,
  type CreateReviewInput,
  type PaginationQuery,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ReviewsService } from '../application/reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/:id/review')
  getMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviewsService.getMine(id, user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/review')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateReviewSchema)) body: CreateReviewInput,
  ) {
    return this.reviewsService.submit(id, user.sub, body.rating, body.comment);
  }

  @Public()
  @Get('cruises/:slug/reviews')
  listForCruise(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.reviewsService.listApprovedForCruise(slug, query.page, query.pageSize);
  }
}

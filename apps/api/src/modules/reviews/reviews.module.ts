import { Module } from '@nestjs/common';
import { ReviewsController } from './presentation/reviews.controller';
import { ReviewModerationController } from './presentation/review-moderation.controller';
import { ReviewsService } from './application/reviews.service';
import { ReviewsRepository } from './persistence/reviews.repository';

@Module({
  controllers: [ReviewsController, ReviewModerationController],
  providers: [ReviewsService, ReviewsRepository],
})
export class ReviewsModule {}

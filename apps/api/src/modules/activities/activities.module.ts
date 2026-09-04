import { Module } from '@nestjs/common';
import { ActivitiesService } from './application/activities.service';
import { ActivitiesRepository } from './persistence/activities.repository';
import { ActivitiesController } from './presentation/activities.controller';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivitiesRepository],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}

import { Module } from '@nestjs/common';
import { CruisesController } from './cruises.controller';
import { CruisesService } from './cruises.service';

@Module({
  controllers: [CruisesController],
  providers: [CruisesService],
  exports: [CruisesService],
})
export class CruisesModule {}

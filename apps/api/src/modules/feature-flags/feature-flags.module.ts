import { Module } from '@nestjs/common';
import { FeatureFlagsController } from './presentation/feature-flags.controller';
import { FeatureFlagsService } from './application/feature-flags.service';
import { FeatureFlagsRepository } from './persistence/feature-flags.repository';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureFlagsRepository],
  // Exportado para AdminModule (AdminFeatureFlagsController usa o mesmo service — nao ha
  // duplicacao de logica entre o lado admin e o lado organizador).
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}

import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrganizersController } from './organizers.controller';
import { OrganizersService } from './organizers.service';

@Module({
  imports: [UsersModule, CatalogModule],
  controllers: [OrganizersController],
  providers: [OrganizersService],
})
export class OrganizersModule {}

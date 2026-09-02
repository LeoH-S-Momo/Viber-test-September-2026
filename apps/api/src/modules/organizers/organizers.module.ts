import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrganizersController } from './organizers.controller';
import { OrganizersService } from './organizers.service';

@Module({
  imports: [UsersModule],
  controllers: [OrganizersController],
  providers: [OrganizersService],
})
export class OrganizersModule {}

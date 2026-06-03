import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [DatabaseModule, OrganizationsModule, LoggerModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService], // Export for use in guards
})
export class ApiKeysModule {}

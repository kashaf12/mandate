import { Module, forwardRef } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsModule } from '../organizations/organizations.module'; // NEW
import { ApiKeysModule } from '../api-keys/api-keys.module'; // NEW (for guard)
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [
    DatabaseModule,
    LoggerModule,
    OrganizationsModule, // NEW
    ApiKeysModule, // NEW
    forwardRef(() => AuditModule),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}

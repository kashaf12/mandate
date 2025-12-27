import { Module, forwardRef } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => AuditModule)],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [forwardRef(() => AgentsModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

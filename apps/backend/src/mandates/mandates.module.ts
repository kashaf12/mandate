import { Module } from '@nestjs/common';
import { MandatesController } from './mandates.controller';
import { MandatesService } from './mandates.service';
import { AgentsModule } from '../agents/agents.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [RulesModule, AgentsModule],
  controllers: [MandatesController],
  providers: [MandatesService],
  exports: [MandatesService],
})
export class MandatesModule {}

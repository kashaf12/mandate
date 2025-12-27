import { Module } from '@nestjs/common';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { RuleEvaluatorService } from './rule-evaluator.service';
import { PolicyComposerService } from './policy-composer.service';
import { PoliciesModule } from '../policies/policies.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [PoliciesModule, AgentsModule],
  controllers: [RulesController],
  providers: [RulesService, RuleEvaluatorService, PolicyComposerService],
  exports: [RulesService, RuleEvaluatorService, PolicyComposerService],
})
export class RulesModule {}

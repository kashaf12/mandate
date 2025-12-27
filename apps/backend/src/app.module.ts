import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AgentsModule } from './agents/agents.module';
import { validateEnv } from './config/env.validation';
import { LoggerModule } from './common/logger/logger.module';
import { HealthModule } from './health/health.module';
import { PoliciesModule } from './policies/policies.module';
import { RulesModule } from './rules/rules.module';
import { MandatesModule } from './mandates/mandates.module';
import { AuditModule } from './audit/audit.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [
        join(process.cwd(), 'apps/backend/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    LoggerModule,
    DatabaseModule,
    AgentsModule,
    HealthModule,
    PoliciesModule,
    RulesModule,
    MandatesModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService, RequestIdMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

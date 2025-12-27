import { Injectable, Inject } from '@nestjs/common';
import {
  HealthIndicatorService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { DATABASE_CONNECTION, Database } from '../database/database.module';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    private healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.db.execute('SELECT 1');
      return this.healthIndicatorService.check(key).up();
    } catch (error) {
      const err = error as Error;
      return this.healthIndicatorService.check(key).down({
        message: err.message,
      });
    }
  }
}

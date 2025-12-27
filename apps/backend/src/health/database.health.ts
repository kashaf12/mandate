import { Injectable, Inject } from '@nestjs/common';
import {
  HealthIndicatorService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import {
  DATABASE_CONNECTION,
  DATABASE_POOL,
  Database,
} from '../database/database.module';
import { Pool } from 'pg';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(DATABASE_POOL)
    private pool: Pool,
    private healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Test database connectivity
      await this.db.execute('SELECT 1');

      // ✅ Get pool metrics
      const poolMetrics = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      };

      return this.healthIndicatorService.check(key).up({
        pool: poolMetrics,
        maxConnections: this.pool.options.max,
      });
    } catch (error) {
      const err = error as Error;

      // Still provide pool metrics even if query failed
      const poolMetrics = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      };

      return this.healthIndicatorService.check(key).down({
        message: err.message,
        pool: poolMetrics,
      });
    }
  }
}

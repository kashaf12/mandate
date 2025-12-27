import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DatabaseService } from './database.service';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';
export const DATABASE_POOL = 'DATABASE_POOL';

export type Database = NodePgDatabase<typeof schema>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (configService: ConfigService): Pool => {
        const connectionString = configService.get<string>('DATABASE_URL');
        const pool = new Pool({
          connectionString,
          max: 20, // Max connections
          idleTimeoutMillis: 30000, // Close idle connections
          connectionTimeoutMillis: 2000, // Timeout new connections
        });

        // Handle pool errors
        pool.on('error', (err) => {
          console.error('Unexpected database error:', err);
        });

        return pool;
      },
      inject: [ConfigService],
    },
    {
      provide: DATABASE_CONNECTION,
      useFactory: (pool: Pool): Database => {
        return drizzle(pool, { schema });
      },
      inject: [DATABASE_POOL],
    },
    {
      provide: DatabaseService,
      useFactory: (db: Database) => {
        return new DatabaseService(db);
      },
      inject: [DATABASE_CONNECTION],
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL, DatabaseService],
})
export class DatabaseModule {}

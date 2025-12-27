import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DatabaseService } from './database.service';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

export type Database = NodePgDatabase<typeof schema>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService): Database => {
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

        return drizzle(pool, { schema });
      },
      inject: [ConfigService],
    },
    {
      provide: DatabaseService,
      useFactory: (db: Database) => {
        return new DatabaseService(db);
      },
      inject: [DATABASE_CONNECTION],
    },
  ],
  exports: [DATABASE_CONNECTION, DatabaseService],
})
export class DatabaseModule {}

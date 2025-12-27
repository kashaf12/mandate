import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'path';
import { config } from 'dotenv';

/**
 * Load environment variables using the same logic as ConfigModule.
 * Tries both locations: app directory and monorepo root.
 */
function loadEnvConfig(): void {
  const cwd = process.cwd();

  const envPaths = [join(cwd, 'apps/backend/.env'), join(cwd, '.env')];

  for (const envPath of envPaths) {
    config({ path: envPath });
  }
}

loadEnvConfig();

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  const pool = new Pool({
    connectionString,
  });

  const db = drizzle(pool);

  const migrationsFolder = join(__dirname, '../../drizzle');

  console.log('Running migrations...');
  console.log(`Migrations folder: ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete!');

  await pool.end();
}

runMigrations().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

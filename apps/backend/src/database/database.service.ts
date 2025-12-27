import { Injectable } from '@nestjs/common';
import { Database } from './database.module';

@Injectable()
export class DatabaseService {
  constructor(private db: Database) {}

  // Direct access for simple queries
  get connection(): Database {
    return this.db;
  }

  // Transaction wrapper for complex operations
  async transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }
}

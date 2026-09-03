import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool;
  readonly db: NodePgDatabase;

  constructor(configService: ConfigService) {
    this.pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
    });

    this.db = drizzle({ client: this.pool });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

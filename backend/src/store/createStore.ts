import { config } from '../config';
import { logger } from '../logger';
import type { AppStore } from './appStore';
import { PostgresStore, type PgSslMode } from './postgresStore';
import { SqliteStore } from './sqliteStore';

export type { AppStore };

/**
 * Railway / Render Postgres: set `DATABASE_URL`.
 * Local dev: leave unset and use `DB_PATH` (SQLite).
 */
export async function createAppStore(): Promise<AppStore> {
  const url = config.DATABASE_URL?.trim();
  if (url) {
    logger.info('using PostgreSQL (DATABASE_URL set)');
    const store = new PostgresStore(url, config.DATABASE_SSL as PgSslMode);
    await store.init();
    return store;
  }

  logger.info({ path: config.DB_PATH }, 'using SQLite');
  const store = new SqliteStore(config.DB_PATH);
  await store.init();
  return store;
}

import Database, { Database as SqliteDatabase } from 'better-sqlite3';
import { config } from './config';
import { logger } from './logger';

/**
 * SQLite-backed persistence layer.
 *
 * Tables:
 *
 *   users (
 *     address TEXT PK,
 *     cumulative_amount TEXT NOT NULL,  -- nano units as string (bigint-safe)
 *     first_seen_at INTEGER NOT NULL,
 *     last_tapped_at INTEGER NOT NULL,
 *     is_banned INTEGER NOT NULL DEFAULT 0
 *   )
 *
 *   epochs (
 *     epoch INTEGER PK,
 *     merkle_root TEXT NOT NULL,
 *     signed_by TEXT NOT NULL,
 *     signature TEXT NOT NULL,
 *     created_at INTEGER NOT NULL,
 *     committed_tx TEXT,
 *     committed_at INTEGER
 *   )
 *
 *   tap_events (
 *     id INTEGER PK AUTOINCREMENT,
 *     address TEXT NOT NULL,
 *     delta TEXT NOT NULL,
 *     source TEXT NOT NULL,             -- 'web' | 'telegram-inline' | 'tma' | 'api'
 *     created_at INTEGER NOT NULL
 *   )
 *
 *   kv (
 *     k TEXT PK,
 *     v TEXT NOT NULL
 *   )
 */
export function createDb(): SqliteDatabase {
  const db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      cumulative_amount TEXT NOT NULL DEFAULT '0',
      first_seen_at INTEGER NOT NULL,
      last_tapped_at INTEGER NOT NULL,
      is_banned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS epochs (
      epoch INTEGER PRIMARY KEY,
      merkle_root TEXT NOT NULL,
      signed_by TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      committed_tx TEXT,
      committed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_epochs_created_at ON epochs(created_at);

    CREATE TABLE IF NOT EXISTS tap_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      delta TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tap_events_addr_time ON tap_events(address, created_at);

    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
  `);

  logger.info({ path: config.DB_PATH }, 'database ready');
  return db;
}

export type DB = SqliteDatabase;

export function getKv(db: DB, key: string): string | null {
  const row = db.prepare('SELECT v FROM kv WHERE k = ?').get(key) as { v: string } | undefined;
  return row ? row.v : null;
}

export function setKv(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(
    key,
    value,
  );
}

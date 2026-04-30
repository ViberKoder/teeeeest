import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { logger } from '../logger';
import type { AppStore } from './appStore';

export class SqliteStore implements AppStore {
  private readonly db: SqliteDatabase;

  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath);
  }

  async init(): Promise<void> {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
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

    logger.info({ backend: 'sqlite', path: this.dbPath }, 'database ready');
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async getKv(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT v FROM kv WHERE k = ?').get(key) as { v: string } | undefined;
    return row ? row.v : null;
  }

  async setKv(key: string, value: string): Promise<void> {
    this.db
      .prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')
      .run(key, value);
  }

  async listUsersForHydration(): Promise<Array<{ address: string; cumulative_amount: string }>> {
    return this.db
      .prepare('SELECT address, cumulative_amount FROM users WHERE is_banned = 0')
      .all() as Array<{ address: string; cumulative_amount: string }>;
  }

  async insertUserIfNotExists(address: string, firstSeenAt: number, lastTappedAt: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO users(address, cumulative_amount, first_seen_at, last_tapped_at)
         VALUES (?, '0', ?, ?)
         ON CONFLICT(address) DO NOTHING`,
      )
      .run(address, firstSeenAt, lastTappedAt);
  }

  async getUserRow(
    address: string,
  ): Promise<{ cumulative_amount: string; is_banned: number } | undefined> {
    return this.db
      .prepare('SELECT cumulative_amount, is_banned FROM users WHERE address = ?')
      .get(address) as { cumulative_amount: string; is_banned: number } | undefined;
  }

  async countTapEventsSince(address: string, since: number): Promise<number> {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as c FROM tap_events WHERE address = ? AND created_at >= ?',
      )
      .get(address, since) as { c: number };
    return row.c;
  }

  async applyRewardAndTap(params: {
    address: string;
    newCumulative: string;
    reward: string;
    source: string;
    now: number;
  }): Promise<void> {
    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE users SET cumulative_amount = ?, last_tapped_at = ? WHERE address = ?',
        )
        .run(params.newCumulative, params.now, params.address);
      this.db
        .prepare(
          'INSERT INTO tap_events(address, delta, source, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(params.address, params.reward, params.source, params.now);
    });
    txn();
  }

  async getCumulativeAmount(address: string): Promise<string | undefined> {
    const row = this.db
      .prepare('SELECT cumulative_amount FROM users WHERE address = ?')
      .get(address) as { cumulative_amount: string } | undefined;
    return row?.cumulative_amount;
  }

  async setBan(address: string, banned: boolean): Promise<void> {
    this.db.prepare('UPDATE users SET is_banned = ? WHERE address = ?').run(banned ? 1 : 0, address);
  }

  async listActiveSince(since: number): Promise<Array<{ address: string; cumulative_amount: string }>> {
    return this.db
      .prepare(
        `SELECT address, cumulative_amount FROM users
         WHERE is_banned = 0 AND last_tapped_at >= ?`,
      )
      .all(since) as Array<{ address: string; cumulative_amount: string }>;
  }

  async insertEpoch(params: {
    epoch: number;
    merkleRoot: string;
    signedBy: string;
    signature: string;
    createdAt: number;
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO epochs(epoch, merkle_root, signed_by, signature, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(params.epoch, params.merkleRoot, params.signedBy, params.signature, params.createdAt);
  }

  async updateEpochCommitted(epoch: number, committedTx: string, committedAt: number): Promise<void> {
    this.db
      .prepare('UPDATE epochs SET committed_tx = ?, committed_at = ? WHERE epoch = ?')
      .run(committedTx, committedAt, epoch);
  }
}

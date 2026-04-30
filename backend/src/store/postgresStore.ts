import { Pool } from 'pg';
import { logger } from '../logger';
import type { AppStore } from './appStore';

export type PgSslMode = 'require' | 'disable' | 'prefer';

function sslConfig(mode: PgSslMode): boolean | { rejectUnauthorized: boolean } | undefined {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  // prefer: enable TLS without strict CA (typical for Railway / managed Postgres)
  return { rejectUnauthorized: false };
}

/**
 * PostgreSQL store — use `DATABASE_URL` from Railway (or any Postgres).
 */
export class PostgresStore implements AppStore {
  private readonly pool: Pool;

  constructor(connectionString: string, sslMode: PgSslMode) {
    this.pool = new Pool({
      connectionString,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      ssl: sslConfig(sslMode),
    });
    this.pool.on('error', (err: Error) => {
      logger.error({ err }, 'postgres pool error');
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          address TEXT PRIMARY KEY,
          cumulative_amount TEXT NOT NULL DEFAULT '0',
          first_seen_at BIGINT NOT NULL,
          last_tapped_at BIGINT NOT NULL,
          is_banned SMALLINT NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS epochs (
          epoch INTEGER PRIMARY KEY,
          merkle_root TEXT NOT NULL,
          signed_by TEXT NOT NULL,
          signature TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          committed_tx TEXT,
          committed_at BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_epochs_created_at ON epochs(created_at);

        CREATE TABLE IF NOT EXISTS tap_events (
          id BIGSERIAL PRIMARY KEY,
          address TEXT NOT NULL,
          delta TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tap_events_addr_time ON tap_events(address, created_at);

        CREATE TABLE IF NOT EXISTS kv (
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
      `);
    } finally {
      client.release();
    }
    logger.info({ backend: 'postgres' }, 'database ready');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getKv(key: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ v: string }>('SELECT v FROM kv WHERE k = $1', [key]);
    return rows[0]?.v ?? null;
  }

  async setKv(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO kv(k, v) VALUES ($1, $2)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [key, value],
    );
  }

  async listUsersForHydration(): Promise<Array<{ address: string; cumulative_amount: string }>> {
    const { rows } = await this.pool.query<{ address: string; cumulative_amount: string }>(
      'SELECT address, cumulative_amount FROM users WHERE is_banned = 0',
    );
    return rows;
  }

  async insertUserIfNotExists(address: string, firstSeenAt: number, lastTappedAt: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO users(address, cumulative_amount, first_seen_at, last_tapped_at)
       VALUES ($1, '0', $2, $3)
       ON CONFLICT (address) DO NOTHING`,
      [address, firstSeenAt, lastTappedAt],
    );
  }

  async getUserRow(
    address: string,
  ): Promise<{ cumulative_amount: string; is_banned: number } | undefined> {
    const { rows } = await this.pool.query<{ cumulative_amount: string; is_banned: string }>(
      'SELECT cumulative_amount, is_banned FROM users WHERE address = $1',
      [address],
    );
    const r = rows[0];
    if (!r) return undefined;
    return { cumulative_amount: r.cumulative_amount, is_banned: Number(r.is_banned) };
  }

  async countTapEventsSince(address: string, since: number): Promise<number> {
    const { rows } = await this.pool.query<{ c: string }>(
      'SELECT COUNT(*)::text AS c FROM tap_events WHERE address = $1 AND created_at >= $2',
      [address, since],
    );
    return Number(rows[0]?.c ?? 0);
  }

  async applyRewardAndTap(params: {
    address: string;
    newCumulative: string;
    reward: string;
    source: string;
    now: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET cumulative_amount = $1, last_tapped_at = $2 WHERE address = $3',
        [params.newCumulative, params.now, params.address],
      );
      await client.query(
        'INSERT INTO tap_events(address, delta, source, created_at) VALUES ($1, $2, $3, $4)',
        [params.address, params.reward, params.source, params.now],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getCumulativeAmount(address: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ cumulative_amount: string }>(
      'SELECT cumulative_amount FROM users WHERE address = $1',
      [address],
    );
    return rows[0]?.cumulative_amount;
  }

  async setBan(address: string, banned: boolean): Promise<void> {
    await this.pool.query('UPDATE users SET is_banned = $1 WHERE address = $2', [
      banned ? 1 : 0,
      address,
    ]);
  }

  async listActiveSince(since: number): Promise<Array<{ address: string; cumulative_amount: string }>> {
    const { rows } = await this.pool.query<{ address: string; cumulative_amount: string }>(
      `SELECT address, cumulative_amount FROM users
       WHERE is_banned = 0 AND last_tapped_at >= $1`,
      [since],
    );
    return rows;
  }

  async insertEpoch(params: {
    epoch: number;
    merkleRoot: string;
    signedBy: string;
    signature: string;
    createdAt: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO epochs(epoch, merkle_root, signed_by, signature, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.epoch, params.merkleRoot, params.signedBy, params.signature, params.createdAt],
    );
  }

  async updateEpochCommitted(epoch: number, committedTx: string, committedAt: number): Promise<void> {
    await this.pool.query(
      'UPDATE epochs SET committed_tx = $1, committed_at = $2 WHERE epoch = $3',
      [committedTx, committedAt, epoch],
    );
  }
}

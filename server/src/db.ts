import Database from 'better-sqlite3';

export interface UserRow {
  tg_id: number;
  address: string | null;
  cumulative: string;
  banned: number;
  claim_signed_at: number | null;
}

/**
 * Everything the server knows. Money-like numbers are TEXT holding a base-10
 * bigint so no JavaScript number ever sees them.
 */
export class Db {
  readonly raw: Database.Database;

  constructor(path: string) {
    this.raw = new Database(path);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('synchronous = NORMAL');
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        tg_id           INTEGER PRIMARY KEY,
        address         TEXT UNIQUE,
        cumulative      TEXT NOT NULL DEFAULT '0',
        banned          INTEGER NOT NULL DEFAULT 0,
        claim_signed_at INTEGER,
        created_at      INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        idem_key    TEXT NOT NULL UNIQUE,
        tg_id       INTEGER NOT NULL,
        amount      TEXT NOT NULL,
        kind        TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_tg ON events(tg_id, created_at);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta(key, value) VALUES ('issued_total', '0');
    `);
  }

  close() {
    this.raw.close();
  }

  user(tgId: number): UserRow | undefined {
    return this.raw.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId) as UserRow | undefined;
  }

  ensureUser(tgId: number, now: number): UserRow {
    this.raw.prepare('INSERT OR IGNORE INTO users(tg_id, created_at) VALUES (?, ?)').run(tgId, now);
    return this.user(tgId)!;
  }

  issuedTotal(): bigint {
    const r = this.raw.prepare("SELECT value FROM meta WHERE key = 'issued_total'").get() as { value: string };
    return BigInt(r.value);
  }

  /**
   * Credit a reward exactly once per idempotency key. Atomic: the event row,
   * the user's balance and the global issued total move together or not at all.
   */
  credit(p: {
    tgId: number;
    amount: bigint;
    kind: string;
    idemKey: string;
    now: number;
    maxSupply: bigint;
  }): { applied: boolean; cumulative: bigint; reason?: 'banned' | 'supply' } {
    const tx = this.raw.transaction(() => {
      const user = this.ensureUser(p.tgId, p.now);
      const cumulative = BigInt(user.cumulative);
      if (user.banned) return { applied: false, cumulative, reason: 'banned' as const };

      const dup = this.raw.prepare('SELECT 1 FROM events WHERE idem_key = ?').get(p.idemKey);
      if (dup) return { applied: false, cumulative };

      const issued = this.issuedTotal();
      if (p.maxSupply > 0n && issued + p.amount > p.maxSupply) {
        return { applied: false, cumulative, reason: 'supply' as const };
      }
      const next = cumulative + p.amount;
      this.raw
        .prepare('INSERT INTO events(idem_key, tg_id, amount, kind, created_at) VALUES (?,?,?,?,?)')
        .run(p.idemKey, p.tgId, p.amount.toString(), p.kind, p.now);
      this.raw.prepare('UPDATE users SET cumulative = ? WHERE tg_id = ?').run(next.toString(), p.tgId);
      this.raw.prepare("UPDATE meta SET value = ? WHERE key = 'issued_total'").run((issued + p.amount).toString());
      return { applied: true, cumulative: next };
    });
    return tx();
  }

  /**
   * An address may be changed only until the first claim has been signed.
   * After that the wallet on-chain remembers `claimed`, and pointing the same
   * balance at a fresh wallet would let it be collected twice.
   */
  link(tgId: number, address: string, now: number): { ok: true } | { ok: false; reason: 'locked' | 'taken' } {
    const tx = this.raw.transaction(() => {
      const user = this.ensureUser(tgId, now);
      if (user.address === address) return { ok: true as const };
      if (user.claim_signed_at !== null) return { ok: false as const, reason: 'locked' as const };
      const owner = this.raw.prepare('SELECT tg_id FROM users WHERE address = ?').get(address) as
        | { tg_id: number }
        | undefined;
      if (owner && owner.tg_id !== tgId) return { ok: false as const, reason: 'taken' as const };
      this.raw.prepare('UPDATE users SET address = ? WHERE tg_id = ?').run(address, tgId);
      return { ok: true as const };
    });
    return tx();
  }

  markClaimSigned(tgId: number, now: number) {
    this.raw.prepare('UPDATE users SET claim_signed_at = COALESCE(claim_signed_at, ?) WHERE tg_id = ?').run(now, tgId);
  }

  setBan(tgId: number, banned: boolean, now: number) {
    this.ensureUser(tgId, now);
    this.raw.prepare('UPDATE users SET banned = ? WHERE tg_id = ?').run(banned ? 1 : 0, tgId);
  }
}

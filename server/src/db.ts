import Database from 'better-sqlite3';

export interface UserRow {
  tg_id: number;
  address: string | null;
  cumulative: string;
  banned: number;
  frozen_at: number | null;
}

export type EpochStatus = 'pending' | 'sent' | 'confirmed' | 'conflict';

export interface EpochRow {
  epoch: number;
  tree_root: string;
  total: string;
  commitment: string;
  status: EpochStatus;
  leaves: string;
  created_at: number;
  sent_at: number | null;
}

/**
 * Everything the server knows. Money-like numbers are TEXT holding a base-10 bigint
 * so no JavaScript number ever sees them.
 */
export class Db {
  readonly raw: Database.Database;

  constructor(path: string) {
    this.raw = new Database(path);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('synchronous = NORMAL');
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        tg_id      INTEGER PRIMARY KEY,
        address    TEXT UNIQUE,
        cumulative TEXT NOT NULL DEFAULT '0',
        banned     INTEGER NOT NULL DEFAULT 0,
        frozen_at  INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        idem_key   TEXT NOT NULL UNIQUE,
        tg_id      INTEGER NOT NULL,
        amount     TEXT NOT NULL,
        kind       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_tg ON events(tg_id, created_at);
      CREATE TABLE IF NOT EXISTS epochs (
        epoch      INTEGER PRIMARY KEY,
        tree_root  TEXT NOT NULL,
        total      TEXT NOT NULL,
        commitment TEXT NOT NULL,
        status     TEXT NOT NULL,
        leaves     TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at    INTEGER
      );
      CREATE TABLE IF NOT EXISTS relays (
        tg_id   INTEGER PRIMARY KEY,
        count   INTEGER NOT NULL DEFAULT 0,
        last_at INTEGER NOT NULL DEFAULT 0
      );
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
   * Credit a reward exactly once per idempotency key. Atomic: the event row, the user's
   * balance and the global promised total move together or not at all.
   */
  credit(p: { tgId: number; amount: bigint; kind: string; idemKey: string; now: number; maxSupply: bigint }) {
    return this.raw.transaction((): { applied: boolean; cumulative: bigint; reason?: 'banned' | 'supply' } => {
      const user = this.ensureUser(p.tgId, p.now);
      const cumulative = BigInt(user.cumulative);
      if (user.banned) return { applied: false, cumulative, reason: 'banned' };
      if (this.raw.prepare('SELECT 1 FROM events WHERE idem_key = ?').get(p.idemKey)) return { applied: false, cumulative };
      const issued = this.issuedTotal();
      if (p.maxSupply > 0n && issued + p.amount > p.maxSupply) return { applied: false, cumulative, reason: 'supply' };
      const next = cumulative + p.amount;
      this.raw.prepare('INSERT INTO events(idem_key, tg_id, amount, kind, created_at) VALUES (?,?,?,?,?)').run(p.idemKey, p.tgId, p.amount.toString(), p.kind, p.now);
      this.raw.prepare('UPDATE users SET cumulative = ? WHERE tg_id = ?').run(next.toString(), p.tgId);
      this.raw.prepare("UPDATE meta SET value = ? WHERE key = 'issued_total'").run((issued + p.amount).toString());
      return { applied: true, cumulative: next };
    })();
  }

  /**
   * The address can change until the user first appears in a tree sent to the chain. After that the
   * wallet there may already hold a claim, and pointing the same balance at another wallet would pay it twice.
   */
  link(tgId: number, address: string, now: number): { ok: true } | { ok: false; reason: 'locked' | 'taken' } {
    return this.raw.transaction(() => {
      const user = this.ensureUser(tgId, now);
      if (user.address === address) return { ok: true as const };
      if (user.frozen_at !== null) return { ok: false as const, reason: 'locked' as const };
      const owner = this.raw.prepare('SELECT tg_id FROM users WHERE address = ?').get(address) as { tg_id: number } | undefined;
      if (owner && owner.tg_id !== tgId) return { ok: false as const, reason: 'taken' as const };
      this.raw.prepare('UPDATE users SET address = ? WHERE tg_id = ?').run(address, tgId);
      return { ok: true as const };
    })();
  }

  /** Atomically takes one sponsored-request slot for a player; false when their allowance is used up. */
  takeRelaySlot(tgId: number, max: number, now: number): boolean {
    return this.raw.transaction(() => {
      this.raw.prepare('INSERT OR IGNORE INTO relays(tg_id) VALUES (?)').run(tgId);
      const r = this.raw.prepare('SELECT count FROM relays WHERE tg_id = ?').get(tgId) as { count: number };
      if (r.count >= max) return false;
      this.raw.prepare('UPDATE relays SET count = count + 1, last_at = ? WHERE tg_id = ?').run(now, tgId);
      return true;
    })();
  }

  relaysUsed(tgId: number): number {
    const r = this.raw.prepare('SELECT count FROM relays WHERE tg_id = ?').get(tgId) as { count: number } | undefined;
    return r?.count ?? 0;
  }

  setBan(tgId: number, banned: boolean, now: number) {
    this.ensureUser(tgId, now);
    this.raw.prepare('UPDATE users SET banned = ? WHERE tg_id = ?').run(banned ? 1 : 0, tgId);
  }

  /**
   * Everyone who has a wallet linked and something owed. Banned players stay in: a root may never shrink
   * (the contract refuses a lower total), and what is published is theirs. A ban only stops NEW rewards.
   */
  leaves(): { tg_id: number; address: string; cumulative: string }[] {
    return this.raw
      .prepare("SELECT tg_id, address, cumulative FROM users WHERE address IS NOT NULL AND cumulative != '0'")
      .all() as { tg_id: number; address: string; cumulative: string }[];
  }

  /**
   * Cancels what has NOT been published yet for a player (fraud): their balance goes back to the amount in
   * the newest tree that contains them. Published amounts are untouchable by design.
   */
  slash(tgId: number, publishedCumulative: bigint, now: number): bigint {
    return this.raw.transaction(() => {
      const user = this.ensureUser(tgId, now);
      const current = BigInt(user.cumulative);
      const keep = publishedCumulative < current ? publishedCumulative : current;
      const removed = current - keep;
      this.raw.prepare('UPDATE users SET cumulative = ?, banned = 1 WHERE tg_id = ?').run(keep.toString(), tgId);
      const issued = this.issuedTotal();
      this.raw.prepare("UPDATE meta SET value = ? WHERE key = 'issued_total'").run((issued - removed).toString());
      return keep;
    })();
  }

  // ---- epochs ----
  epoch(n: number): EpochRow | undefined {
    return this.raw.prepare('SELECT * FROM epochs WHERE epoch = ?').get(n) as EpochRow | undefined;
  }
  lastEpochRow(): EpochRow | undefined {
    return this.raw.prepare('SELECT * FROM epochs ORDER BY epoch DESC LIMIT 1').get() as EpochRow | undefined;
  }
  lastConfirmed(): EpochRow | undefined {
    return this.raw.prepare("SELECT * FROM epochs WHERE status = 'confirmed' ORDER BY epoch DESC LIMIT 1").get() as EpochRow | undefined;
  }
  confirmedDesc(limit = 50): EpochRow[] {
    return this.raw.prepare("SELECT * FROM epochs WHERE status = 'confirmed' ORDER BY epoch DESC LIMIT ?").all(limit) as EpochRow[];
  }

  /** Persist a new epoch and freeze the address of everyone in it, in one transaction. */
  createEpoch(row: Omit<EpochRow, 'status' | 'sent_at'>, tgIds: number[]) {
    this.raw.transaction(() => {
      this.raw
        .prepare("INSERT INTO epochs(epoch, tree_root, total, commitment, status, leaves, created_at) VALUES (?,?,?,?, 'pending', ?, ?)")
        .run(row.epoch, row.tree_root, row.total, row.commitment, row.leaves, row.created_at);
      const freeze = this.raw.prepare('UPDATE users SET frozen_at = COALESCE(frozen_at, ?) WHERE tg_id = ?');
      for (const id of tgIds) freeze.run(row.created_at, id);
    })();
  }

  setEpochStatus(n: number, status: EpochStatus, now?: number) {
    this.raw.prepare('UPDATE epochs SET status = ?, sent_at = COALESCE(?, sent_at) WHERE epoch = ?').run(status, status === 'sent' ? now ?? null : null, n);
  }
}

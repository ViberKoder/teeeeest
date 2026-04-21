import { Address } from '@ton/core';
import { DB } from './db';
import { config } from './config';
import { logger } from './logger';

/**
 * Game server logic.
 *
 * Every tap (or click / inline button press / in-app action) that should
 * result in a reward flows through `recordAction`, which:
 *
 *   1. Validates the user exists (or lazily upserts them).
 *   2. Applies anti-cheat rate-limiting per address.
 *   3. Increments the user's cumulative_amount in `users`.
 *   4. Appends a row to `tap_events` (used for anti-cheat forensics and
 *      adaptive settlement strategies).
 *
 * Rate-limits are enforced in two windows:
 *   - a 1-second window (MAX_TAPS_PER_SECOND) to reject automation bursts,
 *   - a 24-hour window (MAX_TAPS_PER_DAY) to bound the max daily reward.
 */
export interface GameAction {
  address: Address;
  rewardNano?: bigint; // override TAP_VALUE_NANO per-action if desired
  source: 'web' | 'telegram-inline' | 'tma' | 'api';
  at?: number; // unix seconds — defaults to now
  meta?: Record<string, unknown>;
}

export type GameActionResult =
  | { ok: true; cumulativeAmount: bigint; deltaApplied: bigint }
  | { ok: false; reason: 'rate-limited-per-second' | 'daily-cap-reached' | 'user-banned' };

export class GameServer {
  constructor(readonly db: DB) {}

  private countEventsSince(address: string, since: number): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as c FROM tap_events WHERE address = ? AND created_at >= ?',
      )
      .get(address, since) as { c: number };
    return row.c;
  }

  recordAction(action: GameAction): GameActionResult {
    const address = action.address.toString({ urlSafe: true, bounceable: false });
    const reward = action.rewardNano ?? config.TAP_VALUE_NANO;
    const now = action.at ?? Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        `INSERT INTO users(address, cumulative_amount, first_seen_at, last_tapped_at)
         VALUES (?, '0', ?, ?)
         ON CONFLICT(address) DO NOTHING`,
      )
      .run(address, now, now);

    const user = this.db
      .prepare(
        'SELECT cumulative_amount, is_banned FROM users WHERE address = ?',
      )
      .get(address) as { cumulative_amount: string; is_banned: number };

    if (user.is_banned) {
      return { ok: false, reason: 'user-banned' };
    }

    const perSecond = this.countEventsSince(address, now - 1);
    if (perSecond >= config.MAX_TAPS_PER_SECOND) {
      return { ok: false, reason: 'rate-limited-per-second' };
    }

    const perDay = this.countEventsSince(address, now - 86_400);
    if (perDay >= config.MAX_TAPS_PER_DAY) {
      return { ok: false, reason: 'daily-cap-reached' };
    }

    const newCumulative = BigInt(user.cumulative_amount) + reward;

    const txn = this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE users SET cumulative_amount = ?, last_tapped_at = ? WHERE address = ?',
        )
        .run(newCumulative.toString(), now, address);
      this.db
        .prepare(
          'INSERT INTO tap_events(address, delta, source, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(address, reward.toString(), action.source, now);
    });
    txn();

    logger.debug(
      { address, reward: reward.toString(), cumulative: newCumulative.toString(), source: action.source },
      'action recorded',
    );

    return { ok: true, cumulativeAmount: newCumulative, deltaApplied: reward };
  }

  /**
   * Fetch a user's current off-chain cumulative amount.
   */
  getCumulative(address: Address): bigint {
    const row = this.db
      .prepare('SELECT cumulative_amount FROM users WHERE address = ?')
      .get(address.toString({ urlSafe: true, bounceable: false })) as
      | { cumulative_amount: string }
      | undefined;
    return row ? BigInt(row.cumulative_amount) : 0n;
  }

  /**
   * Ban / unban a user. Banned users are excluded from subsequent Merkle
   * trees, so they won't be able to claim any further cumulative amount.
   */
  setBan(address: Address, banned: boolean): void {
    this.db
      .prepare('UPDATE users SET is_banned = ? WHERE address = ?')
      .run(banned ? 1 : 0, address.toString({ urlSafe: true, bounceable: false }));
  }

  /**
   * List users that have had activity since the given unix timestamp. Used
   * by the tree builder to construct deltas for a new epoch.
   */
  listActiveSince(since: number): Array<{ address: Address; cumulative: bigint }> {
    const rows = this.db
      .prepare(
        `SELECT address, cumulative_amount FROM users
         WHERE is_banned = 0 AND last_tapped_at >= ?`,
      )
      .all(since) as Array<{ address: string; cumulative_amount: string }>;

    const out: Array<{ address: Address; cumulative: bigint }> = [];
    for (const row of rows) {
      try {
        out.push({
          address: Address.parse(row.address),
          cumulative: BigInt(row.cumulative_amount),
        });
      } catch {
        // skip malformed
      }
    }
    return out;
  }
}

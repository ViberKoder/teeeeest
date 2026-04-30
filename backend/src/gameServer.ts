import { Address } from '@ton/core';
import type { AppStore } from './store/appStore';
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
  constructor(readonly store: AppStore) {}

  private async countEventsSince(address: string, since: number): Promise<number> {
    return this.store.countTapEventsSince(address, since);
  }

  async recordAction(action: GameAction): Promise<GameActionResult> {
    const address = action.address.toString({ urlSafe: true, bounceable: false });
    const reward = action.rewardNano ?? config.TAP_VALUE_NANO;
    const now = action.at ?? Math.floor(Date.now() / 1000);

    await this.store.insertUserIfNotExists(address, now, now);

    const user = await this.store.getUserRow(address);
    if (!user) {
      return { ok: false, reason: 'rate-limited-per-second' };
    }

    if (user.is_banned) {
      return { ok: false, reason: 'user-banned' };
    }

    const perSecond = await this.countEventsSince(address, now - 1);
    if (perSecond >= config.MAX_TAPS_PER_SECOND) {
      return { ok: false, reason: 'rate-limited-per-second' };
    }

    const perDay = await this.countEventsSince(address, now - 86_400);
    if (perDay >= config.MAX_TAPS_PER_DAY) {
      return { ok: false, reason: 'daily-cap-reached' };
    }

    const newCumulative = BigInt(user.cumulative_amount) + reward;

    await this.store.applyRewardAndTap({
      address,
      newCumulative: newCumulative.toString(),
      reward: reward.toString(),
      source: action.source,
      now,
    });

    logger.debug(
      { address, reward: reward.toString(), cumulative: newCumulative.toString(), source: action.source },
      'action recorded',
    );

    return { ok: true, cumulativeAmount: newCumulative, deltaApplied: reward };
  }

  /**
   * Fetch a user's current off-chain cumulative amount.
   */
  async getCumulative(address: Address): Promise<bigint> {
    const raw = await this.store.getCumulativeAmount(
      address.toString({ urlSafe: true, bounceable: false }),
    );
    return raw ? BigInt(raw) : 0n;
  }

  /**
   * Ban / unban a user. Banned users are excluded from subsequent Merkle
   * trees, so they won't be able to claim any further cumulative amount.
   */
  async setBan(address: Address, banned: boolean): Promise<void> {
    await this.store.setBan(
      address.toString({ urlSafe: true, bounceable: false }),
      banned,
    );
  }

  /**
   * List users that have had activity since the given unix timestamp. Used
   * by the tree builder to construct deltas for a new epoch.
   */
  async listActiveSince(since: number): Promise<Array<{ address: Address; cumulative: bigint }>> {
    const rows = await this.store.listActiveSince(since);

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

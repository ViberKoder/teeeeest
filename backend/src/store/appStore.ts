/**
 * Async persistence API shared by SQLite (local) and PostgreSQL (Railway, etc.).
 */
export interface AppStore {
  /** Create tables / indexes if missing */
  init(): Promise<void>;
  close(): Promise<void>;

  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string): Promise<void>;

  listUsersForHydration(): Promise<Array<{ address: string; cumulative_amount: string }>>;

  insertUserIfNotExists(address: string, firstSeenAt: number, lastTappedAt: number): Promise<void>;

  getUserRow(
    address: string,
  ): Promise<{ cumulative_amount: string; is_banned: number } | undefined>;

  countTapEventsSince(address: string, since: number): Promise<number>;

  applyRewardAndTap(params: {
    address: string;
    newCumulative: string;
    reward: string;
    source: string;
    now: number;
  }): Promise<void>;

  getCumulativeAmount(address: string): Promise<string | undefined>;

  setBan(address: string, banned: boolean): Promise<void>;

  listActiveSince(since: number): Promise<Array<{ address: string; cumulative_amount: string }>>;

  insertEpoch(params: {
    epoch: number;
    merkleRoot: string;
    signedBy: string;
    signature: string;
    createdAt: number;
  }): Promise<void>;

  updateEpochCommitted(epoch: number, committedTx: string, committedAt: number): Promise<void>;
}

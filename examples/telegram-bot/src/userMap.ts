/**
 * Trivial in-memory mapping from Telegram user id → TON wallet address.
 *
 * In production replace with a persistent store (SQLite, Postgres) and
 * add a proper TON Connect linking flow. For this example we keep it
 * minimal: users type `/link EQ…` once, and subsequent inline-button
 * clicks award rewards to that address.
 */
export class UserAddressMap {
  private map = new Map<number, string>();

  link(telegramId: number, address: string) {
    this.map.set(telegramId, address);
  }

  get(telegramId: number): string | undefined {
    return this.map.get(telegramId);
  }

  unlink(telegramId: number) {
    this.map.delete(telegramId);
  }
}

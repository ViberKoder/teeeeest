// Earn: one-time tasks. A task is "claimed" exactly when its ledger row exists (ref = task:<id>:<player>), so it can never pay twice.
// Every condition is checked here, from data the server owns; the app only displays the result.
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { EGG } from './config.js';

/** mult: reward = reward_task x mult. `of` reads what the player has done so far. */
export const TASKS = [
  { id: 'wallet', icon: 'wallet', mult: 1, title: 'Create your wallet', sub: 'Link the wallet to your Telegram account', of: (x) => [x.walletLinked ? 1 : 0, 1] },
  { id: 'first', icon: 'egg', mult: 1, title: 'Hatch your first egg', sub: 'Tap Hatch under any post or egg in a chat', of: (x) => [Math.min(x.hatches, 1), 1] },
  { id: 'squad', icon: 'squad', mult: 1, title: 'Join a squad', sub: 'Hatch together and win weekly prizes', of: (x) => [x.inSquad ? 1 : 0, 1] },
  { id: 'friend1', icon: 'friends', mult: 2, title: 'Invite a friend', sub: 'A friend who hatches an egg counts', of: (x) => [Math.min(x.friends, 1), 1] },
  { id: 'hatch10', icon: 'egg', mult: 3, title: 'Hatch 10 eggs', sub: 'Keep the nest warm', of: (x) => [Math.min(x.hatches, 10), 10] },
  { id: 'streak7', icon: 'fire', mult: 5, title: '7-day streak', sub: 'Check in seven days in a row', of: (x) => [Math.min(x.streak, 7), 7] },
  { id: 'friend5', icon: 'friends', mult: 5, title: 'Invite 5 friends', sub: 'Grow your flock', of: (x) => [Math.min(x.friends, 5), 5] },
  { id: 'hatch100', icon: 'egg', mult: 10, title: 'Hatch 100 eggs', sub: 'A true farmer', of: (x) => [Math.min(x.hatches, 100), 100] },
  { id: 'friend25', icon: 'friends', mult: 20, title: 'Invite 25 friends', sub: 'A whole poultry farm', of: (x) => [Math.min(x.friends, 25), 25] },
];

export const rewardOf = (task, base) => base * BigInt(task.mult);
export const taskRef = (id, tgId) => `task:${id}:${tgId}`;

/** What a player has done, in one go. */
export async function progressOf(tgId, { streak, friends }) {
  const u = await db.get(sql`SELECT verified AS v, squad AS s FROM users WHERE tg_id = ${tgId}`);
  const h = await db.get(sql`SELECT COUNT(*) AS n FROM ledger WHERE tg_id = ${tgId} AND kind IN ('post', 'inline', 'widget')`);
  return { walletLinked: Boolean(u?.v), inSquad: Number(u?.s ?? 0) > 0, hatches: Number(h?.n ?? 0), streak, friends };
}

export async function claimedTasks(tgId) {
  const rows = await db.all(sql`SELECT ref FROM ledger WHERE tg_id = ${tgId} AND kind = 'task'`);
  return new Set(rows.map((r) => String(r.ref).split(':')[1]));
}

void EGG;

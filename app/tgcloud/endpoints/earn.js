import { db, EndpointError } from 'sdk';
import { sql } from 'sdk/db';
import { balanceOf, credit, ensureUser } from '../lib/ledger.js';
import { getSettings, toUnits } from '../lib/settings.js';
import { BROOD, DAY, SQUAD, STREAK, WARMUP, boostsOf, streakOf } from '../lib/boosts.js';
import { TASKS, claimedTasks, progressOf, rewardOf, taskRef } from '../lib/tasks.js';

// Daily check-in: day k of the week pays reward_daily x (3 + k) / 4 (1, 1.25 ... 2.5 times the base).
const dailyReward = (base, k) => (base * BigInt(3 + k)) / 4n;
const cycleDay = (streakAfter) => ((streakAfter - 1) % 7) + 1;

/**
 * Earn, from inside the app: the daily check-in, the one-time tasks and the boosts. The platform verifies Telegram's init data, so
 * `ctx.initData.user.id` can not be forged. Every payout is one ledger row with a unique ref (see lib/ledger.js).
 */
export default async function (input, ctx) {
  const me = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  const fail = (c) => { throw new EndpointError(c, { code: c }); };
  await ensureUser(me, now, ctx.initData.user.language_code);
  const S = await getSettings();
  const baseDaily = toUnits(S.raw.reward_daily);
  const baseTask = toUnits(S.raw.reward_task);
  const paid = (r) => { if (r === 'cap') fail('cap'); if (r === 'banned') fail('banned'); if (r === 'again') fail('already'); };

  switch (input?.action ?? 'state') {
    case 'daily': {
      const st = await streakOf(me, now);
      if (st.claimedToday) fail('already');
      const k = cycleDay(st.streak + 1);
      paid(await credit({ tgId: me, amount: dailyReward(baseDaily, k), kind: 'daily', ref: `daily:${st.today}:${me}`, now }));
      break;
    }
    case 'task': {
      const task = TASKS.find((t) => t.id === String(input.id));
      if (!task) fail('no-task');
      const b = await boostsOf(me, now);
      const p = await progressOf(me, { streak: b.st.streak, friends: b.friends });
      const [have, need] = task.of(p);
      if (have < need) fail('not-yet');
      paid(await credit({ tgId: me, amount: rewardOf(task, baseTask), kind: 'task', ref: taskRef(task.id, me), now }));
      break;
    }
    case 'boost': {
      if (String(input.id) !== 'warmup') fail('no-boost');
      const w = (await boostsOf(me, now)).wu;
      if (w.usedToday) fail('cooldown');
      // one row per player per day: the unique ref makes a double tap harmless; amount 0, so it never touches a balance
      await db.run(sql`INSERT OR IGNORE INTO ledger (tg_id, amount, kind, ref, ts, squad) VALUES (${me}, 0, 'boost', ${`boost:warmup:${w.today}:${me}`}, ${now}, 0)`);
      break;
    }
    case 'state': break;
    default: fail('unknown-action');
  }

  const b = await boostsOf(me, now);
  const p = await progressOf(me, { streak: b.st.streak, friends: b.friends });
  const done = await claimedTasks(me);
  const doneToday = b.st.claimedToday;
  const completed = doneToday ? cycleDay(b.st.streak) : b.st.streak % 7;
  const days = Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    reward: String(dailyReward(baseDaily, i + 1)),
    state: i + 1 <= completed ? 'done' : i + 1 === completed + 1 && !doneToday ? 'today' : 'next',
  }));
  const today = Math.floor(now / DAY);

  return {
    now,
    balance: await balanceOf(me),
    bonusPct: b.pct,
    daily: { streak: b.st.streak, claimedToday: doneToday, nextAt: (today + 1) * DAY, days },
    boosts: [
      { id: 'warmup', pct: WARMUP.pct, active: b.wu.activeUntil, nextAt: b.wu.usedToday ? (today + 1) * DAY : 0, ready: !b.wu.usedToday, secs: WARMUP.secs },
      { id: 'streak', pct: b.parts.streak, max: STREAK.max, per: STREAK.perDay, days: b.st.streak },
      { id: 'squad', pct: b.parts.squad, max: SQUAD.pct, joined: b.inSquad },
      { id: 'brood', pct: b.parts.brood, max: BROOD.max, per: BROOD.each, friends: b.friends },
    ],
    tasks: TASKS.map((t) => {
      const [have, need] = t.of(p);
      return { id: t.id, icon: t.icon, title: t.title, sub: t.sub, reward: String(rewardOf(t, baseTask)), have, need, state: done.has(t.id) ? 'done' : have >= need ? 'ready' : 'open' };
    }),
  };
}

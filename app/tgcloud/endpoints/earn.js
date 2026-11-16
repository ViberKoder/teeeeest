import { api, db, EndpointError } from 'sdk';
import { eq, sql } from 'sdk/db';
import { users } from '../schema.js';
import { activeFriends, dayIndex, liveStreak, NEST, nestLevel, RACK, rackLevel } from '../lib/boosts.js';
import { credit, ensureUser, fmtEgg, balanceOf } from '../lib/ledger.js';
import { quietly } from '../lib/telegram.js';

const E = 1000000000n;
const CHANNEL = '@hatchtg';
const dailyReward = (streak) => BigInt(Math.min(10, 2 + streak)) * E / 2n; // 1.5, 2, 2.5 … up to 5 EGG as the streak grows

/** One-time tasks. `ready` decides whether the reward can be claimed; the claim itself is paid once (unique ref per task and player). */
const TASKS = [
  { id: 'wallet', title: 'Link your wallet', desc: 'Your eggs become yours on-chain', reward: 2n * E, icon: '👛', ready: (c) => Boolean(c.u.verified) },
  { id: 'channel', title: 'Join the Hatch channel', desc: `${CHANNEL}: news, battles, new eggs`, reward: 3n * E, icon: '📣', link: `https://t.me/${CHANNEL.slice(1)}`, check: true },
  { id: 'squad', title: 'Join a squad', desc: 'Hatch together with a team', reward: 2n * E, icon: '🛡', ready: (c) => c.u.squad > 0 },
  { id: 'send1', title: 'Send your first egg', desc: 'Type @hatchapp in any chat; a friend hatches it', reward: 2n * E, icon: '🥚', ready: (c) => c.hatchedEggs > 0 },
  { id: 'friend1', title: 'Invite a friend', desc: 'A friend who plays counts', reward: 2n * E, icon: '🤝', progress: (c) => [Math.min(c.friends, 1), 1], ready: (c) => c.friends >= 1 },
  { id: 'friend3', title: 'Invite 3 friends', desc: 'Your Egg rack grows too', reward: 5n * E, icon: '🐣', progress: (c) => [Math.min(c.friends, 3), 3], ready: (c) => c.friends >= 3 },
  { id: 'friend10', title: 'Invite 10 friends', desc: 'A real flock', reward: 15n * E, icon: '🐔', progress: (c) => [Math.min(c.friends, 10), 10], ready: (c) => c.friends >= 10 },
];

export default async function (input, ctx) {
  const me = ctx.initData.user.id;
  const now = Math.floor(Date.now() / 1000);
  const day = dayIndex(now);
  const fail = (c) => { throw new EndpointError(c, { code: c }); };
  await ensureUser(me, now, ctx.initData.user.language_code, ctx.initData.user.first_name);

  const load = async () => {
    const u = await db.select().from(users).where(eq(users.tgId, me)).get();
    const friends = await activeFriends(me);
    const hatchedEggs = Number((await db.get(sql`SELECT COUNT(*) AS n FROM eggs WHERE sender = ${me} AND hatched > 0`))?.n ?? 0);
    const done = new Set((await db.all(sql`SELECT ref FROM ledger WHERE tg_id = ${me} AND ref LIKE ${`task:%:${me}`}`)).map((r) => String(r.ref).split(':')[1]));
    return { u, friends, hatchedEggs, done };
  };

  if (input?.action === 'checkin') {
    const c = await load();
    if (c.u.banned) fail('banned');
    if (c.u.streakDay === day) fail('already');
    const streak = c.u.streakDay === day - 1 ? c.u.streak + 1 : 1;
    const r = await credit({ tgId: me, amount: dailyReward(streak), kind: 'task', ref: `task:daily:${me}:${day}`, now });
    if (r === 'again') fail('already');
    if (r === 'cap') fail('cap');
    await db.update(users).set({ streak, streakDay: day }).where(eq(users.tgId, me)).run();
  } else if (input?.action === 'claim') {
    const t = TASKS.find((x) => x.id === input.id);
    if (!t) fail('no-task');
    const c = await load();
    if (c.u.banned) fail('banned');
    if (c.done.has(t.id)) fail('already');
    let ok = false;
    if (t.check) {
      const m = await quietly(api.getChatMember({ chat_id: CHANNEL, user_id: me }));
      ok = Boolean(m && ['member', 'administrator', 'creator'].includes(m.status));
      if (!ok) fail('not-joined');
    } else ok = t.ready(c);
    if (!ok) fail('not-ready');
    const r = await credit({ tgId: me, amount: t.reward, kind: 'task', ref: `task:${t.id}:${me}`, now });
    if (r === 'cap') fail('cap');
  }

  const c = await load();
  const streak = liveStreak(c.u, now);
  const todayDone = c.u.streakDay === day;
  return {
    streak, checkedInToday: todayDone, nextDaily: fmtEgg(dailyReward(todayDone ? streak + 1 : streak + 1)),
    tasks: TASKS.map((t) => {
      const done = c.done.has(t.id);
      const prog = t.progress ? t.progress(c) : null;
      const ready = t.check ? true : t.ready(c);
      return { id: t.id, title: t.title, desc: t.desc, icon: t.icon, reward: fmtEgg(t.reward), link: t.link ?? null, status: done ? 'done' : ready ? 'ready' : 'todo', progress: prog };
    }),
    boosts: [
      { id: 'rack', icon: '🪺', title: 'Egg rack', desc: 'More eggs to send every day', level: rackLevel(c.friends), max: RACK.max, effect: `+${rackLevel(c.friends) * RACK.bonus} eggs a day`, nextEffect: `+${(rackLevel(c.friends) + 1) * RACK.bonus}`, have: c.friends, need: (rackLevel(c.friends) + 1) * RACK.step, unit: 'active friends' },
      { id: 'nest', icon: '🌟', title: 'Golden nest', desc: 'A higher daily earning limit', level: nestLevel(streak), max: NEST.max, effect: `+${nestLevel(streak) * NEST.pct}% a day`, nextEffect: `+${(nestLevel(streak) + 1) * NEST.pct}%`, have: streak, need: (nestLevel(streak) + 1) * NEST.days, unit: 'day streak' },
    ],
    balance: await balanceOf(me),
  };
}

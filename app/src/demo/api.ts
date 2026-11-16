/** Design fixtures for the bot's endpoints (VITE_DEMO=1 builds only). Claims change the fixture so the flows can be clicked through. */
const E = (n: number) => String(Math.round(n * 1e9));
const now = () => Math.floor(Date.now() / 1000);

const earn = {
  now: now(),
  balance: E(12600),
  bonusPct: 37,
  daily: {
    streak: 4, claimedToday: false, nextAt: now() + 5 * 3600,
    days: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: d, reward: E((3 + d) / 4), state: (d <= 4 ? 'done' : d === 5 ? 'today' : 'next') as 'done' | 'today' | 'next' })),
  },
  boosts: [
    { id: 'warmup', pct: 100, ready: true, nextAt: 0, active: 0, secs: 3600 },
    { id: 'streak', pct: 12, max: 30, per: 3, days: 4 },
    { id: 'squad', pct: 10, max: 10, joined: true },
    { id: 'brood', pct: 15, max: 25, per: 5, friends: 3 },
  ],
  tasks: [
    { id: 'wallet', icon: 'wallet', title: 'Create your wallet', sub: 'Link the wallet to your Telegram account', reward: E(1), have: 1, need: 1, state: 'done' },
    { id: 'squad', icon: 'squad', title: 'Join a squad', sub: 'Hatch together and win weekly prizes', reward: E(1), have: 1, need: 1, state: 'ready' },
    { id: 'friend1', icon: 'friends', title: 'Invite a friend', sub: 'A friend who hatches an egg counts', reward: E(2), have: 1, need: 1, state: 'ready' },
    { id: 'hatch10', icon: 'egg', title: 'Hatch 10 eggs', sub: 'Keep the nest warm', reward: E(3), have: 7, need: 10, state: 'open' },
    { id: 'streak7', icon: 'fire', title: '7-day streak', sub: 'Check in seven days in a row', reward: E(5), have: 4, need: 7, state: 'open' },
    { id: 'friend5', icon: 'friends', title: 'Invite 5 friends', sub: 'Grow your flock', reward: E(5), have: 3, need: 5, state: 'open' },
    { id: 'hatch100', icon: 'egg', title: 'Hatch 100 eggs', sub: 'A true farmer', reward: E(10), have: 7, need: 100, state: 'open' },
  ],
};

const friends = {
  pct: 25, count: 6, earned: E(842.5), balance: E(12600), invitedBy: 'nastya',
  friends: [
    { tag: '412', username: 'alex_codes', balance: E(48210), gave: E(310.25), joined: now() - 86400 * 20, last: now() - 600, squad: true },
    { tag: '907', username: 'marina_k', balance: E(21440), gave: E(204), joined: now() - 86400 * 12, last: now() - 7200, squad: true },
    { tag: '338', username: null, balance: E(9120), gave: E(133.5), joined: now() - 86400 * 9, last: now() - 86400, squad: false },
    { tag: '115', username: 'dimon', balance: E(2210), gave: E(88.25), joined: now() - 86400 * 5, last: now() - 3600, squad: false },
    { tag: '764', username: 'oleg_tg', balance: E(640), gave: E(66.5), joined: now() - 86400 * 3, last: now() - 40000, squad: false },
    { tag: '221', username: null, balance: E(95), gave: E(40), joined: now() - 86400, last: now() - 90000, squad: false },
  ],
};

const board = [
  { rank: 1, id: 1, name: 'Golden Yolks', link: null, members: 1840, score: E(412800) },
  { rank: 2, id: 2, name: 'Omelette Club', link: null, members: 960, score: E(288400) },
  { rank: 3, id: 3, name: 'Chicken Run', link: null, members: 1210, score: E(251000) },
  { rank: 4, id: 4, name: 'Shell Shock', link: null, members: 402, score: E(120440) },
  { rank: 5, id: 5, name: 'Benedict', link: null, members: 311, score: E(98100) },
  { rank: 6, id: 6, name: 'Scrambled', link: null, members: 280, score: E(64000) },
];
let mySquad: { id: number; name: string; link: string | null; members: number; score: string; rank: number | null; owner?: number } | null = { id: 3, name: 'Chicken Run', link: 'https://t.me/chickenrun', members: 1210, score: E(8420), rank: 3 };
const roster = [
  { rank: 1, tag: '412', username: 'alex_codes', score: E(1840), balance: E(48210), me: false, owner: true },
  { rank: 2, tag: '001', username: null, score: E(1210), balance: E(12600), me: true, owner: false },
  { rank: 3, tag: '907', username: 'marina_k', score: E(990), balance: E(21440), me: false, owner: false },
  { rank: 4, tag: '338', username: null, score: E(640), balance: E(9120), me: false, owner: false },
];

const stats = {
  stats: { t: now(), users: 48210, wallets: 21000, newUsersToday: 812, lastUserAt: now(), promised: E(1_284_000), events: 99000, lastEventAt: now(), today: E(18420), eventsToday: 2400, hatchesLastHour: 318, posts: 40, views: 90000, postHatches: 50000, eggs: 800, eggHatches: 2000, reactions: 400, latestPost: null, root: null },
  recent: [
    { kind: 'post', amount: E(1.37), t: now() - 40, who: '…412' }, { kind: 'daily', amount: E(1.5), t: now() - 130, who: '…907' }, { kind: 'inline', amount: E(1), t: now() - 400, who: '…338' },
    { kind: 'sender', amount: E(2), t: now() - 800, who: '…115' }, { kind: 'task', amount: E(3), t: now() - 1500, who: '…764' }, { kind: 'battle', amount: E(10), t: now() - 3000, who: '…221' },
  ],
  days: null, top: [],
  langs: [['ru', 18400], ['en', 12100], ['uk', 4200], ['tr', 3100], ['es', 2800], ['pt', 2200], ['de', 1500], ['fr', 1100], ['id', 900], ['ar', 800], ['hi', 700], ['zh', 600], ['ja', 300]] as [string, number][],
};

export async function demoCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));
  const name = path.replace(/^\/v1\//, '').split('/')[0];
  if (name === 'earn') {
    if (body.action === 'daily') { earn.daily.claimedToday = true; earn.daily.streak += 1; earn.daily.days[4].state = 'done'; }
    if (body.action === 'task') { const t = earn.tasks.find((x) => x.id === body.id); if (t) t.state = 'done'; }
    if (body.action === 'boost') { earn.boosts[0] = { id: 'warmup', pct: 100, ready: false, active: now() + 3600, nextAt: now() + 86400, secs: 3600 } as typeof earn.boosts[0]; earn.bonusPct += 100; }
    return structuredClone(earn) as T;
  }
  if (name === 'friends') return friends as T;
  if (name === 'stats') return stats as T;
  if (name === 'squad') {
    if (body.action === 'leave') mySquad = null;
    if (body.action === 'join' || body.action === 'create') mySquad = { id: 3, name: String(body.name ?? 'Chicken Run'), link: null, members: 1211, score: E(0), rank: 3 };
    if (body.action === 'find') return { found: board.slice(0, 4).map((b) => ({ id: b.id, name: b.name, members: b.members })) } as T;
    return { me: mySquad, roster: mySquad ? roster : [], board, week: 1, endsAt: now() + 3 * 86400 + 4 * 3600, nextChangeAt: 0, prizes: ['10', '6', '4'] } as T;
  }
  if (name === 'walletFor') return { username: String(body.username), address: '0:' + 'ab'.repeat(32), ready: true } as T;
  return {} as T;
}

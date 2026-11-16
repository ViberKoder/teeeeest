/** Design fixtures for the bot's endpoints (VITE_DEMO=1 builds only). Claims change the fixture so the flows can be clicked through. */
const E = (n: number) => String(Math.round(n * 1e9));
const now = () => Math.floor(Date.now() / 1000);

const earn = {
  streak: 4, checkedInToday: false, nextDaily: '3.5', balance: E(12600),
  tasks: [
    { id: 'wallet', title: 'Link your wallet', desc: 'Your eggs become yours on-chain', icon: '👛', reward: '2', link: null, status: 'done', progress: null },
    { id: 'channel', title: 'Join the Hatch channel', desc: '@hatchtg: news, battles, new eggs', icon: '📣', reward: '3', link: 'https://t.me/hatchtg', status: 'ready', progress: null },
    { id: 'squad', title: 'Join a squad', desc: 'Hatch together with a team', icon: '🛡', reward: '2', link: null, status: 'ready', progress: null },
    { id: 'send1', title: 'Send your first egg', desc: 'Type @hatchapp in any chat; a friend hatches it', icon: '🥚', reward: '2', link: null, status: 'todo', progress: null },
    { id: 'friend1', title: 'Invite a friend', desc: 'A friend who plays counts', icon: '🤝', reward: '2', link: null, status: 'done', progress: [1, 1] },
    { id: 'friend3', title: 'Invite 3 friends', desc: 'Your Egg rack grows too', icon: '🐣', reward: '5', link: null, status: 'ready', progress: [3, 3] },
    { id: 'friend10', title: 'Invite 10 friends', desc: 'A real flock', icon: '🐔', reward: '15', link: null, status: 'todo', progress: [6, 10] },
  ],
  boosts: [
    { id: 'rack', icon: '🪺', title: 'Egg rack', desc: 'More eggs to send every day', level: 3, max: 5, effect: '+15 eggs a day', nextEffect: '+20', have: 6, need: 8, unit: 'active friends' },
    { id: 'nest', icon: '🌟', title: 'Golden nest', desc: 'A higher daily earning limit', level: 0, max: 5, effect: '+0% a day', nextEffect: '+10%', have: 4, need: 7, unit: 'day streak' },
  ],
};

const friends = {
  link: 'https://t.me/hatchapp?startapp=ref_1', count: 6, active: 5, earnedFromFriends: E(842.5), rack: { level: 3, step: 2, bonus: 5 }, invitedBy: { name: 'Nastya' },
  friends: [
    { rank: 1, id: 412, name: 'Alex', username: 'alex_codes', lang: 'en', since: now() - 86400 * 20, eggs: E(48210), forMe: E(310.25) },
    { rank: 2, id: 907, name: 'Marina', username: 'marina_k', lang: 'ru', since: now() - 86400 * 12, eggs: E(21440), forMe: E(204) },
    { rank: 3, id: 338, name: 'Kirill', username: null, lang: 'ru', since: now() - 86400 * 9, eggs: E(9120), forMe: E(133.5) },
    { rank: 4, id: 115, name: 'Dima', username: 'dimon', lang: 'ru', since: now() - 86400 * 5, eggs: E(2210), forMe: E(88.25) },
    { rank: 5, id: 764, name: 'Oleg', username: 'oleg_tg', lang: 'uk', since: now() - 86400 * 3, eggs: E(640), forMe: E(66.5) },
    { rank: 6, id: 221, name: 'Sveta', username: null, lang: 'en', since: now() - 86400, eggs: E(95), forMe: '0' },
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
const members = [
  { rank: 1, id: 412, name: 'Alex', earned: E(1840), total: E(48210) },
  { rank: 2, id: 1, name: 'You', earned: E(1210), total: E(12600) },
  { rank: 3, id: 907, name: 'Marina', earned: E(990), total: E(21440) },
  { rank: 4, id: 338, name: 'Kirill', earned: E(640), total: E(9120) },
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
    if (body.action === 'checkin') { earn.checkedInToday = true; earn.streak += 1; }
    if (body.action === 'claim') { const t = earn.tasks.find((x) => x.id === body.id); if (t) t.status = 'done'; }
    return structuredClone(earn) as T;
  }
  if (name === 'friends') return friends as T;
  if (name === 'stats') return stats as T;
  if (name === 'squad') {
    if (body.action === 'leave') mySquad = null;
    if (body.action === 'join' || body.action === 'create') mySquad = { id: 3, name: String(body.name ?? 'Chicken Run'), link: null, members: 1211, score: E(0), rank: 3 };
    if (body.action === 'find') return { found: board.slice(0, 4).map((b) => ({ id: b.id, name: b.name, members: b.members })) } as T;
    return { me: mySquad, members: mySquad ? members : [], board, week: 1, endsAt: now() + 3 * 86400 + 4 * 3600, nextChangeAt: 0, prizes: ['10', '6', '4'] } as T;
  }
  if (name === 'walletFor') return { username: String(body.username), address: '0:' + 'ab'.repeat(32), ready: true } as T;
  return {} as T;
}

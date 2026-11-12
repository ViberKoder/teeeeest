// Admin-editable numbers. Defaults live here; the panel stores overrides in the `settings` table, validated against SPEC.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { admins, adminLog, settings } from '../schema.js';
import { ADMINS, EGG, MINTER } from './config.js';

/** key -> { label, unit, min, max, def, hint }: everything the panel may change, and the range it may change to. */
export const SPEC = {
  reward_post: { label: 'Hatch under a channel post', unit: 'EGG', min: 0, max: 100, def: '1', group: 'Rewards' },
  reward_inline: { label: 'Hatching a friend’s egg', unit: 'EGG', min: 0, max: 100, def: '1', group: 'Rewards' },
  reward_sender: { label: 'Sender, per hatched egg', unit: 'EGG', min: 0, max: 100, def: '1', group: 'Rewards' },
  reward_chain: { label: 'Sender’s inviter, per hatched egg of the sender', unit: 'EGG', min: 0, max: 100, def: '1', group: 'Rewards', hint: 'A hatches B’s first egg → A is B’s inviter. Every time B’s egg is hatched, A earns this too.' },
  referral_pct: { label: 'Referral share of an invited player’s earnings', unit: '%', min: 0, max: 100, def: '0', integer: true, group: 'Rewards', hint: 'on top of the chain bonus; 0 = off' },
  battle_prize_1: { label: 'Channel battle: 1st place, per player', unit: 'EGG', min: 0, max: 1000, def: '5', group: 'Battles' },
  battle_prize_2: { label: 'Channel battle: 2nd place, per player', unit: 'EGG', min: 0, max: 1000, def: '3', group: 'Battles' },
  battle_prize_3: { label: 'Channel battle: 3rd place, per player', unit: 'EGG', min: 0, max: 1000, def: '2', group: 'Battles' },
  daily_cap: { label: 'Most a player earns per day', unit: 'EGG', min: 1, max: 100000, def: '300', group: 'Limits', hint: 'keep it below the token’s per-wallet daily ceiling' },
  pair_cap: { label: 'Same sender + hatcher, per day', unit: 'times', min: 1, max: 100, def: '3', integer: true, group: 'Limits' },
  sends_per_day: { label: 'Sender’s hatched eggs per day', unit: 'eggs', min: 1, max: 1000, def: '10', integer: true, group: 'Limits' },
  gas_amount: { label: 'First network fee paid by the bot', unit: 'TON', min: 0, max: 1, def: '0.1', group: 'Bot-paid fees' },
  gas_min_earned: { label: 'Earned before the bot pays the fee', unit: 'EGG', min: 0, max: 1000, def: '3', group: 'Bot-paid fees' },
  gas_daily_budget: { label: 'Accounts helped per day', unit: 'accounts', min: 0, max: 100000, def: '50', integer: true, group: 'Bot-paid fees' },
  beacon_every: { label: 'Public stats beacon, at most every', unit: 'seconds', min: 30, max: 86400, def: '60', integer: true, group: 'Public stats' },
};

/** "1.5" -> 1500000000n (exact, 9 decimals) */
export const toUnits = (v) => {
  const [w, f = ''] = String(v).split('.');
  return BigInt(w || '0') * EGG + BigInt((f + '000000000').slice(0, 9));
};

export function validate(key, raw) {
  const sp = SPEC[key];
  if (!sp) throw new Error('unknown setting');
  const v = String(raw).trim();
  if (!/^\d+(\.\d{1,9})?$/.test(v) || (sp.integer && v.includes('.'))) throw new Error(`${sp.label}: enter a number`);
  const n = Number(v);
  if (n < sp.min || n > sp.max) throw new Error(`${sp.label}: between ${sp.min} and ${sp.max}`);
  return v;
}

let cache = null;
/** All settings as typed values (BigInt units for EGG amounts). Cached for a few seconds. */
export async function getSettings() {
  if (cache && Date.now() - cache.at < 3000) return cache.v;
  const rows = await db.select().from(settings).all();
  const raw = { minter: MINTER };
  for (const k of Object.keys(SPEC)) raw[k] = SPEC[k].def;
  for (const r of rows) if (r.key === 'minter' || SPEC[r.key]) raw[r.key] = r.value;
  const v = {
    raw,
    minter: raw.minter,
    reward: { post: toUnits(raw.reward_post), inline: toUnits(raw.reward_inline), sender: toUnits(raw.reward_sender), chain: toUnits(raw.reward_chain) },
    battlePrize: [toUnits(raw.battle_prize_1), toUnits(raw.battle_prize_2), toUnits(raw.battle_prize_3)],
    referralPct: BigInt(raw.referral_pct),
    dailyCap: toUnits(raw.daily_cap),
    pairCap: Number(raw.pair_cap),
    sendsPerDay: Number(raw.sends_per_day),
    gasAmount: toUnits(raw.gas_amount),
    gasMinEarned: toUnits(raw.gas_min_earned),
    gasDailyBudget: Number(raw.gas_daily_budget),
    beaconEvery: Number(raw.beacon_every),
  };
  cache = { at: Date.now(), v };
  return v;
}

export async function setSetting(key, value, now) {
  await db.insert(settings).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } }).run();
  cache = null;
}
export const activeMinter = async () => (await getSettings()).minter;

// ---- admins ----
export async function adminIds() {
  const rows = await db.select().from(admins).all();
  return new Set([...ADMINS, ...rows.map((r) => r.tgId)]);
}
export const isAdminId = async (id) => (await adminIds()).has(Number(id));

export async function logAdmin(tgId, action, detail, now) {
  await db.insert(adminLog).values({ tgId, action, detail: String(detail ?? '').slice(0, 400), ts: now }).run();
}
void eq;

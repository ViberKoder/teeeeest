// Eggs sent into any chat through inline mode (the "send egg" game of the original bot): someone else hatches it,
// the hatcher earns REWARD.inline and the sender REWARD.sender. One egg is hatched by one person.
import { api, db } from 'sdk';
import { and, eq, lt, sql } from 'sdk/db';
import { eggs, users } from '../schema.js';
import { BOT_USERNAME } from './config.js';
import { credit, creditRef, fmtEgg, setReferrer } from './ledger.js';
import { mac } from './mac.js';
import { answer, quietly } from './telegram.js';

const nonce = () => Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');

/** Callback data of a fresh egg: e:<sender>:<nonce>:1:<mac> (always < 64 bytes; the `1` is kept so older eggs stay valid). */
export async function newEggData(sender) {
  const n = nonce();
  return `e:${sender}:${n}:1:${await mac(`${sender}:${n}:1`)}`;
}

export async function parseEggData(data) {
  const p = data.split(':');
  if (p.length !== 5 || p[0] !== 'e') return null;
  const [, sender, n, max, tag] = p;
  if (tag !== (await mac(`${sender}:${n}:${max}`))) return null;
  // eggs that were sent as "multi" before multi eggs were removed now hatch once, like any other egg
  return { sender: Number(sender), key: `${sender}:${n}`, max: 1 };
}

/** Under every egg (and under the hatched message): the app, and a way to send an egg of your own — every egg is its own invitation. */
export const tailRow = () => [
  { text: '🚀 Hatch App', url: `https://t.me/${BOT_USERNAME}?startapp` },
  { text: '🥚 Send Egg', switch_inline_query: '' },
];
const keyboard = (data, hatched, max) => ({
  inline_keyboard: [[{ text: max > 1 ? `🥚 Hatch · ${hatched}/${max}` : '🥚 Hatch', callback_data: data }], tailRow()],
});
export const afterHatchKeyboard = () => ({ inline_keyboard: [tailRow()] });

/** A tap on an egg's Hatch button. */
export async function hatchEgg(q, egg, now, S) {
  const clicker = q.from.id;
  if (clicker === egg.sender) return answer(q, 'You can’t hatch your own egg — send it to someone!', true);

  await db.insert(eggs).values({ key: egg.key, sender: egg.sender, max: egg.max, createdAt: now }).onConflictDoNothing().run();
  const day = now - (now % 86400);
  // the sender's daily allowance: only SENDS_PER_DAY of their eggs per day can be hatched (counted at the first hatch of each egg)
  const row = await db.select().from(eggs).where(eq(eggs.key, egg.key)).get();
  if (row.hatched === 0) {
    const sent = await db.$count(eggs, and(eq(eggs.sender, egg.sender), sql`${eggs.createdAt} >= ${day}`));
    if (sent > S.sendsPerDay) return answer(q, `This sender already has ${S.sendsPerDay} hatched eggs today — try again tomorrow.`, true);
  }
  // the same pair can not farm each other
  const pair = await db.get(sql`SELECT COUNT(*) AS n FROM ledger WHERE tg_id = ${clicker} AND kind = 'inline' AND ts >= ${day} AND ref LIKE ${`egg:${egg.sender}:%`}`);
  if (Number(pair?.n ?? 0) >= S.pairCap) return answer(q, 'You already hatched enough of this friend’s eggs today.', true);

  const already = await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${`egg:${egg.key}:${clicker}`}`);
  if (already) return answer(q, 'You already hatched this egg.');
  const taken = await db.update(eggs).set({ hatched: sql`${eggs.hatched} + 1` }).where(and(eq(eggs.key, egg.key), lt(eggs.hatched, egg.max))).returning().run();
  if (!taken.length) return answer(q, 'This egg has already hatched 🐣');

  // the first egg a player ever hatches makes its sender their inviter (only while they have earned nothing yet)
  await setReferrer(clicker, egg.sender, now);
  const r = await credit({ tgId: clicker, amount: S.reward.inline, kind: 'inline', ref: `egg:${egg.key}:${clicker}`, now });
  if (r !== 'ok') {
    await db.update(eggs).set({ hatched: sql`${eggs.hatched} - 1` }).where(eq(eggs.key, egg.key)).run();
    return answer(q, r === 'banned' ? 'Your account can not earn right now.' : r === 'cap' ? 'Daily limit reached — come back tomorrow!' : 'You already hatched this egg.', r !== 'again');
  }
  await credit({ tgId: egg.sender, amount: S.reward.sender, kind: 'sender', ref: `snd:${egg.key}:${clicker}`, now });
  // the chain: whoever invited the sender earns too when the sender's egg is hatched
  const sender = await db.select().from(users).where(eq(users.tgId, egg.sender)).get();
  if (sender?.referrer && sender.referrer !== clicker) await creditRef({ tgId: sender.referrer, amount: S.reward.chain, ref: `chain:${egg.key}:${clicker}`, now });
  await answer(q, `🐣 +${fmtEgg(S.reward.inline)} EGG! The sender got +${fmtEgg(S.reward.sender)}.`);

  const hatched = taken[0].hatched;
  const target = q.inline_message_id ? { inline_message_id: q.inline_message_id } : { chat_id: q.message?.chat.id, message_id: q.message?.message_id };
  if (egg.max <= 1 || hatched >= egg.max) {
    await quietly(api.editMessageText({ ...target, text: '🐣', parse_mode: 'HTML', reply_markup: afterHatchKeyboard() }));
  } else if (now - row.editedAt >= 3) {
    await db.update(eggs).set({ editedAt: now }).where(eq(eggs.key, egg.key)).run();
    await quietly(api.editMessageReplyMarkup({ ...target, reply_markup: keyboard(q.data, hatched, egg.max) }));
  }
}

export { keyboard as eggKeyboard };

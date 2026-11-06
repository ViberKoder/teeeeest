// Eggs sent into any chat through inline mode (the "send egg" game of the original bot): someone else hatches it,
// the hatcher earns REWARD.inline and the sender REWARD.sender. One egg is hatched by one person.
import { api, db } from 'sdk';
import { and, eq, lt, sql } from 'sdk/db';
import { eggs } from '../schema.js';
import { PAIR_DAILY_CAP, REWARD, SENDS_PER_DAY } from './config.js';
import { credit } from './ledger.js';
import { mac } from './mac.js';
import { answer, nameOf, quietly } from './telegram.js';

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

const keyboard = (data, hatched, max) => ({
  inline_keyboard: [[{ text: max > 1 ? `🥚 Hatch · ${hatched}/${max}` : '🥚 Hatch', callback_data: data }]],
});

/** A tap on an egg's Hatch button. */
export async function hatchEgg(q, egg, now) {
  const clicker = q.from.id;
  if (clicker === egg.sender) return answer(q, 'You can’t hatch your own egg — send it to someone!', true);

  await db.insert(eggs).values({ key: egg.key, sender: egg.sender, max: egg.max, createdAt: now }).onConflictDoNothing().run();
  const day = now - (now % 86400);
  // the sender's daily allowance: only SENDS_PER_DAY of their eggs per day can be hatched (counted at the first hatch of each egg)
  const row = await db.select().from(eggs).where(eq(eggs.key, egg.key)).get();
  if (row.hatched === 0) {
    const sent = await db.$count(eggs, and(eq(eggs.sender, egg.sender), sql`${eggs.createdAt} >= ${day}`));
    if (sent > SENDS_PER_DAY) return answer(q, `This sender already has ${SENDS_PER_DAY} hatched eggs today — try again tomorrow.`, true);
  }
  // the same pair can not farm each other
  const pair = await db.get(sql`SELECT COUNT(*) AS n FROM ledger WHERE tg_id = ${clicker} AND kind = 'inline' AND ts >= ${day} AND ref LIKE ${`egg:${egg.sender}:%`}`);
  if (Number(pair?.n ?? 0) >= PAIR_DAILY_CAP) return answer(q, 'You already hatched enough of this friend’s eggs today.', true);

  const already = await db.get(sql`SELECT 1 AS x FROM ledger WHERE ref = ${`egg:${egg.key}:${clicker}`}`);
  if (already) return answer(q, 'You already hatched this egg.');
  const taken = await db.update(eggs).set({ hatched: sql`${eggs.hatched} + 1` }).where(and(eq(eggs.key, egg.key), lt(eggs.hatched, egg.max))).returning().run();
  if (!taken.length) return answer(q, 'This egg has already hatched 🐣');

  const r = await credit({ tgId: clicker, amount: REWARD.inline, kind: 'inline', ref: `egg:${egg.key}:${clicker}`, now });
  if (r !== 'ok') {
    await db.update(eggs).set({ hatched: sql`${eggs.hatched} - 1` }).where(eq(eggs.key, egg.key)).run();
    return answer(q, r === 'cap' ? 'Daily limit reached — come back tomorrow!' : 'You already hatched this egg.', r === 'cap');
  }
  await credit({ tgId: egg.sender, amount: REWARD.sender, kind: 'sender', ref: `snd:${egg.key}:${clicker}`, now });
  await answer(q, `🐣 +1 EGG! The sender got +2.`);

  const hatched = taken[0].hatched;
  const target = q.inline_message_id ? { inline_message_id: q.inline_message_id } : { chat_id: q.message?.chat.id, message_id: q.message?.message_id };
  if (egg.max <= 1 || hatched >= egg.max) {
    await quietly(api.editMessageText({ ...target, text: egg.max <= 1 ? `🐣 Hatched by ${nameOf(q.from)}` : `🐣 All ${egg.max} hatched!`, parse_mode: 'HTML' }));
  } else if (now - row.editedAt >= 3) {
    await db.update(eggs).set({ editedAt: now }).where(eq(eggs.key, egg.key)).run();
    await quietly(api.editMessageReplyMarkup({ ...target, reply_markup: keyboard(q.data, hatched, egg.max) }));
  }
}

export { keyboard as eggKeyboard };

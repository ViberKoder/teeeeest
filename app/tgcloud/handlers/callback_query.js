// Buttons: Hatch under a channel post, Hatch on an egg sent in a chat, and the admin's "post to …" choice.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { chats } from '../schema.js';
import { getSettings } from '../lib/settings.js';
import { hatchEgg, parseEggData } from '../lib/eggs.js';
import { balanceOf, credit, ensureUser, fmtEgg } from '../lib/ledger.js';
import { board, recordHit, settleBattle, weekOf } from '../lib/battle.js';
import { countHatch, findPost, POST_DATA, publishPost } from '../lib/posts.js';
import { answer, isAdmin } from '../lib/telegram.js';
import { maybeBeacon } from '../lib/beacon.js';

export default async function (q) {
  const now = Math.floor(Date.now() / 1000);
  if (!q.from || !q.data) return answer(q);
  const S = await getSettings();
  await ensureUser(q.from.id, now, q.from.language_code);

  if (q.data.startsWith('e:')) {
    const egg = await parseEggData(q.data);
    if (!egg) return answer(q, 'This egg is not valid.');
    await hatchEgg(q, egg, now, S);
    return maybeBeacon(now);
  }

  if (q.data.startsWith('pp:')) {
    if (!(await isAdmin(q.from.id))) return answer(q, 'Admins only.');
    const chat = await db.select().from(chats).where(eq(chats.chatId, Number(q.data.slice(3)))).get();
    if (!chat) return answer(q, 'Unknown chat.');
    await publishPost({ chatId: chat.chatId, username: chat.username, caption: null, by: q.from.id, now });
    return answer(q, `Posted to ${chat.title ?? chat.chatId}`);
  }

  if (q.data === POST_DATA && q.message) {
    const chat = q.message.chat;
    if (chat.type === 'private') return answer(q, 'This egg is retired — hatch eggs under channel posts or ones friends send you.', true);
    // only posts the bot published (or adopted) in a channel one of our admins connected pay anything
    const post = await findPost(chat.id, q.message.message_id);
    if (!post) return answer(q, 'This post is not part of the game.');
    if (!post.active) return answer(q, 'This post is closed.');
    // one Hatch per player per day (UTC), under whichever post: the ref is the player and the day
    const day = Math.floor(now / 86400);
    const r = await credit({ tgId: q.from.id, amount: S.reward.post, kind: 'post', ref: `post:${q.from.id}:${day}`, now });
    if (r === 'banned') return answer(q, 'Your account can not earn right now.', true);
    if (r === 'cap') return answer(q, 'Daily limit reached — come back tomorrow!', true);
    if (r === 'again') return answer(q, 'You already hatched today — come back tomorrow! 🌅', true);
    await recordHit({ chatId: chat.id, tgId: q.from.id, now });
    const rank = (await board(weekOf(now), 50)).find((b) => b.chatId === chat.id);
    await answer(q, `+${fmtEgg(S.reward.post)} EGG · you have ${fmtEgg(await balanceOf(q.from.id))}${rank ? `\n🏆 This channel is #${rank.rank} in this week’s battle` : ''}`);
    await countHatch({ chatId: chat.id, messageId: q.message.message_id, now });
    await settleBattle(now).catch(() => null);
    return maybeBeacon(now);
  }
  return answer(q);
}
void api;

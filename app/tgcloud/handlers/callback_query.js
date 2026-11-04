// Buttons: Hatch under a channel post, Hatch on an egg sent in a chat, and the admin's "post to …" choice.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { chats } from '../schema.js';
import { REWARD } from '../lib/config.js';
import { hatchEgg, parseEggData } from '../lib/eggs.js';
import { balanceOf, credit, fmtEgg } from '../lib/ledger.js';
import { countHatch, findPost, POST_DATA, publishPost } from '../lib/posts.js';
import { answer, isAdmin } from '../lib/telegram.js';
import { maybeBeacon } from '../lib/beacon.js';

export default async function (q) {
  const now = Math.floor(Date.now() / 1000);
  if (!q.from || !q.data) return answer(q);

  if (q.data.startsWith('e:')) {
    const egg = await parseEggData(q.data);
    if (!egg) return answer(q, 'This egg is not valid.');
    await hatchEgg(q, egg, now);
    return maybeBeacon(now);
  }

  if (q.data.startsWith('pp:')) {
    if (!isAdmin(q.from.id)) return answer(q, 'Admins only.');
    const chat = await db.select().from(chats).where(eq(chats.chatId, Number(q.data.slice(3)))).get();
    if (!chat) return answer(q, 'Unknown chat.');
    await publishPost({ chatId: chat.chatId, username: chat.username, caption: null, by: q.from.id, now });
    return answer(q, `Posted to ${chat.title ?? chat.chatId}`);
  }

  if (q.data === POST_DATA && q.message) {
    const chat = q.message.chat;
    if (chat.type === 'private') return answer(q, 'This egg is retired — hatch eggs under channel posts or ones friends send you.', true);
    // only posts the bot published (or adopted) in a channel one of our admins connected pay anything
    if (!(await findPost(chat.id, q.message.message_id))) return answer(q, 'This post is not part of the game.');
    const r = await credit({ tgId: q.from.id, amount: REWARD.post, kind: 'post', ref: `post:${chat.id}:${q.message.message_id}:${q.from.id}`, now });
    if (r === 'cap') return answer(q, 'Daily limit reached — come back tomorrow!', true);
    if (r === 'again') return answer(q, 'You already hatched this egg. Watch the channel for the next one!');
    await answer(q, `+1 EGG · you have ${fmtEgg(await balanceOf(q.from.id))}`);
    await countHatch({ chatId: chat.id, messageId: q.message.message_id, now });
    return maybeBeacon(now);
  }
  return answer(q);
}
void api;

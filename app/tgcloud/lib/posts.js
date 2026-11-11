// Channel posts with a Hatch button: publishing (admins only), counting, and their public view counter.
import { api, db } from 'sdk';
import { and, eq, lt, sql } from 'sdk/db';
import { posts } from '../schema.js';
import { APP_URL } from './config.js';
import { quietly } from './telegram.js';

export const POST_DATA = 'h';
export const hatchKeyboard = (n) => ({ inline_keyboard: [[{ text: `🥚 Hatch${n ? ` · ${n}` : ''}`, callback_data: POST_DATA }]] });

export async function publishPost({ chatId, username, caption, by, now }) {
  const m = await api.sendPhoto({
    chat_id: chatId,
    photo: `${APP_URL}post-egg.jpg`,
    // just the egg and the button — a caption only if the admin wrote one
    ...(caption ? { caption, parse_mode: 'HTML' } : {}),
    reply_markup: hatchKeyboard(0),
  });
  await db.insert(posts).values({ chatId, messageId: m.message_id, username: username ?? null, createdBy: by, createdAt: now, caption: caption || '' }).onConflictDoNothing().run();
  return m;
}

/** A channel post an admin wrote by hand with #hatch: the bot adds the button. */
export async function adoptPost({ chatId, messageId, username, now }) {
  await quietly(api.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: hatchKeyboard(0) }));
  await db.insert(posts).values({ chatId, messageId, username: username ?? null, createdBy: 0, createdAt: now }).onConflictDoNothing().run();
}

export const findPost = (chatId, messageId) => db.select().from(posts).where(and(eq(posts.chatId, chatId), eq(posts.messageId, messageId))).get();

/** One more hatch on a post; the button's counter is updated at most every few seconds (Telegram limits edits). */
export async function countHatch({ chatId, messageId, now }) {
  const p = await findPost(chatId, messageId);
  if (!p) return 0;
  const n = p.hatches + 1;
  await db.update(posts).set({ hatches: sql`${posts.hatches} + 1` }).where(eq(posts.id, p.id)).run();
  if (now - p.editedAt >= 4) {
    const claimed = await db.update(posts).set({ editedAt: now }).where(and(eq(posts.id, p.id), lt(posts.editedAt, now - 3))).returning().run();
    if (claimed.length) await quietly(api.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: hatchKeyboard(n) }));
  }
  return n;
}

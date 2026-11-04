// Channel posts with a Hatch button: publishing (admins only), counting, and their public view counter.
import { api, db, fetch } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { posts } from '../schema.js';
import { APP_URL } from './config.js';
import { quietly } from './telegram.js';

export const POST_DATA = 'h';
export const hatchKeyboard = (n) => ({ inline_keyboard: [[{ text: `🥚 Hatch${n ? ` · ${n}` : ''}`, callback_data: POST_DATA }]] });
const DEFAULT_CAPTION = '🥚 A fresh egg!\nTap <b>Hatch</b> — every tap is +1 EGG, yours on the blockchain.';

export async function publishPost({ chatId, username, caption, by, now }) {
  const m = await api.sendPhoto({
    chat_id: chatId,
    photo: `${APP_URL}post-egg.jpg`,
    caption: caption || DEFAULT_CAPTION,
    parse_mode: 'HTML',
    reply_markup: hatchKeyboard(0),
  });
  await db.insert(posts).values({ chatId, messageId: m.message_id, username: username ?? null, createdBy: by, createdAt: now }).onConflictDoNothing().run();
  return m;
}

/** A channel post an admin wrote by hand with #hatch: the bot adds the button. */
export async function adoptPost({ chatId, messageId, username, now }) {
  await quietly(api.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: hatchKeyboard(0) }));
  await db.insert(posts).values({ chatId, messageId, username: username ?? null, createdBy: 0, createdAt: now }).onConflictDoNothing().run();
}

/** One more hatch on a post; the button's counter is updated at most every few seconds (Telegram limits edits). */
export async function countHatch({ chatId, messageId, now }) {
  await db.insert(posts).values({ chatId, messageId, createdBy: 0, createdAt: now }).onConflictDoNothing().run();
  const p = await db.select().from(posts).where(and(eq(posts.chatId, chatId), eq(posts.messageId, messageId))).get();
  const n = p.hatches + 1;
  await db.update(posts).set({ hatches: n }).where(eq(posts.id, p.id)).run();
  if (now - p.editedAt >= 4) {
    const claimed = await db.update(posts).set({ editedAt: now }).where(and(eq(posts.id, p.id), lt(posts.editedAt, now - 3))).returning().run();
    if (claimed.length) await quietly(api.editMessageReplyMarkup({ chat_id: chatId, message_id: messageId, reply_markup: hatchKeyboard(n) }));
  }
  return n;
}

const parseViews = (s) => {
  const m = /^([\d.,]+)\s*([KM])?$/i.exec(String(s).trim());
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(n * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2] ? 1e3 : 1));
};

/** Public channels expose a view counter on their embed page (the Bot API does not). Refreshed lazily, a few posts at a time. */
export async function refreshViews(now, limit = 4) {
  const stale = await db.select().from(posts).where(lt(posts.viewsAt, now - 120)).orderBy(posts.viewsAt).limit(limit).all();
  for (const p of stale) {
    await db.update(posts).set({ viewsAt: now }).where(eq(posts.id, p.id)).run();
    if (!p.username) continue;
    try {
      const r = await fetch(`https://t.me/${p.username}/${p.messageId}?embed=1&mode=tme`);
      const html = await r.text();
      const v = /tgme_widget_message_views">([^<]+)</.exec(html)?.[1];
      if (v) await db.update(posts).set({ views: parseViews(v) }).where(eq(posts.id, p.id)).run();
    } catch {
      /* a view counter is nice to have */
    }
  }
}

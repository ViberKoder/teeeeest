// Telegram reactions ("likes") on a channel post: the bot is told the total per emoji.
import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { posts } from '../schema.js';

export default async function (u) {
  const total = (u.reactions ?? []).reduce((a, r) => a + (r.total_count ?? 0), 0);
  await db.update(posts).set({ reactions: total }).where(and(eq(posts.chatId, u.chat.id), eq(posts.messageId, u.message_id))).run();
}

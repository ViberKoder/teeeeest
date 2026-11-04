// A channel admin writes a post containing #hatch: the bot adds the Hatch button to it.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { chats } from '../schema.js';
import { adoptPost } from '../lib/posts.js';

export default async function (m) {
  const text = `${m.text ?? ''} ${m.caption ?? ''}`.toLowerCase();
  if (!/#hatch\b|#egg\b/.test(text)) return;
  const chat = await db.select().from(chats).where(eq(chats.chatId, m.chat.id)).get();
  if (!chat?.isAdmin) return; // only channels one of our admins connected
  await adoptPost({ chatId: m.chat.id, messageId: m.message_id, username: m.chat.username, now: Math.floor(Date.now() / 1000) });
}

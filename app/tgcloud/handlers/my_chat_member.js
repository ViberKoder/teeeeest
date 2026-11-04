// Remembers the channels and groups where the bot is an administrator, so an admin can /post there.
import { db } from 'sdk';
import { chats } from '../schema.js';

export default async function (u) {
  const c = u.chat;
  const status = u.new_chat_member?.status;
  const isAdmin = status === 'administrator' ? 1 : 0;
  const row = { chatId: c.id, title: c.title ?? null, username: c.username ?? null, kind: c.type, isAdmin, updatedAt: Math.floor(Date.now() / 1000) };
  await db.insert(chats).values(row).onConflictDoUpdate({ target: chats.chatId, set: { title: row.title, username: row.username, kind: row.kind, isAdmin, updatedAt: row.updatedAt } }).run();
}

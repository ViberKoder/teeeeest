// Remembers the channels and groups where the bot is an administrator, so an admin can /post there.
import { db } from 'sdk';
import { chats } from '../schema.js';
import { isAdminId } from '../lib/settings.js';

export default async function (u) {
  const c = u.chat;
  const status = u.new_chat_member?.status;
  // the bot publishes (and pays for posts) only where one of OUR admins made it an administrator:
  // otherwise anyone could add it to their own channel and print posts to farm EGG
  const isAdmin = status === 'administrator' && (await isAdminId(u.from?.id)) ? 1 : 0;
  const row = { chatId: c.id, title: c.title ?? null, username: c.username ?? null, kind: c.type, isAdmin, updatedAt: Math.floor(Date.now() / 1000) };
  await db.insert(chats).values(row).onConflictDoUpdate({ target: chats.chatId, set: { title: row.title, username: row.username, kind: row.kind, ...(status === 'administrator' && !isAdmin ? {} : { isAdmin }), updatedAt: row.updatedAt } }).run();
}

import { db } from 'sdk';
import { and, eq, gte, sql } from 'sdk/db';
import { hatches, users } from '../schema.js';

export async function ensureUser(tgId, now) {
  await db.insert(users).values({ tgId, createdAt: now }).onConflictDoNothing().run();
}

export const countOf = (tgId) => db.$count(hatches, eq(hatches.tgId, tgId));

/** Credits one hatch for (post, player). Returns 'ok' | 'again' | 'cap'. Idempotent on (chat, message, player). */
export async function hatchOnce({ chatId, messageId, tgId, now, cap }) {
  await ensureUser(tgId, now);
  const dayStart = now - (now % 86400);
  if ((await db.$count(hatches, and(eq(hatches.tgId, tgId), gte(hatches.ts, dayStart)))) >= cap) return 'cap';
  const rows = await db.insert(hatches).values({ chatId, messageId, tgId, ts: now }).onConflictDoNothing().returning().run();
  return rows.length ? 'ok' : 'again';
}

export const postCount = (chatId, messageId) => db.$count(hatches, and(eq(hatches.chatId, chatId), eq(hatches.messageId, messageId)));
void sql;

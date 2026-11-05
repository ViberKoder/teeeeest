import { db } from 'sdk';
import { eq } from 'sdk/db';
import { posts } from '../schema.js';
import { requireOp } from '../lib/guard.js';

// Operator tool: the bot's runtime can not reach t.me, so a small outside job reads each public post's view counter from its
// embed page and writes it back here (scripts/sync-views.mjs). `list` returns the posts, `set` stores the counters.
export default async function (input) {
  requireOp(input);
  if (input.set) {
    for (const x of input.set) await db.update(posts).set({ views: Math.max(0, Math.floor(Number(x.views) || 0)), viewsAt: Math.floor(Date.now() / 1000) }).where(eq(posts.id, Number(x.id))).run();
    return { ok: true };
  }
  const rows = await db.select().from(posts).all();
  return { posts: rows.filter((p) => p.username).map((p) => ({ id: p.id, username: p.username, messageId: p.messageId })) };
}

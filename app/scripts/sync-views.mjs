#!/usr/bin/env node
/**
 * Reads the view counter of every public channel post (the Bot API does not expose it; the bot's own runtime can not reach t.me)
 * and writes it back to the bot, where the explorer and the on-chain beacon pick it up.
 *
 *   TGCLOUD_TOKEN=app…:… OP_KEY=… node scripts/sync-views.mjs
 *
 * Run it every few minutes (see .github/workflows/sync-views.yml).
 */
import { spawnSync } from 'node:child_process';

const key = process.env.OP_KEY;
if (!key || !process.env.TGCLOUD_TOKEN) throw new Error('TGCLOUD_TOKEN and OP_KEY are required');

const run = (args) => {
  const r = spawnSync('npx', ['tgcloud', '--no-pager', 'run', 'opPosts', JSON.stringify({ key, ...args })], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  const out = ((r.stderr ?? '') + (r.stdout ?? '')).replace(/\x1b\[[0-9;]*m/g, '');
  const at = out.lastIndexOf('\n< ');
  if (at < 0) throw new Error(`opPosts failed: ${out.slice(-300)}`);
  return out.slice(at + 3).replace(/\s+\d+ms\s*$/, '');
};

const parse = (s) => Function(`"use strict"; return (${s})`)(); // the CLI prints JS-object notation
const { posts } = parse(run({}));
const items = [];
for (const p of posts) {
  try {
    const html = await (await fetch(`https://t.me/${p.username}/${p.messageId}?embed=1&mode=tme`)).text();
    const v = /tgme_widget_message_views">([^<]+)</.exec(html)?.[1];
    if (!v) continue;
    const m = /^([\d.,]+)\s*([KM])?$/i.exec(v.trim());
    if (m) items.push({ id: p.id, views: Math.round(Number(m[1].replace(',', '.')) * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2] ? 1e3 : 1)) });
  } catch {
    /* a counter is nice to have */
  }
}
if (items.length) run({ set: items });
console.log(`views synced for ${items.length} of ${posts.length} posts`);

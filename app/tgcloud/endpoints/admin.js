import { api, db, EndpointError } from 'sdk';
import { desc, eq, sql } from 'sdk/db';
import { admins, adminLog, chats, ledger, posts, roots, users } from '../schema.js';
import { BOT_USERNAME, NETWORK, ADMINS, VAULT } from '../lib/config.js';
import { balanceOf as tonBalance, limitsOf, publisherKeyOf } from '../lib/chain.js';
import { hex } from '../lib/bytes.js';
import { fromHex } from '../lib/bytes.js';
import { publicKeyOf as pubOf } from '../lib/ed25519.js';
import { maybeBeacon } from '../lib/beacon.js';
import { publishPost } from '../lib/posts.js';
import { PUBLISHER_SEED } from '../lib/publisherkey.js';
import { SPEC, getSettings, isAdminId, logAdmin, setSetting, validate } from '../lib/settings.js';
import { currentRoot } from '../lib/snapshot.js';
import { computeStats } from '../lib/stats.js';
import { balanceOf } from '../lib/ledger.js';

const RAW = /^0:[0-9a-f]{64}$/;
const one = async (q) => (await db.get(q)) ?? {};

/** The admin panel's single endpoint. The platform verifies Telegram's init data, so `ctx.initData.user.id` can not be forged. */
export default async function (input, ctx) {
  const me = ctx.initData.user.id;
  if (!(await isAdminId(me))) throw new EndpointError('forbidden', { code: 'forbidden' });
  const now = Math.floor(Date.now() / 1000);
  const log = (action, detail) => logAdmin(me, action, detail, now);
  const fail = (m) => { throw new EndpointError(m, { code: m }); };

  switch (input?.action) {
    case 'overview': {
      const S = await getSettings();
      const stats = await computeStats(now);
      const banned = Number((await one(sql`SELECT COUNT(*) AS n FROM users WHERE banned = 1`)).n ?? 0);
      let health = { chain: false, vault: 0 };
      try { await limitsOf(S.minter); health.chain = true; health.vault = String(await tonBalance(VAULT)); } catch { /* shown as red */ }
      const rootRows = await db.select().from(roots).orderBy(desc(roots.seq)).limit(6).all();
      return {
        me, network: NETWORK, bot: BOT_USERNAME, minter: S.minter, vault: VAULT, health,
        publisherKey: hex(await pubOf(fromHex(PUBLISHER_SEED))),
        stats, banned,
        roots: rootRows.map((r) => ({ seq: r.seq, total: r.total, treeRoot: r.treeRoot, at: r.createdAt })),
        settings: { values: S.raw, spec: SPEC },
        team: [...ADMINS.map((id) => ({ id, root: true })), ...(await db.select().from(admins).all()).map((a) => ({ id: a.tgId, root: false, by: a.addedBy, at: a.at }))],
        chats: await db.select().from(chats).all(),
        posts: (await db.select().from(posts).orderBy(desc(posts.id)).limit(20).all()).map((p) => ({ id: p.id, chatId: p.chatId, username: p.username, messageId: p.messageId, hatches: p.hatches, views: p.views, reactions: p.reactions, active: p.active, at: p.createdAt })),
        log: (await db.select().from(adminLog).orderBy(desc(adminLog.id)).limit(40).all()).map((l) => ({ who: l.tgId, action: l.action, detail: l.detail, at: l.ts })),
      };
    }

    case 'settings.set': {
      const changed = [];
      for (const [k, v] of Object.entries(input.values ?? {})) {
        let clean;
        try { clean = validate(k, v); } catch (e) { fail(String(e.message)); }
        await setSetting(k, clean, now);
        changed.push(`${k}=${clean}`);
      }
      if (changed.length) await log('settings', changed.join(' '));
      return { ok: true };
    }

    case 'token.setActive': {
      const minter = String(input.minter ?? '');
      if (!RAW.test(minter)) fail('bad-address');
      // the bot signs roots with ONE key: only a contract that trusts exactly that key can be served
      let onChainKey;
      try { await limitsOf(minter); onChainKey = await publisherKeyOf(minter); } catch { fail('not-a-token'); }
      if (onChainKey !== hex(await pubOf(fromHex(PUBLISHER_SEED)))) fail('key-mismatch');
      await setSetting('minter', minter, now);
      await log('token.setActive', minter);
      return { ok: true };
    }

    case 'chat.set': {
      await db.update(chats).set({ isAdmin: input.approved ? 1 : 0 }).where(eq(chats.chatId, Number(input.chatId))).run();
      await log('chat.set', `${input.chatId} ${input.approved ? 'approved' : 'removed'}`);
      return { ok: true };
    }

    case 'post.publish': {
      const chat = await db.select().from(chats).where(eq(chats.chatId, Number(input.chatId))).get();
      if (!chat?.isAdmin) fail('unknown-chat');
      const caption = String(input.caption ?? '').slice(0, 900);
      const m = await publishPost({ chatId: chat.chatId, username: chat.username, caption: caption || null, by: me, now });
      await log('post.publish', `${chat.title ?? chat.chatId} #${m.message_id}`);
      return { ok: true, messageId: m.message_id, link: chat.username ? `https://t.me/${chat.username}/${m.message_id}` : null };
    }

    case 'post.close': {
      await db.update(posts).set({ active: input.active ? 1 : 0 }).where(eq(posts.id, Number(input.id))).run();
      await log('post.close', `${input.id} ${input.active ? 'reopened' : 'closed'}`);
      return { ok: true };
    }

    case 'user.find': {
      const q = String(input.q ?? '').trim();
      let u = null;
      if (/^\d{1,15}$/.test(q)) u = await db.select().from(users).where(eq(users.tgId, Number(q))).get();
      else if (RAW.test(q)) u = await db.select().from(users).where(eq(users.address, q)).get();
      else if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(q)) u = await db.select().from(users).where(eq(users.username, q.replace(/^@/, '').toLowerCase())).get();
      if (!u) return { found: false };
      const recent = await db.all(sql`SELECT kind, amount, ts FROM ledger WHERE tg_id = ${u.tgId} ORDER BY id DESC LIMIT 15`);
      return {
        found: true, tgId: u.tgId, username: u.username, address: u.address, verified: u.verified, locked: u.locked, banned: u.banned, referrer: u.referrer, createdAt: u.createdAt,
        ledger: await balanceOf(u.tgId), recent: recent.map((r) => ({ kind: r.kind, amount: String(r.amount), at: Number(r.ts) })),
      };
    }

    case 'user.ban': {
      const id = Number(input.tgId);
      if (await isAdminId(id)) fail('is-admin');
      await db.update(users).set({ banned: input.banned ? 1 : 0 }).where(eq(users.tgId, id)).run();
      await log('user.ban', `${id} ${input.banned ? 'banned' : 'unbanned'}`);
      return { ok: true };
    }

    case 'team.add': {
      const id = Number(input.tgId);
      if (!Number.isSafeInteger(id) || id <= 0) fail('bad-id');
      await db.insert(admins).values({ tgId: id, addedBy: me, at: now }).onConflictDoNothing().run();
      await log('team.add', String(id));
      return { ok: true };
    }
    case 'team.remove': {
      const id = Number(input.tgId);
      if (ADMINS.includes(id)) fail('root-admin');
      await db.delete(admins).where(eq(admins.tgId, id)).run();
      await log('team.remove', String(id));
      return { ok: true };
    }

    case 'ops.root': {
      const r = await currentRoot(now + 10);
      await log('ops.root', r ? `#${r.seq}` : 'none');
      return { seq: r?.seq ?? null, total: r?.total ?? null };
    }
    case 'ops.beacon': {
      const r = await maybeBeacon(now);
      await log('ops.beacon', r);
      return { result: r };
    }
    case 'ops.notify': {
      // a message to the admin who asked (a way to test that the bot can reach them)
      await api.sendMessage({ chat_id: me, text: 'Admin panel: the bot can reach you.' });
      return { ok: true };
    }

    default:
      return fail('unknown-action');
  }
}
void ledger;

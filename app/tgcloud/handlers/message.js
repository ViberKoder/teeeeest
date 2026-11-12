// Private chat commands: /start (with ref_ / send_ links), /send, /balance, and for admins /post and /stats.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { chats } from '../schema.js';
import { APP_URL, BOT_USERNAME } from '../lib/config.js';
import { balanceOf, ensureUser, fmtEgg, setReferrer } from '../lib/ledger.js';
import { battleReply, settleBattle } from '../lib/battle.js';
import { publishPost } from '../lib/posts.js';
import { computeStats } from '../lib/stats.js';
import { esc, isAdmin } from '../lib/telegram.js';

const openWallet = (text = 'Open wallet', query = '') => ({ inline_keyboard: [[{ text, web_app: { url: APP_URL + query } }]] });
const say = (chat_id, text, reply_markup) => api.sendMessage({ chat_id, text, parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
const USER = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/;

async function sendLink(chatId, private_, who, amount) {
  const q = `?send=${encodeURIComponent('@' + who)}${amount ? `&amount=${encodeURIComponent(amount)}` : ''}`;
  const label = `Send ${amount ? `${amount} ` : ''}EGG to @${who}`;
  // web_app buttons work only in private chats; elsewhere a link brings the user to the bot first
  const markup = private_
    ? openWallet(label, q)
    : { inline_keyboard: [[{ text: label, url: `https://t.me/${BOT_USERNAME}?start=send-${who}-${(amount || '').replace('.', 'p')}` }]] };
  return say(chatId, `Confirm in your wallet — it is signed by your own key.`, markup);
}

export default async function (m) {
  if (!m.from || !m.chat) return;
  const text = (m.text ?? '').trim();
  const now = Math.floor(Date.now() / 1000);
  const private_ = m.chat.type === 'private';
  const [cmd0, ...args] = text.split(/\s+/);
  const cmd = cmd0.replace(new RegExp(`@${BOT_USERNAME}$`, 'i'), '').toLowerCase();

  if (cmd === '/send') {
    const who = USER.exec(args[0] ?? '')?.[1];
    const amount = /^\d+(\.\d{1,9})?$/.test(args[1] ?? '') ? args[1] : '';
    if (!who) return say(m.chat.id, 'Usage: <code>/send @username 10</code> — they don’t need to have opened the wallet yet.');
    return sendLink(m.chat.id, private_, who, amount);
  }
  if (cmd === '/battle') {
    await settleBattle(now).catch(() => null);
    const b = await battleReply(now);
    const days = Math.max(0, Math.ceil((b.endsAt - now) / 86400));
    const rows = b.board.map((r) => `${['🥇', '🥈', '🥉'][r.rank - 1] ?? `${r.rank}.`} <b>${esc(r.title)}</b> · ${r.score} hatches · ${r.players} players`);
    return say(m.chat.id, `<b>Channel battle</b> · ${days} day${days === 1 ? '' : 's'} left\n\n${rows.join('\n') || 'No hatches yet this week. Tap Hatch under the post!'}\n\nOne Hatch a day under any post scores a point for its channel. The top 3 channels win EGG for everyone who hatched there.`);
  }
  if (!private_) return;
  await ensureUser(m.from.id, now, m.from.language_code);

  if (cmd === '/start') {
    const p = args[0] ?? '';
    if (p.startsWith('ref_')) await setReferrer(m.from.id, Number(p.slice(4)), now);
    if (p.startsWith('send-')) {
      const [, who, raw] = p.split('-');
      const amount = (raw ?? '').replace('p', '.');
      if (USER.test(who ?? '')) return sendLink(m.chat.id, true, who, /^\d+(\.\d+)?$/.test(amount) ? amount : '');
    }
    return say(
      m.chat.id,
      '<b>Hatch eggs. Earn EGG.</b>\n\n• Tap <b>Hatch</b> under a post once a day: +1 EGG, and a point for its channel in the weekly <b>battle</b> (/battle)\n• Send an egg to any chat: type <code>@' + BOT_USERNAME + '</code> — a friend hatches it, you both get +1. When someone you invited sends an egg that gets hatched, you earn +1 too\n• <code>/send @username 10</code> — send EGG, even to someone who never opened the wallet\n\nYour EGG live in a wallet only you hold the key to.',
      openWallet(),
    );
  }
  if (cmd === '/balance' || cmd === '/me') {
    return say(m.chat.id, `You have earned <b>${fmtEgg(await balanceOf(m.from.id))} EGG</b>.\nInvite link: https://t.me/${BOT_USERNAME}?start=ref_${m.from.id}`, openWallet());
  }

  // ---- admins ----
  if (cmd === '/admin' && (await isAdmin(m.from.id))) return say(m.chat.id, 'Admin panel — token, game settings, posts, players. Every action is logged.', openWallet('Open admin panel', 'admin/'));
  if (cmd === '/post' && (await isAdmin(m.from.id))) {
    let caption = text.slice(cmd0.length).trim();
    let target = null;
    const first = USER.exec(args[0] ?? '');
    const all = await db.select().from(chats).where(eq(chats.isAdmin, 1)).all();
    if (first && args[0].startsWith('@')) {
      target = all.find((c) => (c.username ?? '').toLowerCase() === first[1].toLowerCase());
      if (!target) return say(m.chat.id, `@${esc(first[1])} is not connected. Make me an administrator there first (with "Post messages").`);
      caption = caption.slice(args[0].length).trim();
    } else if (all.length === 1) target = all[0];
    if (!target) {
      if (!all.length) return say(m.chat.id, 'Add me to your channel as an administrator (with "Post messages"), then send /post again.');
      return say(m.chat.id, 'Where should I post?', { inline_keyboard: all.map((c) => [{ text: c.title ?? String(c.chatId), callback_data: `pp:${c.chatId}` }]) });
    }
    const sent = await publishPost({ chatId: target.chatId, username: target.username, caption: caption || null, by: m.from.id, now });
    const link = target.username ? `https://t.me/${target.username}/${sent.message_id}` : '';
    return say(m.chat.id, `Posted ✅ ${link}`);
  }
  if (cmd === '/stats' && (await isAdmin(m.from.id))) {
    const s = await computeStats(now);
    return say(m.chat.id, `<b>Stats</b>\nPlayers: ${s.users} (wallets: ${s.wallets})\nEGG promised: ${fmtEgg(s.promised)}\nToday: ${fmtEgg(s.today)} EGG, ${s.newUsersToday} new players\nPosts: ${s.posts}, views: ${s.views}, hatches: ${s.postHatches}\nEggs sent in chats: ${s.eggs}\nNewest root: #${s.root?.seq ?? '—'}`);
  }
  return say(m.chat.id, 'Commands: /start, /balance, /battle, <code>/send @username 10</code>' + ((await isAdmin(m.from.id)) ? ', /post [@channel] [text], /stats, /admin' : ''), openWallet());
}

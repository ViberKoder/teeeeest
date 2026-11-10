// The egg widget (Bot API 10.4). Telegram only allows widgets in private chats for now (never in channels), and its taps arrive as
// `widget_query` updates, a handler Telegram Serverless does not offer yet. Everything is ready: when it does (or on our own webhook),
// wire `onWidgetQuery` to that update. Until then `sendEggWidget` shows the card (counter and animation work, the button waits).
import { api, db } from 'sdk';
import { sql } from 'sdk/db';
import { EGG_WIDGET_HTML } from './widgetHtml.js';
import { balanceOf, credit, fmtEgg } from './ledger.js';
import { getSettings } from './settings.js';
import { quietly } from './telegram.js';

const totalHatches = async () => Number((await db.get(sql`SELECT COUNT(*) AS n FROM ledger WHERE kind IN ('post','inline','widget')`))?.n ?? 0);

const dataFor = async (tgId) => ({
  public_data: JSON.stringify({ n: await totalHatches() }),
  chat_data: JSON.stringify({ b: Number(fmtEgg(await balanceOf(tgId)).replace(/[^\d.]/g, '')) || 0 }),
});

export async function sendEggWidget(chatId, tgId) {
  return api.sendWidget({ chat_id: chatId, html: EGG_WIDGET_HTML, height: 470, allow_queries: true, ...(await dataFor(tgId)) });
}

/** A tap on "Hatch +1" in the widget: pays like a channel post (same limits, same ledger), answers with the new numbers. */
export async function onWidgetQuery(q, now = Math.floor(Date.now() / 1000)) {
  const reply = (m, extra = {}) => quietly(api.answerWidgetQuery({ widget_query_id: q.id, data: JSON.stringify({ m, ...extra }) }));
  if (q.type && q.type.type !== 'data') return reply(''); // wallet queries are not used yet
  if (q.data !== 'h') return reply('');
  const S = await getSettings();
  const r = await credit({ tgId: q.from.id, amount: S.reward.post, kind: 'widget', ref: `widget:${q.id}`, now });
  if (r === 'banned') return reply('Your account can not earn right now.');
  if (r === 'cap') return reply('Daily limit reached, come back tomorrow!');
  const d = await dataFor(q.from.id);
  await reply('+1 EGG', { n: JSON.parse(d.public_data).n, b: JSON.parse(d.chat_data).b });
  if (q.chat?.id && q.message_id) await quietly(api.editMessageWidgetData({ chat_id: q.chat.id, message_id: q.message_id, ...d }));
}

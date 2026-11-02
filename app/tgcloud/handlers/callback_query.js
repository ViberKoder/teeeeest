// A tap on "Hatch" is the like: +1 EGG, once per player per egg, with a daily cap.
import { api } from 'sdk';
import { DAILY_CAP, HATCH_DATA, fmt, total } from '../lib/game.js';
import { countOf, hatchOnce, postCount } from '../lib/ledger.js';

const safe = async (p) => { try { await p; } catch { /* the egg is already credited; a failed toast must not undo it */ } };

export default async function (q) {
  if (q.data !== HATCH_DATA || !q.message || !q.from) return safe(api.answerCallbackQuery({ callback_query_id: q.id }));
  const now = Math.floor(Date.now() / 1000);
  const r = await hatchOnce({ chatId: q.message.chat.id, messageId: q.message.message_id, tgId: q.from.id, now, cap: DAILY_CAP });

  if (r === 'cap') return safe(api.answerCallbackQuery({ callback_query_id: q.id, text: `Daily limit reached (${DAILY_CAP}). Come back tomorrow!`, show_alert: true }));
  if (r === 'again') return safe(api.answerCallbackQuery({ callback_query_id: q.id, text: 'You already hatched this egg. Get another with /hatch' }));

  const mine = await countOf(q.from.id);
  await safe(api.answerCallbackQuery({ callback_query_id: q.id, text: `+1 EGG · you have ${fmt(total(mine))}` }));
  const n = await postCount(q.message.chat.id, q.message.message_id);
  await safe(api.editMessageReplyMarkup({
    chat_id: q.message.chat.id,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: `🥚 Hatch · ${n}`, callback_data: HATCH_DATA }]] },
  }));
}

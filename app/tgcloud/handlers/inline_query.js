// Inline mode: type "@<bot>" in any chat to send an egg someone else can hatch.
import { api } from 'sdk';
import { eggKeyboard, newEggData } from '../lib/eggs.js';
import { ensureUser, fmtEgg } from '../lib/ledger.js';
import { getSettings } from '../lib/settings.js';

export default async function (iq) {
  const S = await getSettings();
  await ensureUser(iq.from.id, Math.floor(Date.now() / 1000), iq.from.language_code);
  const data = await newEggData(iq.from.id);
  const results = [{
    type: 'article',
    id: `e${Date.now()}`,
    title: '🥚 Send an egg',
    description: `A friend hatches it: you both get +${fmtEgg(S.reward.inline)} EGG (up to ${S.sendsPerDay} eggs a day)`,
    input_message_content: { message_text: '🥚' },
    reply_markup: eggKeyboard(data, 0, 1),
  }];
  await api.answerInlineQuery({ inline_query_id: iq.id, results, cache_time: 0, is_personal: true });
}

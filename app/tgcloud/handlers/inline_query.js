// Inline mode: type "@<bot>" (or "@<bot> egg 10") in any chat to send an egg someone else can hatch.
import { api } from 'sdk';
import { MULTI_MAX } from '../lib/config.js';
import { eggKeyboard, newEggData } from '../lib/eggs.js';

export default async function (iq) {
  const q = (iq.query ?? '').trim().toLowerCase();
  const n = Number(/(\d+)/.exec(q)?.[1] ?? 0);
  const results = [];
  const single = await newEggData(iq.from.id, 1);
  results.push({
    type: 'article', id: `s${Date.now()}`, title: '🥚 Send an egg', description: 'The first friend to hatch it gets +1 EGG, you get +2',
    input_message_content: { message_text: '🥚' }, reply_markup: eggKeyboard(single, 0, 1),
  });
  for (const m of n > 1 ? [Math.min(n, MULTI_MAX)] : [5, 25]) {
    const data = await newEggData(iq.from.id, m);
    results.push({
      type: 'article', id: `m${m}${Date.now()}`, title: `🥚 Multi egg ×${m}`, description: `Up to ${m} friends can hatch it: +1 EGG each, +2 for you per hatch`,
      input_message_content: { message_text: `🥚 ×${m}` }, reply_markup: eggKeyboard(data, 0, m),
    });
  }
  await api.answerInlineQuery({ inline_query_id: iq.id, results, cache_time: 0, is_personal: true });
}

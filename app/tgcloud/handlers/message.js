// /start opens the wallet; /hatch drops an egg you can tap to earn EGG.
import { api } from 'sdk';
import { HATCH_DATA } from '../lib/game.js';
import { ensureUser } from '../lib/ledger.js';

const APP = 'https://app8930916503.tgcloud.ai/';
const eggKeyboard = (n) => ({ inline_keyboard: [[{ text: `🥚 Hatch${n ? ` · ${n}` : ''}`, callback_data: HATCH_DATA }]] });

export default async function (message) {
  if (!message.chat || message.chat.type !== 'private' || !message.from) return;
  const text = (message.text ?? '').trim();
  const now = Math.floor(Date.now() / 1000);

  if (text.startsWith('/hatch')) {
    await ensureUser(message.from.id, now);
    await api.sendMessage({
      chat_id: message.chat.id,
      text: '🥚 A fresh egg!\nTap Hatch — every tap is +1 EGG, credited to your account and committed on-chain.',
      reply_markup: eggKeyboard(0),
    });
    return;
  }

  await ensureUser(message.from.id, now);
  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Hatch eggs. Earn EGG.\n\n/hatch — get an egg to tap\nThe wallet below keeps your EGG: your keys, your coins.',
    reply_markup: { inline_keyboard: [[{ text: 'Open wallet', web_app: { url: APP } }]] },
  });
}

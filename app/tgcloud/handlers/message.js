// Answers /start with a button that opens the wallet Mini App.
import { api } from 'sdk';

export default async function (message) {
  if (!message.chat || message.chat.type !== 'private') return;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Your eggs. Your keys.\nA self-custody TON wallet inside Telegram.',
    reply_markup: {
      inline_keyboard: [[{ text: 'Open wallet', web_app: { url: 'https://app8930916503.tgcloud.ai/' } }]],
    },
  });
}

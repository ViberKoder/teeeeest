// A channel admin writes a post containing #hatch: the bot adds the Hatch button to it.
import { adoptPost } from '../lib/posts.js';

export default async function (m) {
  const text = `${m.text ?? ''} ${m.caption ?? ''}`.toLowerCase();
  if (!/#hatch\b|#egg\b/.test(text)) return;
  await adoptPost({ chatId: m.chat.id, messageId: m.message_id, username: m.chat.username, now: Math.floor(Date.now() / 1000) });
}

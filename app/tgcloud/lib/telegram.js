import { api } from 'sdk';
import { ADMINS } from './config.js';

export const isAdmin = (id) => ADMINS.includes(Number(id));

/** Bot API calls whose failure must never undo what was already credited (a toast, an edit, a notification). */
export async function quietly(p) {
  try {
    return await p;
  } catch {
    return null;
  }
}

export const answer = (q, text, alert = false) => quietly(api.answerCallbackQuery({ callback_query_id: q.id, ...(text ? { text, show_alert: alert } : {}) }));

export const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
export const nameOf = (u) => esc(u?.username ? `@${u.username}` : [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'someone');

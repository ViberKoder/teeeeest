import { table, integer, text } from 'sdk/db';

// The wallet keeps keys on the user's device, so there is no database yet.
// (The reward ledger lives in the EGG server; it can move here later as tables + endpoints.)
// Example, when needed:
// export const players = table('players', { tg_id: integer('tg_id').primaryKey(), note: text('note') });
void table; void integer; void text;

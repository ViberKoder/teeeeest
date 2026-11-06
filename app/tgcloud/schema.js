import { table, integer, text, index, uniqueIndex } from 'sdk/db';

// Reward ledger of the Hatch game. There is NO balance column: a player's total is always
// (number of rows in `hatches`) x REWARD, so it can never drift from the log.
export const users = table('users', {
  tgId: integer('tg_id').primaryKey(),
  // wallet link: the address, the WalletTg public key and the signature that proves control of it.
  // The signature is verified by the operator (Node, ed25519) before an address enters a Merkle tree.
  address: text('address').unique(),
  // the @username Telegram reports for this account (lowercase, without @); lets transfers sent to @username find their owner
  username: text('username'),
  publicKey: text('public_key'),
  linkSig: text('link_sig'),
  // who invited this player (set once, from /start ref_<id>)
  referrer: integer('referrer'),
  // when the bot paid this player's first network fee (once per account)
  gasAt: integer('gas_at').notNull().default(0),
  // set by an admin: the account stops earning (what it was already promised in signed roots stays claimable)
  banned: integer('banned').notNull().default(0),
  // 1 once the signature was checked (ed25519) and the address was derived from that key
  verified: integer('verified').notNull().default(0),
  // 1 once this address was included in a root sent on-chain: from then on it is the account's wallet for good
  // (a second wallet could otherwise claim the same ledger again from an older root)
  locked: integer('locked').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const hatches = table('hatches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  tgId: integer('tg_id').notNull(),
  ts: integer('ts').notNull(),
}, (t) => ({
  oncePerPost: uniqueIndex('uq_hatch_once').on(t.chatId, t.messageId, t.tgId),
  byUser: index('idx_hatch_user').on(t.tgId, t.ts),
}));

// Merkle proofs of roots (legacy table, not used any more), filled by the operator after each PublishRoot (the contract is the authority).
export const proofs = table('proofs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  epoch: integer('epoch').notNull(),
  address: text('address').notNull(),
  cumulative: text('cumulative').notNull(),
  proof: text('proof').notNull(),
  commitment: text('commitment').notNull(),
}, (t) => ({
  once: uniqueIndex('uq_proof').on(t.epoch, t.address),
  byAddr: index('idx_proof_addr').on(t.address, t.epoch),
}));

// The publisher's state machine (a single row): what is in flight on-chain and when the last root went out.
export const state = table('state', {
  id: integer('id').primaryKey(),
  lockUntil: integer('lock_until').notNull().default(0),
  lastPublishAt: integer('last_publish_at').notNull().default(0),
  lastCommitment: text('last_commitment').notNull().default(''),
  pendingEpoch: integer('pending_epoch').notNull().default(0),
  pendingCommitment: text('pending_commitment').notNull().default(''),
  pendingLeaves: text('pending_leaves').notNull().default(''),
  sentAt: integer('sent_at').notNull().default(0),
});

// Transfers sent to a @username through the vault. One row per deposit (eventKey = the deposit's own id), so a deposit is
// paid out at most once; the row also walks queued -> sent -> done as the vault's requests are confirmed.
export const payouts = table('payouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventKey: text('event_key').notNull(),
  kind: text('kind').notNull(), // 'ton' | 'egg'
  amount: text('amount').notNull(), // what is paid out (jetton units or nanoTON)
  toAddress: text('to_address').notNull(),
  reason: text('reason').notNull(), // 'claim' | 'refund'
  status: text('status').notNull().default('queued'),
  sentSeqno: integer('sent_seqno').notNull().default(0),
  sentAt: integer('sent_at').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  once: uniqueIndex('uq_payout_event').on(t.eventKey),
  byStatus: index('idx_payout_status').on(t.status, t.id),
}));

// Wallets prepared for @usernames that have not opened the wallet yet (the key is derived, nothing secret is stored here).
export const prepared = table('prepared', {
  username: text('username').primaryKey(),
  address: text('address').notNull(),
  issuedAt: integer('issued_at').notNull(),
  adoptedBy: integer('adopted_by').notNull().default(0),
  fundedAt: integer('funded_at').notNull().default(0),
  sentAt: integer('sent_at').notNull().default(0),
});

// Every root the publisher key ever signed (an append-only public log: seq, root, total, signature). Only the newest keeps its
// leaf set (needed to build proofs); an auditor can ask for any root's leaves from the log's mirror.
export const roots = table('roots', {
  seq: integer('seq').primaryKey(),
  version: text('version').notNull(),
  treeRoot: text('tree_root').notNull(),
  total: text('total').notNull(),
  signature: text('signature').notNull(),
  leaves: text('leaves').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

// The ledger: every EGG a player was ever promised, one row per event. `ref` makes each event count once
// (e.g. "post:<chat>:<msg>:<user>", "egg:<key>:<user>"). There is no balance column: a balance is SUM(amount).
export const ledger = table('ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').notNull(),
  amount: integer('amount').notNull(), // jetton units (1 EGG = 1e9)
  kind: text('kind').notNull(), // post | inline | sender | ref | legacy
  ref: text('ref').notNull(),
  ts: integer('ts').notNull(),
}, (t) => ({
  once: uniqueIndex('uq_ledger_ref').on(t.ref),
  byUser: index('idx_ledger_user').on(t.tgId, t.ts),
  byTime: index('idx_ledger_ts').on(t.ts),
}));

// Channel posts with a Hatch button (published by an admin).
export const posts = table('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  username: text('username'), // public channel username, for views
  createdBy: integer('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  hatches: integer('hatches').notNull().default(0),
  views: integer('views').notNull().default(0),
  viewsAt: integer('views_at').notNull().default(0),
  editedAt: integer('edited_at').notNull().default(0),
  // reactions (Telegram's own likes) counted by the channel; the Bot API reports them only as a total
  reactions: integer('reactions').notNull().default(0),
  caption: text('caption'),
  // 0 = closed by an admin: the button stops paying
  active: integer('active').notNull().default(1),
}, (t) => ({
  once: uniqueIndex('uq_post').on(t.chatId, t.messageId),
}));

// Eggs sent into chats through inline mode (created at the first hatch).
export const eggs = table('eggs', {
  key: text('key').primaryKey(), // sender:nonce
  sender: integer('sender').notNull(),
  max: integer('max').notNull(),
  hatched: integer('hatched').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  editedAt: integer('edited_at').notNull().default(0),
});

// Channels and groups where the bot is an administrator (it can publish there).
export const chats = table('chats', {
  chatId: integer('chat_id').primaryKey(),
  title: text('title'),
  username: text('username'),
  kind: text('kind'),
  isAdmin: integer('is_admin').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

// Admin-editable settings (the game's numbers and the active token). Missing keys fall back to the defaults in lib/settings.js.
export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(0),
});

// Admins added from the panel (the ones in lib/config.js are the root admins and can not be removed here).
export const admins = table('admins', {
  tgId: integer('tg_id').primaryKey(),
  addedBy: integer('added_by').notNull(),
  at: integer('at').notNull(),
});

// Everything an admin did, newest first in the panel.
export const adminLog = table('admin_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  ts: integer('ts').notNull(),
}, (t) => ({ byTime: index('idx_admin_log_ts').on(t.ts) }));

import { table, integer, text, index, uniqueIndex } from 'sdk/db';

// Reward ledger of the Hatch game. There is NO balance column: a player's total is always
// (number of rows in `hatches`) x REWARD, so it can never drift from the log.
export const users = table('users', {
  tgId: integer('tg_id').primaryKey(),
  // wallet link: the address, the WalletTg public key and the signature that proves control of it.
  // The signature is verified by the operator (Node, ed25519) before an address enters a Merkle tree.
  address: text('address').unique(),
  publicKey: text('public_key'),
  linkSig: text('link_sig'),
  // 1 once the signature was checked (ed25519) and the address was derived from that key
  verified: integer('verified').notNull().default(0),
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

// Merkle proofs of published roots, filled by the operator after each PublishRoot (the contract is the authority).
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

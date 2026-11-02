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

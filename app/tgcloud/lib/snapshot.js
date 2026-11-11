// Signed roots, produced on demand. Nothing is sent to the blockchain: the player carries a root signed by the publisher key
// into their own claim, and the minter contract checks the signature and the Merkle proof (see docs/ARCHITECTURE.md).
//
// A root is only a snapshot of the ledger: monotone amounts mean that a newer root never takes anything from a player an older one
// gave them, and the contract accepts any root the publisher key ever signed, forever.
import { db } from 'sdk';
import { desc, eq, lt, sql } from 'sdk/db';
import { roots } from '../schema.js';
import { fromHex, hex, toBase64 } from './bytes.js';
import { toBoc } from './cell.js';
import { limitsOf } from './chain.js';
import { activeMinter } from './settings.js';
import { sign } from './ed25519.js';
import { PUBLISHER_SEED } from './publisherkey.js';
import { buildTree, proofCell, signedRootDigest } from './tree.js';

const REBUILD_EVERY = 3; // seconds: a root is reused for this long, whatever happens in the ledger

async function ledger() {
  const rows = await db.all(sql`SELECT u.address AS address, CAST(SUM(l.amount) AS TEXT) AS s, MAX(l.id) AS m FROM users u JOIN ledger l ON l.tg_id = u.tg_id WHERE u.verified = 1 AND u.address IS NOT NULL GROUP BY u.tg_id`);
  const leaves = rows.map((r) => ({ owner: r.address, cumulative: BigInt(r.s) }));
  const version = `${rows.length}:${rows.reduce((a, r) => Math.max(a, Number(r.m)), 0)}:${leaves.reduce((a, l) => a + l.cumulative, 0n)}`;
  return { leaves, version };
}

/** What the minter would accept from a new root right now: the total it may promise, and the most one wallet may be owed. */
async function chainLimits(now, minter) {
  const l = await limitsOf(minter);
  const used = now >= l.windowStart + l.periodSeconds ? 0n : l.windowGrowth;
  const total = l.frozen ? l.maxTotal : l.maxTotal + (l.maxGrowth > used ? l.maxGrowth - used : 0n);
  const days = BigInt(Math.max(0, now - l.launchAt));
  return { total, perWallet: l.walletBurst + (l.walletDaily * days) / 86400n };
}

/** The newest signed root, rebuilt when the ledger moved (at most every few seconds). */
export async function currentRoot(now) {
  const last = await db.select().from(roots).orderBy(desc(roots.seq)).limit(1).get();
  // a root is reused for a few seconds without even looking at the ledger (opening the wallet must stay cheap)
  if (last && last.version !== 'stale' && now - last.createdAt < REBUILD_EVERY) return last;
  const { leaves, version: v0 } = await ledger();
  const minter = await activeMinter();
  const version = `${minter.slice(-8)}:${v0}`; // a root is bound to ONE token contract
  if (last && last.version === version) return last;
  if (!leaves.length) return last ?? null;

  // never sign what the contract would refuse: the growth budget for the total, and the per-wallet ceiling for each leaf
  const lim = await chainLimits(now, minter);
  const capped = leaves.map((l) => (l.cumulative > lim.perWallet ? { ...l, cumulative: lim.perWallet } : l));
  const tree = await buildTree(capped);
  if (tree.total > lim.total) return last ?? null;
  if (last && BigInt(last.total) > tree.total) return last; // totals only grow (a smaller one would be provable fraud)
  const seq = (last?.seq ?? 0) + 1;
  const signature = await sign(await signedRootDigest(minter, tree.treeRoot, tree.total, seq), fromHex(PUBLISHER_SEED));
  const row = {
    seq, version, treeRoot: hex(tree.treeRoot), total: tree.total.toString(), signature: hex(signature), createdAt: now,
    leaves: JSON.stringify(tree.leaves.map((l) => [l.owner, l.cumulative.toString()])),
  };
  // Two requests may build seq N at the same moment. Only the stored one is ever handed out: a second, different root for the
  // same seq would be provable fraud (ProveFraud) and freeze the key.
  const stored = await db.insert(roots).values(row).onConflictDoNothing().returning().run();
  if (!stored.length) return db.select().from(roots).where(eq(roots.seq, seq)).get();
  await db.update(roots).set({ leaves: '' }).where(lt(roots.seq, seq)).run(); // only the newest keeps its leaf set
  return row;
}

/** What the wallet needs to claim: the player's amount, the proof, and the root the publisher signed (null if not in any root yet). */
let memo = { key: '', tree: null };
async function treeOf(root) {
  const key = `${root.seq}:${root.treeRoot}`;
  if (memo.key !== key) memo = { key, tree: await buildTree(JSON.parse(root.leaves).map(([o, c]) => ({ owner: o, cumulative: BigInt(c) }))) };
  return memo.tree;
}

export async function entitlementFor(address, now) {
  const root = await currentRoot(now);
  if (!root || !root.leaves) return null;
  const tree = await treeOf(root);
  const proof = proofCell(tree, address);
  if (!proof) return null;
  const leaf = tree.leaves[tree.index.get(address.split(':')[1])];
  return {
    owner: address,
    cumulative: leaf.cumulative.toString(),
    proof: toBase64(await toBoc(proof)),
    root: { treeRoot: root.treeRoot, total: root.total, seq: String(root.seq), signature: root.signature },
  };
}

/** Marks the newest root stale (the ledger's wallet links changed): the next request signs a fresh one. History is not touched. */
export async function invalidate() {
  const last = await db.select().from(roots).orderBy(desc(roots.seq)).limit(1).get();
  if (last) await db.update(roots).set({ version: 'stale' }).where(eq(roots.seq, last.seq)).run();
}

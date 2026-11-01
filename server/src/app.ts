import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Address } from '@ton/core';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { EggTree } from '@egg/sdk';
import { Config } from './config';
import { Db } from './db';
import { Publisher } from './publisher';
import { TgUser, verifyInitData } from './telegram';

export interface Deps {
  config: Config;
  db: Db;
  publisher: Publisher;
  /** injectable clock (unix seconds) */
  now?: () => number;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp({ config, db, publisher, now = () => Math.floor(Date.now() / 1000) }: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  await app.register(cors, { origin: config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((s) => s.trim()) });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });

  const tgUser = (req: FastifyRequest): TgUser | null => {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('tma ')) return null;
    return verifyInitData(h.slice(4), config.BOT_TOKEN, { now: now(), maxAgeSeconds: config.INIT_DATA_MAX_AGE_SECONDS });
  };
  const requireUser = (req: FastifyRequest, reply: FastifyReply): TgUser | null => {
    const u = tgUser(req);
    if (!u) void reply.code(401).send({ error: 'unauthorized' });
    return u;
  };
  const serverAuthorized = (req: FastifyRequest) => {
    const h = req.headers.authorization ?? '';
    return h.startsWith('Bearer ') && safeEqual(h.slice(7), config.INGEST_API_KEY);
  };

  // tiny LRU of rebuilt trees (rebuilding is cheap but not free)
  const trees = new Map<number, EggTree>();
  const treeOf = (epoch: number): EggTree | null => {
    const hit = trees.get(epoch);
    if (hit) return hit;
    const row = db.epoch(epoch);
    if (!row || row.status !== 'confirmed') return null;
    const t = publisher.treeOf(row);
    trees.set(epoch, t);
    if (trees.size > 4) trees.delete(trees.keys().next().value as number);
    return t;
  };

  /** The newest confirmed epoch that contains this owner, with the proof. */
  const entitlement = (owner: Address) => {
    for (const row of db.confirmedDesc(20)) {
      const t = treeOf(row.epoch);
      const proof = t?.proof(owner);
      if (t && proof) {
        return {
          owner: owner.toRawString(),
          epoch: row.epoch,
          cumulative: t.cumulativeOf(owner).toString(),
          proof: proof.toBoc().toString('base64'),
          commitment: row.commitment,
        };
      }
    }
    return null;
  };

  // ---- public ---------------------------------------------------------------
  app.get('/health', async () => {
    const last = db.lastEpochRow();
    return { ok: last?.status !== 'conflict', last_epoch: last?.epoch ?? 0, last_status: last?.status ?? null };
  });

  /** Optional off-chain metadata (the token also carries everything on-chain). */
  app.get('/jetton.json', async () => ({
    name: config.JETTON_NAME,
    symbol: config.JETTON_SYMBOL,
    decimals: String(config.JETTON_DECIMALS),
    description: config.JETTON_DESCRIPTION,
    ...(config.JETTON_IMAGE_URL ? { image: config.JETTON_IMAGE_URL } : {}),
  }));

  app.get('/v1/supply', async () => ({
    promised: db.issuedTotal().toString(),
    max: config.MAX_SUPPLY_UNITS.toString(),
    decimals: config.JETTON_DECIMALS,
  }));

  /**
   * Anyone — a wallet, an explorer, a dApp — can ask what an address is entitled to. The answer needs no trust:
   * it is checked against the commitment stored in the minter contract (see @egg/sdk `verifyEntitlement`).
   */
  app.get<{ Params: { address: string } }>('/v1/entitlement/:address', async (req, reply) => {
    let owner: Address;
    try {
      owner = Address.parse(decodeURIComponent(req.params.address));
    } catch {
      return reply.code(400).send({ error: 'invalid-address' });
    }
    const e = entitlement(owner);
    return e ?? reply.code(404).send({ error: 'no-entitlement' });
  });

  /** The complete leaf set of an epoch: whoever has it can rebuild the tree and every proof, without us. */
  app.get<{ Params: { epoch: string } }>('/v1/epochs/:epoch', async (req, reply) => {
    const n = req.params.epoch === 'latest' ? db.lastConfirmed()?.epoch : Number(req.params.epoch);
    const row = n ? db.epoch(n) : undefined;
    if (!row || row.status !== 'confirmed') return reply.code(404).send({ error: 'unknown-epoch' });
    reply.header('cache-control', 'public, max-age=60');
    return JSON.parse(row.leaves);
  });

  // ---- bot -> server ----------------------------------------------------------
  const Ingest = z.object({
    tg_id: z.number().int().positive(),
    amount: z.string().regex(/^[1-9][0-9]*$/),
    kind: z.string().min(1).max(32),
    idempotency_key: z.string().min(8).max(128),
  });
  app.post('/v1/ingest', { config: { rateLimit: false } }, async (req, reply) => {
    if (!serverAuthorized(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = Ingest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    const amount = BigInt(body.data.amount);
    if (amount > config.MAX_EVENT_UNITS) return reply.code(422).send({ error: 'amount-too-large' });
    const r = db.credit({ tgId: body.data.tg_id, amount, kind: body.data.kind, idemKey: body.data.idempotency_key, now: now(), maxSupply: config.MAX_SUPPLY_UNITS });
    if (r.reason === 'banned') return reply.code(403).send({ error: 'banned' });
    if (r.reason === 'supply') return reply.code(409).send({ error: 'max-supply-reached' });
    return { applied: r.applied, cumulative: r.cumulative.toString() };
  });

  const Ban = z.object({ tg_id: z.number().int().positive(), banned: z.boolean() });
  app.post('/v1/ban', { config: { rateLimit: false } }, async (req, reply) => {
    if (!serverAuthorized(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = Ban.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    db.setBan(body.data.tg_id, body.data.banned, now());
    return { ok: true };
  });

  /** Fraud response: cancel the unpublished part of a player's balance and ban them. */
  const Slash = z.object({ tg_id: z.number().int().positive() });
  app.post('/v1/slash', { config: { rateLimit: false } }, async (req, reply) => {
    if (!serverAuthorized(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = Slash.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    const user = db.ensureUser(body.data.tg_id, now());
    // "published" = the newest epoch that was sent or confirmed and contains the player (it may already be on-chain)
    let published = 0n;
    if (user.address) {
      const last = db.lastEpochRow();
      if (last && last.status !== 'conflict') {
        const t = publisher.treeOf(last);
        published = t.cumulativeOf(Address.parseRaw(user.address));
      }
      const confirmed = db.lastConfirmed();
      if (confirmed && (!last || confirmed.epoch !== last.epoch)) {
        const c = publisher.treeOf(confirmed).cumulativeOf(Address.parseRaw(user.address));
        if (c > published) published = c;
      }
    }
    const kept = db.slash(body.data.tg_id, published, now());
    return { ok: true, cumulative: kept.toString() };
  });

  // ---- Mini App -> server -------------------------------------------------------
  app.get('/v1/me', async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    const row = db.ensureUser(u.id, now());
    const e = row.address ? entitlement(Address.parseRaw(row.address)) : null;
    return {
      tg_id: row.tg_id,
      address: row.address,
      /** everything the ledger owes this player */
      ledger: row.cumulative,
      /** the part already committed on-chain and provable (null until the next root is published) */
      entitlement: e,
      address_locked: row.frozen_at !== null,
      banned: Boolean(row.banned),
    };
  });

  const Link = z.object({ address: z.string().min(10).max(128) });
  app.post('/v1/link', async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    const body = Link.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    let addr: Address;
    try {
      addr = Address.parse(body.data.address);
    } catch {
      return reply.code(400).send({ error: 'invalid-address' });
    }
    if (addr.workChain !== 0) return reply.code(400).send({ error: 'invalid-address' });
    const r = db.link(u.id, addr.toRawString(), now());
    if (!r.ok) return reply.code(409).send({ error: r.reason === 'locked' ? 'address-locked' : 'address-taken' });
    return { ok: true, address: addr.toRawString() };
  });

  return app;
}

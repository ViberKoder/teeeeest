import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Address } from '@ton/core';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { Config } from './config';
import { Db } from './db';
import { ClaimSigner } from './signer';
import { TgUser, verifyInitData } from './telegram';

export interface Deps {
  config: Config;
  db: Db;
  signer: ClaimSigner;
  /** injectable clock (unix seconds) */
  now?: () => number;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp({ config, db, signer, now = () => Math.floor(Date.now() / 1000) }: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  await app.register(cors, { origin: config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((s) => s.trim()) });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // ---- auth helpers -------------------------------------------------------
  const tgUser = (req: FastifyRequest): TgUser | null => {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('tma ')) return null;
    return verifyInitData(h.slice(4), config.BOT_TOKEN, {
      now: now(),
      maxAgeSeconds: config.INIT_DATA_MAX_AGE_SECONDS,
    });
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

  // ---- public -------------------------------------------------------------
  app.get('/health', async () => ({
    ok: true,
    signer: signer.publicKey.toString('hex'),
    cert_days_left: Math.floor(signer.certTtl(now()) / 86_400),
  }));

  /** TEP-64 off-chain metadata referenced by the jetton master. */
  app.get('/jetton.json', async () => ({
    name: config.JETTON_NAME,
    symbol: config.JETTON_SYMBOL,
    decimals: String(config.JETTON_DECIMALS),
    description: config.JETTON_DESCRIPTION,
    ...(config.JETTON_IMAGE_URL ? { image: config.JETTON_IMAGE_URL } : {}),
  }));

  app.get('/v1/supply', async () => ({
    issued: db.issuedTotal().toString(),
    max: config.MAX_SUPPLY_UNITS.toString(),
    decimals: config.JETTON_DECIMALS,
  }));

  // ---- bot -> server ------------------------------------------------------
  const Ingest = z.object({
    tg_id: z.number().int().positive(),
    amount: z.string().regex(/^[1-9][0-9]*$/),
    kind: z.string().min(1).max(32),
    idempotency_key: z.string().min(8).max(128),
  });
  app.post('/v1/ingest', async (req, reply) => {
    if (!serverAuthorized(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = Ingest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    const amount = BigInt(body.data.amount);
    if (amount > config.MAX_EVENT_UNITS) return reply.code(422).send({ error: 'amount-too-large' });
    const r = db.credit({
      tgId: body.data.tg_id,
      amount,
      kind: body.data.kind,
      idemKey: body.data.idempotency_key,
      now: now(),
      maxSupply: config.MAX_SUPPLY_UNITS,
    });
    if (r.reason === 'banned') return reply.code(403).send({ error: 'banned' });
    if (r.reason === 'supply') return reply.code(409).send({ error: 'max-supply-reached' });
    return { applied: r.applied, cumulative: r.cumulative.toString() };
  });

  const Ban = z.object({ tg_id: z.number().int().positive(), banned: z.boolean() });
  app.post('/v1/ban', async (req, reply) => {
    if (!serverAuthorized(req)) return reply.code(401).send({ error: 'unauthorized' });
    const body = Ban.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad-request' });
    db.setBan(body.data.tg_id, body.data.banned, now());
    return { ok: true };
  });

  // ---- Mini App -> server -------------------------------------------------
  app.get('/v1/me', async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    const row = db.ensureUser(u.id, now());
    return {
      tg_id: row.tg_id,
      address: row.address,
      cumulative: row.cumulative,
      claim_locked: row.claim_signed_at !== null,
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

  app.post('/v1/claim', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    const row = db.ensureUser(u.id, now());
    if (row.banned) return reply.code(403).send({ error: 'banned' });
    if (!row.address) return reply.code(409).send({ error: 'wallet-not-linked' });
    const t = now();
    if (signer.certTtl(t) < config.CLAIM_TTL_SECONDS) return reply.code(503).send({ error: 'signer-certificate-expired' });
    const cumulative = BigInt(row.cumulative);
    if (cumulative === 0n) return reply.code(409).send({ error: 'nothing-to-claim' });

    const validUntil = t + config.CLAIM_TTL_SECONDS;
    const cell = signer.claim(Address.parseRaw(row.address), cumulative, validUntil);
    db.markClaimSigned(u.id, t);
    return {
      claim: cell.toBoc().toString('base64'),
      cumulative: cumulative.toString(),
      valid_until: validUntil,
    };
  });

  return app;
}

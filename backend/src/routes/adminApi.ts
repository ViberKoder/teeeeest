import { FastifyInstance, FastifyRequest } from 'fastify';
import { Address } from '@ton/core';
import { z } from 'zod';
import { GameServer } from '../gameServer';
import { TreeBuilder } from '../treeBuilder';
import { config } from '../config';
import { logger } from '../logger';

export interface AdminApiDeps {
  gameServer: GameServer;
  treeBuilder: TreeBuilder;
}

function requireAdmin(req: FastifyRequest) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return false;
  }
  const token = auth.slice(7);
  return token === config.ADMIN_JWT_SECRET;
}

export function registerAdminApi(app: FastifyInstance, deps: AdminApiDeps): void {
  /**
   * Force advance an epoch (useful in dev / CI).
   *
   * POST /api/v1/admin/advance-epoch
   */
  app.post('/api/v1/admin/advance-epoch', async (req, reply) => {
    if (!requireAdmin(req)) {
      reply.code(401);
      return { error: 'unauthorised' };
    }
    const res = await deps.treeBuilder.tick(true);
    return res;
  });

  /**
   * Ban / unban a user.
   *
   * POST /api/v1/admin/ban { address, banned }
   */
  const BanSchema = z.object({
    address: z.string(),
    banned: z.boolean(),
  });
  app.post('/api/v1/admin/ban', async (req, reply) => {
    if (!requireAdmin(req)) {
      reply.code(401);
      return { error: 'unauthorised' };
    }
    const parsed = BanSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'bad-request' };
    }
    let addr: Address;
    try {
      addr = Address.parse(parsed.data.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }
    deps.gameServer.setBan(addr, parsed.data.banned);
    logger.info({ addr: addr.toString(), banned: parsed.data.banned }, 'admin ban toggled');
    return { ok: true };
  });

  /**
   * Grant an arbitrary reward to a user (e.g. promo, migration, refund).
   *
   * POST /api/v1/admin/grant { address, amount_nano, source? }
   */
  const GrantSchema = z.object({
    address: z.string(),
    amount_nano: z.string().regex(/^[0-9]+$/),
    source: z.enum(['web', 'telegram-inline', 'tma', 'api']).default('api'),
  });
  app.post('/api/v1/admin/grant', async (req, reply) => {
    if (!requireAdmin(req)) {
      reply.code(401);
      return { error: 'unauthorised' };
    }
    const parsed = GrantSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'bad-request' };
    }
    let addr: Address;
    try {
      addr = Address.parse(parsed.data.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }
    const result = deps.gameServer.recordAction({
      address: addr,
      source: parsed.data.source,
      rewardNano: BigInt(parsed.data.amount_nano),
    });
    return result;
  });

  logger.info('admin api routes registered');
}

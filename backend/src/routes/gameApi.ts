import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { z } from 'zod';
import { GameServer, GameAction } from '../gameServer';
import { logger } from '../logger';

export interface GameApiDeps {
  gameServer: GameServer;
}

const ActionSchema = z.object({
  address: z.string().min(48).max(128),
  source: z.enum(['web', 'telegram-inline', 'tma', 'api']).default('api'),
  reward: z
    .string()
    .regex(/^[0-9]+$/)
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

/**
 * Game-facing action API. Games, bots and TMAs POST here with a stable
 * user identity (TON address) to register a reward-earning event.
 *
 * POST /api/v1/action { address, source, reward?, meta? }
 *
 * The server is the sole source of truth: the `reward` override is only
 * honoured if it's within product-configured bounds. Otherwise the default
 * TAP_VALUE_NANO is used.
 */
export function registerGameApi(app: FastifyInstance, deps: GameApiDeps): void {
  app.post('/api/v1/action', async (req, reply) => {
    const parsed = ActionSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'bad-request', details: parsed.error.flatten() };
    }

    let addr: Address;
    try {
      addr = Address.parse(parsed.data.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    const action: GameAction = {
      address: addr,
      source: parsed.data.source,
      rewardNano: parsed.data.reward ? BigInt(parsed.data.reward) : undefined,
      meta: parsed.data.meta,
    };

    const result = deps.gameServer.recordAction(action);
    if (!result.ok) {
      reply.code(429);
      return { error: result.reason };
    }

    return {
      ok: true,
      cumulative_offchain: result.cumulativeAmount.toString(),
      delta_applied: result.deltaApplied.toString(),
    };
  });

  /**
   * Bulk action endpoint — useful for trusted server integrations batching
   * events (e.g. a game engine sending 100 taps at a time to save RTT).
   */
  const BulkSchema = z.object({
    actions: z.array(ActionSchema).min(1).max(100),
  });
  app.post('/api/v1/action/bulk', async (req, reply) => {
    const parsed = BulkSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'bad-request', details: parsed.error.flatten() };
    }
    const results: unknown[] = [];
    for (const a of parsed.data.actions) {
      let addr: Address;
      try {
        addr = Address.parse(a.address);
      } catch {
        results.push({ ok: false, reason: 'invalid-address' });
        continue;
      }
      const r = deps.gameServer.recordAction({
        address: addr,
        source: a.source,
        rewardNano: a.reward ? BigInt(a.reward) : undefined,
        meta: a.meta,
      });
      results.push(
        r.ok
          ? {
              ok: true,
              cumulative: r.cumulativeAmount.toString(),
              delta: r.deltaApplied.toString(),
            }
          : { ok: false, reason: r.reason },
      );
    }
    return { results };
  });

  logger.info('game api routes registered');
}

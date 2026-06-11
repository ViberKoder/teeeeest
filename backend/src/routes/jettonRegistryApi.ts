import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import { z } from 'zod';
import type { AppStore } from '../store/appStore';
import {
  JETTON_METADATA_FILENAME,
  MINTLESS_JETTON_METADATA_FILENAME,
  parseJettonMasterPathSegment,
} from '../jettonAddressPath';
import { loadJettonRegistry, saveJettonRegistry } from '../jettonRegistry';
import { logger } from '../logger';

const RegisterSchema = z.object({
  master: z.string().min(48).max(128),
  name: z.string().min(1).max(128),
  symbol: z.string().min(1).max(32),
  description: z.string().max(2048).optional().default(''),
  image: z.string().max(2048).optional(),
  decimals: z.enum(['0', '9']).optional().default('0'),
  kind: z.enum(['rmj', 'mintless']).optional().default('rmj'),
});

export interface JettonRegistryApiDeps {
  store: AppStore;
}

/**
 * Persist TEP-64 display fields per jetton master (web minter calls this after deploy).
 * Proof/game APIs still use `JETTON_MASTER_ADDRESS` — register metadata separately from env.
 */
export function registerJettonRegistryApi(app: FastifyInstance, deps: JettonRegistryApiDeps): void {
  app.post('/api/v1/jettons/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'bad-request', details: parsed.error.flatten() };
    }

    let master: Address;
    try {
      master = Address.parse(parsed.data.master);
    } catch {
      reply.code(400);
      return { error: 'invalid-master-address' };
    }

    const image = parsed.data.image?.trim();
    const kind = parsed.data.kind;
    const defaultDescription =
      kind === 'mintless'
        ? `${parsed.data.symbol.trim()} — TEP-177 Mintless Jetton.`
        : `${parsed.data.symbol.trim()} — Rolling Mintless Jetton.`;
    await saveJettonRegistry(deps.store, master, {
      name: parsed.data.name.trim(),
      symbol: parsed.data.symbol.trim(),
      description: parsed.data.description?.trim() || defaultDescription,
      image: image || undefined,
      decimals: parsed.data.decimals,
      kind,
    });

    logger.info(
      { master: master.toString({ urlSafe: true, bounceable: true }), symbol: parsed.data.symbol },
      'jetton metadata registered',
    );

    return {
      ok: true,
      master: master.toString({ urlSafe: true, bounceable: true }),
      metadata_url: `/api/v1/jettons/${master.toString({ urlSafe: true, bounceable: true })}/metadata.json`,
      hint:
        kind === 'mintless'
          ? `Set MINTLESS_JETTON_MASTER_ADDRESS to this master so /${MINTLESS_JETTON_METADATA_FILENAME} serves it (parallel to RMJ).`
          : `Set JETTON_MASTER_ADDRESS to this master so Proof API and /${JETTON_METADATA_FILENAME} use it.`,
    };
  });

  app.get<{ Params: { master: string } }>(
    '/api/v1/jettons/:master/registry',
    async (req, reply) => {
      const fromPath = parseJettonMasterPathSegment(req.params.master);
      if (!fromPath) {
        reply.code(400);
        return { error: 'invalid-master-address' };
      }
      const reg = await loadJettonRegistry(deps.store, fromPath);
      if (!reg) {
        reply.code(404);
        return { error: 'not-registered' };
      }
      return { master: fromPath.toRawString(), ...reg };
    },
  );

  logger.info('jetton registry: POST /api/v1/jettons/register');
}

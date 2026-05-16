import { FastifyInstance } from 'fastify';
import { Address, beginCell } from '@ton/core';
import { AirdropState } from '../state';
import { config } from '../config';
import { createTonClient } from '../tonClient';
import { logger } from '../logger';

const OP_MERKLE_AIRDROP_CLAIM = 0x0df602d6;

/**
 * TEP-177 reference claim API (ton-community/mintless-jetton `claimApi.ts`).
 * Set metadata `custom_payload_api_uri` to `{PUBLIC_APP_URL}/api/v1` (no `/jettons/{master}`).
 * Wallets call `GET {uri}/wallet/{owner_raw}`.
 */
export function registerStandardMintlessProofApi(app: FastifyInstance, state: AirdropState): void {
  const masterRaw =
    config.JETTON_MASTER_ADDRESS?.trim() || config.STANDARD_JETTON_MASTER_ADDRESS?.trim();
  if (!masterRaw) {
    logger.info('standard mintless API disabled (JETTON_MASTER_ADDRESS unset)');
    return;
  }

  let master: Address;
  try {
    master = Address.parse(masterRaw);
  } catch {
    logger.error({ masterRaw }, 'invalid STANDARD_JETTON_MASTER_ADDRESS');
    return;
  }

  app.get<{ Params: { owner: string } }>('/api/v1/wallet/:owner', async (req, reply) => {
    let owner: Address;
    try {
      owner = Address.parse(req.params.owner);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    if (!state.tree.has(owner)) {
      reply.code(404);
      return { error: 'address-not-in-tree' };
    }

    const leaf = state.tree.get(owner)!;
    const proof = state.tree.generateProof(owner);
    const customPayload = beginCell().storeUint(OP_MERKLE_AIRDROP_CLAIM, 32).storeRef(proof).endCell();

    try {
      const client = createTonClient();
      const ownerSlice = beginCell().storeAddress(owner).endCell();

      const walletRes = await client.runMethod(master, 'get_wallet_address', [
        { type: 'slice', cell: ownerSlice },
      ]);
      const jettonWallet = walletRes.stack.readAddress();

      let stateInitB64: string | null = null;
      const jwState = await client.getContractState(jettonWallet);
      if (jwState.state !== 'active') {
        const siRes = await client.runMethod(master, 'get_wallet_state_init_and_salt', [
          { type: 'slice', cell: ownerSlice },
        ]);
        const stateInit = siRes.stack.readCell();
        stateInitB64 = stateInit.toBoc().toString('base64');
      }

      return {
        owner: owner.toRawString(),
        jetton_wallet: jettonWallet.toRawString(),
        custom_payload: customPayload.toBoc().toString('base64'),
        state_init: stateInitB64,
        compressed_info: {
          amount: leaf.cumulativeAmount.toString(),
          start_from: leaf.startFrom,
          expired_at: leaf.expiredAt,
        },
      };
    } catch (e) {
      logger.error({ err: e, owner: owner.toString() }, 'standard mintless wallet API failed');
      reply.code(503);
      return { error: 'rpc-unavailable' };
    }
  });

  logger.info({ master: master.toString() }, 'TEP-177 standard mintless API: GET /api/v1/wallet/:owner');
}

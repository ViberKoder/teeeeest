import { FastifyInstance } from 'fastify';
import { Address, beginCell, storeStateInit } from '@ton/core';
import { JettonMaster } from '@ton/ton';
import { RollingMintlessWallet } from '@rmj/contracts';

import { config } from '../config';
import { createTonClient } from '../tonClient';
import { resolveMasterSignerPubkey } from '../onChainSigner';
import type { VoucherSigner } from '../signer';
import { logger } from '../logger';

export interface JettonWalletApiDeps {
  signer: VoucherSigner;
}

/**
 * GET /api/v1/jetton-wallet/:owner
 *
 * Resolves the user's Rolling Mintless jetton-wallet address for the configured master,
 * and (if the wallet account is not active yet) returns a base64 StateInit BoC for
 * TON Connect so the first transfer can deploy the wallet on-chain.
 */
export function registerJettonWalletApi(app: FastifyInstance, deps: JettonWalletApiDeps): void {
  app.get<{ Params: { owner: string } }>('/api/v1/jetton-wallet/:owner', async (req, reply) => {
    if (!config.JETTON_MASTER_ADDRESS?.trim()) {
      reply.code(503);
      return { error: 'jetton-master-not-configured' };
    }

    let owner: Address;
    try {
      owner = Address.parse(req.params.owner);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    try {
      const client = createTonClient();
      const masterAddr = Address.parse(config.JETTON_MASTER_ADDRESS);
      const master = client.open(JettonMaster.create(masterAddr));

      const jettonWalletAddr = await master.getWalletAddress(owner);
      const st = await client.getContractState(jettonWalletAddr);
      const needs_deploy = st.state !== 'active';

      let wallet_state_init_base64: string | null = null;

      if (needs_deploy) {
        const jd = await master.getJettonData();
        const walletCode = jd.walletCode;
        const signerPubkey = await resolveMasterSignerPubkey({ fallback: deps.signer.publicKeyBigint });

        const jw = RollingMintlessWallet.createFromConfig(
          {
            owner,
            master: masterAddr,
            walletCode,
            signerPubkey,
          },
          walletCode,
        );

        if (!jw.init?.code || !jw.init?.data) {
          reply.code(500);
          return { error: 'wallet-init-unavailable' };
        }

        const si = beginCell().store(storeStateInit({ code: jw.init.code, data: jw.init.data })).endCell();
        wallet_state_init_base64 = si.toBoc().toString('base64');

        const resolved = jw.address.toString({ bounceable: false, urlSafe: true });
        const expected = jettonWalletAddr.toString({ bounceable: false, urlSafe: true });
        if (resolved !== expected) {
          logger.error(
            { resolved, expected, owner: owner.toString() },
            'jetton-wallet: derived StateInit address mismatch — check SIGNER_SEED_HEX vs on-chain master',
          );
          reply.code(500);
          return { error: 'wallet-address-mismatch' };
        }
      }

      return {
        jetton_master: masterAddr.toString({ bounceable: false, urlSafe: true }),
        owner: owner.toString({ bounceable: false, urlSafe: true }),
        jetton_wallet: jettonWalletAddr.toString({ bounceable: false, urlSafe: true }),
        jetton_wallet_active: st.state === 'active',
        needs_deploy,
        wallet_state_init_base64,
      };
    } catch (e) {
      logger.error({ err: e }, 'jetton-wallet lookup failed');
      reply.code(502);
      return { error: 'rpc-error' };
    }
  });

  logger.info('jetton wallet route registered: GET /api/v1/jetton-wallet/:owner');
}

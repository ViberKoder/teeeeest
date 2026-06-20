import { RollingMintlessMaster } from '@rmj/contracts';
import { configuredJettonMaster } from './jettonMaster';
import { createTonClient } from './tonClient';
import { logger } from './logger';

let cached: { masterRaw: string; pubkey: bigint } | null = null;

/** Drop cache after master redeploy or signer rotation (tests / admin). */
export function resetMasterSignerCache(): void {
  cached = null;
}

/**
 * RMJ jetton-wallet address / StateInit depend on `signer_pubkey` baked into the master at deploy.
 * Always prefer on-chain `get_signer_pubkey`; env `SIGNER_SEED_HEX` is only for voucher signing + fallback.
 */
export async function resolveMasterSignerPubkey(opts?: { fallback?: bigint }): Promise<bigint> {
  const master = configuredJettonMaster();
  if (!master) {
    if (opts?.fallback != null) return opts.fallback;
    throw new Error('JETTON_MASTER_ADDRESS not configured');
  }

  const masterRaw = master.toRawString();
  if (cached?.masterRaw === masterRaw) {
    return cached.pubkey;
  }

  try {
    const client = createTonClient();
    const contract = client.open(RollingMintlessMaster.createFromAddress(master));
    const onChain = await contract.getSignerPubkey();

    if (opts?.fallback != null && onChain !== opts.fallback) {
      logger.warn(
        {
          on_chain_signer: onChain.toString(16),
          env_signer: opts.fallback.toString(16),
          master: master.toString({ urlSafe: true, bounceable: false }),
        },
        'SIGNER_SEED_HEX pubkey differs from master get_signer_pubkey — using on-chain for wallet StateInit; fix env for voucher signing',
      );
    }

    cached = { masterRaw, pubkey: onChain };
    return onChain;
  } catch (e) {
    if (opts?.fallback != null) {
      logger.warn(
        { err: e, master: masterRaw },
        'mintless: get_signer_pubkey failed — falling back to SIGNER_SEED_HEX for wallet derive',
      );
      return opts.fallback;
    }
    throw e;
  }
}

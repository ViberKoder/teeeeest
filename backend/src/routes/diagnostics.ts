import { FastifyInstance } from 'fastify';
import type { AppStore } from '../store/appStore';
import type { AirdropState } from '../state';
import type { RootUpdater } from '../rootUpdater';
import { config } from '../config';
import { logger } from '../logger';

const KV_TREE_TICK_AT = 'tree_builder_last_tick_at';

export interface DiagnosticsDeps {
  store: AppStore;
  state: AirdropState;
  rootUpdater: RootUpdater;
}

/**
 * Human-oriented snapshot for operators: chain wiring, Merkle epoch, and RMJ UX caveats.
 */
export function registerDiagnostics(app: FastifyInstance, deps: DiagnosticsDeps): void {
  app.get('/api/v1/diagnostics', async () => {
    const lastTickStr = await deps.store.getKv(KV_TREE_TICK_AT);
    const lastTickUnix = lastTickStr ? Number(lastTickStr) : null;
    const now = Math.floor(Date.now() / 1000);

    const jettonConfigured = Boolean(config.JETTON_MASTER_ADDRESS?.trim());
    const adminConfigured = Boolean(
      config.ADMIN_MNEMONIC?.trim() ||
        config.ADMIN_PRIVATE_KEY_HEX?.replace(/^0x/i, '').replace(/\s+/g, '').trim(),
    );
    const rootUpdatesEnabled = deps.rootUpdater.isReady();
    const adminOnChain = await deps.rootUpdater.getAdminWalletOnChain();

    return {
      service: 'rmj-backend',
      healthy: true,
      ton_network: config.TON_NETWORK,
      epoch: deps.state.epoch,
      merkle_tree_users: deps.state.tree.size,
      epoch_duration_seconds: config.EPOCH_DURATION_SECONDS,
      balance_display: config.PUBLIC_BALANCE_DISPLAY,
      jetton_master_configured: jettonConfigured,
      jetton_max_supply_nano: config.JETTON_MAX_SUPPLY_NANO.toString(),
      admin_mnemonic_or_private_key_configured: adminConfigured,
      root_updates_will_send_onchain: rootUpdatesEnabled,
      admin_wallet_onchain: adminOnChain,
      integration_warnings: [
        ...(!jettonConfigured ? ['JETTON_MASTER_ADDRESS is empty'] : []),
        ...(!adminConfigured ? ['ADMIN_MNEMONIC or ADMIN_PRIVATE_KEY_HEX required — root updates cannot broadcast'] : []),
        ...(jettonConfigured && adminConfigured && !rootUpdatesEnabled
          ? ['Root updater did not initialise — check logs at startup (often ADMIN_WALLET_ADDRESS vs mnemonic / v5r1 subwallet)']
          : []),
        ...(adminOnChain && adminOnChain.contract_state !== 'active'
          ? [
              `Admin wallet ${adminOnChain.derived_address} is ${adminOnChain.contract_state} on ${config.TON_NETWORK} — deploy it (send any outgoing tx in Tonkeeper) and fund TON before Merkle roots can broadcast`,
            ]
          : []),
        ...(adminOnChain?.matches_standard_v5r1_code === false &&
        adminOnChain.contract_state === 'active'
          ? [
              'On-chain admin contract is not standard Wallet V5 R1 — set ADMIN_WALLET_VERSION=v4 if this address is Wallet V4, or fix signing key / ADMIN_WALLET_ADDRESS',
            ]
          : []),
      ],
      last_tree_builder_tick_unix: lastTickUnix,
      seconds_since_last_tree_tick: lastTickUnix != null ? now - lastTickUnix : null,
      how_balance_works: [
        'Taps POST to /api/v1/action increase cumulative_offchain in the DB immediately.',
        `The Merkle tree refreshes on a timer (epoch_duration_seconds=${config.EPOCH_DURATION_SECONDS}); until then GET /api/v1/custom-payload/:addr may return 404.`,
        'Wallets show jetton balance only after a transfer/swap that attaches the custom payload (TEP-177); many UIs show 0 until then.',
        'Compare GET /api/v1/balance/:addr cumulative_offchain vs cumulative_in_tree to see DB vs Merkle lag.',
      ],
    };
  });

  logger.info('diagnostics route registered: GET /api/v1/diagnostics');
}

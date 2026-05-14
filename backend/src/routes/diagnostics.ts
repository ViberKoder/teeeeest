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
    const adminConfigured = Boolean(config.ADMIN_MNEMONIC?.trim());
    const rootUpdatesEnabled = deps.rootUpdater.isReady();

    return {
      service: 'rmj-backend',
      healthy: true,
      ton_network: config.TON_NETWORK,
      epoch: deps.state.epoch,
      merkle_tree_users: deps.state.tree.size,
      epoch_duration_seconds: config.EPOCH_DURATION_SECONDS,
      public_jetton_decimals: config.PUBLIC_JETTON_DECIMALS,
      tap_value_per_action: config.TAP_VALUE_NANO.toString(),
      jetton_master_configured: jettonConfigured,
      admin_mnemonic_configured: adminConfigured,
      root_updates_will_send_onchain: rootUpdatesEnabled,
      integration_warnings: [
        ...(!jettonConfigured ? ['JETTON_MASTER_ADDRESS is empty'] : []),
        ...(!adminConfigured ? ['ADMIN_MNEMONIC is empty — root updates cannot broadcast'] : []),
        ...(jettonConfigured && adminConfigured && !rootUpdatesEnabled
          ? ['Root updater did not initialise — check logs at startup']
          : []),
      ],
      last_tree_builder_tick_unix: lastTickUnix,
      seconds_since_last_tree_tick: lastTickUnix != null ? now - lastTickUnix : null,
      how_balance_works: [
        'Taps POST to /api/v1/action increase cumulative_offchain in the DB immediately.',
        `The Merkle tree refreshes on a timer (epoch_duration_seconds=${config.EPOCH_DURATION_SECONDS}); until then GET /api/v1/custom-payload/:addr may return 404.`,
        `Jetton UI scale: PUBLIC_JETTON_DECIMALS=${config.PUBLIC_JETTON_DECIMALS} in /jetton-metadata.json — use 0 so 1 on-chain unit displays as 1 token (not 1e-9).`,
        'Wallets show jetton balance only after a transfer/swap that attaches the custom payload (TEP-177); many UIs show 0 until then.',
        'Compare GET /api/v1/balance/:addr cumulative_offchain vs cumulative_in_tree to see DB vs Merkle lag.',
      ],
    };
  });

  logger.info('diagnostics route registered: GET /api/v1/diagnostics');
}

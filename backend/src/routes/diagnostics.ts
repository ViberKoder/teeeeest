import { FastifyInstance } from 'fastify';
import type { AppStore } from '../store/appStore';
import type { AirdropState } from '../state';
import type { RootUpdater } from '../rootUpdater';
import { config } from '../config';
import { buildCustomPayloadApiUri } from '../jettonMaster';
import { resolveMasterSignerPubkey } from '../onChainSigner';
import { voucherSigner } from '../signer';
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
    const onChainMerkle = await deps.rootUpdater.readOnChainMerkle();
    const offChainRoot = deps.state.rootHex();
    const merkleSynced =
      onChainMerkle != null &&
      onChainMerkle.rootHex.toLowerCase() === offChainRoot.toLowerCase();

    const envSignerPubkeyHex = voucherSigner.publicKeyHex;
    let onChainSignerPubkeyHex: string | null = null;
    let signerSeedMatchesMaster = true;
    if (jettonConfigured) {
      try {
        const onChainSigner = await resolveMasterSignerPubkey({ fallback: voucherSigner.publicKeyBigint });
        onChainSignerPubkeyHex = onChainSigner.toString(16).padStart(64, '0');
        signerSeedMatchesMaster = onChainSignerPubkeyHex === envSignerPubkeyHex;
      } catch {
        onChainSignerPubkeyHex = null;
      }
    }

    return {
      service: 'rmj-backend',
      healthy: true,
      ton_network: config.TON_NETWORK,
      epoch: deps.state.epoch,
      merkle_tree_users: deps.state.tree.size,
      epoch_duration_seconds: config.EPOCH_DURATION_SECONDS,
      balance_display: config.PUBLIC_BALANCE_DISPLAY,
      jetton_metadata_decimals: config.PUBLIC_BALANCE_DISPLAY === 'integer' ? '0' : '9',
      tap_value_per_action: config.TAP_VALUE_NANO.toString(),
      custom_payload_api_uri: config.PUBLIC_APP_URL.trim()
        ? buildCustomPayloadApiUri(config.PUBLIC_APP_URL)
        : null,
      jetton_master_configured: jettonConfigured,
      jetton_max_supply_nano: config.JETTON_MAX_SUPPLY_NANO.toString(),
      admin_mnemonic_or_private_key_configured: adminConfigured,
      root_updates_will_send_onchain: rootUpdatesEnabled,
      admin_wallet_onchain: adminOnChain,
      on_chain_merkle_root: onChainMerkle?.rootHex ?? null,
      on_chain_merkle_epoch: onChainMerkle?.epoch ?? null,
      off_chain_merkle_root: offChainRoot,
      off_chain_db_epoch: deps.state.epoch,
      merkle_root_synced: merkleSynced,
      env_signer_pubkey: envSignerPubkeyHex,
      on_chain_signer_pubkey: onChainSignerPubkeyHex,
      signer_seed_matches_master: signerSeedMatchesMaster,
      integration_warnings: [
        ...(jettonConfigured && onChainSignerPubkeyHex && !signerSeedMatchesMaster
          ? [
              `SIGNER_SEED_HEX pubkey (${envSignerPubkeyHex}) ≠ master get_signer_pubkey (${onChainSignerPubkeyHex}) — update Railway env with the seed from minter step 3 for this jetton deploy; StateInit uses on-chain key but update_merkle_root vouchers will fail until fixed`,
            ]
          : []),
        ...(jettonConfigured && !merkleSynced && deps.state.tree.size > 0 && !rootUpdatesEnabled
          ? [
              'Tonkeeper/MyTonWallet will NOT auto-attach claim on transfer until on-chain merkle root is synced — users see a plain send without custom_payload',
            ]
          : []),
        ...(jettonConfigured && !merkleSynced && deps.state.tree.size > 0
          ? [
              `On-chain merkle root (${onChainMerkle?.rootHex ?? 'unreadable'}) ≠ off-chain tree (${offChainRoot}) — Toncenter mintless_info will stay empty until update_merkle_root confirms. POST /api/v1/admin/sync-merkle-root or wait for root updater.`,
            ]
          : []),
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
        'Taps POST to /api/v1/action increase cumulative_offchain in the DB and update the in-memory Merkle tree immediately.',
        'Proof API GET /api/v1/jettons/{master}/wallet/:owner serves TEP-177 custom_payload as soon as the address is in the tree.',
        `On-chain merkle root sync runs on epoch timer (epoch_duration_seconds=${config.EPOCH_DURATION_SECONDS}); Toncenter/TonAPI unclaimed display may lag until update_merkle_root confirms.`,
        `Jetton UI scale: PUBLIC_BALANCE_DISPLAY=${config.PUBLIC_BALANCE_DISPLAY} → /jetton-metadata.json "decimals" ${config.PUBLIC_BALANCE_DISPLAY === 'integer' ? '"0"' : '"9"'} (integer = one on-chain unit shows as one token).`,
        'Wallets show jetton balance only after a transfer/swap that attaches the custom payload (TEP-177); many UIs show 0 until then.',
        'MyTonWallet: extension fetches Proof API via api.mytonwallet.org/proxy/download-json which validates jetton *metadata* JSON (name/symbol/decimals), not TEP-176 wallet proof — returns "Invalid metadata JSON" → InsufficientBalance before signing. Direct curl to Proof API works; bug is in MyTonWallet tokens.ts fetchJsonWithProxy. Workaround: ClaimTab (TON Connect) or Tonkeeper.',
        'Compare GET /api/v1/balance/:addr cumulative_offchain vs cumulative_in_tree — should match after each tap.',
      ],
    };
  });

  logger.info('diagnostics route registered: GET /api/v1/diagnostics');
}

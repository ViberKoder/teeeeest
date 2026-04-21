import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from '@ton/core';
import { OpCodes } from './OpCodes';

export interface RollingMintlessWalletConfig {
  balance?: bigint;
  owner: Address;
  master: Address;
  walletCode: Cell;
  alreadyClaimed?: bigint;
  cachedMerkleRoot?: bigint;
  cachedEpoch?: number;
  signerPubkey: bigint;
}

export function rollingMintlessWalletConfigToCell(cfg: RollingMintlessWalletConfig): Cell {
  const rolling = beginCell()
    .storeCoins(cfg.alreadyClaimed ?? 0n)
    .storeUint(cfg.cachedMerkleRoot ?? 0n, 256)
    .storeUint(cfg.cachedEpoch ?? 0, 32)
    .storeUint(cfg.signerPubkey, 256)
    .endCell();
  return beginCell()
    .storeCoins(cfg.balance ?? 0n)
    .storeAddress(cfg.owner)
    .storeAddress(cfg.master)
    .storeRef(cfg.walletCode)
    .storeRef(rolling)
    .endCell();
}

export class RollingMintlessWallet implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address): RollingMintlessWallet {
    return new RollingMintlessWallet(address);
  }

  static createFromConfig(
    cfg: RollingMintlessWalletConfig,
    code: Cell,
    workchain = 0,
  ): RollingMintlessWallet {
    const data = rollingMintlessWalletConfigToCell(cfg);
    const init = { code, data };
    return new RollingMintlessWallet(contractAddress(workchain, init), init);
  }

  /**
   * Send a TEP-74 `transfer` op with an optional `custom_payload`. Pass a
   * rolling-claim payload built via `buildRollingClaimPayload()` to trigger
   * a cumulative claim during the transfer.
   */
  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    params: {
      queryId?: bigint;
      jettonAmount: bigint;
      to: Address;
      responseAddress?: Address;
      customPayload?: Cell | null;
      forwardTonAmount?: bigint;
      forwardPayload?: Cell | null;
      value?: bigint;
    },
  ) {
    const body = beginCell()
      .storeUint(OpCodes.transfer, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(params.to)
      .storeAddress(params.responseAddress ?? via.address ?? null)
      .storeMaybeRef(params.customPayload ?? null)
      .storeCoins(params.forwardTonAmount ?? 1n)
      .storeMaybeRef(params.forwardPayload ?? null)
      .endCell();

    await provider.internal(via, {
      value: params.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    params: {
      queryId?: bigint;
      jettonAmount: bigint;
      responseAddress?: Address;
      value?: bigint;
    },
  ) {
    await provider.internal(via, {
      value: params.value ?? toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.burn, 32)
        .storeUint(params.queryId ?? 0n, 64)
        .storeCoins(params.jettonAmount)
        .storeAddress(params.responseAddress ?? via.address ?? null)
        .endCell(),
    });
  }

  // ---- getters ----

  async getWalletData(provider: ContractProvider): Promise<{
    balance: bigint;
    owner: Address;
    master: Address;
    walletCode: Cell;
  }> {
    const res = await provider.get('get_wallet_data', []);
    return {
      balance: res.stack.readBigNumber(),
      owner: res.stack.readAddress(),
      master: res.stack.readAddress(),
      walletCode: res.stack.readCell(),
    };
  }

  async getAlreadyClaimed(provider: ContractProvider): Promise<bigint> {
    const res = await provider.get('get_already_claimed', []);
    return res.stack.readBigNumber();
  }

  async getCachedRoot(provider: ContractProvider): Promise<{ root: bigint; epoch: number }> {
    const res = await provider.get('get_cached_root', []);
    return {
      root: res.stack.readBigNumber(),
      epoch: res.stack.readNumber(),
    };
  }

  async getSignerPubkey(provider: ContractProvider): Promise<bigint> {
    const res = await provider.get('get_signer_pubkey', []);
    return res.stack.readBigNumber();
  }
}

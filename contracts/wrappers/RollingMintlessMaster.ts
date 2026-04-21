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

export interface RollingMintlessMasterConfig {
  totalSupply: bigint;
  admin: Address;
  content: Cell;
  walletCode: Cell;
  merkleRoot?: bigint;
  epoch?: number;
  signerPubkey: bigint;
  isPaused?: boolean;
}

export function rollingMintlessMasterConfigToCell(cfg: RollingMintlessMasterConfig): Cell {
  const rolling = beginCell()
    .storeUint(cfg.merkleRoot ?? 0n, 256)
    .storeUint(cfg.epoch ?? 0, 32)
    .storeUint(cfg.signerPubkey, 256)
    .storeUint(cfg.isPaused ? 1 : 0, 1)
    .endCell();
  return beginCell()
    .storeCoins(cfg.totalSupply)
    .storeAddress(cfg.admin)
    .storeRef(cfg.content)
    .storeRef(cfg.walletCode)
    .storeRef(rolling)
    .endCell();
}

export class RollingMintlessMaster implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address): RollingMintlessMaster {
    return new RollingMintlessMaster(address);
  }

  static createFromConfig(
    cfg: RollingMintlessMasterConfig,
    code: Cell,
    workchain = 0,
  ): RollingMintlessMaster {
    const data = rollingMintlessMasterConfigToCell(cfg);
    const init = { code, data };
    return new RollingMintlessMaster(contractAddress(workchain, init), init);
  }

  // ---- admin ops ----

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint = toNano('0.1')) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendUpdateMerkleRoot(
    provider: ContractProvider,
    via: Sender,
    params: {
      queryId?: bigint;
      newRoot: bigint;
      newEpoch: number;
      value?: bigint;
    },
  ) {
    await provider.internal(via, {
      value: params.value ?? toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.updateMerkleRoot, 32)
        .storeUint(params.queryId ?? 0n, 64)
        .storeUint(params.newRoot, 256)
        .storeUint(params.newEpoch, 32)
        .endCell(),
    });
  }

  async sendUpdateSigner(
    provider: ContractProvider,
    via: Sender,
    params: { queryId?: bigint; newSignerPubkey: bigint; value?: bigint },
  ) {
    await provider.internal(via, {
      value: params.value ?? toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.updateSigner, 32)
        .storeUint(params.queryId ?? 0n, 64)
        .storeUint(params.newSignerPubkey, 256)
        .endCell(),
    });
  }

  async sendPause(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(OpCodes.pause, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendUnpause(provider: ContractProvider, via: Sender, queryId = 0n) {
    await provider.internal(via, {
      value: toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(OpCodes.unpause, 32).storeUint(queryId, 64).endCell(),
    });
  }

  async sendChangeAdmin(provider: ContractProvider, via: Sender, newAdmin: Address) {
    await provider.internal(via, {
      value: toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.changeAdmin, 32)
        .storeUint(0, 64)
        .storeAddress(newAdmin)
        .endCell(),
    });
  }

  async sendChangeContent(provider: ContractProvider, via: Sender, newContent: Cell) {
    await provider.internal(via, {
      value: toNano('0.02'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.changeContent, 32)
        .storeUint(0, 64)
        .storeRef(newContent)
        .endCell(),
    });
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    params: {
      to: Address;
      jettonAmount: bigint;
      forwardTonAmount?: bigint;
      totalTonAmount?: bigint;
      queryId?: bigint;
    },
  ) {
    const forwardTonAmount = params.forwardTonAmount ?? toNano('0.02');
    const totalTonAmount = params.totalTonAmount ?? toNano('0.1');
    const masterMsg = beginCell()
      .storeUint(OpCodes.internalTransfer, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(null)
      .storeAddress(this.address)
      .storeCoins(forwardTonAmount)
      .storeMaybeRef(null)
      .endCell();

    await provider.internal(via, {
      value: totalTonAmount + toNano('0.05'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(OpCodes.mint, 32)
        .storeUint(params.queryId ?? 0n, 64)
        .storeAddress(params.to)
        .storeCoins(totalTonAmount)
        .storeRef(masterMsg)
        .endCell(),
    });
  }

  // ---- get methods ----

  async getJettonData(provider: ContractProvider): Promise<{
    totalSupply: bigint;
    mintable: boolean;
    admin: Address;
    content: Cell;
    walletCode: Cell;
  }> {
    const res = await provider.get('get_jetton_data', []);
    return {
      totalSupply: res.stack.readBigNumber(),
      mintable: res.stack.readNumber() !== 0,
      admin: res.stack.readAddress(),
      content: res.stack.readCell(),
      walletCode: res.stack.readCell(),
    };
  }

  async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
    const res = await provider.get('get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
    ]);
    return res.stack.readAddress();
  }

  async getMerkleRoot(provider: ContractProvider): Promise<{ root: bigint; epoch: number }> {
    const res = await provider.get('get_merkle_root', []);
    return {
      root: res.stack.readBigNumber(),
      epoch: res.stack.readNumber(),
    };
  }

  async getSignerPubkey(provider: ContractProvider): Promise<bigint> {
    const res = await provider.get('get_signer_pubkey', []);
    return res.stack.readBigNumber();
  }

  async getIsPaused(provider: ContractProvider): Promise<boolean> {
    const res = await provider.get('get_is_paused', []);
    return res.stack.readNumber() !== 0;
  }
}

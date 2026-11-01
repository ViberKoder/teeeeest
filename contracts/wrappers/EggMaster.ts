import {
  Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano,
} from '@ton/core';
import { Op } from './OpCodes';

export interface EggMasterConfig {
  totalSupply?: bigint;
  /** 0 = uncapped */
  maxSupply: bigint;
  admin: Address;
  content: Cell;
  walletCode: Cell;
  /** cold authority public key as 256-bit integer */
  authority: bigint;
}

export function eggMasterConfigToCell(c: EggMasterConfig): Cell {
  return beginCell()
    .storeCoins(c.totalSupply ?? 0n)
    .storeCoins(c.maxSupply)
    .storeAddress(c.admin)
    .storeRef(c.content)
    .storeRef(c.walletCode)
    .storeUint(c.authority, 256)
    .endCell();
}

/** TEP-64 off-chain content cell: `0x01` + URI. */
export function offchainContent(uri: string): Cell {
  return beginCell().storeUint(1, 8).storeStringTail(uri).endCell();
}

export class EggMaster implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address) {
    return new EggMaster(address);
  }

  static createFromConfig(cfg: EggMasterConfig, code: Cell, workchain = 0) {
    const data = eggMasterConfigToCell(cfg);
    return new EggMaster(contractAddress(workchain, { code, data }), { code, data });
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value = toNano('0.05')) {
    await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: beginCell().endCell() });
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    p: { to: Address; jettonAmount: bigint; value?: bigint; walletTon?: bigint; queryId?: bigint },
  ) {
    const transfer = beginCell()
      .storeUint(Op.internalTransfer, 32)
      .storeUint(p.queryId ?? 0n, 64)
      .storeCoins(p.jettonAmount)
      .storeAddress(null)
      .storeAddress(via.address ?? null)
      .storeCoins(0)
      .storeBit(0)
      .endCell();
    await provider.internal(via, {
      value: p.value ?? toNano('0.1'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Op.mint, 32)
        .storeUint(p.queryId ?? 0n, 64)
        .storeAddress(p.to)
        .storeCoins(p.walletTon ?? toNano('0.05'))
        .storeRef(transfer)
        .endCell(),
    });
  }

  async sendChangeAdmin(provider: ContractProvider, via: Sender, admin: Address) {
    await provider.internal(via, {
      value: toNano('0.03'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Op.changeAdmin, 32).storeUint(0, 64).storeAddress(admin).endCell(),
    });
  }

  async sendChangeContent(provider: ContractProvider, via: Sender, content: Cell) {
    await provider.internal(via, {
      value: toNano('0.03'),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Op.changeContent, 32).storeUint(0, 64).storeRef(content).endCell(),
    });
  }

  async getJettonData(provider: ContractProvider) {
    const r = (await provider.get('get_jetton_data', [])).stack;
    return {
      totalSupply: r.readBigNumber(),
      mintable: r.readBigNumber() !== 0n,
      admin: r.readAddress(),
      content: r.readCell(),
      walletCode: r.readCell(),
    };
  }

  async getWalletAddress(provider: ContractProvider, owner: Address) {
    const r = await provider.get('get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
    ]);
    return r.stack.readAddress();
  }

  async getMaxSupply(provider: ContractProvider) {
    return (await provider.get('get_max_supply', [])).stack.readBigNumber();
  }

  async getAuthority(provider: ContractProvider) {
    return (await provider.get('get_authority', [])).stack.readBigNumber();
  }
}

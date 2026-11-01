import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { Op } from './OpCodes';
import { Attach, claimBody, EggWalletConfig, eggWalletStateInit, jettonTransferBody } from './messages';

export class EggWallet implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address) {
    return new EggWallet(address);
  }

  /** A wallet that is not on-chain yet: the first message carries its StateInit. */
  static createFromConfig(c: EggWalletConfig) {
    const { init, address } = eggWalletStateInit(c);
    return new EggWallet(address, init);
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    p: {
      jettonAmount: bigint;
      to: Address;
      responseAddress?: Address;
      claim?: Cell | null;
      forwardTon?: bigint;
      forwardPayload?: Cell | null;
      value?: bigint;
      queryId?: bigint;
    },
  ) {
    const body = jettonTransferBody({
      queryId: p.queryId,
      amount: p.jettonAmount,
      to: p.to,
      responseTo: p.responseAddress ?? via.address!,
      claim: p.claim,
      forwardTon: p.forwardTon,
      forwardPayload: p.forwardPayload,
    });
    await provider.internal(via, {
      value: p.value ?? (p.claim ? Attach.transferWithClaim : Attach.transfer),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  /** Apply a claim without moving tokens. */
  async sendClaim(provider: ContractProvider, via: Sender, claim: Cell, value = Attach.claim, queryId = 0n) {
    await provider.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: claimBody(claim, queryId) });
  }

  async sendBurn(provider: ContractProvider, via: Sender, amount: bigint, value = toNano('0.05')) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Op.burn, 32).storeUint(0, 64).storeCoins(amount).storeAddress(via.address ?? null).endCell(),
    });
  }

  async getWalletData(provider: ContractProvider) {
    const r = (await provider.get('get_wallet_data', [])).stack;
    return { balance: r.readBigNumber(), owner: r.readAddress(), master: r.readAddress(), code: r.readCell() };
  }

  async getClaimState(provider: ContractProvider) {
    const r = (await provider.get('get_claim_state', [])).stack;
    return { claimed: r.readBigNumber(), keyFloor: Number(r.readBigNumber()), authority: r.readBigNumber() };
  }
}

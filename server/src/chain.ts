import { Address, Cell, internal, SendMode, StateInit, toNano, TonClient, WalletContractV5R1 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

/** The only things the publisher needs from the blockchain. Tests use a sandbox implementation. */
export interface Chain {
  /** `get_last_epoch` of the minter */
  lastEpoch(): Promise<number>;
  /** `get_root(epoch).commitment`, or null if that epoch is not on-chain */
  commitment(epoch: number): Promise<Buffer | null>;
  /** send a `PublishRoot` message from the publisher wallet to the minter */
  publish(body: Cell): Promise<void>;
  /** is there a contract at this address? */
  isDeployed(address: Address): Promise<boolean>;
  /** TON balance in nanoTON (0 for an unknown account) */
  balance(address: Address): Promise<bigint>;
  /** deliver a signed gasless request to a player's wallet from the relayer wallet, paying `value` */
  relay(to: Address, body: Cell, value: bigint, init?: StateInit): Promise<void>;
}

export class TonChain implements Chain {
  private readonly client: TonClient;
  private readonly minter: Address;

  constructor(opts: { minter: string; network: 'testnet' | 'mainnet'; apiKey?: string; mnemonic: string; relayerMnemonic?: string }) {
    this.publisherMnemonic = opts.mnemonic;
    this.relayerMnemonic = opts.relayerMnemonic ?? '';
    this.minter = Address.parse(opts.minter);
    this.client = new TonClient({
      endpoint: opts.network === 'testnet' ? 'https://testnet.toncenter.com/api/v2/jsonRPC' : 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: opts.apiKey || undefined,
    });
    this.network = opts.network;
  }
  private readonly network: 'testnet' | 'mainnet';
  private readonly publisherMnemonic: string;
  private readonly relayerMnemonic: string;

  async lastEpoch() {
    const r = await this.client.runMethod(this.minter, 'get_last_epoch');
    return Number(r.stack.readBigNumber());
  }

  async commitment(epoch: number) {
    try {
      const r = await this.client.runMethod(this.minter, 'get_root', [{ type: 'int', value: BigInt(epoch) }]);
      return Buffer.from(r.stack.readBigNumber().toString(16).padStart(64, '0'), 'hex');
    } catch {
      return null; // exit code: unknown epoch
    }
  }

  async publish(body: Cell) {
    const keys = await mnemonicToPrivateKey(this.publisherMnemonic.trim().split(/\s+/));
    const wallet = this.client.open(
      WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: this.network === 'testnet' ? -3 : -239 } }),
    );
    await wallet.sendTransfer({
      seqno: await wallet.getSeqno(),
      secretKey: keys.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [internal({ to: this.minter, value: toNano('0.05'), bounce: true, body })],
    });
  }

  async isDeployed(address: Address) {
    return this.client.isContractDeployed(address);
  }

  async balance(address: Address) {
    return this.client.getBalance(address);
  }

  async relay(to: Address, body: Cell, value: bigint, init?: StateInit) {
    if (!this.relayerMnemonic) throw new Error('relayer is not configured');
    const keys = await mnemonicToPrivateKey(this.relayerMnemonic.trim().split(/\s+/));
    const wallet = this.client.open(
      WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: this.network === 'testnet' ? -3 : -239 } }),
    );
    await wallet.sendTransfer({
      seqno: await wallet.getSeqno(),
      secretKey: keys.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [internal({ to, value, bounce: false, body, init })],
    });
  }
}

/**
 * Transaction construction and broadcasting.
 *
 * The wallet keeps signing strictly local: the seed is decrypted, the
 * external message is signed in-process, the BoC is broadcast via
 * Toncenter, and the seed copy is wiped immediately.
 *
 * RMJ integration lives here too: `buildJettonTransfer` accepts an optional
 * `customPayload` BoC + `stateInit` (for the first claim) and assembles the
 * exact TEP-74 body the jetton-wallet expects.
 */

import {
  Address,
  beginCell,
  Cell,
  internal,
  SendMode,
  toNano,
} from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';

import { getTonClient, type Network } from './ton';
import { sendBoc } from './ton';
import { keyring } from '../state/keyring';

const OP_JETTON_TRANSFER = 0x0f8a7ea5;

/** ≈0.05 TON covers a standard wallet-v5 + jetton-wallet message hop. */
export const DEFAULT_JETTON_GAS_NANO = toNano('0.05');
/** When a jetton-wallet needs to be deployed on first RMJ claim, bump gas. */
export const DEFAULT_RMJ_CLAIM_GAS_NANO = toNano('0.1');

export interface BuildTonTransferInput {
  network: Network;
  fromAddress: string;
  toAddress: string;
  amountNano: bigint;
  comment?: string | null;
  bounce?: boolean;
}

export interface BuildJettonTransferInput {
  network: Network;
  fromOwner: string;
  jettonWallet: string;
  toOwner: string;
  jettonAmountNano: bigint;
  /** Extra TON attached to the jetton-wallet message (covers gas). */
  attachedTonNano?: bigint;
  /** Forward-amount that triggers a transfer-notification (1 nanoTON enables it). */
  forwardTonAmountNano?: bigint;
  forwardCommentText?: string | null;
  /** Optional RMJ custom_payload (base64 BoC) attached as `custom_payload` ref. */
  customPayloadBase64?: string | null;
  /** Optional jetton-wallet StateInit (base64 BoC) for first-time deployment. */
  jettonWalletStateInitBase64?: string | null;
}

function commentCell(text: string): Cell {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell();
}

function buildJettonTransferBody(input: {
  queryId?: bigint;
  jettonAmountNano: bigint;
  toOwner: Address;
  responseAddress: Address | null;
  forwardTonAmountNano: bigint;
  forwardPayload: Cell | null;
  customPayload: Cell | null;
}): Cell {
  return beginCell()
    .storeUint(OP_JETTON_TRANSFER, 32)
    .storeUint(input.queryId ?? BigInt(Math.floor(Date.now() / 1000)), 64)
    .storeCoins(input.jettonAmountNano)
    .storeAddress(input.toOwner)
    .storeAddress(input.responseAddress)
    .storeMaybeRef(input.customPayload)
    .storeCoins(input.forwardTonAmountNano)
    .storeMaybeRef(input.forwardPayload)
    .endCell();
}

async function sendInternalMessages(
  network: Network,
  publicKey: Buffer,
  secretKey: Buffer,
  messages: Array<{
    to: Address;
    value: bigint;
    body?: Cell | null;
    init?: { code: Cell; data: Cell } | null;
    bounce: boolean;
  }>,
): Promise<void> {
  const client = getTonClient(network);
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey });
  const contract = client.open(wallet);

  let seqno = 0;
  try {
    seqno = await contract.getSeqno();
  } catch (e: any) {
    // Uninit wallet — `sendTransfer` will carry the StateInit automatically.
    if (!/Inactive|state|exit_code/i.test(String(e?.message ?? e))) throw e;
  }

  /**
   * `WalletContractV5R1.sendTransfer` builds the signed external-in message
   * (attaching `state_init` on first use) and pushes it through the
   * `ContractProvider`, which under TonClient ends up as a `sendBoc` call.
   * That is exactly what we want — we just need to make sure the same
   * Toncenter endpoint is used by both code paths.
   */
  await contract.sendTransfer({
    seqno,
    secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: messages.map((m) =>
      internal({
        to: m.to,
        value: m.value,
        body: m.body ?? undefined,
        init: m.init ?? undefined,
        bounce: m.bounce,
      }),
    ),
  });
  void sendBoc;
}

function stateInitFromBase64(b64: string): { code: Cell; data: Cell } {
  /**
   * `state_init` BoCs returned by the RMJ Proof API are wrapped as a single
   * StateInit cell with two refs: code, data.  This is the on-chain encoding
   * (`storeStateInit` from @ton/core).  We unwrap it back into a usable pair.
   */
  const cell = Cell.fromBase64(b64);
  const slice = cell.beginParse();
  /**
   * Skip the prefix bits the StateInit serializer emits:
   *   split_depth   bit
   *   special       bit
   *   code present  bit (we always have code → 1)
   *   data present  bit (we always have data → 1)
   *   library       bit (we have no libs → 0)
   */
  slice.loadBit();
  slice.loadBit();
  const hasCode = slice.loadBit();
  const hasData = slice.loadBit();
  slice.loadBit();
  if (!hasCode || !hasData) {
    throw new Error('state_init missing code or data');
  }
  const code = slice.loadRef();
  const data = slice.loadRef();
  return { code, data };
}

export async function broadcastTonTransfer(input: BuildTonTransferInput): Promise<void> {
  await keyring.withSeed(async (seed) => {
    const kp = keyPairFromSeed(Buffer.from(seed));
    await sendInternalMessages(
      input.network,
      kp.publicKey,
      kp.secretKey,
      [
        {
          to: Address.parse(input.toAddress),
          value: input.amountNano,
          body: input.comment ? commentCell(input.comment) : null,
          init: null,
          bounce: input.bounce ?? false,
        },
      ],
    );
  });
}

export async function broadcastJettonTransfer(input: BuildJettonTransferInput): Promise<void> {
  await keyring.withSeed(async (seed) => {
    const kp = keyPairFromSeed(Buffer.from(seed));
    const customPayload = input.customPayloadBase64
      ? Cell.fromBase64(input.customPayloadBase64)
      : null;
    const init = input.jettonWalletStateInitBase64
      ? stateInitFromBase64(input.jettonWalletStateInitBase64)
      : null;

    const forwardTon = input.forwardTonAmountNano ?? 1n;
    const forwardPayload = input.forwardCommentText
      ? commentCell(input.forwardCommentText)
      : null;

    const body = buildJettonTransferBody({
      jettonAmountNano: input.jettonAmountNano,
      toOwner: Address.parse(input.toOwner),
      responseAddress: Address.parse(input.fromOwner),
      forwardTonAmountNano: forwardTon,
      forwardPayload,
      customPayload,
    });

    const attachedTon =
      input.attachedTonNano ??
      (init || customPayload ? DEFAULT_RMJ_CLAIM_GAS_NANO : DEFAULT_JETTON_GAS_NANO);

    await sendInternalMessages(
      input.network,
      kp.publicKey,
      kp.secretKey,
      [
        {
          to: Address.parse(input.jettonWallet),
          value: attachedTon,
          body,
          init,
          /**
           * For uninit jetton-wallets we MUST set bounce=false so the deploy
           * lands.  For already-active wallets bounce=true is correct so a
           * failed transfer refunds excess TON.
           */
          bounce: !init,
        },
      ],
    );
  });
}

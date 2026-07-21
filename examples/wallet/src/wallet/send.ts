import { Address, Cell, beginCell } from '@ton/core';
import { internal, WalletContractV4 } from '@ton/ton';
import type { KeyPair } from '@ton/crypto';
import { getTonClient } from './tonClient';
import { stateInitFromBoc } from './stateInit';

export interface OutgoingMessage {
  to: string;
  amountNano: bigint;
  /** Base64 BoC body cell. */
  payloadB64?: string;
  /** Base64 StateInit BoC for first-time contract deploy. */
  stateInitB64?: string;
}

function commentBody(comment: string): Cell {
  return beginCell().storeUint(0, 32).storeStringTail(comment.trim().slice(0, 120)).endCell();
}

export async function sendTonTransfer(
  contract: WalletContractV4,
  keyPair: KeyPair,
  params: { to: string; amountNano: bigint; comment?: string },
): Promise<void> {
  await sendMessages(contract, keyPair, [
    {
      to: params.to,
      amountNano: params.amountNano,
      payloadB64: params.comment?.trim() ? commentBody(params.comment).toBoc().toString('base64') : undefined,
    },
  ]);
}

export async function sendMessages(
  contract: WalletContractV4,
  keyPair: KeyPair,
  messages: OutgoingMessage[],
): Promise<void> {
  if (messages.length === 0) throw new Error('No messages to send.');
  if (messages.length > 4) throw new Error('Wallet V4 supports up to 4 messages per transfer.');

  const client = getTonClient();
  const opened = client.open(contract);
  const seqno = await opened.getSeqno();

  await opened.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: messages.map((m) => {
      const init = m.stateInitB64 ? stateInitFromBoc(m.stateInitB64) : undefined;
      const body = m.payloadB64 ? Cell.fromBase64(m.payloadB64) : undefined;
      return internal({
        to: Address.parse(m.to),
        value: m.amountNano,
        bounce: true,
        init,
        body,
      });
    }),
  });
}

export async function getWalletSeqno(contract: WalletContractV4): Promise<number> {
  const client = getTonClient();
  return client.open(contract).getSeqno();
}

export async function isWalletDeployed(contract: WalletContractV4): Promise<boolean> {
  const client = getTonClient();
  const st = await client.getContractState(contract.address);
  return st.state === 'active';
}

import { Address } from '@ton/core';
import { cfg } from '../config';
import { tonapiFetch } from './tonapi';

export interface Activity {
  id: string;
  kind: 'ton' | 'egg';
  direction: 'in' | 'out';
  amount: bigint;
  symbol: string;
  decimals: number;
  peer: string;
  time: number;
  comment?: string;
  /** set for activity the app knows about itself, e.g. a hatch */
  label?: 'hatch';
  failed: boolean;
}

interface TonApiAction {
  type: string;
  status: string;
  TonTransfer?: { sender: { address: string }; recipient: { address: string }; amount: number; comment?: string };
  JettonTransfer?: {
    sender?: { address: string };
    recipient?: { address: string };
    amount: string;
    comment?: string;
    jetton: { address: string; symbol: string; decimals: number };
  };
}

/** Recent activity from TonAPI (events are already parsed into actions there). */
export async function loadActivity(owner: Address, master: Address | null): Promise<Activity[]> {
  const me = owner.toRawString();
  const res = await tonapiFetch(`/v2/accounts/${encodeURIComponent(me)}/events?limit=25&subject_only=true`);
  if (!res.ok) throw new Error('history unavailable');
  const data = (await res.json()) as { events: { event_id: string; timestamp: number; actions: TonApiAction[] }[] };
  const out: Activity[] = [];
  for (const ev of data.events) {
    for (const a of ev.actions) {
      const failed = a.status !== 'ok';
      if (a.type === 'TonTransfer' && a.TonTransfer) {
        const t = a.TonTransfer;
        const out_ = Address.parseRaw(t.sender.address).toRawString() === me;
        out.push({
          id: ev.event_id + ':ton',
          kind: 'ton',
          direction: out_ ? 'out' : 'in',
          amount: BigInt(t.amount),
          symbol: cfg.ton.symbol,
          decimals: 9,
          peer: out_ ? t.recipient.address : t.sender.address,
          time: ev.timestamp,
          comment: t.comment,
          failed,
        });
      } else if (a.type === 'JettonTransfer' && a.JettonTransfer) {
        const t = a.JettonTransfer;
        if (master && Address.parseRaw(t.jetton.address).toRawString() !== master.toRawString()) continue;
        const sender = t.sender ? Address.parseRaw(t.sender.address).toRawString() : '';
        const out_ = sender === me;
        out.push({
          id: ev.event_id + ':jetton',
          kind: 'egg',
          direction: out_ ? 'out' : 'in',
          amount: BigInt(t.amount),
          symbol: t.jetton.symbol,
          decimals: t.jetton.decimals,
          peer: (out_ ? t.recipient?.address : t.sender?.address) ?? '',
          time: ev.timestamp,
          comment: t.comment,
          failed,
        });
      }
    }
  }
  return out;
}

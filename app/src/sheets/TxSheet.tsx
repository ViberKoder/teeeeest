import type { Activity } from '../chain/history';
import { endpoints } from '../config';
import { clock, formatUnits, shortAddr } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { Amount, TxCoin, txTitle } from '../ui/Tx';
import { Copy, External } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';

/** One transaction in full: the coin, the amount, who, when, and the proof on the blockchain. */
export function TxSheet({ a, onClose }: { a: Activity; onClose: () => void }) {
  const toast = useToast();
  const hash = a.id.split(':')[0];
  const full = a.peer;
  const date = new Date(a.time * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const copy = (t: string, m: string) => { void navigator.clipboard?.writeText(t); haptic.success(); toast(m); };
  const earned = a.label === 'hatch';
  return (
    <Sheet onClose={onClose} title={txTitle(a)} footer={!earned ? <button className="btn-main wide" onClick={() => openExternal(`${endpoints.explorer}/transaction/${hash}`)}><External width={19} height={19} />View on the blockchain</button> : undefined}>
      <div className="tx-hero">
        <TxCoin a={a} size={84} />
        <Amount a={a} big />
        <span className={`status ${a.failed ? 'bad' : 'ok'}`}>{a.failed ? 'Failed' : earned ? 'Verified by the blockchain' : 'Completed'}</span>
      </div>
      <div className="card list-card">
        <div className="kv"><span>Date</span><b>{date}, {clock(a.time)}</b></div>
        {full && !earned && (
          <div className="kv"><span>{a.direction === 'in' ? 'From' : 'To'}</span>
            <b className="num link" onClick={() => copy(full.replace(/^0:/, ''), 'Address copied')}>{shortAddr(full.replace(/^0:/, ''), 6, 6)}<Copy width={14} height={14} /></b></div>
        )}
        {a.comment && !earned && <div className="kv"><span>Comment</span><b>{a.comment}</b></div>}
        <div className="kv"><span>Asset</span><b>{a.kind === 'egg' ? 'EGG' : 'Gram'}</b></div>
        {!earned && <div className="kv"><span>Amount</span><b className="num">{formatUnits(a.amount, a.decimals, 9)} {a.kind === 'egg' ? a.symbol : 'Gram'}</b></div>}
      </div>
    </Sheet>
  );
}

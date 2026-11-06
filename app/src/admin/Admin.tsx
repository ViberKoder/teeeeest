import { Address, toNano } from '@ton/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { changeAdminBody, changeMetadataBody, changePublisherKeyBody, claimAdminBody, dropAdminBody, eggMinterCode, minterStateInit, onchainMetadata, setLimitsBody, topUpBody } from '@egg/sdk';
import { api, ApiError } from '../api/server';
import { ton } from '../chain/client';
import { cfg, endpoints } from '../config';
import { formatUnits, parseUnits as parse } from '../lib/format';

/** exact decimal -> units; throws on a bad number (callers catch) */
const parseUnits = (v: string, d: number): bigint => {
  const r = parse(v, d);
  if (r === null) throw new Error('bad number');
  return r;
};
import { NeedTonError } from '../provider/tg';
import { useWallet } from '../state/wallet';
import { useToast } from '../ui/toast';
import { Overview, readToken, TokenInfo } from './data';

const egg = (v: bigint, f = 2) => formatUnits(v, 9, f);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const errText = (e: unknown) => (e instanceof ApiError ? e.code.replace(/-/g, ' ') : e instanceof NeedTonError ? 'Your wallet needs a little TON for the network fee' : e instanceof Error ? e.message : 'failed');
const TABS = ['Overview', 'Token', 'Game', 'Posts', 'Players', 'Team', 'Log'] as const;
type Tab = (typeof TABS)[number];

function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card">
      {title && <header><h3>{title}</h3>{right}</header>}
      {children}
    </section>
  );
}
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="field"><span>{label}</span>{children}{hint && <em>{hint}</em>}</label>
);
const Stat = ({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) => (
  <div className="stat"><span>{k}</span><b>{v}</b>{sub && <em>{sub}</em>}</div>
);
const Btn = ({ children, onClick, kind, disabled }: { children: React.ReactNode; onClick?: () => void; kind?: 'danger' | 'ghost'; disabled?: boolean }) => (
  <button className={`abtn ${kind ?? ''}`} onClick={onClick} disabled={disabled}>{children}</button>
);

export function Admin() {
  const w = useWallet();
  const toast = useToast();
  const [ov, setOv] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>('Overview');

  const load = useCallback(async () => {
    try {
      setOv(await api.admin<Overview>({ action: 'overview' }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'forbidden') setDenied(true);
      else toast(errText(e));
    }
  }, [toast]);
  useEffect(() => { if (api.available()) void load(); }, [load]);

  if (!api.available()) return <div className="gate"><h1>Hatch Admin</h1><p>Open this page from the bot: send <code>/admin</code> to the bot.</p></div>;
  if (denied) return <div className="gate"><h1>Admins only</h1><p>This Telegram account is not an admin of the project.</p></div>;
  if (w.phase !== 'ready') return <div className="gate"><h1>Hatch Admin</h1><p>{w.phase === 'boot' || w.phase === 'adopting' ? 'Opening your wallet…' : 'Open the wallet first (it holds the key that signs token operations).'}</p></div>;
  if (!ov) return <div className="gate"><h1>Hatch Admin</h1><p>Loading…</p></div>;

  return (
    <div className="adm">
      <aside>
        <div className="brand"><span>🥚</span><b>Hatch Admin</b></div>
        <nav>{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
        <div className="me">
          <span>You</span><b>{ov.me}</b>
          <span>Wallet</span><b className="mono">{w.provider!.address.toString({ bounceable: false, testOnly: ov.network === 'testnet' }).slice(0, 8)}…</b>
          <span>TON</span><b>{formatUnits(w.data.ton, 9, 3)}</b>
          <a href="/" className="lnk">Wallet</a><a href="/explorer/" className="lnk">Explorer</a>
        </div>
      </aside>
      <main>
        {tab === 'Overview' && <OverviewTab ov={ov} reload={load} />}
        {tab === 'Token' && <TokenTab ov={ov} reload={load} />}
        {tab === 'Game' && <GameTab ov={ov} reload={load} />}
        {tab === 'Posts' && <PostsTab ov={ov} reload={load} />}
        {tab === 'Players' && <PlayersTab />}
        {tab === 'Team' && <TeamTab ov={ov} reload={load} />}
        {tab === 'Log' && <LogTab ov={ov} />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ overview
function OverviewTab({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const toast = useToast();
  const run = async (action: string, ok: string) => { try { await api.admin({ action }); toast(ok); await reload(); } catch (e) { toast(errText(e)); } };
  const s = ov.stats;
  return (
    <>
      <h1>Overview</h1>
      <div className="stats">
        <Stat k="Players" v={s.users} sub={`+${s.newUsersToday} today`} />
        <Stat k="Wallets linked" v={s.wallets} />
        <Stat k="EGG promised" v={formatUnits(BigInt(s.promised), 9, 0)} sub={`${s.events} events`} />
        <Stat k="Hatches last hour" v={s.hatchesLastHour} />
        <Stat k="Posts" v={s.posts} sub={`${s.views} views · ${s.reactions} reactions`} />
        <Stat k="Banned" v={ov.banned} />
      </div>
      <div className="grid2">
        <Card title="Health">
          <div className="rows">
            <div><span>Blockchain API</span><b className={ov.health.chain ? 'ok' : 'bad'}>{ov.health.chain ? 'reachable' : 'unreachable'}</b></div>
            <div><span>Bot wallet (pays fees, writes the beacon)</span><b>{formatUnits(BigInt(ov.health.vault || 0), 9, 3)} TON</b></div>
            <div><span>Signing key</span><b className="mono">{ov.publisherKey.slice(0, 10)}…{ov.publisherKey.slice(-6)}</b></div>
            <div><span>Active token</span><b className="mono">{ov.minter.slice(0, 10)}…{ov.minter.slice(-6)}</b></div>
          </div>
          <div className="actions">
            <Btn onClick={() => void run('ops.root', 'Root signed')}>Sign a new root now</Btn>
            <Btn kind="ghost" onClick={() => void run('ops.beacon', 'Beacon requested')}>Write the beacon now</Btn>
            <Btn kind="ghost" onClick={() => void run('ops.notify', 'Message sent')}>Test the bot → me</Btn>
          </div>
          {BigInt(ov.health.vault || 0) < toNano('0.3') && <p className="warn">The bot wallet is low on TON — it pays first network fees and the stats beacon. Send some to <span className="mono">{ov.vault}</span>.</p>}
        </Card>
        <Card title="Signed roots (newest)">
          <table><thead><tr><th>#</th><th>Total</th><th>When</th></tr></thead><tbody>
            {ov.roots.map((r) => <tr key={r.seq}><td>{r.seq}</td><td>{formatUnits(BigInt(r.total), 9, 2)} EGG</td><td>{ago(r.at)}</td></tr>)}
          </tbody></table>
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ token
function TokenTab({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const w = useWallet();
  const toast = useToast();
  const [t, setT] = useState<TokenInfo | null>(null);
  const [busy, setBusy] = useState('');
  const me = w.provider!.address;

  const refresh = useCallback(async () => { try { setT(await readToken(cfg.master || ov.minter)); } catch { toast('Could not read the token'); } }, [ov.minter, toast]);
  useEffect(() => { void refresh(); }, [refresh]);

  /** Sends one message from the admin's own wallet, then waits for the chain to show the change. */
  const send = async (label: string, body: ReturnType<typeof dropAdminBody>, changed: () => Promise<boolean>) => {
    if (!t) return;
    setBusy(label);
    try {
      await w.provider!.send([{ to: t.address, value: toNano('0.05'), bounce: true, body }]);
      toast(`${label}: sent`);
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (await changed().catch(() => false)) { await refresh(); toast(`${label}: done`); return; }
      }
      toast(`${label}: not visible on-chain yet — check again in a minute`);
      await refresh();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy('');
    }
  };

  const isAdmin = !!t?.admin && t.admin.equals(me);
  const isNext = !!t?.nextAdmin && t.nextAdmin.equals(me);
  return (
    <>
      <h1>Token</h1>
      {!t ? <Card><p>Reading the token contract…</p></Card> : (
        <>
          <Card title={`${t.name || 'Token'} · ${t.symbol}`} right={<a className="lnk" href={`${endpoints.explorer}/${cfg.master}`} target="_blank" rel="noreferrer">Contract ↗</a>}>
            <div className="stats">
              <Stat k="Claimed (supply)" v={egg(t.supply, 0)} sub={`${t.holders} holders`} />
              <Stat k="Hard cap" v={egg(t.maxSupply, 0)} />
              <Stat k="Promised (max total)" v={egg(t.maxTotal, 0)} />
              <Stat k="Growth limit" v={`${egg(t.maxGrowth, 0)} / ${Math.round(t.periodSeconds / 60)}m`} sub={`${egg(t.windowGrowth, 0)} used`} />
              <Stat k="Per wallet" v={`${egg(t.walletDaily, 0)}/day`} sub={`+${egg(t.walletBurst, 0)} at launch`} />
              <Stat k="Signing key" v={<span className="mono">{t.publisherKey.slice(0, 8)}…</span>} sub={t.publisherKey === ov.publisherKey ? 'the bot’s key ✓' : 'NOT the bot’s key'} />
            </div>
            <div className="rows">
              <div><span>Admin</span><b className="mono">{t.admin ? t.admin.toString({ bounceable: false, testOnly: ov.network === 'testnet' }) : 'dropped — frozen for good'}</b></div>
              <div><span>Next admin (nominated)</span><b className="mono">{t.nextAdmin ? t.nextAdmin.toString({ bounceable: false, testOnly: ov.network === 'testnet' }) : '—'}</b></div>
              <div><span>Your wallet</span><b className={isAdmin ? 'ok' : 'bad'}>{isAdmin ? 'is the admin' : isNext ? 'is nominated — you can claim' : 'is NOT the admin'}</b></div>
              <div><span>Key frozen by a fraud proof</span><b className={t.frozen ? 'bad' : 'ok'}>{t.frozen ? 'FROZEN' : 'no'}</b></div>
            </div>
            {t.publisherKey !== ov.publisherKey && <p className="warn">This contract does not trust the bot’s signing key, so the bot can not serve it. Rotate the key below, or create a new token.</p>}
          </Card>

          <div className="grid2">
            <MetadataCard t={t} disabled={!isAdmin || !!busy} onSend={(md) => send('Metadata', changeMetadataBody(md), async () => (await readToken(cfg.master)).name !== t.name || (await readToken(cfg.master)).symbol !== t.symbol || (await readToken(cfg.master)).description !== t.description || (await readToken(cfg.master)).image !== t.image)} />
            <LimitsCard t={t} disabled={!isAdmin || !!busy} onSend={(p) => send('Limits', setLimitsBody(p), async () => (await readToken(cfg.master)).maxGrowth === p.maxGrowth && (await readToken(cfg.master)).walletDaily === p.walletDaily)} />
          </div>

          <div className="grid2">
            <KeyCard t={t} ov={ov} disabled={!isAdmin || !!busy} onSend={(k) => send('Signing key', changePublisherKeyBody(k), async () => (await readToken(cfg.master)).publisherKey === k.toString('hex'))} />
            <AdminCard t={t} disabled={!!busy} isAdmin={isAdmin} isNext={isNext} send={send} />
          </div>
        </>
      )}
      <CreateToken ov={ov} reload={reload} />
    </>
  );
}

function MetadataCard({ t, disabled, onSend }: { t: TokenInfo; disabled: boolean; onSend: (md: ReturnType<typeof onchainMetadata>) => void }) {
  const [f, setF] = useState({ name: t.name, symbol: t.symbol, description: t.description, image: t.image });
  useEffect(() => setF({ name: t.name, symbol: t.symbol, description: t.description, image: t.image }), [t.name, t.symbol, t.description, t.image]);
  return (
    <Card title="Name, symbol, picture">
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={32} /></Field>
      <Field label="Symbol"><input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} maxLength={12} /></Field>
      <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={140} /></Field>
      <Field label="Image URL" hint="https, square, at least 256×256"><input value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} /></Field>
      <div className="actions"><Btn disabled={disabled || !f.name || !f.symbol || (f.image !== '' && !/^https:\/\//.test(f.image))} onClick={() => onSend(onchainMetadata({ name: f.name, symbol: f.symbol, decimals: Number(t.decimals), description: f.description, image: f.image }))}>Update on-chain</Btn></div>
      <p className="hint">Explorers and wallets read this from the contract. Decimals ({t.decimals}) can not change.</p>
    </Card>
  );
}

function LimitsCard({ t, disabled, onSend }: { t: TokenInfo; disabled: boolean; onSend: (p: { maxGrowth: bigint; periodSeconds: number; walletDaily: bigint; walletBurst: bigint }) => void }) {
  const [f, setF] = useState({ g: egg(t.maxGrowth, 9), p: String(Math.round(t.periodSeconds / 60)), d: egg(t.walletDaily, 9), b: egg(t.walletBurst, 9) });
  const p = useMemo(() => {
    try { return { maxGrowth: parseUnits(f.g, 9), periodSeconds: Math.round(Number(f.p) * 60), walletDaily: parseUnits(f.d, 9), walletBurst: parseUnits(f.b, 9) }; } catch { return null; }
  }, [f]);
  const loosens = !p || p.maxGrowth > t.maxGrowth || p.periodSeconds < t.periodSeconds || p.walletDaily > t.walletDaily || p.walletBurst > t.walletBurst;
  return (
    <Card title="Limits (can only be tightened)">
      <Field label="Growth limit, EGG per period" hint={`now ${egg(t.maxGrowth, 0)}`}><input value={f.g} onChange={(e) => setF({ ...f, g: e.target.value })} inputMode="decimal" /></Field>
      <Field label="Period, minutes" hint={`now ${Math.round(t.periodSeconds / 60)}`}><input value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} inputMode="numeric" /></Field>
      <Field label="Per wallet, EGG per day" hint={`now ${egg(t.walletDaily, 0)}`}><input value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} inputMode="decimal" /></Field>
      <Field label="Per wallet at launch, EGG" hint={`now ${egg(t.walletBurst, 0)}`}><input value={f.b} onChange={(e) => setF({ ...f, b: e.target.value })} inputMode="decimal" /></Field>
      <div className="actions"><Btn disabled={disabled || loosens} onClick={() => p && onSend(p)}>Tighten on-chain</Btn></div>
      <p className="hint">{loosens ? 'The contract refuses anything looser than today’s values — a stolen admin key can never open the tap.' : 'Irreversible: limits can not be loosened later.'}</p>
    </Card>
  );
}

function KeyCard({ t, ov, disabled, onSend }: { t: TokenInfo; ov: Overview; disabled: boolean; onSend: (k: Buffer) => void }) {
  const [k, setK] = useState('');
  const ok = /^[0-9a-fA-F]{64}$/.test(k.trim());
  return (
    <Card title="Signing key">
      <div className="rows">
        <div><span>The contract trusts</span><b className="mono">{t.publisherKey.slice(0, 14)}…</b></div>
        <div><span>The bot signs with</span><b className="mono">{ov.publisherKey.slice(0, 14)}…</b></div>
        <div><span>Old key may still promise up to</span><b>{egg(t.legacyCap, 0)} EGG</b></div>
      </div>
      <Field label="New public key (hex, 64 chars)" hint="The bot can serve the token only if it holds the matching secret."><input value={k} onChange={(e) => setK(e.target.value)} placeholder={ov.publisherKey} spellCheck={false} /></Field>
      <div className="actions">
        <Btn kind="ghost" onClick={() => setK(ov.publisherKey)}>Use the bot’s key</Btn>
        <Btn disabled={disabled || !ok} onClick={() => onSend(Buffer.from(k.trim(), 'hex'))}>Rotate key</Btn>
      </div>
      <p className="hint">Roots signed by the old key stay claimable up to what it had already promised; it can promise nothing more. A rotation also lifts a fraud freeze.</p>
    </Card>
  );
}

function AdminCard({ t, disabled, isAdmin, isNext, send }: { t: TokenInfo; disabled: boolean; isAdmin: boolean; isNext: boolean; send: (label: string, body: ReturnType<typeof dropAdminBody>, changed: () => Promise<boolean>) => Promise<void> }) {
  const [next, setNext] = useState('');
  const [sure, setSure] = useState('');
  let parsed: Address | null = null;
  try { parsed = next.trim() ? Address.parse(next.trim()) : null; } catch { parsed = null; }
  return (
    <Card title="Admin role">
      <Field label="Hand the admin role to" hint="Two steps: you nominate, the new admin accepts. Nothing changes until then."><input value={next} onChange={(e) => setNext(e.target.value)} placeholder="UQ… wallet address" spellCheck={false} /></Field>
      <div className="actions">
        <Btn disabled={disabled || !isAdmin || !parsed} onClick={() => parsed && void send('Nominate admin', changeAdminBody(parsed), async () => (await readToken(cfg.master)).nextAdmin?.equals(parsed!) === true)}>Nominate</Btn>
        {isNext && <Btn disabled={disabled} onClick={() => void send('Claim admin', claimAdminBody(), async () => (await readToken(cfg.master)).admin?.equals(Address.parse('0:' + '0'.repeat(64))) === false)}>Accept the admin role</Btn>}
      </div>
      <hr />
      <Field label="Drop the admin for good" hint="Irreversible: key, limits and metadata freeze forever and nobody can change them. Type DROP to confirm."><input value={sure} onChange={(e) => setSure(e.target.value)} placeholder="DROP" /></Field>
      <div className="actions"><Btn kind="danger" disabled={disabled || !isAdmin || sure !== 'DROP' || !t.admin} onClick={() => void send('Drop admin', dropAdminBody(), async () => (await readToken(cfg.master)).admin === null)}>Drop admin forever</Btn></div>
    </Card>
  );
}

function CreateToken({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const w = useWallet();
  const toast = useToast();
  const [f, setF] = useState({ name: 'Egg', symbol: 'EGG', description: 'Hatch eggs. Earn EGG.', image: 'https://app8930916503.tgcloud.ai/icon.png', supply: '1000000000', growth: '2000000', period: '60', daily: '1000', burst: '1000' });
  const [stage, setStage] = useState<'form' | 'sending' | 'waiting' | 'ready'>('form');
  const [err, setErr] = useState('');
  const spec = useMemo(() => {
    try {
      const maxSupply = parseUnits(f.supply, 9), maxGrowth = parseUnits(f.growth, 9);
      const periodSeconds = Math.round(Number(f.period) * 60);
      const walletDaily = parseUnits(f.daily, 9), walletBurst = parseUnits(f.burst, 9);
      if (!f.name || !f.symbol || maxSupply <= 0n || maxGrowth <= 0n || maxGrowth > maxSupply || periodSeconds < 60) return null;
      const launchAt = Math.floor(Date.now() / 1000);
      const { init, address } = minterStateInit({
        maxSupply, admin: w.provider!.address, publisherKey: Buffer.from(ov.publisherKey, 'hex'), maxGrowth, periodSeconds, walletDaily, walletBurst, launchAt,
        metadata: onchainMetadata({ name: f.name, symbol: f.symbol, decimals: 9, description: f.description, image: f.image }),
      }, eggMinterCode);
      return { init, address };
    } catch { return null; }
    // launchAt changes with every render on purpose only when the form changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, ov.publisherKey]);

  const deploy = async () => {
    if (!spec) return;
    setStage('sending'); setErr('');
    try {
      await w.provider!.send([{ to: spec.address, value: toNano('0.15'), bounce: false, body: topUpBody(), init: spec.init }]);
      setStage('waiting');
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        if (await ton().isContractDeployed(spec.address).catch(() => false)) { setStage('ready'); return; }
      }
      setErr('Not deployed yet — wait a minute and check the address in the explorer.');
      setStage('form');
    } catch (e) {
      setErr(errText(e));
      setStage('form');
    }
  };
  const activate = async () => {
    if (!spec) return;
    try {
      await api.admin({ action: 'token.setActive', minter: spec.address.toRawString() });
      toast('The bot now serves the new token');
      await reload();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <Card title="Create a new token">
      <p className="hint">Deploys a fresh EGG-style jetton from <b>your wallet</b> as its admin. The bot’s signing key is set as the publisher. The token’s rules (signed roots, limits, fraud proofs) are fixed in its code.</p>
      <div className="form2">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={32} /></Field>
        <Field label="Symbol"><input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} maxLength={12} /></Field>
        <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={140} /></Field>
        <Field label="Image URL"><input value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} /></Field>
        <Field label="Hard cap, tokens" hint="Can never be raised"><input value={f.supply} onChange={(e) => setF({ ...f, supply: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Growth limit, tokens per period" hint="The most a stolen signing key could ever promise per period"><input value={f.growth} onChange={(e) => setF({ ...f, growth: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Period, minutes"><input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} inputMode="numeric" /></Field>
        <Field label="Per wallet per day"><input value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Per wallet at launch"><input value={f.burst} onChange={(e) => setF({ ...f, burst: e.target.value })} inputMode="decimal" /></Field>
      </div>
      <div className="rows">
        <div><span>Admin</span><b className="mono">your wallet</b></div>
        <div><span>Signing key</span><b className="mono">{ov.publisherKey.slice(0, 14)}… (the bot’s)</b></div>
        <div><span>Address</span><b className="mono">{spec ? spec.address.toString({ bounceable: false, testOnly: ov.network === 'testnet' }) : 'check the numbers'}</b></div>
        <div><span>Cost</span><b>≈ 0.15 TON (you have {formatUnits(w.data.ton, 9, 3)})</b></div>
      </div>
      {err && <p className="warn">{err}</p>}
      <div className="actions">
        {stage !== 'ready' && <Btn disabled={!spec || stage !== 'form'} onClick={() => void deploy()}>{stage === 'sending' ? 'Confirm in your wallet…' : stage === 'waiting' ? 'Deploying…' : 'Create the token'}</Btn>}
        {stage === 'ready' && <><span className="ok">Deployed ✓</span><Btn onClick={() => void activate()}>Use it in the bot</Btn></>}
      </div>
      <p className="hint">Switching the bot to a new token starts a new set of balances: players claim in the new token, EGG already claimed stays in the old one. Do it deliberately.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ game settings
function GameTab({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(ov.settings.values);
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const [k, sp] of Object.entries(ov.settings.spec)) (g[sp.group] ??= []).push(k);
    return g;
  }, [ov.settings.spec]);
  const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => ov.settings.spec[k] && x !== ov.settings.values[k]));
  const save = async () => {
    try { await api.admin({ action: 'settings.set', values: changed }); toast('Saved — the bot uses it immediately'); await reload(); } catch (e) { toast(errText(e)); }
  };
  return (
    <>
      <h1>Game settings</h1>
      {Object.entries(groups).map(([g, keys]) => (
        <Card key={g} title={g}>
          <div className="form2">
            {keys.map((k) => {
              const sp = ov.settings.spec[k];
              return <Field key={k} label={`${sp.label} (${sp.unit})`} hint={sp.hint ?? `${sp.min}–${sp.max}`}><input value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} inputMode="decimal" className={changed[k] !== undefined ? 'dirty' : ''} /></Field>;
            })}
          </div>
        </Card>
      ))}
      <div className="actions sticky"><Btn disabled={Object.keys(changed).length === 0} onClick={() => void save()}>Save {Object.keys(changed).length || ''} change{Object.keys(changed).length === 1 ? '' : 's'}</Btn><Btn kind="ghost" disabled={Object.keys(changed).length === 0} onClick={() => setV(ov.settings.values)}>Reset</Btn></div>
      <p className="hint">Every change is logged with your id. Amounts the contract limits per wallet (see Token) still apply on top.</p>
    </>
  );
}

// ------------------------------------------------------------------ posts
function PostsTab({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const toast = useToast();
  const approved = ov.chats.filter((c) => c.isAdmin);
  const [chat, setChat] = useState<number | ''>(approved[0]?.chatId ?? '');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    try {
      const r = await api.admin<{ link: string | null }>({ action: 'post.publish', chatId: chat, caption });
      toast(r.link ? `Posted: ${r.link}` : 'Posted'); setCaption(''); await reload();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const call = async (input: Record<string, unknown>) => { try { await api.admin(input); await reload(); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <h1>Posts</h1>
      <div className="grid2">
        <Card title="Publish a Hatch post">
          {approved.length === 0 ? <p className="hint">No channel yet: add the bot to your channel as an administrator (with “Post messages”). It appears here once you do.</p> : (
            <>
              <Field label="Channel"><select value={chat} onChange={(e) => setChat(Number(e.target.value))}>{approved.map((c) => <option key={c.chatId} value={c.chatId}>{c.title ?? c.chatId}{c.username ? ` · @${c.username}` : ''}</option>)}</select></Field>
              <Field label="Text (optional)" hint="By default the post is only the egg and the Hatch button"><textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={900} rows={3} /></Field>
              <div className="actions"><Btn disabled={busy || chat === ''} onClick={() => void publish()}>Publish</Btn></div>
            </>
          )}
        </Card>
        <Card title="Channels and groups">
          <table><thead><tr><th>Chat</th><th>Kind</th><th /></tr></thead><tbody>
            {ov.chats.map((c) => (
              <tr key={c.chatId}><td>{c.title ?? c.chatId}{c.username ? <span className="muted"> @{c.username}</span> : null}</td><td>{c.kind}</td>
                <td className="r"><Btn kind={c.isAdmin ? 'ghost' : undefined} onClick={() => void call({ action: 'chat.set', chatId: c.chatId, approved: !c.isAdmin })}>{c.isAdmin ? 'Remove' : 'Approve'}</Btn></td></tr>
            ))}
            {ov.chats.length === 0 && <tr><td colSpan={3} className="muted">The bot is not in any chat yet.</td></tr>}
          </tbody></table>
          <p className="hint">Only approved chats can publish or pay for posts. The bot approves a chat by itself only when one of the admins makes it an administrator there.</p>
        </Card>
      </div>
      <Card title="Posts">
        <table><thead><tr><th>Post</th><th>Hatches</th><th>Views</th><th>Reactions</th><th>When</th><th /></tr></thead><tbody>
          {ov.posts.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'off'}>
              <td>{p.username ? <a className="lnk" href={`https://t.me/${p.username}/${p.messageId}`} target="_blank" rel="noreferrer">@{p.username} #{p.messageId}</a> : `#${p.messageId}`}</td>
              <td>{p.hatches}</td><td>{p.views || '—'}</td><td>{p.reactions}</td><td>{ago(p.at)}</td>
              <td className="r"><Btn kind="ghost" onClick={() => void call({ action: 'post.close', id: p.id, active: !p.active })}>{p.active ? 'Close' : 'Reopen'}</Btn></td>
            </tr>
          ))}
        </tbody></table>
        <p className="hint">A closed post stops paying; the button stays but answers “closed”.</p>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ players
type Player = { found: boolean; tgId?: number; username?: string | null; address?: string | null; verified?: number; locked?: number; banned?: number; referrer?: number | null; createdAt?: number; ledger?: string; recent?: { kind: string; amount: string; at: number }[] };
function PlayersTab() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [p, setP] = useState<Player | null>(null);
  const find = async () => { try { setP(await api.admin<Player>({ action: 'user.find', q })); } catch (e) { toast(errText(e)); } };
  const ban = async (banned: boolean) => { try { await api.admin({ action: 'user.ban', tgId: p!.tgId, banned }); toast(banned ? 'Banned' : 'Unbanned'); await find(); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <h1>Players</h1>
      <Card>
        <form className="searchrow" onSubmit={(e) => { e.preventDefault(); void find(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Telegram id, @username or wallet address (0:…)" spellCheck={false} />
          <Btn disabled={!q.trim()}>Find</Btn>
        </form>
      </Card>
      {p && !p.found && <Card><p>Nobody found.</p></Card>}
      {p?.found && (
        <Card title={`Player ${p.tgId}${p.username ? ` · @${p.username}` : ''}`} right={p.banned ? <span className="bad">banned</span> : <span className="ok">active</span>}>
          <div className="stats">
            <Stat k="Ledger" v={`${formatUnits(BigInt(p.ledger ?? '0'), 9, 2)} EGG`} />
            <Stat k="Wallet" v={p.address ? <span className="mono">{p.address.slice(0, 8)}…{p.address.slice(-6)}</span> : 'none'} sub={p.verified ? (p.locked ? 'verified · locked on-chain' : 'verified') : undefined} />
            <Stat k="Joined" v={ago(p.createdAt ?? 0)} />
            <Stat k="Invited by" v={p.referrer ?? '—'} />
          </div>
          <table><thead><tr><th>Event</th><th>EGG</th><th>When</th></tr></thead><tbody>
            {(p.recent ?? []).map((r, i) => <tr key={i}><td>{r.kind}</td><td>+{formatUnits(BigInt(r.amount), 9, 2)}</td><td>{ago(r.at)}</td></tr>)}
          </tbody></table>
          <div className="actions">
            {p.banned ? <Btn onClick={() => void ban(false)}>Unban</Btn> : <Btn kind="danger" onClick={() => void ban(true)}>Ban from earning</Btn>}
          </div>
          <p className="hint">A ban stops new earnings. What the player was already promised in signed roots stays claimable — the contract guarantees it, and removing it would count as fraud.</p>
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------ team + log
function TeamTab({ ov, reload }: { ov: Overview; reload: () => Promise<void> }) {
  const toast = useToast();
  const [id, setId] = useState('');
  const call = async (input: Record<string, unknown>) => { try { await api.admin(input); setId(''); await reload(); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <h1>Team</h1>
      <Card title="Admins of the bot">
        <table><thead><tr><th>Telegram id</th><th>Role</th><th /></tr></thead><tbody>
          {ov.team.map((a) => <tr key={a.id}><td>{a.id}{a.id === ov.me ? ' (you)' : ''}</td><td>{a.root ? 'root' : `added by ${a.by} ${a.at ? ago(a.at) : ''}`}</td><td className="r">{!a.root && <Btn kind="ghost" onClick={() => void call({ action: 'team.remove', tgId: a.id })}>Remove</Btn>}</td></tr>)}
        </tbody></table>
        <form className="searchrow" onSubmit={(e) => { e.preventDefault(); void call({ action: 'team.add', tgId: Number(id) }); }}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Telegram id to add" inputMode="numeric" />
          <Btn disabled={!/^\d{5,15}$/.test(id)}>Add admin</Btn>
        </form>
        <p className="hint">Admins can publish posts, change the game numbers, ban players and switch the active token (the token’s own admin keys stay in their wallet). Root admins are fixed in the bot’s code.</p>
      </Card>
    </>
  );
}

function LogTab({ ov }: { ov: Overview }) {
  return (
    <>
      <h1>Log</h1>
      <Card>
        <table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Detail</th></tr></thead><tbody>
          {ov.log.map((l, i) => <tr key={i}><td>{ago(l.at)}</td><td>{l.who}</td><td>{l.action}</td><td className="muted">{l.detail}</td></tr>)}
          {ov.log.length === 0 && <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>}
        </tbody></table>
      </Card>
    </>
  );
}

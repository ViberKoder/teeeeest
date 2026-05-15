import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  type BalanceDisplayMode,
  RMJClient,
  buildJettonTransferPayloadBase64,
  DEFAULT_ATTACHED_TON_NANO,
  formatBalanceDisplay,
} from '@rmj/sdk';

/**
 * Заклеймить mintless-баланс на цепь без Tonkeeper/TEP-177: TON Connect шлёт TEP-74 transfer
 * с custom_payload с Proof API (тот же поток, что examples/tma).
 */
export function ClaimTab() {
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const envBackend = (import.meta.env.VITE_RMJ_BACKEND_URL as string | undefined)?.trim() || '';

  const [backendUrl, setBackendUrl] = useState(envBackend);
  const [balanceOffchain, setBalanceOffchain] = useState<string | null>(null);
  const [balanceTree, setBalanceTree] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [balanceDisplay, setBalanceDisplay] = useState<BalanceDisplayMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const rmj = useMemo(() => (baseUrl ? new RMJClient({ baseUrl }) : null), [baseUrl]);

  const refreshBalance = useCallback(async () => {
    if (!rmj || !address) {
      setBalanceOffchain(null);
      setBalanceTree(null);
      setEpoch(null);
      return;
    }
    try {
      const b = await rmj.getBalance(address);
      setBalanceOffchain(b.cumulativeOffchain);
      setBalanceTree(b.cumulativeInTree);
      setEpoch(b.epoch);
      setBalanceDisplay(b.balanceDisplay);
      setHint('');
    } catch (e) {
      setHint(`Не удалось загрузить баланс: ${(e as Error).message}`);
    }
  }, [rmj, address]);

  useEffect(() => {
    void refreshBalance();
    if (!address || !rmj) return;
    const id = setInterval(() => void refreshBalance(), 8000);
    return () => clearInterval(id);
  }, [address, rmj, refreshBalance]);

  const claimOnChain = useCallback(async () => {
    if (!rmj || !address) return;
    setBusy(true);
    setHint('Готовим транзакцию…');
    try {
      const payload = await rmj.getCustomPayload(address);
      if (!payload) {
        setHint(
          'Нет данных для клейма — адрес не в Merkle-дереве или эпоха ещё не подхватила активность.',
        );
        return;
      }

      const jw = await rmj.getJettonWallet(address);

      const transferPayload = buildJettonTransferPayloadBase64({
        jettonAmountNano: 0n,
        toOwner: address,
        responseAddress: address,
        forwardTonAmountNano: 1n,
        customPayload: payload,
      });

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: jw.jettonWallet,
            amount: DEFAULT_ATTACHED_TON_NANO.toString(),
            payload: transferPayload,
            stateInit: jw.walletStateInitBase64 ?? undefined,
          },
        ],
      });

      setHint(
        jw.needsDeploy
          ? 'Транзакция отправлена. Первый деплой jetton-wallet + клейм могут занять ~30 с.'
          : 'Транзакция отправлена. После подтверждения проверьте jetton в кошельке.',
      );
      await refreshBalance();
    } catch (e) {
      const msg = (e as Error).message;
      setHint(msg.includes('reject') || msg.includes('Rejected') ? 'Отменено в кошельке.' : msg);
    } finally {
      setBusy(false);
    }
  }, [rmj, address, tonConnectUI, refreshBalance]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Забрать токены на кошелёк (mintless)</h2>
      <p style={{ opacity: 0.9 }}>
        Если баланс в игре/боте есть, а в кошельке jetton не видно — отправьте один перевод с{' '}
        <code>custom_payload</code> с вашего RMJ backend. Здесь это делается через TON Connect (~0.1 TON на газ /
        деплой jetton-wallet).
      </p>

      <label style={{ display: 'block', marginBottom: 12 }}>
        URL бэкенда RMJ (без слэша в конце)
        <input
          style={{ width: '100%', marginTop: 6, padding: 8 }}
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="https://your-backend.up.railway.app"
        />
      </label>

      {!baseUrl && (
        <p style={{ color: '#b45309' }}>Укажите URL или задайте <code>VITE_RMJ_BACKEND_URL</code> при сборке.</p>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <TonConnectButton />
        <button type="button" disabled={!baseUrl} onClick={() => void refreshBalance()}>
          Обновить баланс
        </button>
      </div>

      <p style={{ opacity: 0.85, wordBreak: 'break-all' }}>
        {address ? `Кошелёк: ${address}` : 'Подключите кошелёк получателя наград.'}
      </p>

      {balanceOffchain !== null && address && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div>
            <b>Начислено (backend):</b>{' '}
            {balanceDisplay
              ? formatBalanceDisplay(balanceOffchain, balanceDisplay)
              : balanceOffchain}{' '}
            · epoch {epoch ?? '—'}
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
            В дереве:{' '}
            {balanceDisplay
              ? formatBalanceDisplay(balanceTree ?? '0', balanceDisplay)
              : balanceTree ?? '0'}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={busy || !rmj || !address || !baseUrl}
        onClick={() => void claimOnChain()}
        style={{
          padding: '12px 20px',
          fontSize: 16,
          borderRadius: 8,
          border: 'none',
          background: '#15803d',
          color: '#fff',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Отправка…' : 'Заклеймить на цепь (TON Connect)'}
      </button>

      {hint && (
        <div style={{ marginTop: 14, padding: 10, background: '#fef3c7', borderRadius: 8, fontSize: 14 }}>
          {hint}
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 13, opacity: 0.75 }}>
        Нужны методы <code>/api/v1/balance</code>, <code>/api/v1/custom-payload/wallet/…</code>,{' '}
        <code>/api/v1/jetton-wallet</code> на бэкенде (ветка с jetton-wallet API).
      </p>
    </section>
  );
}

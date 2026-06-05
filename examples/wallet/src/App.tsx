import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { TonBalanceCard } from './components/TonBalanceCard';
import { JettonList } from './components/JettonList';
import { NftGrid } from './components/NftGrid';
import { ConnectPrompt } from './components/ConnectPrompt';
import { RmjBanner } from './components/RmjBanner';
import { SendTonModal } from './components/SendTonModal';
import { SendJettonModal } from './components/SendJettonModal';
import { NftDetailModal } from './components/NftDetailModal';
import { useWalletData } from './hooks/useWalletData';
import { useRmjPendingJetton } from './hooks/useRmjPendingJetton';
import type { JettonBalance, NftItem, WalletTab } from './types';
import { colors, layout } from './styles/theme';

export function App() {
  const address = useTonAddress();
  const { account, jettons, nfts, loading, error, refresh } = useWalletData(address || null);
  const pendingRmj = useRmjPendingJetton(address || null, jettons);

  const [tab, setTab] = useState<WalletTab>('assets');
  const [sendTon, setSendTon] = useState(false);
  const [sendJetton, setSendJetton] = useState<JettonBalance | null>(null);
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null);

  const allJettons = pendingRmj ? [pendingRmj, ...jettons] : jettons;

  return (
    <div style={layout.page}>
      <div style={layout.shell}>
        <Header address={address || null} />
        <RmjBanner />

        {!address && <ConnectPrompt />}

        {address && (
          <>
            {error && (
              <div
                style={{
                  ...layout.card,
                  borderColor: colors.danger,
                  color: colors.danger,
                  fontSize: 13,
                }}
              >
                {error}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  style={{
                    ...layout.btn,
                    ...layout.btnGhost,
                    marginTop: 10,
                    padding: '6px 12px',
                    fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            <TabBar active={tab} onChange={setTab} nftCount={nfts.length} />

            {tab === 'assets' && (
              <>
                {account && (
                  <TonBalanceCard balanceNano={account.balanceNano} onSend={() => setSendTon(true)} />
                )}
                <JettonList
                  jettons={allJettons}
                  owner={address}
                  loading={loading}
                  onSend={(j) => setSendJetton(j)}
                />
              </>
            )}

            {tab === 'nfts' && (
              <NftGrid nfts={nfts} loading={loading} onSelect={(n) => setSelectedNft(n)} />
            )}

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              style={{
                ...layout.btn,
                ...layout.btnGhost,
                alignSelf: 'center',
                fontSize: 13,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Refreshing…' : 'Refresh balances'}
            </button>
          </>
        )}
      </div>

      {sendTon && <SendTonModal onClose={() => setSendTon(false)} />}
      {sendJetton && address && (
        <SendJettonModal jetton={sendJetton} owner={address} onClose={() => setSendJetton(null)} />
      )}
      {selectedNft && <NftDetailModal nft={selectedNft} onClose={() => setSelectedNft(null)} />}
    </div>
  );
}

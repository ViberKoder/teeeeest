import { useEffect, useState } from 'react';
import { useWallet } from './context/WalletContext';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { TonBalanceCard } from './components/TonBalanceCard';
import { JettonList } from './components/JettonList';
import { NftGrid } from './components/NftGrid';
import { RmjBanner } from './components/RmjBanner';
import { SendTonModal } from './components/SendTonModal';
import { SendJettonModal } from './components/SendJettonModal';
import { NftDetailModal } from './components/NftDetailModal';
import { SettingsModal } from './components/SettingsModal';
import { WelcomeScreen } from './components/onboarding/WelcomeScreen';
import { CreateWalletFlow } from './components/onboarding/CreateWalletFlow';
import { ImportWalletFlow } from './components/onboarding/ImportWalletFlow';
import { UnlockScreen } from './components/onboarding/UnlockScreen';
import { useWalletData } from './hooks/useWalletData';
import { useRmjAssets } from './hooks/useRmjAssets';
import type { JettonBalance, NftItem, WalletTab } from './types';
import { colors, layout } from './styles/theme';

type Onboarding = 'welcome' | 'create' | 'import';

export function App() {
  const { vaultExists, session, touchActivity } = useWallet();
  const address = session?.address ?? null;

  const { account, jettons, nfts, loading, error, refresh } = useWalletData(address);
  const allJettons = useRmjAssets(address, jettons);

  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [tab, setTab] = useState<WalletTab>('assets');
  const [sendTon, setSendTon] = useState(false);
  const [sendJetton, setSendJetton] = useState<JettonBalance | null>(null);
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    if (!session) return;
    const bump = () => touchActivity();
    window.addEventListener('click', bump);
    window.addEventListener('keydown', bump);
    return () => {
      window.removeEventListener('click', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [session, touchActivity]);

  const showWelcome = !vaultExists && onboarding === null;
  const showOnboarding = !vaultExists && onboarding !== null;
  const showUnlock = vaultExists && !session;
  const showMain = vaultExists && session;

  return (
    <div style={layout.page}>
      <div style={layout.shell}>
        {showMain && (
          <Header address={address} onSettings={() => setSettings(true)} />
        )}

        {showWelcome && (
          <WelcomeScreen onCreate={() => setOnboarding('create')} onImport={() => setOnboarding('import')} />
        )}

        {showOnboarding && onboarding === 'create' && (
          <CreateWalletFlow onBack={() => setOnboarding(null)} />
        )}
        {showOnboarding && onboarding === 'import' && (
          <ImportWalletFlow onBack={() => setOnboarding(null)} />
        )}

        {showUnlock && <UnlockScreen />}

        {showMain && (
          <>
            <RmjBanner />

            {error && (
              <div style={{ ...layout.card, borderColor: colors.danger, color: colors.danger, fontSize: 13 }}>
                {error}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  style={{ ...layout.btn, ...layout.btnGhost, marginTop: 10, padding: '6px 12px', fontSize: 12 }}
                >
                  Повторить
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
                  owner={address!}
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
              {loading ? 'Обновление…' : 'Обновить балансы'}
            </button>
          </>
        )}
      </div>

      {sendTon && <SendTonModal onClose={() => setSendTon(false)} />}
      {sendJetton && address && (
        <SendJettonModal jetton={sendJetton} owner={address} onClose={() => setSendJetton(null)} />
      )}
      {selectedNft && <NftDetailModal nft={selectedNft} onClose={() => setSelectedNft(null)} />}
      {settings && address && <SettingsModal address={address} onClose={() => setSettings(false)} />}
    </div>
  );
}

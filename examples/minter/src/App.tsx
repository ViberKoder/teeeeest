import { useMemo, useState } from 'react';
import { Address } from '@ton/core';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { buildDeploy, jettonMetadataHostedUrl, resolveDeployWithMetadataUrl } from './buildMaster';
import { MASTER_BOC_BASE64, NETWORK, WALLET_BOC_BASE64 } from './constants';
import { generateSignerSecrets } from './signer';
import { buildStandaloneJettonMetadataJson } from './metadata';
import { ClaimTab } from './ClaimTab';

type Step = 1 | 2 | 3 | 4;
type AppTab = 'minter' | 'claim';

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(label: string, text: string, setStatus: (s: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`Copied ${label}`);
    setTimeout(() => setStatus(''), 2000);
  } catch {
    setStatus('Copy failed — select text manually');
  }
}

export function App() {
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('TapCoin');
  const [symbol, setSymbol] = useState('TAP');
  const [description, setDescription] = useState('Tap-to-earn Rolling Mintless Jetton');
  const [imageUrl, setImageUrl] = useState(
    'https://ton.org/download/ton_symbol.png',
  );
  /** Planned HTTPS origin of your RMJ backend (no trailing slash). */
  const [backendUrl, setBackendUrl] = useState('https://your-service.onrender.com');

  const [signerSeedHex, setSignerSeedHex] = useState('');
  const [signerPubkeyHex, setSignerPubkeyHex] = useState('');

  const [metadataMode, setMetadataMode] = useState<'backend' | 'manual'>('backend');
  const [manualMetadataUrl, setManualMetadataUrl] = useState('');

  const [deployValueTon, setDeployValueTon] = useState('0.15');
  /** Empty = unlimited; whole jettons (×1e9 nano), same semantics as backend JETTON_MAX_SUPPLY_NANO. */
  const [maxSupplyWholeJettons, setMaxSupplyWholeJettons] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [deployedMaster, setDeployedMaster] = useState('');
  const [deployedMetadataUrl, setDeployedMetadataUrl] = useState('');
  const [appTab, setAppTab] = useState<AppTab>('minter');

  /** Shown in UI; real deploy URL is computed with master address (see `deployPreview`). */
  const derivedMetadataUrlPattern = useMemo(() => {
    const b = backendUrl.trim().replace(/\/$/, '');
    if (!b || !b.startsWith('http')) return '';
    return `${b}/api/v1/jettons/EQ…master/metadata.json`;
  }, [backendUrl]);

  const backendOrigin = backendUrl.trim().replace(/\/$/, '');

  const effectiveMetadataUrl =
    metadataMode === 'manual' ? manualMetadataUrl.trim() : '';

  const maxSupplyNano = useMemo(() => {
    const t = maxSupplyWholeJettons.trim();
    if (!t) return 0n;
    return BigInt(t) * 1_000_000_000n;
  }, [maxSupplyWholeJettons]);

  const validationDeploy = useMemo(() => {
    if (!walletAddress) return 'Подключите кошелёк';
    if (!signerPubkeyHex || !/^[0-9a-fA-F]{64}$/.test(signerPubkeyHex))
      return 'Сгенерируйте ключ signer (кнопка ниже)';
    if (metadataMode === 'manual') {
      if (!effectiveMetadataUrl || !effectiveMetadataUrl.startsWith('http'))
        return 'Нужен URL метаданных (https)';
    } else if (!backendOrigin.startsWith('http')) {
      return 'Нужен https URL бэкенда';
    }
    if (!/^[0-9]+(\.[0-9]+)?$/.test(deployValueTon)) return 'Сумма деплоя — число TON';
    const ms = maxSupplyWholeJettons.trim();
    if (ms && !/^[0-9]+$/.test(ms)) return 'Макс. выпуск — только целое число jetton (или пусто = без лимита)';
    return null;
  }, [
    walletAddress,
    signerPubkeyHex,
    metadataMode,
    effectiveMetadataUrl,
    backendOrigin,
    deployValueTon,
    maxSupplyWholeJettons,
  ]);

  const deployPreview = useMemo(() => {
    if (metadataMode !== 'backend' || !walletAddress || !signerPubkeyHex) return null;
    if (!backendOrigin.startsWith('http')) return null;
    if (!/^[0-9a-fA-F]{64}$/.test(signerPubkeyHex)) return null;
    try {
      const admin = Address.parse(walletAddress);
      return resolveDeployWithMetadataUrl(
        {
          admin,
          signerPubkeyHex,
          walletCodeBase64: WALLET_BOC_BASE64,
          masterCodeBase64: MASTER_BOC_BASE64,
          maxSupplyNano,
        },
        backendOrigin,
        NETWORK === 'testnet',
      );
    } catch {
      return null;
    }
  }, [metadataMode, walletAddress, signerPubkeyHex, backendOrigin, maxSupplyNano]);

  function regenerateSigner() {
    const s = generateSignerSecrets();
    setSignerSeedHex(s.seedHex);
    setSignerPubkeyHex(s.pubkeyHex);
    setToast('Новый signer — сохраните seed до деплоя бэкенда');
    setTimeout(() => setToast(''), 4000);
  }

  async function deployMaster() {
    if (validationDeploy) {
      setToast(validationDeploy);
      return;
    }
    setBusy(true);
    try {
      const admin = Address.parse(walletAddress!);
      let address: Address;
      let stateInit: import('@ton/core').Cell;
      let metadataUrl: string;

      if (metadataMode === 'backend') {
        const resolved = resolveDeployWithMetadataUrl(
          {
            admin,
            signerPubkeyHex,
            walletCodeBase64: WALLET_BOC_BASE64,
            masterCodeBase64: MASTER_BOC_BASE64,
            maxSupplyNano,
          },
          backendOrigin,
          NETWORK === 'testnet',
        );
        address = resolved.address;
        stateInit = resolved.stateInit;
        metadataUrl = resolved.metadataUrl;
      } else {
        const built = buildDeploy({
          admin,
          signerPubkeyHex,
          metadataUrl: effectiveMetadataUrl,
          walletCodeBase64: WALLET_BOC_BASE64,
          masterCodeBase64: MASTER_BOC_BASE64,
          maxSupplyNano,
        });
        address = built.address;
        stateInit = built.stateInit;
        metadataUrl = effectiveMetadataUrl;
      }

      const masterFriendly = address.toString({
        bounceable: false,
        urlSafe: true,
      });
      const deployNano = BigInt(Math.floor(Number(deployValueTon) * 1e9)).toString();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: masterFriendly,
            amount: deployNano,
            stateInit: stateInit.toBoc().toString('base64'),
          },
        ],
      });

      setDeployedMaster(masterFriendly);
      setDeployedMetadataUrl(metadataUrl);
      setStep(4);
      setToast('');
    } catch (e) {
      setToast(`Ошибка: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const envSnippet = useMemo(() => {
    if (!deployedMaster || !signerSeedHex) return '';
    const jwtHint = 'replace-with-random-32+-chars';
    return [
      `# Paste into backend/.env or Render environment`,
      `ADMIN_JWT_SECRET=${jwtHint}`,
      `SIGNER_SEED_HEX=${signerSeedHex}`,
      `ADMIN_MNEMONIC="same wallet seed as Tonkeeper — Settings → Show phrase (deploy wallet)"`,
      `JETTON_MASTER_ADDRESS=${deployedMaster}`,
      `PUBLIC_APP_URL=${backendOrigin}`,
      `PUBLIC_JETTON_NAME=${name.trim()}`,
      `PUBLIC_JETTON_SYMBOL=${symbol.trim()}`,
      `PUBLIC_JETTON_DESCRIPTION=${description.trim()}`,
      `PUBLIC_JETTON_IMAGE_URL=${imageUrl.trim()}`,
      `TON_NETWORK=${NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}`,
      ...(maxSupplyNano > 0n ? [`JETTON_MAX_SUPPLY_NANO=${maxSupplyNano.toString()}`] : []),
      ``,
      `# Bot (@rmj/example-telegram-bot)`,
      `RMJ_BACKEND_URL=${backendOrigin}`,
      ``,
      `# Mini App + вкладка Claim (URL бэкенда + master для mintless API)`,
      `VITE_RMJ_BACKEND_URL=${backendOrigin}`,
      `VITE_JETTON_MASTER_ADDRESS=${deployedMaster}`,
    ].join('\n');
  }, [deployedMaster, signerSeedHex, backendOrigin, name, symbol, description, imageUrl, maxSupplyNano]);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.45,
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setAppTab('minter')}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: appTab === 'minter' ? '2px solid #2563eb' : '1px solid #ccc',
            background: appTab === 'minter' ? '#eff6ff' : '#fff',
            cursor: 'pointer',
            fontWeight: appTab === 'minter' ? 700 : 400,
          }}
        >
          Минтер (деплой)
        </button>
        <button
          type="button"
          onClick={() => setAppTab('claim')}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: appTab === 'claim' ? '2px solid #15803d' : '1px solid #ccc',
            background: appTab === 'claim' ? '#f0fdf4' : '#fff',
            cursor: 'pointer',
            fontWeight: appTab === 'claim' ? 700 : 400,
          }}
        >
          Забрать токены (claim)
        </button>
      </div>

      {appTab === 'claim' ? (
        <>
          <h1 style={{ marginTop: 0 }}>RMJ — claim на цепь</h1>
          <ClaimTab />
        </>
      ) : (
        <>
      <h1 style={{ marginTop: 0 }}>RMJ — мастер за пару кликов</h1>
      <p style={{ opacity: 0.85 }}>
        Rolling Mintless Jetton: деплой master через TON Connect + готовые строки для бэкенда,
        бота и мини-приложения. Сеть: <b>{NETWORK}</b>
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s as Step)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: step === s ? '2px solid #2563eb' : '1px solid #ccc',
              background: step === s ? '#eff6ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            {s}. {['Кошелёк', 'Токен и URL', 'Signer и деплой', 'Готово'][s - 1]}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section>
          <h2>1. Подключите админ-кошелёк</h2>
          <p>Этот же кошелёк станет <b>admin</b> master-контракта. Его мнемоника понадобится бэкенду
            для обновления Merkle root.</p>
          <TonConnectButton />
          <p style={{ opacity: 0.8 }}>{walletAddress ? `Подключено: ${walletAddress}` : 'Не подключено'}</p>
          <button type="button" disabled={!walletAddress} onClick={() => setStep(2)}>
            Далее →
          </button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>2. Имя токена и адрес бэкенда</h2>
          <p>
            Укажите публичный <b>https</b> URL сервиса RMJ (например Render/Railway после первого деплоя).
            В on-chain content попадёт URL вида{' '}
            <code>{derivedMetadataUrlPattern || '…/api/v1/jettons/EQ…/metadata.json'}</code> — сразу с
            правильным <code>custom_payload_api_uri</code> (TEP offchain-payloads). На бэкенде задайте{' '}
            <code>PUBLIC_*</code> до первого запроса TonAPI.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              Название
              <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Символ
              <input style={{ width: '100%' }} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </label>
            <label>
              Описание
              <input style={{ width: '100%' }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Картинка (URL)
              <input style={{ width: '100%' }} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            </label>
            <label>
              Макс. выпуск (целых jetton, пусто = без лимита)
              <input
                style={{ width: '100%' }}
                value={maxSupplyWholeJettons}
                onChange={(e) => setMaxSupplyWholeJettons(e.target.value)}
                placeholder="например 1000000"
              />
            </label>
            <label>
              URL бэкенда (без слэша в конце)
              <input
                style={{ width: '100%' }}
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="https://rmj-xxxx.onrender.com"
              />
            </label>
          </div>

          <fieldset style={{ marginTop: 16, border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <legend>Метаданные jetton (TEP-64 URL)</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                checked={metadataMode === 'backend'}
                onChange={() => setMetadataMode('backend')}
              />
              Канонический URL (после деплоя):{' '}
              <code style={{ opacity: derivedMetadataUrlPattern ? 1 : 0.5 }}>
                {derivedMetadataUrlPattern || '(исправьте URL бэкенда)'}
              </code>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                type="radio"
                checked={metadataMode === 'manual'}
                onChange={() => setMetadataMode('manual')}
              />
              Свой URL JSON (Gist / статический хостинг)
            </label>
            {metadataMode === 'manual' && (
              <input
                style={{ width: '100%', marginTop: 8 }}
                value={manualMetadataUrl}
                onChange={(e) => setManualMetadataUrl(e.target.value)}
                placeholder="https://gist.githubusercontent.com/.../raw/.../jetton.json"
              />
            )}
          </fieldset>

          <p style={{ fontSize: 14, opacity: 0.85 }}>
            Полный <code>jetton-metadata.json</code> с <code>custom_payload_api_uri</code> (…/api/v1/jettons/EQ…master)
            — после деплоя на шаге 4.
          </p>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setStep(1)}>← Назад</button>
            <button type="button" onClick={() => setStep(3)}>Далее →</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>3. Signer и деплой Master</h2>
          <p>
            Voucher-подпись на бэкенде должна совпадать с публичным ключом в контракте.
            Нажмите «Сгенерировать», сохраните <b>SIGNER_SEED_HEX</b> — он показывается один раз здесь.
          </p>
          <button type="button" onClick={regenerateSigner} style={{ marginBottom: 12 }}>
            Сгенерировать signer (seed + pubkey)
          </button>
          {signerPubkeyHex ? (
            <pre style={{ background: '#f4f4f5', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>
              {`Pubkey (в контракт): ${signerPubkeyHex}\nSeed (backend SIGNER_SEED_HEX): ${signerSeedHex.slice(0, 16)}…`}
            </pre>
          ) : (
            <p style={{ color: '#b45309' }}>Сгенерируйте ключ перед деплоем.</p>
          )}
          <label style={{ display: 'block', marginTop: 12 }}>
            TON на деплой master
            <input value={deployValueTon} onChange={(e) => setDeployValueTon(e.target.value)} />
          </label>
          <p style={{ fontSize: 14, opacity: 0.85 }}>
            On-chain metadata URL:{' '}
            <code style={{ wordBreak: 'break-all' }}>
              {metadataMode === 'backend'
                ? deployPreview?.metadataUrl || derivedMetadataUrlPattern || '—'
                : effectiveMetadataUrl || '—'}
            </code>
          </p>
          {metadataMode === 'backend' && deployPreview && (
            <p style={{ fontSize: 13, opacity: 0.8 }}>
              Master (предпросмотр): <code>{deployPreview.address.toString({ urlSafe: true, bounceable: false })}</code>
            </p>
          )}
          {validationDeploy && <p style={{ color: '#b45309' }}>{validationDeploy}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || !!validationDeploy} onClick={() => void deployMaster()}>
              {busy ? 'Отправка…' : 'Задеплоить Jetton Master'}
            </button>
            <button type="button" onClick={() => setStep(2)}>← Назад</button>
          </div>
        </section>
      )}

      {step === 4 && deployedMaster && (
        <section>
          <h2>4. Готово</h2>
          <p>
            <b>Master:</b>{' '}
            <code style={{ wordBreak: 'break-all' }}>{deployedMaster}</code>{' '}
            <button type="button" onClick={() => void copyText('master', deployedMaster, setToast)}>
              Копировать
            </button>
          </p>
          <p>
            Дальше: задеплойте бэкенд (Docker / Render — см. <code>docs/QUICKSTART_ONE_CLICK.md</code>),
            вставьте переменные ниже (сначала <code>JETTON_MASTER_ADDRESS</code>), затем проверьте{' '}
            <code style={{ wordBreak: 'break-all' }}>
              {deployedMetadataUrl || jettonMetadataHostedUrl(backendOrigin, Address.parse(deployedMaster), NETWORK === 'testnet')}
            </code>
            .
          </p>
          <h3>Переменные окружения</h3>
          <pre
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 12,
            }}
          >
            {envSnippet}
          </pre>
          <button type="button" onClick={() => void copyText('.env', envSnippet, setToast)}>
            Копировать всё
          </button>

          <button
            type="button"
            style={{ marginLeft: 10 }}
            onClick={() =>
              downloadText(
                'jetton-metadata.json',
                buildStandaloneJettonMetadataJson({
                  name,
                  symbol,
                  description,
                  image: imageUrl,
                  backendBaseUrl: backendUrl,
                  jettonMasterAddress: deployedMaster,
                }),
              )
            }
          >
            Скачать jetton-metadata.json
          </button>

          <h3 style={{ marginTop: 24 }}>Интеграция бота / TMA (по одному URL)</h3>
          <pre style={{ background: '#f4f4f5', padding: 12, borderRadius: 8, fontSize: 13 }}>
            {[
              `RMJ_BACKEND_URL=${backendOrigin}`,
              `VITE_RMJ_BACKEND_URL=${backendOrigin}`,
            ].join('\n')}
          </pre>

          <p style={{ marginTop: 16, fontSize: 14 }}>
            · Хостинг минтер-UI: Vercel, корень репозитория (есть <code>vercel.json</code>).<br />
            · Бот: <code>examples/telegram-bot</code> — только <code>RMJ_BACKEND_URL</code> и токен Telegram.<br />
            · TMA / вкладка Claim в этом минтере: <code>VITE_RMJ_BACKEND_URL</code>; master в TMA опционален (jetton-wallet берётся с API).
          </p>
          <button type="button" onClick={() => { setStep(1); setDeployedMaster(''); setDeployedMetadataUrl(''); }}>
            Начать новый проект
          </button>
        </section>
      )}

      {toast && (
        <div style={{ marginTop: 16, padding: 10, background: '#fef3c7', borderRadius: 8 }}>{toast}</div>
      )}
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Address } from '@ton/core';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { computePlannedDeploy, fixedJettonMetadataUrl, jettonMasterDisplay, JETTON_METADATA_FILENAME } from './buildMaster';
import {
  computePlannedMintlessDeploy,
  EMPTY_AIRDROP_MERKLE_ROOT,
  fixedMintlessJettonMetadataUrl,
  MINTLESS_JETTON_METADATA_FILENAME,
  type PlannedMintlessDeploy,
} from './buildMintlessMaster';
import {
  MASTER_BOC_BASE64,
  MINTLESS_MASTER_BOC_BASE64,
  MINTLESS_WALLET_RAW_BOC_BASE64,
  NETWORK,
  WALLET_BOC_BASE64,
} from './constants';
import { generateSignerSecrets } from './signer';
import { buildJettonMetadataJson, buildStandaloneJettonMetadataJson, type JettonKind } from './metadata';
import { ClaimTab } from './ClaimTab';
import { ComplianceTab } from './ComplianceTab';

type Step = 1 | 2 | 3 | 4;
type AppTab = 'minter' | 'claim' | 'compliance';

const JETTON_KIND_LABELS: Record<JettonKind, string> = {
  rmj: 'RMJ (rolling tap-to-earn)',
  mintless: 'Mintless Jetton (TEP-177)',
};

function metadataFilename(kind: JettonKind): string {
  return kind === 'mintless' ? MINTLESS_JETTON_METADATA_FILENAME : JETTON_METADATA_FILENAME;
}

function fixedMetadataUrl(backend: string, kind: JettonKind): string {
  return kind === 'mintless' ? fixedMintlessJettonMetadataUrl(backend) : fixedJettonMetadataUrl(backend);
}

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
  const [jettonKind, setJettonKind] = useState<JettonKind>('rmj');
  const [name, setName] = useState('TapCoin');
  const [symbol, setSymbol] = useState('TAP');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState(
    'https://ton.org/download/ton_symbol.png',
  );
  /** Planned HTTPS origin of your RMJ backend (no trailing slash). */
  const [backendUrl, setBackendUrl] = useState('https://your-service.onrender.com');

  const [signerSeedHex, setSignerSeedHex] = useState('');
  const [signerPubkeyHex, setSignerPubkeyHex] = useState('');

  const [deployValueTon, setDeployValueTon] = useState('0.15');
  /** Empty = unlimited; whole jettons (×1e9 nano), same semantics as backend JETTON_MAX_SUPPLY_NANO. */
  const [maxSupplyWholeJettons, setMaxSupplyWholeJettons] = useState('');
  /** Optional fixed merkle root (hex, 64 chars) for TEP-177 — empty = empty-tree root at deploy. */
  const [mintlessMerkleRootHex, setMintlessMerkleRootHex] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [deployedMaster, setDeployedMaster] = useState('');
  const [deployedMetadataUrl, setDeployedMetadataUrl] = useState('');
  const [appTab, setAppTab] = useState<AppTab>('minter');

  const backendOrigin = backendUrl.trim().replace(/\/$/, '');
  const testnet = NETWORK === 'testnet';

  const maxSupplyNano = useMemo(() => {
    const t = maxSupplyWholeJettons.trim();
    if (!t) return 0n;
    return BigInt(t) * 1_000_000_000n;
  }, [maxSupplyWholeJettons]);

  const mintlessMerkleRoot = useMemo(() => {
    const t = mintlessMerkleRootHex.trim().replace(/^0x/i, '');
    if (!t) return EMPTY_AIRDROP_MERKLE_ROOT;
    if (!/^[0-9a-fA-F]{64}$/.test(t)) return null;
    return BigInt(`0x${t}`);
  }, [mintlessMerkleRootHex]);

  const plannedMintlessDeploy = useMemo((): PlannedMintlessDeploy | null => {
    if (jettonKind !== 'mintless' || !walletAddress || !backendOrigin.startsWith('http')) return null;
    if (mintlessMerkleRoot === null) return null;
    try {
      const admin = Address.parse(walletAddress);
      return computePlannedMintlessDeploy(
        {
          admin,
          walletCodeRawBase64: MINTLESS_WALLET_RAW_BOC_BASE64,
          masterCodeBase64: MINTLESS_MASTER_BOC_BASE64,
          merkleRoot: mintlessMerkleRoot,
        },
        backendOrigin,
        testnet,
      );
    } catch (e) {
      console.warn('computePlannedMintlessDeploy', e);
      return null;
    }
  }, [walletAddress, backendOrigin, jettonKind, mintlessMerkleRoot, testnet]);

  const plannedRmjDeploy = useMemo(() => {
    if (jettonKind !== 'rmj' || !walletAddress || !backendOrigin.startsWith('http')) return null;
    if (!signerPubkeyHex || !/^[0-9a-fA-F]{64}$/.test(signerPubkeyHex)) return null;
    try {
      const admin = Address.parse(walletAddress);
      return computePlannedDeploy(
        {
          admin,
          signerPubkeyHex,
          walletCodeBase64: WALLET_BOC_BASE64,
          masterCodeBase64: MASTER_BOC_BASE64,
          maxSupplyNano,
        },
        backendOrigin,
        testnet,
      );
    } catch (e) {
      console.warn('computePlannedDeploy', e);
      return null;
    }
  }, [walletAddress, signerPubkeyHex, backendOrigin, maxSupplyNano, jettonKind, testnet]);

  const plannedDeploy = jettonKind === 'mintless' ? plannedMintlessDeploy : plannedRmjDeploy;

  const plannedMetadataJson = useMemo(() => {
    if (!plannedDeploy) return null;
    return buildJettonMetadataJson({
      name,
      symbol,
      description,
      image: imageUrl,
      backendBaseUrl: backendOrigin,
      master: plannedDeploy.address,
      kind: jettonKind,
    });
  }, [plannedDeploy, name, symbol, description, imageUrl, backendOrigin, jettonKind]);

  const validationStep2 = useMemo(() => {
    if (!walletAddress) return 'Подключите кошелёк';
    if (!backendOrigin.startsWith('http')) return 'Нужен https URL бэкенда';
    if (jettonKind === 'rmj') {
      if (!signerPubkeyHex || !/^[0-9a-fA-F]{64}$/.test(signerPubkeyHex))
        return 'Сгенерируйте ключ signer';
    } else {
      const t = mintlessMerkleRootHex.trim().replace(/^0x/i, '');
      if (t && !/^[0-9a-fA-F]{64}$/.test(t)) return 'Merkle root — 64 hex-символа или пусто';
      if (mintlessMerkleRoot === null) return 'Некорректный merkle root';
    }
    if (!plannedDeploy)
      return 'Не удалось вычислить master — проверьте URL бэкенда и поля токена';
    return null;
  }, [
    walletAddress,
    backendOrigin,
    signerPubkeyHex,
    plannedDeploy,
    jettonKind,
    mintlessMerkleRootHex,
    mintlessMerkleRoot,
  ]);

  const validationDeploy = useMemo(() => {
    const base = validationStep2;
    if (base) return base;
    if (!/^[0-9]+(\.[0-9]+)?$/.test(deployValueTon)) return 'Сумма деплоя — число TON';
    if (jettonKind === 'rmj') {
      const ms = maxSupplyWholeJettons.trim();
      if (ms && !/^[0-9]+$/.test(ms))
        return 'Макс. выпуск — только целое число jetton (или пусто = без лимита)';
    }
    return null;
  }, [validationStep2, deployValueTon, maxSupplyWholeJettons, jettonKind]);

  function regenerateSigner() {
    const s = generateSignerSecrets();
    setSignerSeedHex(s.seedHex);
    setSignerPubkeyHex(s.pubkeyHex);
    setToast('Новый signer — сохраните seed до деплоя бэкенда');
    setTimeout(() => setToast(''), 4000);
  }

  async function deployMaster() {
    if (validationDeploy || !plannedDeploy) {
      setToast(validationDeploy ?? 'Сначала заполните шаг 2');
      return;
    }
    setBusy(true);
    try {
      const { address, stateInit, metadataUrl } = plannedDeploy;
      const masterFriendly = jettonMasterDisplay(address, testnet);
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

      let registerNote = '';
      try {
        const regRes = await fetch(`${backendOrigin}/api/v1/jettons/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            master: masterFriendly,
            name: name.trim(),
            symbol: symbol.trim(),
            description: description.trim(),
            image: imageUrl.trim(),
            decimals: '0',
            kind: jettonKind,
          }),
        });
        if (!regRes.ok) {
          const err = await regRes.text();
          registerNote = `Master задеплоен, но metadata на бэкенде не сохранилась (${regRes.status}): ${err.slice(0, 120)}. Вызовите POST /api/v1/jettons/register вручную.`;
        }
      } catch (e) {
        registerNote = `Master задеплоен, но бэкенд недоступен для register: ${(e as Error).message}. Сохраните metadata через POST /api/v1/jettons/register.`;
      }

      setStep(4);
      setToast(registerNote);
    } catch (e) {
      setToast(`Ошибка: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const envSnippet = useMemo(() => {
    if (!deployedMaster) return '';
    const jwtHint = 'replace-with-random-32+-chars';
    const signerSeed =
      signerSeedHex || '0000000000000000000000000000000000000000000000000000000000000001';
    const signerLine =
      jettonKind === 'rmj'
        ? `SIGNER_SEED_HEX=${signerSeedHex || 'generate-in-step-2'}`
        : `SIGNER_SEED_HEX=${signerSeed}  # backend only — not in TEP-177 contract`;
    const lines = [
      `# Paste into backend/.env or Render environment`,
      `# Jetton type: ${JETTON_KIND_LABELS[jettonKind]}`,
      `ADMIN_JWT_SECRET=${jwtHint}`,
      signerLine,
      ...(jettonKind === 'rmj'
        ? [
            `ADMIN_MNEMONIC="same wallet seed as Tonkeeper — Settings → Show phrase (deploy wallet)"`,
          ]
        : [
            `# TEP-177: no on-chain merkle root updates — root is fixed at deploy`,
            `# ADMIN_MNEMONIC optional unless you use other admin features`,
          ]),
      ...(jettonKind === 'mintless'
        ? [`MINTLESS_JETTON_MASTER_ADDRESS=${deployedMaster}`]
        : [`JETTON_MASTER_ADDRESS=${deployedMaster}`]),
      `PUBLIC_APP_URL=${backendOrigin}`,
      `PUBLIC_JETTON_NAME=${name.trim()}`,
      `PUBLIC_JETTON_SYMBOL=${symbol.trim()}`,
      `PUBLIC_JETTON_DESCRIPTION=${description.trim()}`,
      `PUBLIC_JETTON_IMAGE_URL=${imageUrl.trim()}`,
      `TON_NETWORK=${NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}`,
      ...(jettonKind === 'rmj' && maxSupplyNano > 0n
        ? [`JETTON_MAX_SUPPLY_NANO=${maxSupplyNano.toString()}`]
        : []),
      ``,
      `# Bot (@rmj/example-telegram-bot)`,
      `RMJ_BACKEND_URL=${backendOrigin}`,
      ``,
      `# Mini App + вкладка Claim`,
      `VITE_RMJ_BACKEND_URL=${backendOrigin}`,
      `VITE_JETTON_MASTER_ADDRESS=${deployedMaster}`,
    ];
    return lines.join('\n');
  }, [
    deployedMaster,
    signerSeedHex,
    backendOrigin,
    name,
    symbol,
    description,
    imageUrl,
    maxSupplyNano,
    jettonKind,
  ]);

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
        <button
          type="button"
          onClick={() => setAppTab('compliance')}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: appTab === 'compliance' ? '2px solid #7c3aed' : '1px solid #ccc',
            background: appTab === 'compliance' ? '#f5f3ff' : '#fff',
            cursor: 'pointer',
            fontWeight: appTab === 'compliance' ? 700 : 400,
          }}
        >
          Compliance &amp; диагностика
        </button>
      </div>

      {appTab === 'claim' ? (
        <>
          <h1 style={{ marginTop: 0 }}>RMJ — claim на цепь</h1>
          <ClaimTab />
        </>
      ) : appTab === 'compliance' ? (
        <>
          <h1 style={{ marginTop: 0 }}>RMJ — compliance</h1>
          <ComplianceTab
            defaultBackendUrl={backendOrigin.startsWith('http') ? backendOrigin : ''}
            defaultMaster={deployedMaster}
          />
        </>
      ) : (
        <>
      <h1 style={{ marginTop: 0 }}>Jetton Minter</h1>
      <p style={{ opacity: 0.85 }}>
        Деплой Jetton Master через TON Connect: <b>RMJ</b> (rolling tap-to-earn) или стандартный{' '}
        <b>TEP-177 Mintless</b> (Tonkeeper / MyTonWallet). Сеть: <b>{NETWORK}</b>
      </p>

      <div style={{ marginBottom: 20, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Тип jetton</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['rmj', 'mintless'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setJettonKind(kind)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: jettonKind === kind ? '2px solid #2563eb' : '1px solid #ccc',
                background: jettonKind === kind ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                fontWeight: jettonKind === kind ? 700 : 400,
                textAlign: 'left',
              }}
            >
              {JETTON_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, marginBottom: 0, marginTop: 10, opacity: 0.85 }}>
          {jettonKind === 'rmj' ? (
            <>
              Rolling claims, обновление Merkle root на цепи, tap-to-earn. Нужен <code>signer</code> в
              контракте.
            </>
          ) : (
            <>
              Контракты <code>ton-community/mintless-jetton</code>, op <code>0x0df602d6</code>, один claim
              на адрес. Merkle root <b>фиксируется при деплое</b> — для rolling наград используйте RMJ.
            </>
          )}
        </p>
      </div>

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
            {s}. {['Кошелёк', 'Токен и master', 'Деплой', 'Готово'][s - 1]}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section>
          <h2>1. Подключите админ-кошелёк</h2>
          <p>
            Этот же кошелёк станет <b>admin</b> master-контракта.
            {jettonKind === 'rmj'
              ? ' Его мнемоника понадобится бэкенду для обновления Merkle root на цепи.'
              : ' Для TEP-177 on-chain root updates нет — admin нужен для смены metadata URL при необходимости.'}
          </p>
          <TonConnectButton />
          <p style={{ opacity: 0.8 }}>{walletAddress ? `Подключено: ${walletAddress}` : 'Не подключено'}</p>
          <button type="button" disabled={!walletAddress} onClick={() => setStep(2)}>
            Далее →
          </button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>2. Токен, бэкенд и адрес master (до деплоя)</h2>
          <p>
            Минтер считает адрес master заранее. В контракт кладётся фиксированный URL{' '}
            <code>
              {backendOrigin
                ? `${backendOrigin}/${metadataFilename(jettonKind)}`
                : `…/${metadataFilename(jettonKind)}`}
            </code>{' '}
            (без master в пути — иначе адрес «плывёт»). В JSON на бэкенде{' '}
            <code>custom_payload_api_uri</code> будет <b>EQ…</b> этого master.
          </p>
          <p style={{ fontSize: 14, color: '#b45309' }}>
            <b>До деплоя</b> на Railway:{' '}
            <code>{jettonKind === 'mintless' ? 'MINTLESS_JETTON_MASTER_ADDRESS' : 'JETTON_MASTER_ADDRESS'}</code> =
            адрес ниже, плюс <code>PUBLIC_*</code> (или register). RMJ и mintless используют{' '}
            <b>разные</b> metadata URL и могут работать параллельно на одном бэкенде.
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
            {jettonKind === 'rmj' && (
              <label>
                Макс. выпуск (целых jetton, пусто = без лимита)
                <input
                  style={{ width: '100%' }}
                  value={maxSupplyWholeJettons}
                  onChange={(e) => setMaxSupplyWholeJettons(e.target.value)}
                  placeholder="например 1000000"
                />
              </label>
            )}
            {jettonKind === 'mintless' && (
              <label>
                Merkle root при деплое (hex, 64 символа — пусто = пустое дерево)
                <input
                  style={{ width: '100%' }}
                  value={mintlessMerkleRootHex}
                  onChange={(e) => setMintlessMerkleRootHex(e.target.value)}
                  placeholder={EMPTY_AIRDROP_MERKLE_ROOT.toString(16)}
                />
              </label>
            )}
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

          {jettonKind === 'rmj' && (
            <div style={{ marginTop: 20, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Signer (в контракт)</h3>
              <button type="button" onClick={regenerateSigner} style={{ marginBottom: 12 }}>
                Сгенерируйте signer (seed + pubkey)
              </button>
              {signerPubkeyHex ? (
                <pre style={{ background: '#fff', padding: 10, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
                  {`Pubkey: ${signerPubkeyHex}\nSeed → SIGNER_SEED_HEX на бэкенде`}
                </pre>
              ) : (
                <p style={{ color: '#b45309', margin: 0 }}>Обязательно перед расчётом master.</p>
              )}
            </div>
          )}

          {jettonKind === 'mintless' && (
            <div style={{ marginTop: 20, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Backend signer (не в контракте)</h3>
              <p style={{ fontSize: 13, marginTop: 0 }}>
                Бэкенд требует <code>SIGNER_SEED_HEX</code> при старте. Для TEP-177 он не попадает в master.
              </p>
              <button type="button" onClick={regenerateSigner} style={{ marginBottom: 12 }}>
                Сгенерировать seed для бэкенда
              </button>
              {signerSeedHex ? (
                <pre style={{ background: '#fff', padding: 10, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
                  {`Seed → SIGNER_SEED_HEX`}
                </pre>
              ) : null}
            </div>
          )}

          {plannedMintlessDeploy && (
            <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                On-chain <code>merkle_root</code>:{' '}
                <code>{plannedMintlessDeploy.merkleRoot.toString(16)}</code>
                <br />
                Кошельки индексируют off-chain баланс через{' '}
                <code>mintless_merkle_dump_uri</code> в metadata. Claim проверяет proof против этого root.
              </p>
            </div>
          )}

          {plannedDeploy && plannedMetadataJson && (
            <div style={{ marginTop: 16, padding: 12, background: '#eff6ff', borderRadius: 8, border: '1px solid #93c5fd' }}>
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Jetton Master (будет задеплоен)</h3>
              <p style={{ margin: '0 0 8px' }}>
                <code style={{ wordBreak: 'break-all' }}>{jettonMasterDisplay(plannedDeploy.address, testnet)}</code>
                <span style={{ opacity: 0.75, marginLeft: 8, fontSize: 12 }}>
                  raw: {plannedDeploy.address.toRawString()}
                </span>
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  onClick={() =>
                    void copyText('master', jettonMasterDisplay(plannedDeploy.address, testnet), setToast)
                  }
                >
                  Копировать
                </button>
              </p>
              <p style={{ fontSize: 13, margin: '8px 0' }}>
                On-chain metadata URL:{' '}
                <code style={{ wordBreak: 'break-all' }}>{plannedDeploy.metadataUrl}</code>
              </p>
              <p style={{ fontSize: 13, margin: '8px 0' }}>
                <code>custom_payload_api_uri</code>:{' '}
                <code style={{ wordBreak: 'break-all' }}>{plannedDeploy.customPayloadApiUri}</code>
              </p>
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>JSON метаданных (как отдаст бэкенд)</summary>
                <pre
                  style={{
                    marginTop: 8,
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 11,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(plannedMetadataJson, null, 2)}
                </pre>
              </details>
              <button
                type="button"
                style={{ marginTop: 10 }}
                onClick={() =>
                  downloadText(
                    'jetton-metadata.json',
                    JSON.stringify(plannedMetadataJson, null, 2),
                  )
                }
              >
                Скачать jetton-metadata.json (с master)
              </button>
              <pre
                style={{
                  marginTop: 12,
                  background: '#fef3c7',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {`JETTON_MASTER_ADDRESS=${jettonMasterDisplay(plannedDeploy.address, testnet)}`}
              </pre>
            </div>
          )}

          {validationStep2 && <p style={{ color: '#b45309' }}>{validationStep2}</p>}

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setStep(1)}>← Назад</button>
            <button type="button" disabled={!!validationStep2} onClick={() => setStep(3)}>
              Далее →
            </button>
          </div>
        </section>
      )}

      {step === 3 && plannedDeploy && (
        <section>
          <h2>3. Деплой Jetton Master</h2>
          <p>
            On-chain metadata: <code>{plannedDeploy.metadataUrl}</code>. Убедитесь, что на бэкенде уже стоит{' '}
            <code>
              {jettonKind === 'mintless' ? 'MINTLESS_JETTON_MASTER_ADDRESS' : 'JETTON_MASTER_ADDRESS'}=
              {jettonMasterDisplay(plannedDeploy.address, testnet)}
            </code>
            .
          </p>
          <label style={{ display: 'block', marginTop: 12 }}>
            TON на деплой master
            <input value={deployValueTon} onChange={(e) => setDeployValueTon(e.target.value)} />
          </label>
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
            Дальше: на бэкенде выставьте{' '}
            <code>
              {jettonKind === 'mintless' ? 'MINTLESS_JETTON_MASTER_ADDRESS' : 'JETTON_MASTER_ADDRESS'}=
              {deployedMaster}
            </code>{' '}
            и переменные ниже.
            Minter уже вызвал <code>POST /api/v1/jettons/register</code> — имя/символ/kартинка берутся из реестра,
            а не из старых <code>PUBLIC_JETTON_*</code>.
          </p>
          <p style={{ color: '#b45309', fontSize: 14 }}>
            On-chain URL: <code>{deployedMetadataUrl || fixedMetadataUrl(backendOrigin, jettonKind)}</code> (
            {jettonKind === 'mintless'
              ? 'отдельно от RMJ `jetton-metadata3.json`'
              : 'отдельно от mintless `mintless-jetton-metadata.json`'}
            ). Tonviewer/TonAPI могут кэшировать старый master несколько часов — сравните с
            живым JSON по этому URL. Tonscan часто показывает свежее.
          </p>
          {jettonKind === 'mintless' && (
            <p style={{ fontSize: 14 }}>
              <b>TEP-177:</b> Proof API отдаёт op <code>0x0df602d6</code>. Один claim на адрес. Для статического
              airdrop задайте финальный merkle root до деплоя; для tap-to-earn с rolling root — переключитесь на RMJ.
            </p>
          )}
          <p>
            Проверка:{' '}
            <code style={{ wordBreak: 'break-all' }}>
              {backendOrigin}/api/v1/wallet-display-audit?master={deployedMaster}
            </code>
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
                  kind: jettonKind,
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
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setDeployedMaster('');
              setDeployedMetadataUrl('');
            }}
          >
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

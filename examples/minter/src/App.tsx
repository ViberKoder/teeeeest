import { useMemo, useState } from 'react';
import { Address } from '@ton/core';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { buildDeploy } from './buildMaster';
import { MASTER_BOC_BASE64, NETWORK, WALLET_BOC_BASE64 } from './constants';

function toBigIntSafe(v: string): bigint | null {
  try {
    if (!/^[0-9]+$/.test(v)) return null;
    return BigInt(v);
  } catch {
    return null;
  }
}

export function App() {
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [metadataUrl, setMetadataUrl] = useState('https://example.com/jetton-metadata.json');
  const [signerPubkeyHex, setSignerPubkeyHex] = useState('');
  const [deployValueTon, setDeployValueTon] = useState('0.1');
  const [status, setStatus] = useState('');

  const validation = useMemo(() => {
    if (!walletAddress) return 'Connect wallet first';
    if (!metadataUrl.trim()) return 'Metadata URL is required';
    if (!/^[0-9]+(\.[0-9]+)?$/.test(deployValueTon)) return 'Deploy TON must be a number';
    if (!/^[0-9a-fA-F]{64}$/.test(signerPubkeyHex)) return 'Signer pubkey must be 32-byte hex (64 chars)';
    return null;
  }, [walletAddress, metadataUrl, deployValueTon, signerPubkeyHex]);

  async function deploy() {
    if (validation) {
      setStatus(validation);
      return;
    }
    try {
      setStatus('Preparing deployment transaction...');

      const admin = Address.parse(walletAddress);
      const { address, stateInit } = buildDeploy({
        admin,
        signerPubkeyHex,
        metadataUrl: metadataUrl.trim(),
        walletCodeBase64: WALLET_BOC_BASE64,
        masterCodeBase64: MASTER_BOC_BASE64,
      });
      const masterAddress = address.toString({
        bounceable: false,
        urlSafe: true,
      });

      const deployNano = BigInt(Math.floor(Number(deployValueTon) * 1e9)).toString();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: masterAddress,
            amount: deployNano,
            stateInit: stateInit.toBoc().toString('base64'),
          },
        ],
      });

      setStatus(`Deployment sent. Master address: ${masterAddress}`);
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div className="minter-page">
      <div className="minter-container">
        <div className="minter-header-card">
          <div>
            <h1 className="minter-title">Rolling Mintless Jetton Minter</h1>
            <p className="minter-subtitle">
              Быстрый деплой Master-контракта для вашего RMJ проекта
            </p>
          </div>
          <TonConnectButton />
        </div>

        <div className="minter-info-row">
          <div className="minter-info-chip">
            Network: <b className="minter-info-strong">{NETWORK}</b>
          </div>
          <div className="minter-info-chip">
            Wallet:{' '}
            <b className="minter-info-strong">
              {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : 'not connected'}
            </b>
          </div>
        </div>

        <div className="minter-card">
          <h2 className="minter-card-title">Deployment params</h2>

          <div className="minter-form-grid">
            <Field label="Metadata URL (TEP-64 off-chain)">
              <input
                className="minter-input"
                value={metadataUrl}
                onChange={(e) => setMetadataUrl(e.target.value)}
                placeholder="https://example.com/jetton-metadata.json"
              />
            </Field>

            <Field label="Signer public key (hex, 64 chars)">
              <input
                className="minter-input"
                value={signerPubkeyHex}
                onChange={(e) => setSignerPubkeyHex(e.target.value.trim())}
                placeholder="e.g. d04ab232..."
              />
            </Field>

            <Field label="Deploy TON value">
              <input
                className="minter-input"
                value={deployValueTon}
                onChange={(e) => setDeployValueTon(e.target.value)}
                placeholder="0.1"
              />
            </Field>
          </div>

          <button
            onClick={deploy}
            disabled={Boolean(validation)}
            className="minter-deploy-btn"
          >
            Deploy Rolling Mintless Master
          </button>

          <p className="minter-hint">
            Контрактный код берётся из <code>contracts/build/*.boc</code>.
            После подтверждения в кошельке вы получите адрес нового Master.
          </p>
        </div>

        {validation && (
          <div className="minter-warn-box">
            <b>Validation:</b> {validation}
          </div>
        )}

        {status && <pre className="minter-status-box">{status}</pre>}
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="minter-field">
      <span className="minter-field-label">{props.label}</span>
      {props.children}
    </label>
  );
}


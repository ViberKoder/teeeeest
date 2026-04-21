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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Rolling Mintless Jetton Minter</h1>
      <p>Network: <b>{NETWORK}</b></p>
      <TonConnectButton />
      <p style={{ opacity: 0.8 }}>Connected wallet: {walletAddress || 'not connected'}</p>

      <div style={{ display: 'grid', gap: 12 }}>
        <label>Metadata URL (TEP-64 off-chain)
          <input value={metadataUrl} onChange={(e) => setMetadataUrl(e.target.value)} />
        </label>

        <label>Signer public key (hex, 64 chars)
          <input value={signerPubkeyHex} onChange={(e) => setSignerPubkeyHex(e.target.value.trim())} placeholder="e.g. d04ab232..." />
        </label>
        <label>Deploy TON value <input value={deployValueTon} onChange={(e) => setDeployValueTon(e.target.value)} /></label>
      </div>

      <button onClick={deploy} style={{ marginTop: 16, padding: '12px 18px', fontSize: 16 }}>
        Deploy Rolling Mintless Master
      </button>

      {validation && <p style={{ color: '#b45309' }}>Validation: {validation}</p>}
      {status && <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12 }}>{status}</pre>}
    </div>
  );
}


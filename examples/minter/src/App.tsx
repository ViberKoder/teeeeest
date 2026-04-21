import { CSSProperties, useMemo, useState } from 'react';
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
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div>
            <h1 style={styles.title}>Rolling Mintless Jetton Minter</h1>
            <p style={styles.subtitle}>
              Быстрый деплой Master-контракта для вашего RMJ проекта
            </p>
          </div>
          <TonConnectButton />
        </div>

        <div style={styles.infoRow}>
          <div style={styles.infoChip}>
            Network: <b style={styles.infoChipStrong}>{NETWORK}</b>
          </div>
          <div style={styles.infoChip}>
            Wallet:{' '}
            <b style={styles.infoChipStrong}>
              {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : 'not connected'}
            </b>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Deployment params</h2>

          <div style={styles.formGrid}>
            <Field label="Metadata URL (TEP-64 off-chain)">
              <input
                style={styles.input}
                value={metadataUrl}
                onChange={(e) => setMetadataUrl(e.target.value)}
                placeholder="https://example.com/jetton-metadata.json"
              />
            </Field>

            <Field label="Signer public key (hex, 64 chars)">
              <input
                style={styles.input}
                value={signerPubkeyHex}
                onChange={(e) => setSignerPubkeyHex(e.target.value.trim())}
                placeholder="e.g. d04ab232..."
              />
            </Field>

            <Field label="Deploy TON value">
              <input
                style={styles.input}
                value={deployValueTon}
                onChange={(e) => setDeployValueTon(e.target.value)}
                placeholder="0.1"
              />
            </Field>
          </div>

          <button
            onClick={deploy}
            disabled={Boolean(validation)}
            style={{
              ...styles.deployButton,
              ...(validation ? styles.deployButtonDisabled : {}),
            }}
          >
            Deploy Rolling Mintless Master
          </button>

          <p style={styles.hint}>
            Контрактный код берётся из <code>contracts/build/*.boc</code>.
            После подтверждения в кошельке вы получите адрес нового Master.
          </p>
        </div>

        {validation && (
          <div style={styles.warnBox}>
            <b>Validation:</b> {validation}
          </div>
        )}

        {status && <pre style={styles.statusBox}>{status}</pre>}
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{props.label}</span>
      {props.children}
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at 20% 20%, #1f2a44 0%, #0f1524 35%, #090d17 100%)',
    color: '#e5e7eb',
    fontFamily:
      'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    padding: '28px 16px',
  },
  container: {
    maxWidth: 860,
    margin: '0 auto',
    display: 'grid',
    gap: 16,
  },
  headerCard: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(12, 17, 29, 0.8)',
    backdropFilter: 'blur(6px)',
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '8px 0 0',
    opacity: 0.75,
    fontSize: 14,
  },
  infoRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoChip: {
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(12, 17, 29, 0.65)',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 13,
    color: '#cbd5e1',
  },
  infoChipStrong: {
    color: '#f8fafc',
  },
  card: {
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(12, 17, 29, 0.82)',
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    margin: '0 0 14px',
    fontSize: 18,
    fontWeight: 600,
  },
  formGrid: {
    display: 'grid',
    gap: 12,
  },
  field: {
    display: 'grid',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    opacity: 0.85,
  },
  input: {
    background: '#0b1220',
    border: '1px solid #263247',
    color: '#e5e7eb',
    borderRadius: 10,
    padding: '11px 12px',
    fontSize: 14,
    outline: 'none',
  },
  deployButton: {
    marginTop: 16,
    padding: '12px 16px',
    borderRadius: 10,
    border: 'none',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
    color: '#fff',
  },
  deployButtonDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
  hint: {
    margin: '12px 0 0',
    fontSize: 12,
    opacity: 0.7,
  },
  warnBox: {
    borderRadius: 12,
    border: '1px solid rgba(251,191,36,0.35)',
    background: 'rgba(120, 53, 15, 0.22)',
    color: '#fde68a',
    padding: 12,
    fontSize: 14,
  },
  statusBox: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(2, 6, 23, 0.85)',
    color: '#dbeafe',
    padding: 12,
    fontSize: 13,
    lineHeight: 1.45,
  },
};


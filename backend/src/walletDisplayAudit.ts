import { Address, Cell } from '@ton/core';

const OP_ROLLING_CLAIM = 0xc9e56df3;
const OP_MERKLE_CLAIM = 0x0df602d6;

export type AuditSeverity = 'ok' | 'warn' | 'fail';

export type AuditCheck = {
  id: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  hint?: string;
};

export type WalletDisplayAuditReport = {
  checked_at: string;
  ton_network: string;
  master_address: string;
  owner_address: string | null;
  checks: AuditCheck[];
  summary: { ok: number; warn: number; fail: number };
  /** What MyTonWallet-style clients likely call */
  wallet_fetch_urls: string[];
};

type JsonRecord = Record<string, unknown>;

async function fetchJson(url: string, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text */
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function parseCustomPayloadOp(b64: string): number | null {
  try {
    const cell = Cell.fromBoc(Buffer.from(b64, 'base64'))[0];
    return cell.beginParse().loadUint(32);
  } catch {
    return null;
  }
}

function check(id: string, severity: AuditSeverity, title: string, detail: string, hint?: string): AuditCheck {
  return { id, severity, title, detail, hint };
}

export async function runWalletDisplayAudit(params: {
  masterAddress: string;
  ownerAddress?: string | null;
  backendBase?: string;
  tonNetwork?: 'mainnet' | 'testnet';
}): Promise<WalletDisplayAuditReport> {
  const checks: AuditCheck[] = [];
  const walletFetchUrls: string[] = [];

  const tonNetwork = params.tonNetwork ?? 'mainnet';
  const backendBase = (params.backendBase ?? '').trim().replace(/\/$/, '');
  const master = Address.parse(params.masterAddress);
  const masterEq = master.toString({ urlSafe: true, bounceable: true, testOnly: tonNetwork === 'testnet' });
  const masterRaw = master.toRawString();

  let ownerRaw: string | null = null;
  if (params.ownerAddress?.trim()) {
    ownerRaw = Address.parse(params.ownerAddress.trim()).toRawString();
  }

  // --- On-chain content URL (Toncenter) ---
  let contentUrl: string | null = null;
  const tokenData = await fetchJson(
    `https://toncenter.com/api/v2/getTokenData?address=${encodeURIComponent(masterEq)}`,
  );
  if (tokenData.ok && tokenData.body && typeof tokenData.body === 'object') {
    const result = (tokenData.body as { result?: { jetton_content?: { data?: string } } }).result;
    contentUrl = result?.jetton_content?.data ?? null;
    checks.push(
      check(
        'toncenter_token_data',
        contentUrl ? 'ok' : 'fail',
        'Toncenter getTokenData',
        contentUrl ? `off-chain URI: ${contentUrl}` : 'could not read jetton_content',
      ),
    );
  } else {
    checks.push(
      check('toncenter_token_data', 'warn', 'Toncenter getTokenData', `HTTP ${tokenData.status} — rate limit?`),
    );
  }

  // --- Hosted metadata (wallets fetch this URL from chain) ---
  let hostedMeta: JsonRecord | null = null;
  if (contentUrl) {
    const hosted = await fetchJson(contentUrl);
    if (hosted.ok && hosted.body && typeof hosted.body === 'object') {
      hostedMeta = hosted.body as JsonRecord;
      const uri = String(hostedMeta.custom_payload_api_uri ?? '');
      const dec = String(hostedMeta.decimals ?? '');
      const uriOk =
        uri &&
        dec !== '' &&
        uri.includes('/api/v1/jettons/') &&
        !uri.endsWith('/custom-payload') &&
        !uri.endsWith('/api/v1/custom-payload');
      checks.push(
        check(
          'hosted_metadata',
          uriOk ? 'ok' : 'fail',
          'Hosted jetton metadata (on-chain URL)',
          `decimals=${dec}, custom_payload_api_uri=${uri || '(missing)'}`,
          uriOk
            ? undefined
            : 'TEP: URI must be final API root …/api/v1/jettons/{master} (see jetton-offchain-payloads)',
        ),
      );
      if (uri) walletFetchUrls.push(`${uri.replace(/\/$/, '')}/wallet/${ownerRaw ?? '{owner_raw}'}`);
    } else {
      checks.push(
        check('hosted_metadata', 'fail', 'Hosted jetton metadata', `HTTP ${hosted.status} from ${contentUrl}`),
      );
    }
  }

  // --- Backend mirror ---
  if (backendBase) {
    const canonicalMetaUrl = `${backendBase}/api/v1/jettons/${encodeURIComponent(masterEq)}/metadata.json`;
    const mirror = await fetchJson(canonicalMetaUrl);
    if (mirror.ok && mirror.body && typeof mirror.body === 'object') {
      const m = mirror.body as JsonRecord;
      const uri = String(m.custom_payload_api_uri ?? '');
      checks.push(
        check(
          'backend_jetton_metadata',
          'ok',
          'GET /api/v1/jettons/{master}/metadata.json',
          `decimals=${m.decimals}, custom_payload_api_uri=${uri}`,
        ),
      );
      if (hostedMeta) {
        const hostedUri = String(hostedMeta.custom_payload_api_uri ?? '');
        const mismatch = hostedUri !== uri;
        checks.push(
          check(
            'metadata_host_vs_backend',
            mismatch ? 'warn' : 'ok',
            'On-chain URL vs backend canonical metadata',
            mismatch ? `chain URL returns ${hostedUri}, backend serves ${uri}` : 'URIs match',
          ),
        );
      }
    } else {
      checks.push(
        check(
          'backend_jetton_metadata',
          'fail',
          'GET /api/v1/jettons/{master}/metadata.json',
          `HTTP ${mirror.status}`,
        ),
      );
    }
  }

  // --- TonAPI index (explorers / some wallets) ---
  const tonapi = await fetchJson(`https://tonapi.io/v2/jettons/${encodeURIComponent(masterEq)}`);
  if (tonapi.ok && tonapi.body && typeof tonapi.body === 'object') {
    const meta = (tonapi.body as { metadata?: JsonRecord }).metadata ?? {};
    const uri = String(meta.custom_payload_api_uri ?? '');
    const dec = String(meta.decimals ?? '');
    checks.push(
      check(
        'tonapi_jetton',
        'ok',
        'TonAPI GET /v2/jettons/{master}',
        `decimals=${dec}, custom_payload_api_uri=${uri || '(missing)'}`,
        'TonAPI may cache metadata for hours — compare with hosted JSON',
      ),
    );
    if (hostedMeta) {
      const hostedUri = String(hostedMeta.custom_payload_api_uri ?? '');
      const hostedDec = String(hostedMeta.decimals ?? '');
      if (uri && hostedUri && uri !== hostedUri) {
        checks.push(
          check(
            'tonapi_uri_stale',
            'fail',
            'TonAPI custom_payload_api_uri ≠ live metadata',
            `TonAPI: ${uri}\nLive:  ${hostedUri}`,
            'Wallets using TonAPI may call a dead URL. Re-save on-chain content or wait for TonAPI reindex. Add legacy API routes on backend.',
          ),
        );
        walletFetchUrls.push(`${uri.replace(/\/$/, '')}/wallet/${ownerRaw ?? '{owner_raw}'} (TonAPI — may 404)`);
      }
      if (dec !== hostedDec) {
        checks.push(
          check(
            'tonapi_decimals_mismatch',
            'warn',
            'TonAPI decimals ≠ hosted metadata',
            `TonAPI decimals=${dec}, hosted decimals=${hostedDec} — UI may show wrong scale`,
          ),
        );
      }
    }
  } else {
    checks.push(check('tonapi_jetton', 'warn', 'TonAPI jetton', `HTTP ${tonapi.status}`));
  }

  // --- Wallet proof API (owner required) ---
  if (ownerRaw && backendBase) {
    const paths = [
      `${backendBase}/api/v1/jettons/${encodeURIComponent(masterEq)}/wallet/${ownerRaw}`,
      `${backendBase}/api/v1/custom-payload/wallet/${ownerRaw}`,
      `${backendBase}/api/v1/custom-payload/${ownerRaw}`,
    ];
    if (hostedMeta?.custom_payload_api_uri) {
      const root = String(hostedMeta.custom_payload_api_uri).replace(/\/$/, '');
      paths.unshift(`${root}/wallet/${ownerRaw}`);
    }

    for (const url of paths) {
      const r = await fetchJson(url);
      const short = url.replace(backendBase, '');
      if (r.status === 404 && r.body && typeof r.body === 'object') {
        const err = (r.body as { error?: string }).error;
        if (err === 'address-not-in-tree' || err === 'nothing-to-claim') {
          checks.push(
            check(`wallet_api_${short}`, 'warn', `Wallet API ${short}`, `HTTP 404: ${err} — route works, user not eligible`),
          );
          continue;
        }
      }
      if (!r.ok) {
        checks.push(
          check(
            `wallet_api_${short}`,
            'fail',
            `Wallet API ${short}`,
            `HTTP ${r.status} — ${typeof r.body === 'object' ? JSON.stringify(r.body).slice(0, 120) : r.body}`,
            r.status === 404 && String(r.body).includes('Route')
              ? 'Route missing on backend — restore /api/v1/custom-payload/wallet or deploy sdk-mintless branch'
              : undefined,
          ),
        );
        continue;
      }
      const body = r.body as JsonRecord;
      const b64 = String(body.custom_payload ?? '');
      const op = b64 ? parseCustomPayloadOp(b64) : null;
      const opName =
        op === OP_ROLLING_CLAIM
          ? 'rolling_claim (RMJ)'
          : op === OP_MERKLE_CLAIM
            ? 'merkle_airdrop_claim (standard)'
            : op != null
              ? `unknown 0x${op.toString(16)}`
              : 'unparseable';
      checks.push(
        check(
          `wallet_api_${short}`,
          'ok',
          `Wallet API ${short}`,
          `amount=${(body.compressed_info as JsonRecord)?.amount ?? '?'}, custom_payload op=${opName}`,
        ),
      );
    }
  } else if (!ownerRaw) {
    checks.push(
      check(
        'wallet_api',
        'warn',
        'Wallet proof API',
        'Pass ?owner=0:… to test GET …/wallet/{owner}',
      ),
    );
  }

  const summary = {
    ok: checks.filter((c) => c.severity === 'ok').length,
    warn: checks.filter((c) => c.severity === 'warn').length,
    fail: checks.filter((c) => c.severity === 'fail').length,
  };

  return {
    checked_at: new Date().toISOString(),
    ton_network: tonNetwork,
    master_address: masterEq,
    owner_address: ownerRaw,
    checks,
    summary,
    wallet_fetch_urls: [...new Set(walletFetchUrls)],
  };
}

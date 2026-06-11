#!/usr/bin/env node
/**
 * npm run compliance-check -- --backend URL [--owner 0:…]
 * Hits GET /api/v1/jettons/{master}/compliance (master from backend env).
 */
async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const backend = (arg('backend') ?? '').replace(/\/$/, '');
  const owner = arg('owner');
  if (!backend) {
    console.error('Usage: --backend URL [--owner 0:…]');
    process.exit(1);
  }

  const health = await fetchJson(`${backend}/health`);
  const master = health.jetton_master_configured
    ? await resolveMasterFromDiagnostics(backend)
    : null;

  if (!master) {
    console.error('Backend has no JETTON_MASTER_ADDRESS — set env and redeploy');
    process.exit(1);
  }

  const qs = owner ? `?owner=${encodeURIComponent(owner)}` : '';
  const report = await fetchJson(`${backend}/api/v1/jettons/${encodeURIComponent(master)}/compliance${qs}`);

  console.log(`\nMintless compliance — ${report.onChainMaster}`);
  console.log(`Rolling: epoch=${report.rolling.epoch}, tree=${report.rolling.tree_size}, root=${report.rolling.merkle_root}`);
  console.log(`${report.summary}\n`);

  for (const c of report.checks) {
    const mark = c.pass ? '✓' : '✗';
    console.log(`${mark} [${c.group}] ${c.label}`);
    if (c.note) console.log(`    ${c.note}`);
  }

  if (report.indexerHints) {
    console.log(`\nIndexer: ${report.indexerHints.recommendedAction}`);
  }

  process.exit(report.score < report.total ? 1 : 0);
}

async function resolveMasterFromDiagnostics(backend) {
  const diag = await fetchJson(`${backend}/api/v1/diagnostics`);
  const uri = diag.custom_payload_api_uri;
  if (!uri) return null;
  const m = String(uri).match(/\/jettons\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

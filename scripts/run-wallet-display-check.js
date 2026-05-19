#!/usr/bin/env node
/**
 * npm run wallet-display-check -- --backend URL --master EQ… [--owner 0:…]
 */
const { runWalletDisplayAudit } = require('../backend/dist/walletDisplayAudit.js');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const backend = arg('backend');
  const master = arg('master');
  const owner = arg('owner');
  if (!backend || !master) {
    console.error('Usage: --backend URL --master EQ… [--owner 0:…]');
    process.exit(1);
  }

  const report = await runWalletDisplayAudit({
    masterAddress: master,
    ownerAddress: owner ?? null,
    backendBase: backend,
    tonNetwork: process.env.TON_NETWORK === 'testnet' ? 'testnet' : 'mainnet',
  });

  const icon = { ok: '✓', warn: '!', fail: '✗' };
  console.log(`\nWallet display audit — ${report.master_address}`);
  console.log(`${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.ok} ok\n`);

  for (const c of report.checks) {
    console.log(`${icon[c.severity]} ${c.title}`);
    console.log(`    ${c.detail.replace(/\n/g, '\n    ')}`);
    if (c.hint) console.log(`    → ${c.hint}`);
    console.log();
  }

  process.exit(report.summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

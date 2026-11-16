// Builds EggWallet and EggMinter with the Tolk compiler from npm (@ton/tolk-js) into build/, in the format
// `acton build` writes — for machines without Acton. Checked to give byte-identical code to Acton 1.2.1 (Tolk 1.5.0).
//
//   node scripts/build-tolk.mjs && node scripts/export-artifacts.mjs
import { runTolkCompiler, getTolkCompilerVersion } from '@ton/tolk-js';
import { Cell } from '@ton/core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'build'), { recursive: true });

let walletBoc64 = null;
async function build(name) {
  const r = await runTolkCompiler({
    entrypointFileName: `contracts/${name}.tolk`,
    fsReadCallback: (p) => {
      // Acton generates this file (`@gen/EggWallet.code`): the wallet's code embedded in the minter
      if (p.endsWith('EggWallet.code.tolk')) {
        const hex = Cell.fromBase64(walletBoc64).toBoc().toString('hex');
        return `fun eggWalletCompiledCode(): cell\n    asm "B{${hex}} B>boc PUSHREF"\n`;
      }
      return readFileSync(p.startsWith('/') ? p : join(root, p), 'utf8').replace('import "@gen/EggWallet.code"', 'import "EggWallet.code"');
    },
    optimizationLevel: 2,
    withStackComments: false,
  });
  if (r.status === 'error') throw new Error(`${name}: ${r.message}`);
  writeFileSync(join(root, 'build', `${name}.json`), JSON.stringify({ code_boc64: r.codeBoc64, hash: r.codeHashHex }, null, 2) + '\n');
  console.log('built', name, r.codeHashHex.toLowerCase().slice(0, 16), Buffer.from(r.codeBoc64, 'base64').length, 'bytes');
  return r.codeBoc64;
}

console.log('tolk', await getTolkCompilerVersion());
walletBoc64 = await build('EggWallet'); // first: the minter embeds it
await build('EggMinter');

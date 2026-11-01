// Copies the code of every contract built by `acton build` into artifacts/ (committed),
// so TypeScript packages and CI can use the exact bytecode without installing Acton.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'artifacts'), { recursive: true });
for (const name of ['EggMinter', 'EggWallet']) {
  const { code_boc64, hash } = JSON.parse(readFileSync(join(root, 'build', `${name}.json`), 'utf8'));
  writeFileSync(join(root, 'artifacts', `${name}.json`), JSON.stringify({ name, hash: hash.toLowerCase(), codeBoc64: code_boc64 }, null, 2) + '\n');
  console.log('exported', name, hash.slice(0, 16));
}

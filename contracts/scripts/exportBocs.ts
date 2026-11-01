import { compile } from '@ton/blueprint';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const dir = join(__dirname, '..', 'build');
  mkdirSync(dir, { recursive: true });
  for (const name of ['EggMaster', 'EggWallet']) {
    const cell = await compile(name);
    writeFileSync(join(dir, `${name}.boc`), cell.toBoc());
    console.log(name, cell.hash().toString('hex'));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

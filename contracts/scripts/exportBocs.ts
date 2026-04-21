import { compile } from '@ton/blueprint';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  mkdirSync(join(__dirname, '..', 'build'), { recursive: true });
  for (const name of ['RollingMintlessMaster', 'RollingMintlessWallet']) {
    const cell = await compile(name);
    const out = join(__dirname, '..', 'build', `${name}.boc`);
    writeFileSync(out, cell.toBoc());
    console.log('wrote', out, 'hash:', cell.hash().toString('hex'));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

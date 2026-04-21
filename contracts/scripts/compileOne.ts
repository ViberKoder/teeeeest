import { compile } from '@ton/blueprint';

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('usage: compileOne <Name>');
  const cell = await compile(name);
  console.log('OK', name, 'hash:', cell.hash().toString('hex'), 'bits:', cell.bits.length);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});

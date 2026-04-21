import { buildAll } from '@ton/blueprint';

async function main() {
  await buildAll();
  console.log('All contracts built.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

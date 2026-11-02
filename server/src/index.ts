import { buildApp } from './app';
import { TonChain } from './chain';
import { loadConfig } from './config';
import { Db } from './db';
import { Publisher } from './publisher';

async function main() {
  const config = loadConfig();
  const db = new Db(config.DB_PATH);
  const chain = new TonChain({
    minter: config.JETTON_MASTER_ADDRESS, network: config.NETWORK, apiKey: config.TONCENTER_KEY,
    mnemonic: config.PUBLISHER_MNEMONIC, relayerMnemonic: config.RELAYER_MNEMONIC,
  });
  const publisher = new Publisher(db, chain, { maxSupply: config.MAX_SUPPLY_UNITS });
  const app = await buildApp({ config, db, publisher, chain: config.RELAYER_MNEMONIC ? chain : undefined });
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`egg-server listening on :${config.PORT}`);

  let running = false;
  const tick = async () => {
    if (running || !config.PUBLISHER_MNEMONIC) return;
    running = true;
    try {
      const r = await publisher.tick();
      if (r.action !== 'idle') console.log('publisher:', r);
      if (r.action === 'conflict') console.error('CONFLICT: the chain holds a different root for this epoch — stop and investigate');
    } catch (e) {
      console.error('publisher error:', (e as Error).message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), config.PUBLISH_INTERVAL_SECONDS * 1000);
  setTimeout(() => void tick(), 5000);

  const stop = async () => {
    clearInterval(timer);
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

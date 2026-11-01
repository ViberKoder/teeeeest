import { Address } from '@ton/core';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Db } from './db';
import { ClaimSigner, decodeCert } from './signer';

async function main() {
  const config = loadConfig();
  const db = new Db(config.DB_PATH);
  const signer = new ClaimSigner(
    config.SIGNER_SEED_HEX,
    Address.parse(config.JETTON_MASTER_ADDRESS),
    Buffer.from(config.AUTHORITY_PUBKEY_HEX, 'hex'),
    decodeCert(config.KEY_CERT_B64),
  );
  const app = await buildApp({ config, db, signer });
  await app.listen({ port: config.PORT, host: config.HOST });
  const left = Math.floor(signer.certTtl(Math.floor(Date.now() / 1000)) / 86_400);
  console.log(`egg-server listening on :${config.PORT}  signer=${signer.publicKey.toString('hex').slice(0, 8)}…  cert valid ${left}d`);
  if (left < 7) console.warn('WARNING: signer certificate expires in under 7 days — issue a new one (npm run cert)');

  const stop = async () => {
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

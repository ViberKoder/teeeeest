import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { config } from './config';
import { logger } from './logger';
import { createAppStore } from './store/createStore';
import { AirdropState } from './state';
import { GameServer } from './gameServer';
import { voucherSigner } from './signer';
import { RootUpdater } from './rootUpdater';
import { TreeBuilder } from './treeBuilder';
import { registerProofApi } from './routes/proofApi';
import { registerGameApi } from './routes/gameApi';
import { registerAdminApi } from './routes/adminApi';
import { registerPublicJettonMetadata } from './routes/publicJettonMetadata';

async function main() {
  const store = await createAppStore();
  const state = await AirdropState.hydrate(store);
  const gameServer = new GameServer(store);
  const rootUpdater = new RootUpdater(store);
  await rootUpdater.init();
  const treeBuilder = new TreeBuilder(store, state, gameServer, voucherSigner, rootUpdater);

  const app = Fastify({
    logger: logger as any,
    bodyLimit: 1024 * 256,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((s) => s.trim()),
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  const dbKind = config.DATABASE_URL.trim() ? 'postgres' : 'sqlite';

  app.get('/health', async () => ({
    status: 'ok',
    epoch: state.epoch,
    tree_size: state.tree.size,
    signer_pubkey: voucherSigner.publicKeyHex,
    db: dbKind,
  }));

  registerPublicJettonMetadata(app);
  registerProofApi(app, { state, gameServer, signer: voucherSigner });
  registerGameApi(app, { gameServer });
  registerAdminApi(app, { gameServer, treeBuilder });

  treeBuilder.start();

  const shutdown = async (code = 0) => {
    logger.info('shutting down');
    treeBuilder.stop();
    try {
      await app.close();
    } catch (e) {
      logger.error({ err: e }, 'error closing app');
    }
    try {
      await store.close();
    } catch (e) {
      logger.error({ err: e }, 'error closing db');
    }
    process.exit(code);
  };

  process.on('SIGTERM', () => void shutdown(0));
  process.on('SIGINT', () => void shutdown(0));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
  });

  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info({ host: config.HOST, port: config.PORT }, 'rmj backend listening');
}

main().catch((e) => {
  logger.error({ err: e }, 'fatal startup error');
  process.exit(1);
});

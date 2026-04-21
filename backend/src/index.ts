import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { config } from './config';
import { logger } from './logger';
import { createDb } from './db';
import { AirdropState } from './state';
import { GameServer } from './gameServer';
import { voucherSigner } from './signer';
import { RootUpdater } from './rootUpdater';
import { TreeBuilder } from './treeBuilder';
import { registerProofApi } from './routes/proofApi';
import { registerGameApi } from './routes/gameApi';
import { registerAdminApi } from './routes/adminApi';

async function main() {
  const db = createDb();
  const state = AirdropState.hydrate(db);
  const gameServer = new GameServer(db);
  const rootUpdater = new RootUpdater(db);
  await rootUpdater.init();
  const treeBuilder = new TreeBuilder(db, state, gameServer, voucherSigner, rootUpdater);

  const app = Fastify({
    logger: logger as any,
    bodyLimit: 1024 * 256,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map(s => s.trim()),
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  app.get('/health', async () => ({
    status: 'ok',
    epoch: state.epoch,
    tree_size: state.tree.size,
    signer_pubkey: voucherSigner.publicKeyHex,
  }));

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
      db.close();
    } catch (e) {
      logger.error({ err: e }, 'error closing db');
    }
    process.exit(code);
  };

  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGINT', () => shutdown(0));
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

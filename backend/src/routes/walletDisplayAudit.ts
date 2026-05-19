import { FastifyInstance } from 'fastify';
import { runWalletDisplayAudit } from '../walletDisplayAudit';
import { config } from '../config';
import { logger } from '../logger';

/**
 * Operator / CI endpoint: compare hosted metadata, TonAPI index, and wallet proof URLs.
 * GET /api/v1/wallet-display-audit?master=EQ…&owner=0:…
 */
export function registerWalletDisplayAudit(app: FastifyInstance): void {
  app.get<{
    Querystring: { master?: string; owner?: string; backend?: string };
  }>('/api/v1/wallet-display-audit', async (req, reply) => {
    const master = req.query.master?.trim() || config.JETTON_MASTER_ADDRESS?.trim();
    if (!master) {
      reply.code(400);
      return {
        error: 'master-required',
        hint: 'Set JETTON_MASTER_ADDRESS or pass ?master=EQ…',
      };
    }

    try {
      const report = await runWalletDisplayAudit({
        masterAddress: master,
        ownerAddress: req.query.owner ?? null,
        backendBase: req.query.backend?.trim() || config.PUBLIC_APP_URL,
        tonNetwork: config.TON_NETWORK,
      });
      reply.type('application/json; charset=utf-8');
      return report;
    } catch (e) {
      logger.error({ err: e }, 'wallet-display-audit failed');
      reply.code(500);
      return { error: 'audit-failed', message: (e as Error).message };
    }
  });

  logger.info('wallet display audit: GET /api/v1/wallet-display-audit');
}

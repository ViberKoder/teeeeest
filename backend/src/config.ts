import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ORIGINS: z.string().default('*'),

  ADMIN_JWT_SECRET: z.string().min(16),
  SIGNER_SEED_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/),
  ADMIN_MNEMONIC: z.string().default(''),

  TON_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  TON_RPC_ENDPOINT: z.string().default(''),
  TON_RPC_API_KEY: z.string().default(''),
  JETTON_MASTER_ADDRESS: z.string().default(''),

  EPOCH_DURATION_SECONDS: z.coerce.number().int().min(30).default(600),
  PROOF_VALIDITY_WINDOW_DAYS: z.coerce.number().int().min(1).default(365),

  MAX_TAPS_PER_SECOND: z.coerce.number().int().min(1).default(5),
  MAX_TAPS_PER_DAY: z.coerce.number().int().min(1).default(100_000),
  TAP_VALUE_NANO: z.coerce.bigint().default(1_000_000_000n),

  DB_PATH: z.string().default('./rmj.db'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

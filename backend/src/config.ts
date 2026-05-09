import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Pretty-print logs (pino-pretty). Default: on when NODE_ENV≠production; override with LOG_PRETTY=true on hosted dashboards. */
  LOG_PRETTY: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
  CORS_ORIGINS: z.string().default('*'),

  ADMIN_JWT_SECRET: z.string().min(16),
  SIGNER_SEED_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/),
  ADMIN_MNEMONIC: z.string().default(''),
  /** Optional passphrase for ADMIN_MNEMONIC (Tonkeeper “mnemonic password”) — required if you enabled one when creating the wallet. */
  ADMIN_MNEMONIC_PASSWORD: z.string().default(''),
  /**
   * Ed25519 secret as hex: 64 chars = 32-byte seed, 128 chars = 64-byte NaCl secret key.
   * If set, used instead of ADMIN_MNEMONIC for on-chain root updates.
   */
  ADMIN_PRIVATE_KEY_HEX: z
    .string()
    .default('')
    .refine(
      (val) => {
        const t = val.trim().replace(/^0x/i, '').replace(/\s+/g, '');
        if (t.length === 0) return true;
        if (!/^[0-9a-fA-F]+$/.test(t)) return false;
        return t.length === 64 || t.length === 128;
      },
      {
        message:
          'ADMIN_PRIVATE_KEY_HEX must be empty, 64 hex chars (32-byte seed), or 128 hex chars (64-byte secret)',
      },
    ),
  /** Admin wallet contract version used for on-chain root updates. */
  ADMIN_WALLET_VERSION: z.enum(['v4', 'v5r1']).default('v4'),
  /** Optional: expected admin wallet address (from Tonkeeper). Used to validate/autodetect v5r1 subwallet. */
  ADMIN_WALLET_ADDRESS: z.string().default(''),
  /** v5r1 subwallet number (0..32767). If ADMIN_WALLET_ADDRESS is provided, backend can auto-detect this. */
  ADMIN_V5R1_SUBWALLET: z.coerce.number().int().min(0).max(32767).default(0),

  TON_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  TON_RPC_ENDPOINT: z.string().default(''),
  TON_RPC_API_KEY: z.string().default(''),
  JETTON_MASTER_ADDRESS: z.string().default(''),

  EPOCH_DURATION_SECONDS: z.coerce.number().int().min(10).default(60),
  PROOF_VALIDITY_WINDOW_DAYS: z.coerce.number().int().min(1).default(365),

  MAX_TAPS_PER_SECOND: z.coerce.number().int().min(1).default(5),
  MAX_TAPS_PER_DAY: z.coerce.number().int().min(1).default(100_000),
  TAP_VALUE_NANO: z.coerce.bigint().default(1_000_000_000n),

  DB_PATH: z.string().default('./rmj.db'),

  /** When set (e.g. Railway Postgres `DATABASE_URL`), PostgreSQL is used instead of SQLite. */
  DATABASE_URL: z.string().default(''),
  /** TLS for Postgres: require / prefer / disable (Railway usually needs require or prefer). */
  DATABASE_SSL: z.enum(['require', 'disable', 'prefer']).default('prefer'),

  /** Public HTTPS origin of this backend (no trailing slash), e.g. https://rmj-xxxx.onrender.com */
  PUBLIC_APP_URL: z.string().default(''),
  PUBLIC_JETTON_NAME: z.string().default(''),
  PUBLIC_JETTON_SYMBOL: z.string().default(''),
  PUBLIC_JETTON_DESCRIPTION: z.string().default(''),
  PUBLIC_JETTON_IMAGE_URL: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

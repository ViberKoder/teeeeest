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
  /**
   * Optional global cap on the sum of all non-banned users' off-chain cumulative_amount (jetton nano).
   * When set (>0), POST /api/v1/action and admin grant reject if the new sum would exceed this value.
   * Should match the jetton master's on-chain max_supply (admin mint cap) for consistent economics.
   */
  JETTON_MAX_SUPPLY_NANO: z
    .string()
    .default('')
    .transform((s) => {
      const t = s.trim().replace(/\s+/g, '');
      if (!t) return 0n;
      if (!/^[0-9]+$/.test(t)) return 0n;
      try {
        return BigInt(t);
      } catch {
        return 0n;
      }
    }),

  EPOCH_DURATION_SECONDS: z.coerce.number().int().min(10).default(60),
  PROOF_VALIDITY_WINDOW_DAYS: z.coerce.number().int().min(1).default(365),

  MAX_TAPS_PER_SECOND: z.coerce.number().int().min(1).default(5),
  MAX_TAPS_PER_DAY: z.coerce.number().int().min(1).default(100_000),
  /**
   * Raw amount added to `users.cumulative_amount` per tap (same units as on-chain jetton `Coins`).
   * Default `1` pairs with `PUBLIC_BALANCE_DISPLAY=integer` (decimals `"0"` in jetton metadata) so one tap ≈ one shown token.
   */
  TAP_VALUE_NANO: z.coerce.bigint().default(1n),

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
  /**
   * How clients should show cumulative amounts from the API (values are still stored on-chain as jetton nano).
   * - jetton_nano: divide by 1e9 for human jettons (e.g. 3e9 → "3").
   * - integer: show the raw integer string (503 nano → "503") — use when 1 reward unit = 1 displayed token.
   */
  PUBLIC_BALANCE_DISPLAY: z.enum(['jetton_nano', 'integer']).default('integer'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

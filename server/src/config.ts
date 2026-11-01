import 'dotenv/config';
import { z } from 'zod';

const bigint = z.string().regex(/^[0-9]+$/).transform((s) => BigInt(s));

export const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DB_PATH: z.string().default('./egg.db'),
  CORS_ORIGINS: z.string().default('*'),

  /** Bot token: used only to verify Mini App initData (HMAC). */
  BOT_TOKEN: z.string().min(10),
  /** Shared secret for server-to-server reward ingestion (your bot). */
  INGEST_API_KEY: z.string().min(24),

  NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  TONCENTER_KEY: z.string().default(''),
  JETTON_MASTER_ADDRESS: z.string().min(10),
  /** 24-word mnemonic of the PUBLISHER wallet. It can only publish roots, and the contract rate-limits it. */
  PUBLISHER_MNEMONIC: z.string().default(''),
  /** How often a new root is published when something changed. Must be >= the on-chain minInterval. */
  PUBLISH_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(600),

  /** Everything the ledger will ever promise, in jetton units. Must equal the on-chain max supply. */
  MAX_SUPPLY_UNITS: bigint,
  /** Largest single reward the ingest API accepts. */
  MAX_EVENT_UNITS: bigint.default('1000000000000'),
  /** Telegram initData must be younger than this. */
  INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().default(3600),

  JETTON_NAME: z.string().default('Egg'),
  JETTON_SYMBOL: z.string().default('EGG'),
  JETTON_DECIMALS: z.coerce.number().int().min(0).max(18).default(9),
  JETTON_DESCRIPTION: z.string().default('Hatch eggs. Earn EGG.'),
  JETTON_IMAGE_URL: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
  return parsed.data;
}

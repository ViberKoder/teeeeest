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

  /** Hot signer seed (32 bytes hex). Keep in a KMS in production. */
  SIGNER_SEED_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/),
  /** Cold authority PUBLIC key (hex). The secret never touches this server. */
  AUTHORITY_PUBKEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/),
  /** Output of `npm run cert` (base64 JSON). */
  KEY_CERT_B64: z.string().min(10),
  JETTON_MASTER_ADDRESS: z.string().min(10),

  /** Seconds a signed claim stays valid on-chain. */
  CLAIM_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  /** Hard ceiling for everything ever issued, in jetton units (0 = none). */
  MAX_SUPPLY_UNITS: bigint.default('0'),
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
  if (!parsed.success) {
    throw new Error('Invalid environment: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  return parsed.data;
}

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
  /** Optional hot wallet that sponsors the first hatches of new players (gasless relay). */
  RELAYER_MNEMONIC: z.string().default(''),
  /** TON sent with each relayed request (it funds the player's wallet; unused TON stays theirs), in nanoTON. */
  RELAY_VALUE: bigint.default('150000000'),
  /** Largest TON a relayed request may forward onward (the claim message), in nanoTON. */
  RELAY_MAX_FORWARD: bigint.default('100000000'),
  /** How many sponsored requests one Telegram account gets in total. */
  RELAY_MAX_PER_USER: z.coerce.number().int().min(0).default(3),
  /** Players who already hold at least this much TON in their wallet are not sponsored, in nanoTON. */
  RELAY_SELF_PAY_BALANCE: bigint.default('100000000'),
  /** How often a new root is published when something changed. Must be >= the on-chain minInterval. */
  PUBLISH_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(600),

  /** Everything the ledger will ever promise, in jetton units. Must equal the on-chain max supply. */
  MAX_SUPPLY_UNITS: bigint,
  /** Largest single reward the ingest API accepts. */
  MAX_EVENT_UNITS: bigint.default('1000000000000'),
  /**
   * Linking a wallet to a Telegram account requires a signature by the wallet's own key, so nobody can squat on an address that is not theirs.
   * Switch off only for tests / wallets that are not WalletTg.
   */
  REQUIRE_LINK_PROOF: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  /**
   * Largest amount the ledger may owe beyond the newest published root (jetton units; 0 = unlimited). Set it to the on-chain `maxGrowth`:
   * the contract refuses a root that grows faster, and a ledger that outran it would stall publication.
   */
  MAX_GROWTH_UNITS: bigint.default('0'),
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

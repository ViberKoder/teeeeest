import { TonClient } from '@ton/ton';
import { cfg, endpoints } from '../config';

let client: TonClient | undefined;

export function ton(): TonClient {
  client ??= new TonClient({ endpoint: endpoints.toncenter, apiKey: cfg.toncenterKey || undefined });
  return client;
}

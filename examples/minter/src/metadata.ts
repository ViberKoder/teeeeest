/** Same shape as backend GET /jetton-metadata.json for manual hosting (Gist, R2, …). */
export function buildStandaloneJettonMetadataJson(opts: {
  name: string;
  symbol: string;
  description: string;
  image: string;
  backendBaseUrl: string;
}): string {
  const base = opts.backendBaseUrl.trim().replace(/\/$/, '');
  const o: Record<string, string> = {
    name: opts.name.trim(),
    symbol: opts.symbol.trim(),
    description: opts.description.trim() || `${opts.symbol.trim()} — Rolling Mintless Jetton.`,
    decimals: '9',
    custom_payload_api_uri: `${base}/api/v1/custom-payload`,
  };
  const img = opts.image.trim();
  if (img) o.image = img;
  return JSON.stringify(o, null, 2);
}

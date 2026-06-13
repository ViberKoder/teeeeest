/** Compare metadata URLs by origin+pathname — `?v=` bumps must not count as stale. */
export function metadataUriPathname(uri: string | null | undefined): string {
  if (!uri) return '';
  try {
    const url = new URL(uri);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return uri.split('?')[0].toLowerCase();
  }
}

/** Rolling RMJ: on-chain `?v={epoch}` cache-bust counter (null when absent). */
export function metadataUriEpoch(uri: string | null | undefined): number | null {
  if (!uri) return null;
  try {
    const v = new URL(uri).searchParams.get('v');
    if (v == null || v === '') return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** On-chain TEP-64 URL with epoch cache-bust: `…/jetton-metadata4.json?v=29`. */
export function epochMetadataUri(metadataBaseUrl: string, epoch: number): string {
  const url = new URL(metadataBaseUrl);
  url.searchParams.set('v', String(epoch));
  return url.toString();
}

/** TEP-177 dump URL cache-bust for rolling roots — backend ignores query on GET. */
export function cacheBustedMerkleDumpUri(
  dumpBaseUrl: string,
  epoch: number,
  rootHex: string,
): string {
  const url = new URL(dumpBaseUrl);
  url.searchParams.set('epoch', String(epoch));
  const root = rootHex.startsWith('0x') || rootHex.startsWith('0X') ? rootHex : `0x${rootHex}`;
  url.searchParams.set('root', root);
  return url.toString();
}

export function metadataUriStale(
  cached: string | null | undefined,
  onChain: string | null | undefined,
  target: string,
): boolean {
  const cachedPath = metadataUriPathname(cached);
  if (!cachedPath) return true;
  const expected = metadataUriPathname(onChain ?? target);
  if (cachedPath !== expected) return true;
  const onChainEpoch = metadataUriEpoch(onChain);
  const cachedEpoch = metadataUriEpoch(cached);
  if (onChainEpoch != null && cachedEpoch !== onChainEpoch) return true;
  return false;
}

export function bumpMetadataUri(uri: string): string {
  const url = new URL(uri);
  const current = metadataUriEpoch(uri) ?? Number.parseInt(url.searchParams.get('v') ?? '1', 10);
  url.searchParams.set('v', String(Number.isFinite(current) ? current + 1 : 2));
  return url.toString();
}

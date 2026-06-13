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

export function metadataUriStale(
  cached: string | null | undefined,
  onChain: string | null | undefined,
  target: string,
): boolean {
  const cachedPath = metadataUriPathname(cached);
  if (!cachedPath) return true;
  const expected = metadataUriPathname(onChain ?? target);
  return cachedPath !== expected;
}

export function bumpMetadataUri(uri: string): string {
  const url = new URL(uri);
  const current = Number.parseInt(url.searchParams.get('v') ?? '1', 10);
  url.searchParams.set('v', String(Number.isFinite(current) ? current + 1 : 2));
  return url.toString();
}

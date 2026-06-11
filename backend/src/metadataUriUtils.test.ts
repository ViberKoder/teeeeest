import { bumpMetadataUri, metadataUriPathname, metadataUriStale } from './metadataUriUtils';

describe('metadataUriStale', () => {
  const base = 'https://example.com/jetton-metadata3.json';
  const bumped = `${base}?v=2`;

  it('?v= bump is not stale when pathname matches', () => {
    expect(metadataUriStale(base, bumped, base)).toBe(false);
    expect(metadataUriStale(bumped, bumped, base)).toBe(false);
  });

  it('missing cached URI is stale', () => {
    expect(metadataUriStale(null, bumped, base)).toBe(true);
  });

  it('different pathname is stale', () => {
    expect(metadataUriStale('https://example.com/old.json', bumped, base)).toBe(true);
  });

  it('metadataUriPathname strips query', () => {
    expect(metadataUriPathname(bumped)).toBe('https://example.com/jetton-metadata3.json');
  });
});

describe('bumpMetadataUri', () => {
  it('increments v query param', () => {
    expect(bumpMetadataUri('https://example.com/jetton-metadata3.json?v=2')).toBe(
      'https://example.com/jetton-metadata3.json?v=3',
    );
  });
});

import { bumpMetadataUri, metadataUriPathname, metadataUriStale, epochMetadataUri, cacheBustedMerkleDumpUri } from './metadataUriUtils';

describe('metadataUriStale', () => {
  const base = 'https://example.com/jetton-metadata3.json';
  const bumped = `${base}?v=2`;

  it('?v= on-chain newer than cached without v is stale', () => {
    expect(metadataUriStale(base, bumped, base)).toBe(true);
  });

  it('matching ?v= is not stale when pathname matches', () => {
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

  it('stale when on-chain ?v= differs from cached', () => {
    expect(
      metadataUriStale(
        'https://example.com/jetton-metadata3.json?v=2',
        'https://example.com/jetton-metadata3.json?v=3',
        base,
      ),
    ).toBe(true);
  });
});

describe('epochMetadataUri', () => {
  it('sets v query to epoch', () => {
    expect(epochMetadataUri('https://example.com/jetton-metadata3.json', 30)).toBe(
      'https://example.com/jetton-metadata3.json?v=30',
    );
  });
});

describe('cacheBustedMerkleDumpUri', () => {
  it('appends epoch and root query params', () => {
    expect(
      cacheBustedMerkleDumpUri(
        'https://example.com/api/v1/jettons/EQxxx/merkle-dump.boc',
        29,
        '0xabc',
      ),
    ).toBe('https://example.com/api/v1/jettons/EQxxx/merkle-dump.boc?epoch=29&root=0xabc');
  });
});

describe('bumpMetadataUri', () => {
  it('increments v query param', () => {
    expect(bumpMetadataUri('https://example.com/jetton-metadata3.json?v=2')).toBe(
      'https://example.com/jetton-metadata3.json?v=3',
    );
  });
});

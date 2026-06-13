import {
  fixedJettonMetadataFilenameFromUrl,
  fixedJettonMetadataUrl,
  isFixedJettonMetadataUrl,
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY,
  JETTON_METADATA_FILENAME_LEGACY2,
  JETTON_METADATA_FILENAME_LEGACY3,
} from './jettonAddressPath';

jest.mock('./config', () => ({
  config: { TON_NETWORK: 'mainnet' },
}));

describe('jettonAddressPath metadata filenames', () => {
  test('current RMJ on-chain URL uses jetton-metadata4.json', () => {
    expect(JETTON_METADATA_FILENAME).toBe('jetton-metadata4.json');
    expect(fixedJettonMetadataUrl('https://example.com')).toBe(
      'https://example.com/jetton-metadata4.json',
    );
  });

  test('isFixedJettonMetadataUrl accepts current and legacy paths', () => {
    expect(isFixedJettonMetadataUrl('https://x/jetton-metadata4.json')).toBe(true);
    expect(isFixedJettonMetadataUrl('https://x/jetton-metadata4.json?v=29')).toBe(true);
    expect(isFixedJettonMetadataUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY3}`)).toBe(true);
    expect(isFixedJettonMetadataUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY2}`)).toBe(true);
    expect(isFixedJettonMetadataUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY}`)).toBe(true);
    expect(isFixedJettonMetadataUrl('https://x/other.json')).toBe(false);
  });

  test('fixedJettonMetadataFilenameFromUrl strips ?v= query', () => {
    expect(fixedJettonMetadataFilenameFromUrl('https://x/jetton-metadata4.json?v=30')).toBe(
      JETTON_METADATA_FILENAME,
    );
  });

  test('fixedJettonMetadataFilenameFromUrl resolves tier', () => {
    expect(fixedJettonMetadataFilenameFromUrl('https://x/jetton-metadata4.json')).toBe(
      JETTON_METADATA_FILENAME,
    );
    expect(fixedJettonMetadataFilenameFromUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY3}`)).toBe(
      JETTON_METADATA_FILENAME_LEGACY3,
    );
    expect(fixedJettonMetadataFilenameFromUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY2}`)).toBe(
      JETTON_METADATA_FILENAME_LEGACY2,
    );
    expect(fixedJettonMetadataFilenameFromUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY}`)).toBe(
      JETTON_METADATA_FILENAME_LEGACY,
    );
  });
});

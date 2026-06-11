import {
  fixedJettonMetadataFilenameFromUrl,
  fixedJettonMetadataUrl,
  isFixedJettonMetadataUrl,
  JETTON_METADATA_FILENAME,
  JETTON_METADATA_FILENAME_LEGACY,
  JETTON_METADATA_FILENAME_LEGACY2,
} from './jettonAddressPath';

jest.mock('./config', () => ({
  config: { TON_NETWORK: 'mainnet' },
}));

describe('jettonAddressPath metadata filenames', () => {
  test('current RMJ on-chain URL uses jetton-metadata3.json', () => {
    expect(JETTON_METADATA_FILENAME).toBe('jetton-metadata3.json');
    expect(fixedJettonMetadataUrl('https://example.com')).toBe(
      'https://example.com/jetton-metadata3.json',
    );
  });

  test('isFixedJettonMetadataUrl accepts current and legacy paths', () => {
    expect(isFixedJettonMetadataUrl('https://x/jetton-metadata3.json')).toBe(true);
    expect(isFixedJettonMetadataUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY2}`)).toBe(true);
    expect(isFixedJettonMetadataUrl(`https://x/${JETTON_METADATA_FILENAME_LEGACY}`)).toBe(true);
    expect(isFixedJettonMetadataUrl('https://x/other.json')).toBe(false);
  });

  test('fixedJettonMetadataFilenameFromUrl resolves tier', () => {
    expect(fixedJettonMetadataFilenameFromUrl('https://x/jetton-metadata3.json')).toBe(
      JETTON_METADATA_FILENAME,
    );
    expect(fixedJettonMetadataFilenameFromUrl('https://x/jetton-metadata2.json')).toBe(
      JETTON_METADATA_FILENAME_LEGACY2,
    );
    expect(fixedJettonMetadataFilenameFromUrl('https://x/jetton-metadata.json')).toBe(
      JETTON_METADATA_FILENAME_LEGACY,
    );
  });
});

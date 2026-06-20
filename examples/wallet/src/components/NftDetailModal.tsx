import type { NftItem } from '../types';
import { Modal } from './Modal';
import { colors } from '../styles/theme';
import { shortenAddress } from '../utils/format';

interface Props {
  nft: NftItem;
  onClose: () => void;
}

export function NftDetailModal({ nft, onClose }: Props) {
  return (
    <Modal title={nft.name} onClose={onClose}>
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: colors.surfaceRaised,
          marginBottom: 14,
          aspectRatio: '1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {nft.image ? (
          <img src={nft.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 48, opacity: 0.25 }}>◆</span>
        )}
      </div>
      {nft.collection && (
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
          Collection: {nft.collection.name}
        </div>
      )}
      {nft.description && (
        <p style={{ fontSize: 14, lineHeight: 1.5, color: colors.textMuted, margin: '0 0 12px' }}>{nft.description}</p>
      )}
      <div style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textMuted, wordBreak: 'break-all' }}>
        {shortenAddress(nft.address, 12, 8)}
      </div>
      <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 16 }}>
        NFT transfers require the item contract — use your primary wallet app for outbound NFT sends.
      </p>
    </Modal>
  );
}

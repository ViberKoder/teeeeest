import type { NftItem } from '../types';
import { colors, layout } from '../styles/theme';

interface Props {
  nfts: NftItem[];
  loading: boolean;
  onSelect: (nft: NftItem) => void;
}

export function NftGrid({ nfts, loading, onSelect }: Props) {
  if (loading && nfts.length === 0) {
    return <div style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', padding: 24 }}>Loading NFTs…</div>;
  }

  if (nfts.length === 0) {
    return (
      <div style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', padding: 24 }}>
        No NFTs in this wallet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
      }}
    >
      {nfts.map((nft) => (
        <button
          key={nft.address}
          type="button"
          onClick={() => onSelect(nft)}
          style={{
            ...layout.card,
            padding: 0,
            overflow: 'hidden',
            cursor: 'pointer',
            textAlign: 'left',
            color: colors.text,
          }}
        >
          <div
            style={{
              aspectRatio: '1',
              background: colors.surfaceRaised,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {nft.image ? (
              <img src={nft.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 28, opacity: 0.3 }}>◆</span>
            )}
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nft.name}
            </div>
            {nft.collection && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nft.collection.name}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

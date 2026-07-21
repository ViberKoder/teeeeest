import type { BalanceDisplayMode } from '@rmj/sdk';

export interface TonAccountInfo {
  address: string;
  balanceNano: bigint;
  status: 'active' | 'uninit' | 'frozen' | 'nonexist';
}

export interface JettonBalance {
  jettonMaster: string;
  jettonWallet: string;
  balanceNano: bigint;
  name: string;
  symbol: string;
  decimals: number;
  image?: string;
  /** TEP offchain-payloads API root when present in metadata. */
  customPayloadApiUri?: string;
  /** Pinned project RMJ from VITE_JETTON_MASTER_ADDRESS — always shown in portfolio. */
  isProjectRmj?: boolean;
}

export interface NftItem {
  address: string;
  collection?: {
    address: string;
    name: string;
  };
  name: string;
  description?: string;
  image?: string;
  index: string;
}

export interface RmjOffchainBalance {
  cumulativeOffchain: string;
  cumulativeInTree: string;
  epoch: number;
  balanceDisplay: BalanceDisplayMode;
  claimable: boolean;
}

export type WalletTab = 'assets' | 'nfts' | 'activity';

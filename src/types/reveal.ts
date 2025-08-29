export type Attr = { trait_type?: string; value?: any };

export type RevealItem = {
  /** Stable key used for scroll-follow + highlight (index, mint, or metadata URI) */
  indexKey: string;

  /** What to show */
  name: string;
  image?: string;

  /** Where attributes can be fetched if not present */
  metadataUri?: string;
  attributes?: Attr[];

  /** Precomputed, from DB */
  score?: number;   // higher = rarer
  rank?: number;    // 1 = rarest

  /** Optional explorer bits */
  mint?: string;
  txSig?: string | null;
};

export type RaritySnapshot = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
};

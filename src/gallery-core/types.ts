export type CoreItem = {
  /** stable key: index from DB if known; else mint (still works for modal scroll) */
  indexKey: string;
  name: string;
  image?: string;
  metadataUri?: string;
  attributes?: { trait_type?: string; value?: any }[];
  score?: number;
  rank?: number;
  minted?: boolean;
};

export type Snapshot = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: number | { avgObserved: number; minObserved: number; maxObserved: number; };
  traitAvg?: number | Record<string, number>;
};

// DB item -> CoreItem
export const adaptDbItem = (x: any): CoreItem => ({
  indexKey: String(x.index),
  name: x.name,
  image: x.image,
  metadataUri: x.metadata,
  attributes: x.attributes,
  score: typeof x.score === "number" ? x.score : Number(x.score),
  rank: typeof x.rank === "number" ? x.rank : Number(x.rank),
  minted: Boolean(x.minted),
});

// DAS wallet asset (+ DB match) -> CoreItem
export const adaptWalletAsset = (a: any, dbMatch?: any): CoreItem => ({
  indexKey: dbMatch ? String(dbMatch.index) : a.id,         // prefer DB index if we can match
  name: a.content?.metadata?.name ?? a.content?.json?.name ?? "MetaMartian",
  image: a.content?.links?.image ?? a.content?.json?.image,
  metadataUri: a.content?.json_uri ?? a.content?.metadata?.uri,
  attributes: dbMatch?.attributes ?? a.content?.json?.attributes,
  score: dbMatch?.score,
  rank: dbMatch?.rank,
  minted: true,
});

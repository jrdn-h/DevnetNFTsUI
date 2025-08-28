// Minimal local cache of minted indices per collection.
// Uses your NEXT_PUBLIC_RPC_URL to call DAS getAssetsByGroup.

export type MintedCache = {
  indices: Record<string, true>;
  total: number;
  updatedAt: number;
};

const KEY = (collectionMint: string) => `mm_minted_${collectionMint}`;

function loadCache(collectionMint: string): MintedCache {
  try {
    const raw = localStorage.getItem(KEY(collectionMint));
    if (!raw) return { indices: {}, total: 0, updatedAt: 0 };
    return JSON.parse(raw);
  } catch {
    return { indices: {}, total: 0, updatedAt: 0 };
  }
}

function saveCache(collectionMint: string, cache: MintedCache) {
  localStorage.setItem(KEY(collectionMint), JSON.stringify(cache));
}

// Extract trailing "#0001" → index "0"
function nameToIndex(name: string): string | null {
  const m = String(name || "").match(/#\s*0*([0-9]+)\s*$/);
  if (!m) return null;
  const n = Math.max(0, Number(m[1]) - 1);
  return String(n);
}

// Calls DAS (getAssetsByGroup) once with a big limit.
// If your RPC is not DAS-enabled, this will no-op gracefully.
export async function refreshMintedCacheOnce(opts: {
  rpcUrl: string;
  collectionMint: string;
  maxLimit?: number; // default 1000
}): Promise<Set<string>> {
  const { rpcUrl, collectionMint, maxLimit = 1000 } = opts;
  const cache = loadCache(collectionMint);
  const set = new Set<string>(Object.keys(cache.indices));

  try {
    const body = {
      jsonrpc: "2.0",
      id: "getAssetsByGroup",
      method: "getAssetsByGroup",
      params: {
        groupKey: "collection",
        groupValue: collectionMint,
        page: 1,
        limit: maxLimit,
      },
    };
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    const items = json?.result?.items || json?.result?.assets || [];

    for (const a of items) {
      const nm =
        a?.content?.metadata?.name ??
        a?.content?.metadata?.name_v2 ??
        a?.name ??
        "";
      const idx = nameToIndex(nm);
      if (idx !== null) set.add(idx);
    }

    // persist
    const obj: MintedCache = {
      indices: Array.from(set).reduce((acc, i) => {
        acc[i] = true;
        return acc;
      }, {} as Record<string, true>),
      total: set.size,
      updatedAt: Date.now(),
    };
    saveCache(collectionMint, obj);
  } catch {
    // If RPC doesn't support DAS, keep whatever we have; no throw.
  }

  return set;
}

// Read-only accessor (doesn't hit RPC)
export function getMintedSetFromCache(collectionMint: string): Set<string> {
  const cache = loadCache(collectionMint);
  return new Set<string>(Object.keys(cache.indices));
}

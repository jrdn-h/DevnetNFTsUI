export type Attribute = { trait_type?: string; value?: unknown };

export type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
};

export function normalizeTraitType(x: unknown): string {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
}

export function normalizeTraitValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "None";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function scoreFromAttributes(attrs: Attribute[], idx: RarityIndex): number {
  const total = Math.max(1, idx.total);
  let sum = 0;
  for (const tt of Object.keys(idx.traits || {})) {
    const a = attrs.find((x) => normalizeTraitType(x?.trait_type) === tt);
    const val = a ? normalizeTraitValue(a.value) : "None";
    const c = idx.traits[tt]?.[val] ?? 0;
    sum += total / Math.max(1, c);
  }
  return sum;
}

type CatalogItem = {
  index: string;
  name: string;
  image: string;
  metadata: string;
  attributes?: Attribute[];
  minted?: boolean;
};

type Catalog = { 
  collectionMint: string; 
  total: number; 
  items: CatalogItem[] 
};

function buildCountsFromAttrMap(attrMap: Map<string, Attribute[]>): RarityIndex {
  const traits: Record<string, Record<string, number>> = {};
  const present: Record<string, number> = {};
  let total = 0;
  for (const [, attrs] of Array.from(attrMap)) {
    total++;
    const seen = new Set<string>();
    for (const a of attrs || []) {
      const tt = normalizeTraitType(a?.trait_type);
      const v = normalizeTraitValue(a?.value);
      traits[tt] ||= {};
      traits[tt][v] = (traits[tt][v] || 0) + 1;
      if (!seen.has(tt)) {
        present[tt] = (present[tt] || 0) + 1;
        seen.add(tt);
      }
    }
  }
  for (const tt of Object.keys(traits)) {
    const missing = Math.max(0, total - (present[tt] || 0));
    if (missing > 0) traits[tt]["None"] = (traits[tt]["None"] || 0) + missing;
  }
  return { total, traits };
}

async function hydrateAllAttrs(items: CatalogItem[], attrMap: Map<string, Attribute[]>, limit = 16) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const it = items[idx];
      if (attrMap.has(it.index)) continue;
      try {
        const attrs = Array.isArray(it.attributes)
          ? it.attributes
          : (await (await fetch(it.metadata, { cache: "no-store" })).json())?.attributes || [];
        attrMap.set(it.index, attrs);
      } catch {
        attrMap.set(it.index, []);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
}

export async function loadRarityIndexFromCatalog(options: {
  collectionMint?: string;
  catalogUrlOverride?: string;
}): Promise<RarityIndex | undefined> {
  const { collectionMint, catalogUrlOverride } = options;
  
  const manifestUrl = catalogUrlOverride
    || (collectionMint ? `/collection/${collectionMint}-catalog.local.json` : undefined);
  if (!manifestUrl) return undefined;

  try {
    let res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) {
      const fallback = manifestUrl.replace("-catalog.local.json", "-catalog.json");
      const r2 = await fetch(fallback, { cache: "no-store" }).catch(() => null);
      if (!r2 || !r2.ok) return undefined;
      res = r2;
    }
    const catalog = (await res.json()) as Catalog;
    
    // Build rarity index from catalog
    const attrMap = new Map<string, Attribute[]>();
    await hydrateAllAttrs(catalog.items, attrMap, 16);
    const idx = buildCountsFromAttrMap(attrMap);
    
    // Compute per-item scores to derive collection avg/min/max
    const scoresAll = catalog.items.map((it) =>
      scoreFromAttributes(attrMap.get(it.index) || [], idx)
    );
    if (scoresAll.length) {
      const sum = scoresAll.reduce((a, b) => a + b, 0);
      idx.overall = {
        avgObserved: sum / scoresAll.length,
        minObserved: Math.min(...scoresAll),
        maxObserved: Math.max(...scoresAll),
      };
    }

    // Compute per-trait average score across values
    const traitAvg: Record<string, number> = {};
    for (const tt of Object.keys(idx.traits)) {
      const counts = Object.values(idx.traits[tt]);
      if (counts.length) {
        const mean = counts.reduce((acc, c) => acc + idx.total / Math.max(1, c), 0) / counts.length;
        traitAvg[tt] = mean;
      }
    }
    idx.traitAvg = traitAvg;
    
    return idx;
  } catch {
    return undefined;
  }
}

export async function loadRarityIndex(options: {
  collectionMint?: string;
  urlOverride?: string;
}): Promise<RarityIndex | undefined> {
  const { collectionMint, urlOverride } = options;
  
  // First try to build from catalog (preferred method)
  const catalogIndex = await loadRarityIndexFromCatalog({ collectionMint });
  if (catalogIndex) return catalogIndex;
  
  // Fallback to static rarity file
  const url = urlOverride
    || process.env.NEXT_PUBLIC_RARITY_INDEX_URL
    || (collectionMint ? `/rarity/${collectionMint}.json` : undefined);
  if (!url) return undefined;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as RarityIndex;
  } catch {
    return undefined;
  }
}



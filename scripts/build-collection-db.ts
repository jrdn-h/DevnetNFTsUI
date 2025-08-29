/* eslint-disable no-console */

// Build a precomputed "mini-database" for a collection.
// Inputs: a catalog json (with items + metadata urls)
// Output: /public/db/<collectionMint>.json with items + traits + scores + ranks
//
// Requirements: Node 18+ (global fetch), TypeScript or run with tsx.
//
// Usage:
//   npx tsx scripts/build-collection-db.ts \
//     --catalog ./public/collection/<COLLECTION>-catalog.json \
//     --outDir ./public/db \
//     --collectionMint <COLLECTION> \
//     --concurrency 24
//
// Notes:
// - If item.attributes exist in catalog, we won't refetch that item's metadata.
// - Otherwise we fetch item.metadata JSON (with retry) to read attributes.
// - Rarity score = sum over all trait types of (total / count(value)),
//   treating missing values as "None". Rank is 1 = rarest (highest score).
//

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Attr = { trait_type?: string; value?: any };
type CatalogItem = {
  index: string;                // "0" based
  name: string;
  image: string;
  metadata: string;
  attributes?: Attr[];
  minted?: boolean | string | number;
};
type Catalog = {
  collectionMint?: string;
  total?: number;
  items: CatalogItem[];
};

type DBItem = CatalogItem & {
  score: number;
  rank: number;
};

type CollectionDB = {
  version: number;
  collectionMint: string;
  generatedAt: string;
  overall: { avgObserved: number; minObserved: number; maxObserved: number };
  traits: Record<string, Record<string, number>>;
  traitAvg: Record<string, number>;
  items: DBItem[];
  // Fast lookup indexes
  __byUri?: Record<string, number>;
  __byName?: Record<string, number>;
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | number | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = /^\d+$/.test(next) ? Number(next) : next;
        i++;
      }
    }
  }
  return args as {
    catalog: string;
    outDir?: string;
    collectionMint?: string;
    concurrency?: number;
  };
}

const normType = (x: any) => {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
};
const normVal = (v: any) =>
  v === null || v === undefined || v === ""
    ? "None"
    : typeof v === "object"
    ? JSON.stringify(v)
    : String(v);

function isMintedFlag(v: any) {
  return v === true || v === "true" || v === 1;
}

async function fetchWithRetry(url: string, tries = 3): Promise<any | null> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const backoff = 200 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  console.warn(`WARN: failed to fetch ${url} after ${tries} tries:`, lastErr?.message || lastErr);
  return null;
}

async function main() {
  const { catalog, outDir = "./public/db", collectionMint, concurrency = 24 } = parseArgs(process.argv);
  if (!catalog) {
    console.error("Usage: --catalog <path> [--outDir ./public/db] [--collectionMint <mint>] [--concurrency 24]");
    process.exit(1);
  }

  const catalogPath = resolve(process.cwd(), catalog);
  const outDirAbs = resolve(process.cwd(), outDir);

  const catRaw = await readFile(catalogPath, "utf8");
  const cat: Catalog = JSON.parse(catRaw);

  const colMint = collectionMint || cat.collectionMint;
  if (!colMint) {
    console.error("collectionMint missing. Provide --collectionMint or include in catalog.");
    process.exit(1);
  }

  const items = (cat.items || []).map((it) => ({
    ...it,
    minted: isMintedFlag((it as any).minted),
  }));

  console.log(`Loaded catalog: ${items.length} items (${colMint})`);
  const total = items.length;

  // 1) Ensure we have attributes for each item. Fetch where missing, with concurrency.
  const attrsByIndex = new Map<string, Attr[]>();
  // seed any existing
  for (const it of items) {
    if (Array.isArray(it.attributes)) attrsByIndex.set(it.index, it.attributes);
  }

  let i = 0;
  const pool = Math.max(1, Number(concurrency));
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      const it = items[idx];
      if (attrsByIndex.has(it.index)) continue;
      const meta = await fetchWithRetry(it.metadata);
      const attrs: Attr[] = Array.isArray(meta?.attributes) ? meta!.attributes : [];
      attrsByIndex.set(it.index, attrs);
      if (idx % 250 === 0) {
        process.stdout.write(`\rFetched metadata for ${idx + 1}/${items.length}…`);
      }
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));
  process.stdout.write("\n");

  // 2) Build trait counts (rarity index) including "None"
  const traits: Record<string, Record<string, number>> = {};
  const present: Record<string, number> = {};
  for (const it of items) {
    const attrs = attrsByIndex.get(it.index) || [];
    const seen = new Set<string>();
    for (const a of attrs || []) {
      const tt = normType(a?.trait_type);
      const v = normVal(a?.value);
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

  // 3) Compute scores
  const totalSafe = Math.max(1, total);
  const scoreOf = (attrs: Attr[]) => {
    let sum = 0;
    for (const tt of Object.keys(traits)) {
      const found = attrs.find((a) => normType(a?.trait_type) === tt);
      const val = found ? normVal(found.value) : "None";
      const count = traits[tt]?.[val] ?? 0;
      sum += totalSafe / Math.max(1, count);
    }
    return sum;
  };

  const scores: number[] = [];
  const itemsWithScore: (CatalogItem & { score: number })[] = items.map((it) => {
    const s = scoreOf(attrsByIndex.get(it.index) || []);
    scores.push(s);
    return { ...it, score: s };
  });

  // 4) Rank (1 = highest score)
  const order = itemsWithScore
    .map((it) => ({ idx: it.index, score: it.score }))
    .sort((a, b) => b.score - a.score);

  const rankByIndex = new Map<string, number>();
  order.forEach((o, i) => rankByIndex.set(o.idx, i + 1));

  const dbItems: DBItem[] = itemsWithScore.map((it) => ({
    ...it,
    attributes: attrsByIndex.get(it.index) || [],
    rank: rankByIndex.get(it.index)!,
  }));

  // 5) Overall stats + traitAvg
  const sum = scores.reduce((a, b) => a + b, 0);
  const overall = {
    avgObserved: sum / scores.length,
    minObserved: Math.min(...scores),
    maxObserved: Math.max(...scores),
  };

  const traitAvg: Record<string, number> = {};
  for (const tt of Object.keys(traits)) {
    const counts = Object.values(traits[tt]);
    const mean =
      counts.reduce((acc, c) => acc + totalSafe / Math.max(1, c), 0) /
      Math.max(1, counts.length);
    traitAvg[tt] = mean;
  }

  // 6) Compose DB with fast lookup indexes
  const byUri: Record<string, number> = {};
  const byName: Record<string, number> = {};
  dbItems.forEach((it, i) => {
    if (it.metadata) byUri[it.metadata] = i;
    if (it.name) byName[it.name] = i;
  });

  const db: CollectionDB = {
    version: 1,
    collectionMint: colMint,
    generatedAt: new Date().toISOString(),
    overall,
    traits,
    traitAvg,
    items: dbItems.sort((a, b) => Number(a.index) - Number(b.index)), // keep by index asc
    __byUri: byUri,
    __byName: byName,
  };

  // 7) Write file
  await mkdir(outDirAbs, { recursive: true });
  const outPath = resolve(outDirAbs, `${colMint}.json`);
  const json = JSON.stringify(db);
  await writeFile(outPath, json);
  console.log(`Wrote ${outPath} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

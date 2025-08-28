#!/usr/bin/env node
/**
 * Build rarity index + observed stats from a Metaplex Sugar cache.
 *
 * Env:
 *   CACHE_PATH        (default: ./cache.json)
 *   OUT_DIR           (default: ./public/rarity)
 *   COLLECTION_MINT   (optional; else from cache.program.collectionMint)
 *   CONCURRENCY       (default: 10)
 *
 * Output JSON (public/rarity/<collectionMint>.json):
 * {
 *   "total": <number>,
 *   "traits": { [traitType]: { [value]: count } },
 *   "avgTraitScoreByType": { [traitType]: <#distinct values incl. "None"> },
 *   "overall": {
 *     "avgObserved": <number>,
 *     "minObserved": <number>,
 *     "minItem": { "index": <string>, "name": <string>, "metadata_link": <string> },
 *     "maxObserved": <number>,
 *     "maxItem": { "index": <string>, "name": <string>, "metadata_link": <string> },
 *     "avgTheoretical": <number>,
 *     "minTheoretical": <number>,
 *     "maxTheoretical": <number>
 *   }
 * }
 */

import fs from "fs/promises";
import path from "path";
import { setTimeout as sleep } from "timers/promises";

const CACHE_PATH = process.env.CACHE_PATH || "./cache.json";
const OUT_DIR = process.env.OUT_DIR || "./public/rarity";
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);

function normalizeTraitType(x) {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
}
function normalizeTraitValue(v) {
  if (v === null || v === undefined || v === "") return "None";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v).trim();
  return s.length ? s : "None";
}

async function fetchJsonWithRetry(url, tries = 4, backoffMs = 400) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await sleep(backoffMs * Math.pow(1.6, i));
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

async function main() {
  const raw = await fs.readFile(CACHE_PATH, "utf8");
  const cache = JSON.parse(raw);

  const collectionMint =
    process.env.COLLECTION_MINT || cache?.program?.collectionMint || null;
  if (!collectionMint) {
    throw new Error(
      "No collection mint found. Set COLLECTION_MINT or ensure cache.program.collectionMint exists."
    );
  }

  // Items list (skip -1 collection row)
  const items = Object.entries(cache.items || {})
    .filter(([k]) => k !== "-1")
    .map(([k, v]) => ({ idx: k, ...v }))
    .filter((it) => it?.metadata_link);

  const total = items.length;
  if (total === 0) {
    console.warn("No items with metadata_link found in cache.");
  }

  /** trait frequency counts */
  const traits = Object.create(null); // traits[traitType][value] = count
  /** #items where traitType is present at all (to compute "None") */
  const presentCount = Object.create(null);
  /** set of all trait types across collection */
  const allTraitTypes = new Set();

  /** per-item normalized attributes as a Map<traitType, value> for later scoring */
  const perItemAttrs = new Array(total);

  function inc(map, traitType, value, delta = 1) {
    if (!map[traitType]) map[traitType] = Object.create(null);
    map[traitType][value] = (map[traitType][value] || 0) + delta;
  }

  // Simple worker pool
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const it = items[idx];
      try {
        const meta = await fetchJsonWithRetry(it.metadata_link);
        const attrsArr = Array.isArray(meta?.attributes) ? meta.attributes : [];

        const map = new Map(); // traitType -> value for this item
        const seenThisItem = new Set();

        for (const a of attrsArr) {
          const tt = normalizeTraitType(a?.trait_type);
          const val = normalizeTraitValue(a?.value);
          allTraitTypes.add(tt);
          inc(traits, tt, val, 1);
          seenThisItem.add(tt);
          map.set(tt, val);
        }

        // record which trait types appeared on this item
        for (const tt of seenThisItem) {
          presentCount[tt] = (presentCount[tt] || 0) + 1;
        }

        perItemAttrs[idx] = {
          name: meta?.name ?? it?.name ?? `#${it.idx}`,
          metadata_link: it.metadata_link,
          attrs: map,
        };
      } catch (e) {
        console.warn(
          `Item ${it.idx}: failed to fetch ${it.metadata_link}: ${e.message || e}`
        );
        perItemAttrs[idx] = {
          name: it?.name ?? `#${it.idx}`,
          metadata_link: it.metadata_link,
          attrs: new Map(),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, worker)
  );

  // Fill "None" counts for trait types missing on some items
  for (const tt of allTraitTypes) {
    const had = presentCount[tt] || 0;
    const missing = Math.max(0, total - had);
    if (missing > 0) inc(traits, tt, "None", missing);
  }

  // Compute avgTraitScoreByType = #distinct values (incl. "None")
  const avgTraitScoreByType = {};
  let avgTheoretical = 0;
  for (const tt of Object.keys(traits)) {
    const K = Object.keys(traits[tt]).length;
    avgTraitScoreByType[tt] = K;
    avgTheoretical += K;
  }

  // Observed overall scores per item (include "None" where absent)
  function scoreOf(tt, val) {
    const counts = traits[tt] || {};
    const count = Math.max(1, Number(counts[val] || 0));
    return total / count; // == 100 / pct
  }

  const overallScores = new Array(total).fill(0);
  for (let idx = 0; idx < total; idx++) {
    const rec = perItemAttrs[idx];
    let sum = 0;
    for (const tt of Object.keys(traits)) {
      const val = rec.attrs.get(tt) ?? "None";
      sum += scoreOf(tt, val);
    }
    overallScores[idx] = sum;
  }

  const sumObs = overallScores.reduce((a, b) => a + b, 0);
  const avgObserved = total > 0 ? sumObs / total : 0;

  // observed min/max + which item
  let minObserved = Infinity,
    maxObserved = -Infinity,
    minIdx = -1,
    maxIdx = -1;
  for (let idx = 0; idx < total; idx++) {
    const s = overallScores[idx];
    if (s < minObserved) {
      minObserved = s;
      minIdx = idx;
    }
    if (s > maxObserved) {
      maxObserved = s;
      maxIdx = idx;
    }
  }

  // theoretical min/max per traitType
  let minTheoretical = 0;
  let maxTheoretical = 0;
  for (const tt of Object.keys(traits)) {
    const counts = Object.values(traits[tt]).map(Number).filter((c) => c > 0);
    if (counts.length === 0) continue;
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    minTheoretical += total / maxCount; // most common
    maxTheoretical += total / minCount; // rarest
  }

  // Write file
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${collectionMint}.json`);

  const out = {
    total,
    traits,
    avgTraitScoreByType,
    overall: {
      avgObserved,
      minObserved: isFinite(minObserved) ? minObserved : 0,
      minItem:
        minIdx >= 0
          ? {
              index: items[minIdx].idx,
              name: perItemAttrs[minIdx]?.name,
              metadata_link: perItemAttrs[minIdx]?.metadata_link,
            }
          : null,
      maxObserved: isFinite(maxObserved) ? maxObserved : 0,
      maxItem:
        maxIdx >= 0
          ? {
              index: items[maxIdx].idx,
              name: perItemAttrs[maxIdx]?.name,
              metadata_link: perItemAttrs[maxIdx]?.metadata_link,
            }
          : null,
      avgTheoretical,
      minTheoretical,
      maxTheoretical,
    },
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`✅ Wrote rarity index: ${outPath}`);
  console.log(`   total items: ${total}`);
  console.log(
    `   observed overall — avg: ${avgObserved.toFixed(2)}, min: ${minObserved.toFixed(
      2
    )}, max: ${maxObserved.toFixed(2)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
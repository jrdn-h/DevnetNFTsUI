#!/usr/bin/env node
/**
 * Build a whole-collection catalog from Sugar cache and mark which items are minted.
 *
 * Env:
 *   CACHE_PATH      (default: ./cache.json)
 *   OUT_DIR         (default: ./public/collection)
 *   COLLECTION_MINT (optional; else from cache.program.collectionMint)
 *   RPC_URL         (optional; falls back to NEXT_PUBLIC_RPC_URL or devnet)
 *
 * Output:
 *   public/collection/<collectionMint>-catalog.json
 *   {
 *     "collectionMint": "<mint>",
 *     "total": <N>,
 *     "items": [
 *        { "index": "0", "name": "...", "image": "...", "metadata": "...", "minted": true|false },
 *        ...
 *     ]
 *   }
 */

import fs from "fs/promises";
import path from "path";

const CACHE_PATH = process.env.CACHE_PATH || "./cache.json";
const OUT_DIR = process.env.OUT_DIR || "./public/collection";

// ---- Optional on-chain minted scan (Umi) ----
let umiLibs = null;
try {
  umiLibs = {
    // lazy import so the script still runs if umi packages are missing
    defaults: await import("@metaplex-foundation/umi-bundle-defaults"),
    tm: await import("@metaplex-foundation/mpl-token-metadata"),
    umi: await import("@metaplex-foundation/umi"),
  };
} catch (_) {
  // If these aren't installed, we'll skip minted detection.
}

async function detectMintedUris(collectionMint, rpcUrl) {
  if (!umiLibs) return null;
  try {
    const { createUmi } = umiLibs.defaults;
    const { fetchAllMetadataByCollection } = umiLibs.tm;
    const { publicKey } = umiLibs.umi;

    const endpoint =
      rpcUrl ||
      process.env.NEXT_PUBLIC_RPC_URL ||
      "https://api.devnet.solana.com";

    const umi = createUmi(endpoint);
    const metas = await fetchAllMetadataByCollection(
      umi,
      publicKey(collectionMint),
      { verifyCollection: true } // only verified to your collection
    );

    // Build a set of URIs we saw on-chain
    const set = new Set(
      metas
        .map((m) => (m?.uri ? m.uri.trim() : ""))
        .filter((u) => u.length > 0)
    );
    return set;
  } catch (e) {
    console.warn(
      "⚠️ Minted detection skipped (could not scan collection on-chain):",
      e.message || e
    );
    return null;
  }
}

async function main() {
  const raw = await fs.readFile(CACHE_PATH, "utf8");
  const cache = JSON.parse(raw);

  const collectionMint =
    process.env.COLLECTION_MINT ||
    cache?.program?.collectionMint ||
    null;
  if (!collectionMint) {
    throw new Error(
      "Missing collection mint. Set COLLECTION_MINT or ensure cache.program.collectionMint exists."
    );
  }

  // Build base items (from cache only)
  const baseItems = Object.entries(cache.items || {})
    .filter(([k]) => k !== "-1")
    .map(([index, it]) => ({
      index,
      name: it?.name ?? `#${index}`,
      image: it?.image_link ?? null,
      metadata: it?.metadata_link ?? null,
    }))
    .filter((x) => x.metadata);

  // Try to detect minted from chain (optional, best-effort)
  const rpc = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "";
  const mintedUriSet = await detectMintedUris(collectionMint, rpc);

  const items = baseItems.map((it) => ({
    ...it,
    minted: mintedUriSet ? mintedUriSet.has(it.metadata) : false,
  }));

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${collectionMint}-catalog.json`);
  await fs.writeFile(
    outPath,
    JSON.stringify(
      { collectionMint, total: items.length, items },
      null,
      2
    ),
    "utf8"
  );

  console.log(`✅ Wrote ${outPath} (${items.length} items)`);
  if (mintedUriSet) {
    const mintedCount = items.filter((i) => i.minted).length;
    console.log(`   Minted detected: ${mintedCount}/${items.length}`);
  } else {
    console.log(
      "   Minted detection disabled — install Umi packages to enable."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Build a local, fast-loading catalog from your Sugar assets + cache.
 *
 * Inputs (env):
 *   CACHE_PATH        default ./cache.json
 *   ASSETS_DIR        default ./assets           (folder with 0.json,0.png,...)
 *   OUT_DIR           default ./public/collection
 *   COLLECTION_MINT   optional (else from cache.program.collectionMint)
 *   DETECT_MINTED     "1" to mark minted via on-chain scan (slower, optional)
 *   RPC_URL           endpoint for minted scan; default NEXT_PUBLIC_RPC_URL or devnet
 *
 * Output:
 *   <OUT_DIR>/<collectionMint>-catalog.local.json
 *   <OUT_DIR>/assets/<index>.json (rewritten to point at local image)
 *   <OUT_DIR>/assets/<index>.(png|jpg|webp)
 */

import fs from "fs/promises";
import path from "path";

// Optional umi libs for minted detection
let umiLibs = null;
try {
  umiLibs = {
    defaults: await import("@metaplex-foundation/umi-bundle-defaults"),
    tm: await import("@metaplex-foundation/mpl-token-metadata"),
    umi: await import("@metaplex-foundation/umi"),
  };
} catch {}

const CACHE_PATH = process.env.CACHE_PATH || "./cache.json";
const ASSETS_DIR = process.env.ASSETS_DIR || "./assets";
const OUT_DIR = process.env.OUT_DIR || "./public/collection";
const DETECT_MINTED = process.env.DETECT_MINTED === "1";

const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];

async function exists(p) { try { await fs.stat(p); return true; } catch { return false; } }

async function readJson(p) { return JSON.parse(await fs.readFile(p, "utf8")); }

function localImgCandidate(index, metaImageField) {
  // If metadata image is a relative file name, try that first.
  if (metaImageField && !/^https?:/i.test(metaImageField)) {
    const clean = metaImageField.replace(/^\.?\//, "");
    return clean; // e.g. "0.png" or "images/0.png"
  }
  // Otherwise try <index>.<ext>
  for (const ext of IMG_EXTS) {
    const name = `${index}.${ext}`;
    return name; // we'll check existence later
  }
}

async function copyEnsured(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function detectMintedUris(collectionMint, rpcUrl) {
  if (!umiLibs) return null;
  try {
    const { createUmi } = umiLibs.defaults;
    const { fetchAllMetadataByCollection } = umiLibs.tm;
    const { publicKey } = umiLibs.umi;
    const endpoint = rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
    const umi = createUmi(endpoint);
    const metas = await fetchAllMetadataByCollection(umi, publicKey(collectionMint), { verifyCollection: true });
    const set = new Set(metas.map((m) => (m?.uri ? m.uri.trim() : "")).filter(Boolean));
    return set;
  } catch (e) {
    console.warn("⚠️  Skipping minted detection:", e.message || e);
    return null;
  }
}

async function main() {
  const cache = await readJson(CACHE_PATH);
  const collectionMint = process.env.COLLECTION_MINT || cache?.program?.collectionMint;
  if (!collectionMint) throw new Error("No collection mint found (set COLLECTION_MINT or ensure cache.program.collectionMint)");

  const rawItems = Object.entries(cache.items || {}).filter(([k]) => k !== "-1");
  const mintedUriSet = DETECT_MINTED ? await detectMintedUris(collectionMint, process.env.RPC_URL) : null;

  /** manifest items */
  const items = [];

  for (const [index, it] of rawItems) {
    // Prefer local JSON: <ASSETS_DIR>/<index>.json
    let metaPath = path.join(ASSETS_DIR, `${index}.json`);
    if (!(await exists(metaPath))) {
      // Some pipelines name files e.g. 0001.json; try pad left to width 4
      const padded = String(index).padStart(4, "0");
      const alt = path.join(ASSETS_DIR, `${padded}.json`);
      if (await exists(alt)) metaPath = alt;
      else {
        // If no local json, skip this item (we're avoiding remote fetch)
        console.warn(`Skipping #${index}: missing local JSON ${metaPath}`);
        continue;
      }
    }

    const meta = await readJson(metaPath);
    const name = meta?.name ?? it?.name ?? `#${index}`;
    const attributes = Array.isArray(meta?.attributes) ? meta.attributes : [];

    // Resolve image source
    const candidate = localImgCandidate(index, meta?.image);
    let imgSrcAbs = null;
    if (candidate) {
      // Try relative path in ASSETS_DIR
      const tryPaths = [
        path.join(ASSETS_DIR, candidate),
        path.join(ASSETS_DIR, `${index}.png`),
        path.join(ASSETS_DIR, `${index}.jpg`),
        path.join(ASSETS_DIR, `${index}.jpeg`),
        path.join(ASSETS_DIR, `${index}.webp`),
      ];
      for (const p of tryPaths) {
        if (await exists(p)) { imgSrcAbs = p; break; }
      }
    }
    if (!imgSrcAbs) {
      console.warn(`Skipping #${index}: no local image found`);
      continue;
    }

    // Decide extension from found file
    const ext = path.extname(imgSrcAbs).slice(1) || "png";
    const outImg = path.join(OUT_DIR, "assets", `${index}.${ext}`);
    const outJson = path.join(OUT_DIR, "assets", `${index}.json`);

    await copyEnsured(imgSrcAbs, outImg);

    // Rewrite metadata to point to our local image path
    const metaOut = { ...meta, image: `/collection/assets/${index}.${ext}` };
    await fs.writeFile(outJson, JSON.stringify(metaOut, null, 2), "utf8");

    // Build manifest item (embed attributes to avoid client fetch)
    const item = {
      index,
      name,
      image: `/collection/assets/${index}.${ext}`,
      metadata: `/collection/assets/${index}.json`,
      attributes,
      minted: mintedUriSet ? mintedUriSet.has(it?.metadata_link || "") : undefined,
    };
    items.push(item);
  }

  // Write manifest
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifestPath = path.join(OUT_DIR, `${collectionMint}-catalog.local.json`);
  const out = {
    collectionMint,
    total: items.length,
    generatedAt: new Date().toISOString(),
    source: "local",
    items,
  };
  await fs.writeFile(manifestPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Built local catalog: ${manifestPath}`);
  console.log(`   Items: ${items.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

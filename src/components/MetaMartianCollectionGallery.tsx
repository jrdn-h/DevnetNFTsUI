"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import umiWithCurrentWalletAdapter from "@/lib/umi/umiWithCurrentWalletAdapter";
import { refreshMintedCacheOnce, getMintedSetFromCache } from "@/lib/mintedCache";

type Attr = { trait_type?: string; value?: any };
type Item = {
  index: string;
  name: string;
  image: string;
  metadata: string;
  attributes?: Attr[];
  minted?: boolean;
};
type Catalog = { collectionMint: string; total: number; items: Item[] };
type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
};
type SortKey =
  | "num-asc" | "num-desc"
  | "rarity-asc" | "rarity-desc";

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

// normalize any minted shape (boolean | "true"/"false" | 1/0)
const isMintedFlag = (v: any) => v === true || v === "true" || v === 1;

function scoreFromAttrs(attrs: Attr[], idx: RarityIndex): number {
  const total = Math.max(1, idx.total);
  let sum = 0;
  for (const tt of Object.keys(idx.traits || {})) {
    const a = attrs.find((x) => normType(x?.trait_type) === tt);
    const val = a ? normVal(a.value) : "None";
    const c = idx.traits[tt]?.[val] ?? 0;
    sum += total / Math.max(1, c);
  }
  return sum;
}
function buildCountsFromAttrMap(attrMap: Map<string, Attr[]>): RarityIndex {
  const traits: Record<string, Record<string, number>> = {};
  const present: Record<string, number> = {};
  let total = 0;
  for (const [, attrs] of Array.from(attrMap)) {
    total++;
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
  return { total, traits };
}
async function hydrateAllAttrs(items: Item[], attrMap: Map<string, Attr[]>, limit = 16) {
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

export default function MetaMartianCollectionGallery({
  pageStep = 60,
  initialVisible = 120,
  collectionMint: propMint,
  catalogUrlOverride,
}: {
  pageStep?: number;
  initialVisible?: number;
  collectionMint?: string;
  catalogUrlOverride?: string;
}) {
  const { Modal, openWithData } = useMetaMartianReveal();
  const { publicKey: walletPk } = useWallet();

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

  const [resolvedMint, setResolvedMint] = useState<string | undefined>(
    propMint || process.env.NEXT_PUBLIC_COLLECTION_MINT
  );
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintedSet, setMintedSet] = useState<Set<string>>(new Set());

  const attrMapRef = useRef<Map<string, Attr[]>>(new Map());
  const [attrReady, setAttrReady] = useState(false);

  const [rarityIndex, setRarityIndex] = useState<RarityIndex | null>(null);
  const [rarityScoreByIndex, setRarityScoreByIndex] = useState<Map<string, number>>(new Map());

  const [visible, setVisible] = useState(initialVisible);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [searchNum, setSearchNum] = useState<string>("");
  const [highlight, setHighlight] = useState<string | null>(null);

  const [minterFilter, setMinterFilter] = useState<"all" | "minted" | "unminted">("all");
  const [sortKey, setSortKey] = useState<SortKey>("num-asc");

  const [selectedTraits, setSelectedTraits] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    (async () => {
      if (resolvedMint) return;
      try {
        const CM = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID;
        if (!CM) return;
        const [{ createUmi }, { fetchCandyMachine }, { publicKey }] = await Promise.all([
          import("@metaplex-foundation/umi-bundle-defaults"),
          import("@metaplex-foundation/mpl-candy-machine"),
          import("@metaplex-foundation/umi"),
        ]);
        const endpoint = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
        const u = createUmi(endpoint);
        const cm = await fetchCandyMachine(u, publicKey(CM));
        setResolvedMint(cm.collectionMint.toString());
      } catch {
        setError("Could not resolve collection mint. Set NEXT_PUBLIC_COLLECTION_MINT or pass collectionMint prop.");
      }
    })();
  }, [resolvedMint]);

  const manifestUrl = useMemo(() => {
    if (catalogUrlOverride) return catalogUrlOverride;
    if (!resolvedMint) return undefined;
    return `/collection/${resolvedMint}-catalog.local.json`;
  }, [catalogUrlOverride, resolvedMint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!manifestUrl) return;
      setLoading(true);
      setError(null);
      setAttrReady(false);
      try {
        let res = await fetch(manifestUrl, { cache: "no-store" });
        if (!res.ok) {
          const fallback = manifestUrl.replace("-catalog.local.json", "-catalog.json");
          const r2 = await fetch(fallback, { cache: "no-store" }).catch(() => null);
          if (!r2 || !r2.ok) throw new Error("Manifest not found");
          res = r2;
        }
        const json = (await res.json()) as Catalog;
        if (cancelled) return;
        
        const normalizedItems = (json.items || []).map((it: any) => ({
          ...it,
          minted: isMintedFlag(it.minted),
        }));
        setCatalog({ ...json, items: normalizedItems });
        
        // Prime from local cache immediately
        const initialSet = getMintedSetFromCache(json.collectionMint);
        setMintedSet(initialSet);
        
        // Reflect into items so filters work before network refresh
        setCatalog((prev) =>
          !prev
            ? prev
            : {
                ...prev,
                items: prev.items.map((it) => ({
                  ...it,
                  minted: initialSet.has(it.index),
                })),
              }
        );
        
        setVisible(initialVisible);
        setHighlight(null);
      } catch (e: any) {
        if (cancelled) return;
        setCatalog(null);
        setError(e?.message ?? "Failed to load collection manifest");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifestUrl, initialVisible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!catalog) return;
      const map = attrMapRef.current;
      await hydrateAllAttrs(catalog.items, map, 16);
      if (cancelled) return;

      const idx = buildCountsFromAttrMap(map);
      
      // Compute per-item scores to derive collection avg/min/max
      const scoresAll = catalog.items.map((it) =>
        scoreFromAttrs(map.get(it.index) || [], idx)
      );
      if (scoresAll.length) {
        const sum = scoresAll.reduce((a, b) => a + b, 0);
        idx.overall = {
          avgObserved: sum / scoresAll.length,
          minObserved: Math.min(...scoresAll),
          maxObserved: Math.max(...scoresAll),
        };
      }

      // Compute per-trait average score across values (unweighted mean of total/freq)
      const traitAvg: Record<string, number> = {};
      for (const tt of Object.keys(idx.traits)) {
        const counts = Object.values(idx.traits[tt]);
        if (counts.length) {
          const mean = counts.reduce((acc, c) => acc + idx.total / Math.max(1, c), 0) / counts.length;
          traitAvg[tt] = mean;
        }
      }
      idx.traitAvg = traitAvg;
      
      setRarityIndex(idx);

      const scoreMap = new Map<string, number>();
      for (const it of catalog.items) {
        const attrs = map.get(it.index) || [];
        scoreMap.set(it.index, scoreFromAttrs(attrs, idx));
      }
      setRarityScoreByIndex(scoreMap);
      setAttrReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  // Refresh minted cache from RPC (DAS)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!catalog?.collectionMint) return;

      // Pull fresh minted list from RPC (DAS). No-op if RPC doesn't support it.
      const freshSet = await refreshMintedCacheOnce({
        rpcUrl: RPC,
        collectionMint: catalog.collectionMint,
      });
      if (cancelled) return;

      setMintedSet(freshSet);
      // reflect on items
      setCatalog((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              items: prev.items.map((it) => ({
                ...it,
                minted: freshSet.has(it.index),
              })),
            }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog?.collectionMint, RPC]);

  const traitTypes = useMemo(() => {
    return rarityIndex ? Object.keys(rarityIndex.traits || {}).sort() : [];
  }, [rarityIndex]);

  const traitValuesByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!rarityIndex) return map;
    for (const tt of Object.keys(rarityIndex.traits)) {
      map[tt] = Object.keys(rarityIndex.traits[tt]).sort();
    }
    return map;
  }, [rarityIndex]);

  // Compute counts (minted / not minted) for the currently filtered-by-traits set
  const { mintedCount, unmintedCount } = useMemo(() => {
    const items = catalog?.items ?? [];
    const active = Object.keys(selectedTraits);

    // Apply ONLY the trait filters here (not the minted dropdown)
    let base = items;
    if (active.length > 0) {
      base = base.filter((it) => {
        const attrs = attrMapRef.current.get(it.index) || [];
        for (const tt of active) {
          const allowed = selectedTraits[tt];
          const found = attrs.find((a) => normType(a?.trait_type) === tt);
          const val = found ? normVal(found.value) : "None";
          if (!allowed.has(val)) return false;
        }
        return true;
      });
    }

    let minted = 0;
    for (const it of base) {
      if (mintedSet.has(it.index)) minted++;
    }
    const unminted = Math.max(0, base.length - minted);

    return { mintedCount: minted, unmintedCount: unminted };
  }, [catalog?.items, selectedTraits, mintedSet]);



  const toggleTraitValue = (tt: string, val: string) => {
    setSelectedTraits((prev) => {
      const next: Record<string, Set<string>> = {};
      for (const k of Object.keys(prev)) next[k] = new Set(prev[k]);
      if (!next[tt]) next[tt] = new Set<string>();
      next[tt].has(val) ? next[tt].delete(val) : next[tt].add(val);
      if (next[tt].size === 0) delete next[tt];
      return next;
    });
  };
  const clearAllTraits = () => setSelectedTraits({});

  const filteredSorted = useMemo(() => {
    let arr: Item[] = catalog?.items ?? [];

     if (minterFilter === "minted") {
       arr = arr.filter((it) => mintedSet.has(it.index));
     } else if (minterFilter === "unminted") {
       arr = arr.filter((it) => !mintedSet.has(it.index));
     }


    const active = Object.keys(selectedTraits);
    if (active.length > 0) {
      arr = arr.filter((it) => {
        const attrs = attrMapRef.current.get(it.index) || [];
        for (const tt of active) {
          const allowed = selectedTraits[tt];
          const found = attrs.find((a) => normType(a?.trait_type) === tt);
          const val = found ? normVal(found.value) : "None";
          if (!allowed.has(val)) return false;
        }
        return true;
      });
    }

    const byNum = (a: Item, b: Item) => Number(a.index) - Number(b.index);


    const byRarity = (dir: "asc" | "desc") => (a: Item, b: Item) => {
      const ra = rarityScoreByIndex.get(a.index) ?? 0;
      const rb = rarityScoreByIndex.get(b.index) ?? 0;
      return dir === "asc" ? ra - rb : rb - ra;
    };

    const arr2 = [...arr];
    switch (sortKey) {
      case "num-asc":
        arr2.sort(byNum);
        break;
      case "num-desc":
        arr2.sort((a, b) => byNum(b, a));
        break;
      case "rarity-asc":
        arr2.sort(byRarity("asc"));
        break;
      case "rarity-desc":
        arr2.sort(byRarity("desc"));
        break;
      
    }
    return arr2;
  }, [catalog, minterFilter, sortKey, selectedTraits, rarityScoreByIndex, mintedSet]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => v + pageStep);
      },
      { rootMargin: "800px 0px 800px 0px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.unobserve(el);
  }, [pageStep, filteredSorted.length]);

     const onSearch = useCallback(() => {
     const nHuman = Number(searchNum.trim());
     if (!catalog || !Number.isFinite(nHuman)) return;
     const nZero = Math.max(0, nHuman - 1);
     const i = filteredSorted.findIndex((it) => Number(it.index) === nZero);
    if (i >= 0) {
      setVisible((v) => Math.max(v, i + 24));
      const item = filteredSorted[i];
      setTimeout(() => {
        const el = document.getElementById(`mm-item-${item.index}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlight(item.index);
        setTimeout(() => setHighlight(null), 1600);
        const attrs = attrMapRef.current.get(item.index) || [];
                 openWithData({
           name: item.name,
           image: item.image,
           attributes: attrs,
           txSig: null,
           mint: undefined,
           collectionMint: catalog.collectionMint,
           rarityIndexSnapshot: rarityIndex || undefined,
           yourScore: rarityScoreByIndex.get(item.index),
         });
      }, 40);
    }
  }, [searchNum, filteredSorted, catalog, openWithData]);

  const shown = filteredSorted.slice(0, visible);

  return (
    <div className="w-full">
      {Modal}

      <div className="mb-3">
        <h3 className="text-base font-semibold">
          Entire Collection{" "}
          {catalog?.collectionMint ? `· ${catalog.collectionMint.slice(0, 4)}…${catalog.collectionMint.slice(-4)}` : ""}
        </h3>
        <div className="text-xs opacity-70">{loading ? "Loading…" : catalog ? `${catalog.total.toLocaleString()} items` : ""}</div>
      </div>

      {error && !loading && <div className="mb-4 rounded-xl border p-4 text-sm text-red-600 dark:border-neutral-800">{error}</div>}

             <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* LEFT: Sticky controls */}
        <aside className="lg:sticky lg:top-20 h-fit space-y-4 rounded-2xl border p-4 dark:border-neutral-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur">
          {/* Search by # */}
          <div className="space-y-1">
            <div className="text-xs font-medium opacity-70">Find by number</div>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={searchNum}
                onChange={(e) => setSearchNum(e.target.value.replace(/\D+/g, ""))}
                className="h-9 w-28 rounded-lg border px-2 text-sm dark:border-neutral-700"
                placeholder="e.g. 123"
              />
              <button onClick={onSearch} className="h-9 rounded-lg border px-3 text-sm dark:border-neutral-700">
                Go
              </button>
            </div>
            <p className="text-[11px] opacity-60">Jumps to the card and opens its details.</p>
          </div>

          {/* Minted */}
          <div>
            <div className="text-xs font-medium opacity-70">Minted</div>
            <select
              value={minterFilter}
              onChange={(e) => setMinterFilter(e.target.value as any)}
              className="mt-1 h-9 w-full rounded-lg border px-2 text-sm dark:border-neutral-700"
            >
              <option value="all">All</option>
              <option value="minted">Minted ({mintedCount})</option>
              <option value="unminted">Not minted ({unmintedCount})</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <div className="text-xs font-medium opacity-70">Sort</div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="mt-1 h-9 w-full rounded-lg border px-2 text-sm dark:border-neutral-700"
            >
              <option value="num-asc">Number ↑</option>
              <option value="num-desc">Number ↓</option>
              <option value="rarity-desc">Rarity ↑ (rare first)</option>
              <option value="rarity-asc">Rarity ↓ (common first)</option>
              
            </select>
          </div>

          {/* Multi-trait filters */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium opacity-70">Filter by traits</div>
              <button onClick={clearAllTraits} className="text-xs opacity-80 underline hover:opacity-100">
                Clear all
              </button>
            </div>

            {!attrReady && <div className="mb-2 text-[11px] opacity-70">Loading trait data…</div>}

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {traitTypes.map((tt) => {
                const values = traitValuesByType[tt] || [];
                const selected = selectedTraits[tt] || new Set<string>();
                const selectedCount = selected.size;
                return (
                  <details key={tt} className="group rounded-lg border px-2 py-1 dark:border-neutral-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-1">
                      <span className="text-sm">{tt}</span>
                      <span className="text-[10px] opacity-60">{selectedCount > 0 ? `${selectedCount} selected` : `${values.length}`}</span>
                    </summary>

                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {values.map((val) => {
                        const checked = selected.has(val);
                        const count = rarityIndex?.traits?.[tt]?.[val] ?? 0;
                        return (
                          <label
                            key={`${tt}:${val}`}
                            className={`flex items-start gap-2 rounded-lg border px-2 py-1 text-xs dark:border-neutral-800 ${
                              checked ? "bg-black text-white dark:bg-white dark:text-black" : ""
                            }`}
                            title={val}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTraitValue(tt, val)}
                              className="mt-0.5 h-3 w-3"
                            />
                            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                              {val}
                            </span>
                            <span
                              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums ${
                                checked
                                  ? "border-white/40 bg-white/10"
                                  : "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/10"
                              }`}
                              title="Items with this value"
                            >
                              {count}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>

            <p className="mt-2 text-[11px] opacity-60">Select multiple values per trait (AND across traits, OR within each).</p>
          </div>
        </aside>

        {/* RIGHT: Grid + infinite scroll */}
        <div>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
            style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
          >
            {loading &&
              Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              ))}

            {!loading &&
              shown.map((it) => {
                const score = rarityScoreByIndex.get(it.index);
                return (
                  <button
                    key={it.index}
                    id={`mm-item-${it.index}`}
                                         onClick={() =>
                       openWithData({
                         name: it.name,
                         image: it.image,
                         attributes: attrMapRef.current.get(it.index) || [],
                         txSig: null,
                         mint: undefined,
                         collectionMint: catalog?.collectionMint,
                         rarityIndexSnapshot: rarityIndex || undefined,
                         yourScore: rarityScoreByIndex.get(it.index),
                       })
                     }
                    className={`group relative overflow-hidden rounded-xl border text-left transition hover:shadow-md dark:border-neutral-800 ${
                      highlight === it.index ? "ring-2 ring-emerald-400" : ""
                    }`}
                    title="View details"
                  >
                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                      {typeof it.minted === "boolean" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            it.minted
                              ? "bg-emerald-500/90 text-white"
                              : "bg-neutral-300/90 text-neutral-900 dark:bg-neutral-700/90 dark:text-white"
                          }`}
                        >
                          {it.minted ? "Minted" : "Not minted"}
                        </span>
                      )}
                    </div>

                    <div className="aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.image}
                        alt={it.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                    </div>
                    <div className="p-2">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                                             {attrReady && rarityIndex && (
                         <div className="truncate text-[10px] opacity-60">
                           Score: {Number.isFinite(score || 0) ? Math.round(score as number).toLocaleString() : "—"}
                         </div>
                       )}
                    </div>
                  </button>
                );
              })}
          </div>

          <div ref={sentinelRef} className="h-12" />
          {shown.length >= (filteredSorted?.length || 0) && !loading && (
            <div className="py-6 text-center text-xs opacity-60">— end of collection —</div>
          )}
        </div>
      </div>

      {/* Jump controls */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="rounded-full border px-3 py-1.5 text-xs bg-white/80 backdrop-blur shadow hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-900 dark:border-neutral-800"
          title="Jump to top"
        >
          Top
        </button>
        <button
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
          className="rounded-full border px-3 py-1.5 text-xs bg-white/80 backdrop-blur shadow hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-900 dark:border-neutral-800"
          title="Jump to bottom"
        >
          Bottom
        </button>
      </div>
    </div>
  );
}

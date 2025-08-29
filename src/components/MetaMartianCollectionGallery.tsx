"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { refreshMintedCacheOnce } from "@/lib/mintedCache";
import { useCollectionDB, type CollectionDB } from "@/store/useCollectionDB";

type SortKey = "num-asc" | "num-desc" | "rarity-asc" | "rarity-desc";

// trait normalization (used in filters)
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



export default function MetaMartianCollectionGallery({
  pageStep = 60,
  initialVisible = 120,
  collectionMint: propMint,
}: {
  pageStep?: number;
  initialVisible?: number;
  collectionMint?: string;
}) {
  const { Modal, openWithData } = useMetaMartianReveal();

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

  const [resolvedMint, setResolvedMint] = useState<string | undefined>(
    propMint || process.env.NEXT_PUBLIC_COLLECTION_MINT
  );
  const [mintedSet, setMintedSet] = useState<Set<string>>(new Set());

  const [visible, setVisible] = useState(initialVisible);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [searchNum, setSearchNum] = useState<string>("");
  const [highlight, setHighlight] = useState<string | null>(null);

  const [minterFilter, setMinterFilter] = useState<"all" | "minted" | "unminted">("all");
  const [sortKey, setSortKey] = useState<SortKey>("num-asc");
  const [selectedTraits, setSelectedTraits] = useState<Record<string, Set<string>>>({});

  const [, startTransition] = useTransition();

  // DB store
  const db = useCollectionDB((s) => s.db);
  const loadDB = useCollectionDB((s) => s.load);
  const dbLoading = useCollectionDB((s) => s.loading);
  const dbError = useCollectionDB((s) => s.error);

  // NEW: persistent highlight that survives until user hovers the card
  const [stickyHighlight, setStickyHighlight] = useState<string | null>(null);

  // Score computation cache
  const scoreCacheRef = useRef<Map<string, number>>(new Map());

  // Background scroll follower: listens to modal nav events
  useEffect(() => {
    const onScrollToCard = (e: any) => {
      const key: string | undefined = e?.detail?.indexKey;
      if (!key) return;
      const el = document.getElementById(`mm-card-${key}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("mm:scroll-to-card", onScrollToCard as EventListener);
    return () => window.removeEventListener("mm:scroll-to-card", onScrollToCard as EventListener);
  }, []);

  // Resolve collection mint from CM on-chain if not provided
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
        // ignore; fallback to env or prop
      }
    })();
  }, [resolvedMint]);

  // Load DB when collection mint is ready
  useEffect(() => {
    if (resolvedMint) loadDB(resolvedMint);
  }, [resolvedMint, loadDB]);

  // Refresh minted list from RPC (DAS)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!db?.collectionMint) return;
      const freshSet = await refreshMintedCacheOnce({
        rpcUrl: RPC,
        collectionMint: db.collectionMint,
      });
      if (!cancelled) setMintedSet(freshSet);
    })();
    return () => {
      cancelled = true;
    };
  }, [db?.collectionMint, RPC]);

  const traitTypes = useMemo(() => (db ? Object.keys(db.traits || {}).sort() : []), [db]);

  const traitValuesByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!db) return map;
    for (const tt of Object.keys(db.traits)) {
      map[tt] = Object.keys(db.traits[tt]).sort();
    }
    return map;
  }, [db]);

  // Minted/not-minted counts for current trait-filtered set
  const { mintedCount, unmintedCount } = useMemo(() => {
    const items = db?.items ?? [];
    const active = Object.keys(selectedTraits);

    let base = items;
    if (active.length > 0) {
      base = base.filter((it) => {
        for (const tt of active) {
          const allowed = selectedTraits[tt];
          const found = it.attributes?.find((a) => normType(a?.trait_type) === tt);
          const val = found ? normVal(found.value) : "None";
          if (!allowed.has(val)) return false;
        }
        return true;
      });
    }

    let minted = 0;
    for (const it of base) if (mintedSet.has(it.index)) minted++;
    const unminted = Math.max(0, base.length - minted);
    return { mintedCount: minted, unmintedCount: unminted };
  }, [db?.items, selectedTraits, mintedSet]);

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

  // Filter + sort view
  const filteredSorted = useMemo(() => {
    let arr: CollectionDB["items"] = db?.items ?? [];

    if (minterFilter === "minted") {
      arr = arr.filter((it) => mintedSet.has(it.index));
    } else if (minterFilter === "unminted") {
      arr = arr.filter((it) => !mintedSet.has(it.index));
    }

    const active = Object.keys(selectedTraits);
    if (active.length > 0) {
      arr = arr.filter((it) => {
        for (const tt of active) {
          const allowed = selectedTraits[tt];
          const found = it.attributes?.find((a) => normType(a?.trait_type) === tt);
          const val = found ? normVal(found.value) : "None";
          if (!allowed.has(val)) return false;
        }
        return true;
      });
    }

    const out = [...arr];
    switch (sortKey) {
      case "num-asc":
        out.sort((a, b) => Number(a.index) - Number(b.index));
        break;
      case "num-desc":
        out.sort((a, b) => Number(b.index) - Number(a.index));
        break;
      case "rarity-asc":
        out.sort((a, b) => a.score - b.score);
        break;
      case "rarity-desc":
        out.sort((a, b) => b.score - a.score);
        break;
    }
    return out;
  }, [db?.items, minterFilter, sortKey, selectedTraits, mintedSet]);

  // Fast index → position lookup in the current filtered+sorted view
  const posByIndex = useMemo(() => {
    const m = new Map<string, number>();
    filteredSorted.forEach((x, i) => m.set(x.index, i));
    return m;
  }, [filteredSorted]);

  // Prebuild the exact items shape the modal expects (once per filteredSorted change)
  const modalItems = useMemo(() => {
    return filteredSorted.map((x) => ({
      name: x.name,
      image: x.image,
      metadataUri: x.metadata,
      indexKey: x.index,
      attributes: x.attributes,
      score: x.score,
      rank: x.rank,
    }));
  }, [filteredSorted]);

  // Memoize sorted scores once (for rank fallback)
  const sortedScoresDesc = useMemo(() => {
    const arr = (db?.items ?? [])
      .map((x) => Number(x.score))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a);
    return arr;
  }, [db]);

  // Fast single-item score (fallback) from DB traits
  const computeScoreFromTraits = useCallback((attrs: any[]): number => {
    if (!db) return NaN;
    const total = Math.max(1, db.items.length);
    let sum = 0;
    const traitsMap = db.traits || {};
    for (const tt of Object.keys(traitsMap)) {
      const found = attrs?.find?.((a: any) => {
        const s = (a?.trait_type ?? "—").toString().trim();
        return s.length ? s === tt : "—" === tt;
      });
      const val = found?.value == null || found?.value === "" ? "None"
        : typeof found.value === "object" ? JSON.stringify(found.value) : String(found.value);
      const count = traitsMap[tt]?.[val] ?? 0;
      sum += total / Math.max(1, count);
    }
    return sum;
  }, [db]);

  // Get display score/rank with coercion + cached fallback + binary search
  const getDisplayScoreRank = useCallback((it: CollectionDB["items"][number]) => {
    // coerce score
    let score = typeof it.score === "number" ? it.score : Number(it.score);
    if (!Number.isFinite(score)) {
      const cached = scoreCacheRef.current.get(it.index);
      if (cached != null) {
        score = cached;
      } else {
        score = computeScoreFromTraits(it.attributes || []);
        if (Number.isFinite(score)) {
          scoreCacheRef.current.set(it.index, score);
        }
      }
    }

    // coerce rank or derive from sorted scores (1 = highest)
    let rank = typeof it.rank === "number" ? it.rank : Number(it.rank);
    if (!Number.isFinite(rank) && sortedScoresDesc.length && Number.isFinite(score)) {
      // count of scores > my score (binary search)
      const arr = sortedScoresDesc;
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] > score) lo = mid + 1; else hi = mid;
      }
      rank = lo + 1;
    }

    return { score, rank };
  }, [computeScoreFromTraits, sortedScoresDesc]);

  // Infinite scroll growth
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

  // Find-by-number
  // Find-by-number (O(1) lookup)
  const onSearch = useCallback(() => {
    const nHuman = Number(searchNum.trim());
    if (!db || !Number.isFinite(nHuman)) return;

    const nZero = Math.max(0, nHuman - 1);
    const i = posByIndex.get(String(nZero));
    if (i == null) return;

    setVisible((v) => Math.max(v, i + Math.max(24, pageStep)));
    const item = filteredSorted[i];

    // Preload hero image (non-blocking)
    if (item?.image) { const img = new Image(); img.src = item.image; }

    // Open quickly with prebuilt items
    openWithData({
      items: modalItems,
      initialIndex: i,
      title: "MetaMartian details",
      collectionMint: db.collectionMint,
      rarityIndexSnapshot: {
        total: db.items.length,
        traits: db.traits,
        overall: db.overall,
        traitAvg: db.traitAvg,
      },
      // Sticky highlight is applied AFTER closing the modal
      onModalClose: () => setStickyHighlight(item.index),
    });

    // Optionally center it behind the modal immediately
    requestAnimationFrame(() => {
      const el = document.getElementById(`mm-card-${item.index}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchNum, db, posByIndex, filteredSorted, modalItems, openWithData, pageStep]);

  const shown = filteredSorted.slice(0, visible);

  return (
    <div className="w-full">
      {Modal}

      <div className="mb-3">
        <h3 className="text-base font-semibold">
          Entire Collection{" "}
          {db?.collectionMint ? `· ${db.collectionMint.slice(0, 4)}…${db.collectionMint.slice(-4)}` : ""}
        </h3>
        <div className="text-xs opacity-70">
          {dbLoading ? "Loading collection data…" : db ? `${db.items.length.toLocaleString()} items` : "Loading…"}
        </div>
      </div>

      {dbError && !dbLoading && (
        <div className="mb-4 rounded-xl border p-4 text-sm text-red-600 dark:border-neutral-800">{dbError}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* LEFT: controls */}
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
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                className="h-9 w-28 rounded-lg border px-2 text-sm dark:border-neutral-700"
                placeholder="e.g. 123"
              />
              <button
                onClick={onSearch}
                disabled={!searchNum}
                className="h-9 rounded-lg border px-3 text-sm disabled:opacity-50 dark:border-neutral-700"
              >
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

          {/* Trait filters */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium opacity-70">Filter by traits</div>
              <button onClick={clearAllTraits} className="text-xs opacity-80 underline hover:opacity-100">
                Clear all
              </button>
            </div>

            {!db && <div className="mb-2 text-[11px] opacity-70">Loading trait data…</div>}

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {traitTypes.map((tt) => {
                const values = traitValuesByType[tt] || [];
                const selected = selectedTraits[tt] || new Set<string>();
                const selectedCount = selected.size;
                return (
                  <details key={tt} className="group rounded-lg border px-2 py-1 dark:border-neutral-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-1">
                      <span className="text-sm">{tt}</span>
                      <span className="text-[10px] opacity-60">
                        {selectedCount > 0 ? `${selectedCount} selected` : `${values.length}`}
                      </span>
                    </summary>

                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {values.map((val) => {
                        const checked = selected.has(val);
                        const count = db?.traits?.[tt]?.[val] ?? 0;
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
                            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{val}</span>
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

            <p className="mt-2 text-[11px] opacity-60">
              Select multiple values per trait (AND across traits, OR within each).
            </p>
          </div>
        </aside>

        {/* RIGHT: Grid + infinite scroll */}
        <div>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
            style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
          >
            {dbLoading &&
              Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              ))}

            {!dbLoading &&
              db &&
              shown.map((it) => {
                const isMinted = mintedSet.has(it.index);
                const isHighlighted = stickyHighlight === it.index || highlight === it.index; // combine flash + sticky

                // Get display score/rank with coercion + cached fallback + binary search
                const { score, rank } = getDisplayScoreRank(it);

                return (
                  <button
                    key={it.index}
                    id={`mm-card-${it.index}`}
                    onMouseEnter={() => {
                      // clear sticky highlight on hover of that card
                      if (stickyHighlight === it.index) setStickyHighlight(null);
                    }}
                    onPointerEnter={() => {
                      if (it.image) {
                        const img = new Image();
                        img.src = it.image;
                      }
                    }}
                    onPointerDown={() => {
                      if (it.image) {
                        const img = new Image();
                        img.src = it.image;
                      }
                    }}
                    onClick={() => {
                      startTransition(() => {
                        const i = posByIndex.get(it.index) ?? 0; // use your memoized posByIndex
                        openWithData({
                          items: modalItems,                     // use your memoized modalItems
                          initialIndex: i,
                          title: "MetaMartian details",
                          collectionMint: db!.collectionMint,
                          rarityIndexSnapshot: {
                            total: db!.items.length,
                            traits: db!.traits,
                            overall: db!.overall,
                            traitAvg: db!.traitAvg,
                          },
                          // NOTE: no sticky highlight on regular clicks (only for "Find by number")
                        });
                      });
                    }}
                    className={`group relative overflow-hidden rounded-xl border text-left transition hover:shadow-md dark:border-neutral-800 ${
                      isHighlighted ? "ring-2 ring-emerald-400" : ""
                    }`}
                    title="View details"
                  >
                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isMinted
                            ? "bg-emerald-500/90 text-white"
                            : "bg-neutral-300/90 text-neutral-900 dark:bg-neutral-700/90 dark:text-white"
                        }`}
                      >
                        {isMinted ? "Minted" : "Not minted"}
                      </span>
                    </div>

                    <div className="aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                      <img
                        src={it.image}
                        alt={it.name}
                        className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03] will-change-transform"
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                      />
                    </div>
                    {/* text */}
                    <div className="p-2">
                      <div className="truncate text-sm font-medium">{it.name}</div>

                      {/* RARITY LINE — always visible with coercion + cached fallback */}
                      <div className="text-[10px] opacity-60 whitespace-nowrap">
                        Score: {Number.isFinite(score) ? Math.round(score).toLocaleString() : "—"} · #{Number.isFinite(rank) ? rank : "—"}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          <div ref={sentinelRef} className="h-12" />
          {shown.length >= (filteredSorted?.length || 0) && !dbLoading && (
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

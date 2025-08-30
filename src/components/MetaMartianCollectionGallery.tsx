"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { refreshMintedCacheOnce } from "@/lib/mintedCache";
import { useCollectionDB, type CollectionDB } from "@/store/useCollectionDB";
import useUmiStore from "@/store/useUmiStore"; // NEW: for signer/wallet

type SortKey = "num-asc" | "num-desc" | "rarity-asc" | "rarity-desc";
type OwnershipFilter = "all" | "mine";

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

// Module-scope cache for wallet collections (shared across component instances)
const walletCache: Map<string, {ts: number; uri: Set<string>; name: Set<string>}> =
  (globalThis as any).__mmWalletCache ?? new Map();
(globalThis as any).__mmWalletCache = walletCache;

// Global inflight request controller
let inflight: AbortController | null = null;

function FoundBeacon() {
  return (
    <>
      {/* soft spinning gradient halo */}
      <span
        className="pointer-events-none absolute -inset-[3px] rounded-2xl
                   bg-[conic-gradient(at_50%_50%,#22c55e_0deg,#06b6d4_120deg,#a78bfa_240deg,#22c55e_360deg)]
                   animate-[spin_2.8s_linear_infinite] opacity-55 blur-md"
      />
      {/* bright ring + glow */}
      <span
        className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-emerald-400/80
                   shadow-[0_0_0_3px_rgba(16,185,129,.50),0_0_40px_12px_rgba(16,185,129,.35)]"
      />
      {/* ripple ping */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2
                   rounded-full border-2 border-emerald-400/50 animate-ping"
      />
    </>
  );
}


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
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all"); // NEW
  const [sortKey, setSortKey] = useState<SortKey>("num-asc");
  const [selectedTraits, setSelectedTraits] = useState<Record<string, Set<string>>>({});

  const [, startTransition] = useTransition();

  // Dock + traits sheet
  const [dockOpen, setDockOpen] = useState(true);
  const [traitsOpen, setTraitsOpen] = useState(false);

  // Auto-hide on scroll
  const [dockHiddenByScroll, setDockHiddenByScroll] = useState(false);
  const prevYRef = useRef<number>(0);

  // DB store
  const db = useCollectionDB((s) => s.db);
  const loadDB = useCollectionDB((s) => s.load);
  const dbLoading = useCollectionDB((s) => s.loading);
  const dbError = useCollectionDB((s) => s.error);

  // Wallet / signer
  const signer = useUmiStore((s) => s.signer);



  // A. derive an effective minter filter (auto-force "minted" when ownership = "mine")
  const effMinter = ownershipFilter === "mine" ? "minted" : minterFilter;

  // B. when Ownership changes, just update the filter
  const onChangeOwnership = (val: OwnershipFilter) => {
    setOwnershipFilter(val);
  };

  // C. keyboard navigation for segmented control
  const ownershipKeyNav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      onChangeOwnership(ownershipFilter === "all" ? "mine" : "all");
      e.preventDefault();
    }
  };

  // D. helper to check if we're in Mine view
  const isMineView = ownershipFilter === "mine";

  // NEW: wallet-owned lookups
  const [walletUriSet, setWalletUriSet] = useState<Set<string>>(new Set());
  const [walletNameSet, setWalletNameSet] = useState<Set<string>>(new Set());
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [walletFetched, setWalletFetched] = useState(false);

  // persistent highlight
  const [stickyHighlight, setStickyHighlight] = useState<string | null>(null);

  // Flash highlight for found cards
  const HIGHLIGHT_MS = 1600;
  const [flashHighlight, setFlashHighlight] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Score computation cache
  const scoreCacheRef = useRef<Map<string, number>>(new Map());

  // ADD: fast O(1) minted lookup via typed array (fallback to Set for non-numeric indexes)
  const mintedFlags = useMemo(() => {
    const len = db?.items?.length ?? 0;
    const flags = new Uint8Array(len || 0);
    if (!len || !mintedSet || mintedSet.size === 0) return flags;
    mintedSet.forEach((idxStr) => {
      const n = Number(idxStr);
      if (Number.isFinite(n) && n >= 0 && n < len) flags[n] = 1;
    });
    return flags;
  }, [mintedSet, db?.items?.length]);

  const hasMinted = useCallback(
    (idxStr: string) => {
      const n = Number(idxStr);
      if (Number.isFinite(n) && mintedFlags.length) return mintedFlags[n] === 1;
      return mintedSet.has(idxStr);
    },
    [mintedFlags, mintedSet]
  );

  // Background scroll follower
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

  // NEW: Optimized wallet-owned assets fetch with caching and lazy loading
  useEffect(() => {
    const wantMine = ownershipFilter === "mine";
    if (!wantMine || !signer?.publicKey || !db?.collectionMint) {
      setWalletUriSet(new Set());
      setWalletNameSet(new Set());
      setWalletErr(null);
      return;
    }

    const key = `${signer.publicKey}:${db.collectionMint}`;
    const cached = walletCache.get(key);
    const FRESH_MS = 5 * 60 * 1000; // 5 minutes TTL

    if (cached && Date.now() - cached.ts < FRESH_MS) {
      setWalletUriSet(cached.uri);
      setWalletNameSet(cached.name);
      return;
    }

    inflight?.abort();
    inflight = new AbortController();

    (async () => {
      setWalletFetched(false); // reset when we start a new fetch
      setWalletLoading(true);
      setWalletErr(null);
      try {
        const res = await fetch(`/api/wallet-collection?owner=${signer.publicKey}&collection=${db.collectionMint}`, {
          cache: "no-store",
          signal: inflight.signal,
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const assets: any[] = await res.json();

        const uri = new Set<string>(), name = new Set<string>();
        for (const a of assets) {
          const u = a?.content?.json_uri ?? a?.content?.metadata?.uri;
          const n = a?.content?.metadata?.name ?? a?.content?.json?.name;
          if (u) uri.add(u);
          if (n) name.add(n);
        }
        setWalletUriSet(uri);
        setWalletNameSet(name);
        walletCache.set(key, { ts: Date.now(), uri, name });
      } catch (e: any) {
        if (!(e as any)?.name?.includes("Abort")) setWalletErr((e as any)?.message ?? String(e));
      } finally {
        setWalletFetched(true); // mark as fetched even on error
        setWalletLoading(false);
      }
    })();

    return () => inflight?.abort();
  }, [ownershipFilter, signer?.publicKey, db?.collectionMint]);

  // Auto-hide scroll listener
  useEffect(() => {
    if (!dockOpen) return; // manual hide wins

    const THRESH_HIDE = 12;        // px down before we hide
    const THRESH_SHOW = 6;         // px up before we show
    const TOP_FORCE_SHOW = 40;     // always show near top
    const BOTTOM_FORCE_SHOW = 160; // always show near bottom

    let ticking = false;
    prevYRef.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const prev = prevYRef.current;
          const dy = y - prev;
          prevYRef.current = y;

          const nearTop = y < TOP_FORCE_SHOW;
          const nearBottom =
            window.innerHeight + y >= document.body.scrollHeight - BOTTOM_FORCE_SHOW;

          if (nearTop || nearBottom) {
            setDockHiddenByScroll(false);
          } else if (dy > THRESH_HIDE) {
            // scrolling down
            setDockHiddenByScroll(true);
            setTraitsOpen(false); // close sheet when dock hides
          } else if (dy < -THRESH_SHOW) {
            // scrolling up
            setDockHiddenByScroll(false);
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dockOpen]);

  const traitTypes = useMemo(() => (db ? Object.keys(db.traits || {}).sort() : []), [db]);

  const traitValuesByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!db) return map;
    for (const tt of Object.keys(db.traits)) {
      map[tt] = Object.keys(db.traits[tt]).sort();
    }
    return map;
  }, [db]);

  // Count of selected trait chips
  const selectedTraitCount = useMemo(
    () => Object.values(selectedTraits).reduce((n, s) => n + s.size, 0),
    [selectedTraits]
  );

  // Single source of truth for trait filtering
  const traitFiltered = useMemo(() => {
    let arr: CollectionDB["items"] = db?.items ?? [];
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
    return arr;
  }, [db?.items, selectedTraits]);

  // Helper: is this item owned by connected wallet?
  const isOwned = useCallback(
    (it: CollectionDB["items"][number]) => {
      if (!walletUriSet.size && !walletNameSet.size) return false;
      return (it.metadata && walletUriSet.has(it.metadata)) || (it.name && walletNameSet.has(it.name));
    },
    [walletUriSet, walletNameSet]
  );

  // NEW: base list after Ownership + Minted filters
  const baseAfterOwnerMinter = useMemo(() => {
    if (!db) return [] as CollectionDB["items"];
    let arr = db.items;

    const effOwnership = signer?.publicKey ? ownershipFilter : "all";
    if (effOwnership === "mine") arr = arr.filter((it) => isOwned(it));

    if (effMinter === "minted") arr = arr.filter((it) => hasMinted(it.index));
    else if (effMinter === "unminted") arr = arr.filter((it) => !hasMinted(it.index));

    return arr;
  }, [db, signer?.publicKey, ownershipFilter, effMinter, isOwned, hasMinted]);

  // NEW: facet counts per trait value given current filters
  const facetCounts = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    if (!db) return out;

    const traitMap = db.traits || {};
    const types = Object.keys(traitMap);
    for (const tt of types) out[tt] = Object.create(null) as Record<string, number>;

    // helper: does item pass currently selected traits EXCEPT `exceptTT`?
    const passesExcept = (it: CollectionDB["items"][number], exceptTT: string) => {
      for (const tt of Object.keys(selectedTraits)) {
        if (tt === exceptTT) continue;
        const allowed = selectedTraits[tt];
        const found = it.attributes?.find((a) => normType(a?.trait_type) === tt);
        const val = found ? normVal(found.value) : "None";
        if (!allowed.has(val)) return false;
      }
      return true;
    };

    for (const tt of Object.keys(traitMap)) {
      for (const it of baseAfterOwnerMinter) {
        if (!passesExcept(it, tt)) continue;
        const found = it.attributes?.find((a) => normType(a?.trait_type) === tt);
        const val = found ? normVal(found.value) : "None";
        out[tt][val] = (out[tt][val] || 0) + 1;
      }
    }
    return out;
  }, [db, baseAfterOwnerMinter, selectedTraits]);

  // Derived counts based on current trait filter (so counts reflect filters)
  const { mintedCount, unmintedCount, ownedCount } = useMemo(() => {
    const base = traitFiltered;
    let minted = 0;
    let owned = 0;
    for (let i = 0; i < base.length; i++) {
      if (hasMinted(base[i].index)) minted++;
      if (isOwned(base[i])) owned++;
    }
    return {
      mintedCount: minted,
      unmintedCount: Math.max(0, base.length - minted),
      ownedCount: owned,
    };
  }, [traitFiltered, hasMinted, isOwned]);

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

  // Build the grid list from the filtered source (traits → ownership → minted → sort)
  const filteredSorted = useMemo(() => {
    let arr = traitFiltered;

    if (ownershipFilter === "mine") {
      arr = arr.filter((it) => isOwned(it));
    }

    if (effMinter === "minted") {
      arr = arr.filter((it) => hasMinted(it.index));
    } else if (effMinter === "unminted") {
      arr = arr.filter((it) => !hasMinted(it.index));
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
  }, [traitFiltered, ownershipFilter, effMinter, sortKey, hasMinted, isOwned]);

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
  const computeScoreFromTraits = useCallback(
    (attrs: any[]): number => {
      if (!db) return NaN;
      const total = Math.max(1, db.items.length);
      let sum = 0;
      const traitsMap = db.traits || {};
      for (const tt of Object.keys(traitsMap)) {
        const found = attrs?.find?.((a: any) => {
          const s = (a?.trait_type ?? "—").toString().trim();
          return s.length ? s === tt : "—" === tt;
        });
        const val =
          found?.value == null || found?.value === ""
            ? "None"
            : typeof found.value === "object"
            ? JSON.stringify(found.value)
            : String(found.value);
        const count = traitsMap[tt]?.[val] ?? 0;
        sum += total / Math.max(1, count);
      }
      return sum;
    },
    [db]
  );

  // Get display score/rank with coercion + cached fallback + binary search
  const getDisplayScoreRank = useCallback(
    (it: CollectionDB["items"][number]) => {
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
        const arr = sortedScoresDesc;
        let lo = 0,
          hi = arr.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (arr[mid] > score) lo = mid + 1;
          else hi = mid;
        }
        rank = lo + 1;
      }

      return { score, rank };
    },
    [computeScoreFromTraits, sortedScoresDesc]
  );

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

  // Find-by-number (O(1) lookup)
  const onSearch = useCallback(() => {
    const nHuman = Number(searchNum.trim());
    if (!db || !Number.isFinite(nHuman)) return;

    const nZero = Math.max(0, nHuman - 1);
    const i = posByIndex.get(String(nZero));
    if (i == null) return;

    setVisible((v) => Math.max(v, i + Math.max(24, pageStep)));
    const item = filteredSorted[i];

    if (item?.image) {
      const img = new Image();
      img.src = item.image;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReducedMotion) {
      setFlashHighlight(item.index);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFlashHighlight(null), HIGHLIGHT_MS);
    } else {
      setStickyHighlight(item.index);
    }

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
      onModalClose: () => setStickyHighlight(item.index),
    });

    requestAnimationFrame(() => {
      const el = document.getElementById(`mm-card-${item.index}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchNum, db, posByIndex, filteredSorted, modalItems, openWithData, pageStep]);

  const shown = filteredSorted.slice(0, visible);

  return (
    <div className="w-full">
      {Modal}

      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Entire Collection{" "}
            {db?.collectionMint ? `· ${db.collectionMint.slice(0, 4)}…${db.collectionMint.slice(-4)}` : ""}
          </h3>
          <div className="text-xs opacity-70">
            {dbLoading ? "Loading collection data…" : db ? `${db.items.length.toLocaleString()} items` : "Loading…"}
          </div>
        </div>

      </div>

      {dbError && !dbLoading && (
        <div className="mb-4 rounded-xl border p-4 text-sm text-red-600 dark:border-neutral-800">{dbError}</div>
      )}

      {/* Cards grid — now uses the full container width on all breakpoints */}
      <div className="pb-28">{/* bottom padding so the dock doesn't cover last row */}
        <div
          className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
        >
          {dbLoading &&
            Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
            ))}

          {!dbLoading && db && shown.map((it) => {
            const isMinted = hasMinted(it.index);
            const isHighlighted = stickyHighlight === it.index || flashHighlight === it.index;
            const { score, rank } = getDisplayScoreRank(it);

            return (
              <button
                key={it.index}
                id={`mm-card-${it.index}`}
                onMouseEnter={() => { if (stickyHighlight === it.index) setStickyHighlight(null); }}
                onPointerEnter={() => { if (it.image) { const img = new Image(); img.src = it.image; } }}
                onPointerDown={() => { if (it.image) { const img = new Image(); img.src = it.image; } }}
                onClick={() => {
                  startTransition(() => {
                    const i = posByIndex.get(it.index) ?? 0;
                    openWithData({
                      items: modalItems,
                      initialIndex: i,
                      title: "MetaMartian details",
                      collectionMint: db!.collectionMint,
                      rarityIndexSnapshot: {
                        total: db!.items.length,
                        traits: db!.traits,
                        overall: db!.overall,
                        traitAvg: db!.traitAvg,
                      },
                    });
                  });
                }}
                className={`group relative overflow-hidden rounded-xl border text-left transition
                  dark:border-neutral-800 hover:shadow-md
                  ${isHighlighted ? "scale-[1.015]" : ""}`}
                title="View details"
              >
                {isHighlighted && <FoundBeacon />}

                {!isMineView && (
                  <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                    {signer?.publicKey && isOwned(it) && (
                      <span className="rounded-full bg-indigo-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
                        Mine
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isMinted
                        ? "bg-emerald-500/90 text-white"
                        : "bg-neutral-300/90 text-neutral-900 dark:bg-neutral-700/90 dark:text-white"
                    }`}>
                      {isMinted ? "Minted" : "Not minted"}
                    </span>
                  </div>
                )}

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

                <div className="p-2">
                  <div className="text-sm font-medium leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                    {it.name}
                  </div>
                  <div className="text-[10px] opacity-60 whitespace-nowrap">
                    Score: {Number.isFinite(score) ? Math.round(score).toLocaleString() : "—"} · #
                    {Number.isFinite(rank) ? rank : "—"}
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

      {/* Toggle button when dock is hidden */}
      {!dockOpen && (
        <button
          onClick={() => setDockOpen(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full border bg-white/90 px-4 py-2 text-sm shadow
                     dark:bg-zinc-900/90 dark:border-neutral-800"
          title="Show filters"
        >
          Show Filters
        </button>
      )}

      {/* Bottom dock (wide + short) */}
      {dockOpen && (
        <div
          className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
            dockHiddenByScroll ? "translate-y-full" : "translate-y-0"
          }`}
        >
          <div className="mx-auto max-w-7xl px-3">
            <div className="rounded-t-2xl border bg-white/90 p-3 shadow-lg backdrop-blur
                            dark:bg-zinc-900/90 dark:border-neutral-800">

              {/* Top row: toolbar */}
              <div className="flex flex-wrap items-center gap-2">

                {/* Hide */}
                <button
                  onClick={() => setDockOpen(false)}
                  className="rounded-lg border px-3 py-1.5 text-xs dark:border-neutral-700"
                  title="Hide filters"
                >
                  Hide
                </button>

                {/* Find by number */}
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={searchNum}
                    onChange={(e) => setSearchNum(e.target.value.replace(/\D+/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                    className="h-9 w-28 rounded-lg border px-2 text-sm dark:border-neutral-700"
                    placeholder="e.g. 123"
                    title="Find by number"
                  />
                  <button
                    onClick={onSearch}
                    disabled={!searchNum}
                    className="h-9 rounded-lg border px-3 text-sm disabled:opacity-50 dark:border-neutral-700"
                  >
                    Go
                  </button>
                </div>

                {/* Ownership segmented */}
                <div
                  role="radiogroup"
                  aria-label="Ownership"
                  className="inline-flex overflow-hidden rounded-lg border dark:border-neutral-700"
                >
                  <button
                    role="radio"
                    aria-checked={ownershipFilter === "all"}
                    onClick={() => onChangeOwnership("all")}
                    className={`h-9 px-3 text-sm ${ownershipFilter === "all" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
                  >
                    All
                  </button>
                  <button
                    role="radio"
                    aria-checked={ownershipFilter === "mine"}
                    onClick={() => onChangeOwnership("mine")}
                    disabled={!signer?.publicKey}
                    title={!signer?.publicKey ? "Connect a wallet to use Mine" : ""}
                    className={`h-9 px-3 text-sm border-l dark:border-neutral-700 disabled:opacity-50
                                ${ownershipFilter === "mine" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
                  >
                    {ownershipFilter === "mine"
                      ? walletLoading
                        ? "Mine (…)": walletFetched ? `Mine (${ownedCount})` : "Mine"
                      : "Mine"}
                  </button>
                </div>

                {/* Minted */}
                <select
                  value={minterFilter}
                  onChange={(e) => setMinterFilter(e.target.value as any)}
                  disabled={ownershipFilter === "mine"}
                  title={ownershipFilter === "mine" ? "All owned NFTs are minted" : "Filter by minted status"}
                  className="h-9 rounded-lg border px-2 text-sm dark:border-neutral-700"
                >
                  <option value="all">All</option>
                  <option value="minted">Minted ({mintedCount})</option>
                  <option value="unminted">Not minted ({unmintedCount})</option>
                </select>

                {/* Sort */}
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-9 rounded-lg border px-2 text-sm dark:border-neutral-700"
                  title="Sort"
                >
                  <option value="num-asc">Number ↑</option>
                  <option value="num-desc">Number ↓</option>
                  <option value="rarity-desc">Rarity ↑</option>
                  <option value="rarity-asc">Rarity ↓</option>
                </select>

                {/* Traits sheet toggle */}
                <button
                  onClick={() => setTraitsOpen(true)}
                  className="rounded-lg border px-3 py-1.5 text-sm dark:border-neutral-700"
                  title="Filter by traits"
                >
                  Traits{selectedTraitCount ? ` (${selectedTraitCount})` : ""}
                </button>

                {/* Spacer */}
                <div className="grow" />

                {/* Jump controls (moved into dock) */}
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="rounded-lg border px-3 py-1.5 text-xs dark:border-neutral-700"
                  title="Top"
                >
                  Top
                </button>
                <button
                  onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
                  className="rounded-lg border px-3 py-1.5 text-xs dark:border-neutral-700"
                  title="Bottom"
                >
                  Bottom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Traits sheet */}
      {dockOpen && traitsOpen && (
        <>
          {/* dim background */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setTraitsOpen(false)}
          />
          <div
            className="fixed z-50 bottom-16 left-1/2 -translate-x-1/2
                       w-[min(100vw-1rem,80rem)] max-h-[65vh] overflow-y-auto
                       rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur
                       dark:bg-zinc-900/95 dark:border-neutral-800"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium opacity-70">Filter by traits</div>
              <div className="flex gap-2">
                <button
                  onClick={clearAllTraits}
                  className="rounded-lg border px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setTraitsOpen(false)}
                  className="rounded-lg border px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                  Done
                </button>
              </div>
            </div>

            {/* Same trait UI, just placed inside the sheet */}
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
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
                        const hideFacetCounts = ownershipFilter === "mine" && !walletFetched;
                        const count = hideFacetCounts ? undefined : facetCounts[tt]?.[val] ?? 0;
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
                            {typeof count === "number" && (
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
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
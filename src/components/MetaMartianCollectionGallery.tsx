"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { refreshMintedCacheOnce } from "@/lib/mintedCache";
import { useCollectionDB, type CollectionDB } from "@/store/useCollectionDB";

// Gallery core imports
import { adaptDbItem } from "@/gallery-core/types";
import { useInfiniteGrid } from "@/gallery-core/useInfiniteGrid";
import { useGalleryFilters } from "@/gallery-core/useGalleryFilters";
import { useFindByNumber } from "@/gallery-core/useFindByNumber";
import { GalleryControls } from "@/gallery-core/GalleryControls";
import { GalleryGrid } from "@/gallery-core/GalleryGrid";



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

  const [, startTransition] = useTransition();

  // DB store
  const db = useCollectionDB((s) => s.db);
  const loadDB = useCollectionDB((s) => s.load);
  const dbLoading = useCollectionDB((s) => s.loading);
  const dbError = useCollectionDB((s) => s.error);

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
      // fallback for non-numeric indexes
      return mintedSet.has(idxStr);
    },
    [mintedFlags, mintedSet]
  );

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

  // Convert DB items to CoreItem format
  const coreItems = useMemo(() => {
    return (db?.items ?? []).map(adaptDbItem);
  }, [db?.items]);

  // Gallery core hooks
  const snapshot = db ? {
    total: db.items.length,
    traits: db.traits,
    overall: db.overall,
    traitAvg: db.traitAvg
  } : undefined;

  const { filteredSorted, traitTypes, traitValuesByType, selectedTraits, setSelectedTraits, clearAllTraits, minterFilter, setMinterFilter, sortKey, setSortKey } =
    useGalleryFilters(coreItems, {
      snapshot,
      mintedLookup: hasMinted,
      enableMintedFilter: true
    });

  const { visible, setVisible, sentinelRef } = useInfiniteGrid(initialVisible, pageStep);
  const { searchNum, setSearchNum, flash, setFlash, sticky, setSticky, onSearch } = useFindByNumber(filteredSorted, pageStep);

  // Minted counts for controls
  const { mintedCount, unmintedCount } = useMemo(() => {
    let minted = 0;
    for (let i = 0; i < filteredSorted.length; i++) {
      if (hasMinted(filteredSorted[i].indexKey)) minted++;
    }
    return { mintedCount: minted, unmintedCount: Math.max(0, filteredSorted.length - minted) };
  }, [filteredSorted, hasMinted]);

  // Prebuild the exact items shape the modal expects (once per filteredSorted change)
  const modalItems = useMemo(() => {
    return filteredSorted.map((x) => ({
      name: x.name,
      image: x.image,
      metadataUri: x.metadataUri,
      indexKey: x.indexKey,
      attributes: x.attributes,
      score: x.score,
      rank: x.rank,
    }));
  }, [filteredSorted]);

  // Find-by-number callback using gallery core
  const handleSearch = useCallback(() => {
    onSearch((i: number, item: any) => {
      startTransition(() => {
        openWithData({
          items: modalItems,
          initialIndex: i,
          title: "MetaMartian details",
          collectionMint: db?.collectionMint,
          rarityIndexSnapshot: snapshot,
          onModalClose: () => setSticky(item.indexKey),
        });
      });
    }, setVisible);
  }, [onSearch, modalItems, openWithData, db?.collectionMint, snapshot, setSticky, setVisible, startTransition]);

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
        <GalleryControls
          searchNum={searchNum}
          setSearchNum={setSearchNum}
          onSearch={handleSearch}
          showMinted={true}
          mintedCounts={{ minted: mintedCount, unminted: unmintedCount }}
          minterFilter={minterFilter}
          setMinterFilter={setMinterFilter}
          sortKey={sortKey}
          setSortKey={setSortKey}
          traitTypes={traitTypes}
          traitValuesByType={traitValuesByType}
          selectedTraits={selectedTraits}
          toggleTraitValue={(tt, val) => {
            setSelectedTraits(prev => {
              const next: Record<string, Set<string>> = {};
              for (const k of Object.keys(prev)) next[k] = new Set(prev[k]);
              (next[tt] ??= new Set()).has(val) ? next[tt].delete(val) : next[tt].add(val);
              if (next[tt].size === 0) delete next[tt];
              return next;
            });
          }}
          clearAllTraits={clearAllTraits}
        />

        {/* RIGHT: Grid + infinite scroll */}
        <div>
          {dbLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              ))}
            </div>
          )}

          {!dbLoading && db && (
            <>
              <GalleryGrid
                items={shown}
                flashKey={flash}
                stickyKey={sticky}
                onCardClick={(item) => {
                  startTransition(() => {
                    const i = filteredSorted.findIndex(x => x.indexKey === item.indexKey);
                    openWithData({
                      items: modalItems,
                      initialIndex: i,
                      title: "MetaMartian details",
                      collectionMint: db.collectionMint,
                      rarityIndexSnapshot: snapshot,
                    });
                  });
                }}
                onCardHover={(item) => {
                  // clear sticky highlight on hover of that card
                  if (sticky === item.indexKey) {
                    setSticky(null);
                  }
                }}
                showMintedBadge={true}
                mintedLookup={hasMinted}
              />
              <div ref={sentinelRef} className="h-12" />
              {shown.length >= filteredSorted.length && (
                <div className="py-6 text-center text-xs opacity-60">— end of collection —</div>
              )}
            </>
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

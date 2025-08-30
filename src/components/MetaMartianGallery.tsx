"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import useUmiStore from "@/store/useUmiStore";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { useCollectionDB } from "@/store/useCollectionDB";

// Gallery core imports
import { adaptWalletAsset } from "@/gallery-core/types";
import { useInfiniteGrid } from "@/gallery-core/useInfiniteGrid";
import { useGalleryFilters } from "@/gallery-core/useGalleryFilters";
import { useFindByNumber } from "@/gallery-core/useFindByNumber";
import { GalleryControls } from "@/gallery-core/GalleryControls";
import { GalleryGrid } from "@/gallery-core/GalleryGrid";


import { publicKey } from "@metaplex-foundation/umi";
import { fetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

// Using CoreItem from gallery-core/types.ts

type Props = {
  pageSize?: number;
  collectionMintOverride?: string;
  candyMachineId?: string;
};

export default function MetaMartianGallery({
  pageSize = 12,
  collectionMintOverride,
  candyMachineId = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!,
}: Props) {
  const umi = useUmiStore((s) => s.umi);
  const signer = useUmiStore((s) => s.signer);

  const { Modal: RevealModal, openWithData } = useMetaMartianReveal();

  // Database store
  const db = useCollectionDB((s) => s.db);
  const loadDB = useCollectionDB((s) => s.load);
  const getItemByMetadata = useCollectionDB((s) => s.getItemByMetadata);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rawItems, setRawItems] = useState<any[]>([]);

  // For smooth modal opening
  const [pending, startTransition] = useTransition();

  // Reduced motion support
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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

  useEffect(() => setMounted(true), []);
  const endpoint = useMemo(
    () => (process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"),
    []
  );

  // resolve collection mint (prop > CM on-chain)
  const [collectionMint, setCollectionMint] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      if (collectionMintOverride) {
        setCollectionMint(collectionMintOverride);
        return;
      }
      try {
        if (!candyMachineId) return;
        const cm = await fetchCandyMachine(umi, publicKey(candyMachineId));
        if (!dead) setCollectionMint(cm.collectionMint.toString());
      } catch (e: any) {
        if (!dead) setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      dead = true;
    };
  }, [candyMachineId, collectionMintOverride, umi]);

  // Load database when collection mint is resolved
  useEffect(() => {
    if (collectionMint) {
      loadDB(collectionMint);
    }
  }, [collectionMint, loadDB]);

  // Convert raw wallet assets to CoreItem format
  const coreItems = useMemo(() => {
    // Pre-build O(1) DB lookups
    const byUri = new Map(db?.items?.map(i => [i.metadata, i]) ?? []);
    const byName = new Map(db?.items?.map(i => [i.name, i]) ?? []);

    return rawItems.map(a => {
      const dbMatch = (a.uri && byUri.get(a.uri)) || byName.get(a.name);
      return adaptWalletAsset(a as any, dbMatch);
    });
  }, [rawItems, db?.items]);

  // Gallery core hooks
  const snapshot = db ? {
    total: db.items.length,
    traits: db.traits,
    overall: db.overall,
    traitAvg: db.traitAvg
  } : undefined;

  const { filteredSorted, traitTypes, traitValuesByType, selectedTraits, setSelectedTraits, clearAllTraits, sortKey, setSortKey } =
    useGalleryFilters(coreItems, {
      snapshot,
      enableMintedFilter: false
    });

  const { visible, setVisible, sentinelRef } = useInfiniteGrid(120, 60);
  const { searchNum, setSearchNum, flash, setFlash, sticky, setSticky, onSearch } = useFindByNumber(filteredSorted, 60);

  // load wallet NFTs and filter by collection (DAS approach)
  useEffect(() => {
    if (!signer || !collectionMint) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = `/api/wallet-collection?owner=${signer.publicKey}&collection=${collectionMint}`;
        const res = await fetch(url, { cache: "no-store" }); // SSR route has its own caching
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const assets: any[] = await res.json();

        if (cancelled) return;

        if (!cancelled) {
          setRawItems(assets);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [signer?.publicKey, collectionMint]);

  // Gallery core logic
  const shown = filteredSorted.slice(0, visible);
  const total = filteredSorted.length;

  if (!mounted) return null;

  if (!signer) {
    return (
      <div className="flex flex-col items-center gap-2">
        <WalletMultiButton />
        <p className="text-xs opacity-70">Connect a wallet to view your MetaMartians.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {RevealModal}
      
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Your MetaMartians</h3>
        <div className="text-xs opacity-70 ml-4">
          {loading ? "Loading…" : err ? "Error" : total === 0 ? "None found" : `${total} found`}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* LEFT: controls */}
        <GalleryControls
          searchNum={searchNum}
          setSearchNum={setSearchNum}
          onSearch={() => onSearch((i: number, item: any) => {
            startTransition(() => {
              const modalItems = filteredSorted.map((x) => ({
                name: x.name,
                image: x.image,
                metadataUri: x.metadataUri,
                indexKey: x.indexKey,
                attributes: x.attributes,
                score: x.score,
                rank: x.rank,
                mint: x.indexKey, // fallback for mint
              }));
              openWithData({
                items: modalItems,
                initialIndex: i,
                title: "Your MetaMartian",
                collectionMint: collectionMint ?? undefined,
                rarityIndexSnapshot: snapshot,
                onModalClose: () => setSticky(item.indexKey),
              });
            });
          }, setVisible)}
          showMinted={false}
          minterFilter="all"
          setMinterFilter={()=>{}}
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
          {err && <pre className="text-xs text-red-600 whitespace-pre-wrap">{err}</pre>}

          {!err && (
            <>
              {loading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                  ))}
                </div>
              )}

              {!loading && (
                <>
                  <GalleryGrid
                    items={shown}
                    flashKey={flash}
                    stickyKey={sticky}
                    onCardClick={(item) => {
                      startTransition(() => {
                        const modalItems = filteredSorted.map((x) => ({
                          name: x.name,
                          image: x.image,
                          metadataUri: x.metadataUri,
                          indexKey: x.indexKey,
                          attributes: x.attributes,
                          score: x.score,
                          rank: x.rank,
                          mint: x.indexKey, // fallback for mint
                        }));
                        const i = filteredSorted.findIndex(x => x.indexKey === item.indexKey);
                        openWithData({
                          items: modalItems,
                          initialIndex: i,
                          title: "Your MetaMartian",
                          collectionMint: collectionMint ?? undefined,
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
                    showMintedBadge={false}
                  />
                  <div ref={sentinelRef} className="h-12" />
                  {shown.length >= filteredSorted.length && (
                    <div className="py-6 text-center text-xs opacity-60">— end of collection —</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
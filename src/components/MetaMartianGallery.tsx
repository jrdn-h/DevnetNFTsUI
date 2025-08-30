"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import useUmiStore from "@/store/useUmiStore";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { useCollectionDB } from "@/store/useCollectionDB";
import { scoreFromAttrs } from "@/lib/rarity/utils";


import { publicKey } from "@metaplex-foundation/umi";
import { fetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

type Card = {
  mint: string;
  name: string;
  image?: string;
  uri?: string;
  attributes?: any[];
  rarityScore?: number;
  rarityRank?: number;
};

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
  const [items, setItems] = useState<Card[]>([]);
  const [page, setPage] = useState(1);

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

        // Pre-build O(1) DB lookups
        const byUri = new Map(db?.items?.map(i => [i.metadata, i]) ?? []);
        const byName = new Map(db?.items?.map(i => [i.name, i]) ?? []);

        const cards = assets.map((a: any) => {
          const mint = a.id as string;
          const name = a.content?.metadata?.name ?? a.content?.json?.name ?? "MetaMartian";
          const image = a.content?.links?.image ?? a.content?.json?.image;
          const uri = a.content?.json_uri ?? a.content?.metadata?.uri;

          const dbItem = (uri && byUri.get(uri)) || byName.get(name);
          return {
            mint,
            name,
            image,
            uri,
            attributes: dbItem?.attributes ?? a.content?.json?.attributes,
            rarityScore: dbItem?.score,
            rarityRank: dbItem?.rank
          };
        });

        // sort by trailing number if present
        cards.sort((a, b) => {
          const num = (s?: string) => Number((s ?? "").match(/(\d+)(?!.*\d)/)?.[1] ?? NaN);
          const an = num(a.name);
          const bn = num(b.name);
          if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
          return a.name.localeCompare(b.name);
        });

        if (!cancelled) {
          setItems(cards);
          setPage(1);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [signer?.publicKey, collectionMint, db?.items]);

  // pagination
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

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

      {err && <pre className="text-xs text-red-600 whitespace-pre-wrap">{err}</pre>}

      {!err && (
        <>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
            style={{ contentVisibility: 'auto', containIntrinsicSize: '800px' }}
          >
            {pageItems.map((it) => (
              <button
                key={it.mint}
                id={`mm-card-${it.mint}`}
                onPointerEnter={() => {
                  // Preload image on hover
                  if (it.image) {
                    const img = new Image();
                    img.src = it.image;
                  }
                }}
                onPointerDown={() => {
                  // Preload image on touch/press
                  if (it.image) {
                    const img = new Image();
                    img.src = it.image;
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  // One-tap open without blocking main thread
                  startTransition(() => {
                    const itemsForModal = items.map((x) => {
                      const dbItem = x.uri ? getItemByMetadata(x.uri) : undefined;
                      return {
                        indexKey: x.mint,        // stable for scroll-follow
                        name: x.name,
                        image: x.image,
                        metadataUri: x.uri,
                        attributes: x.attributes, // might be undefined -> modal lazily fetches
                        score: Number(x.rarityScore ?? dbItem?.score ?? NaN),
                        rank: Number(x.rarityRank ?? dbItem?.rank ?? NaN),
                        mint: x.mint,
                      };
                    });
                    const modalIndex = Math.max(0, items.findIndex((x2) => x2.mint === it.mint));

                    openWithData({
                      items: itemsForModal,
                      initialIndex: modalIndex,
                      title: "Your MetaMartian",
                      collectionMint: collectionMint ?? undefined,
                      rarityIndexSnapshot: db ? {
                        total: db.items.length,
                        traits: db.traits,
                        overall: db.overall,
                        traitAvg: db.traitAvg,
                      } : undefined,
                    });
                  });
                }}
                className="group border rounded-xl overflow-hidden dark:border-neutral-800 cursor-pointer"
                title="Open details"
              >
                <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                  {it.image ? (
                    <img
                      src={it.image}
                      alt={it.name}
                      className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03] will-change-transform"
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-xs opacity-60">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium truncate">{it.name}</div>
                  <div className="text-[10px] opacity-60 truncate">{it.mint.slice(0, 8)}…{it.mint.slice(-8)}</div>
                  <div className="text-[10px] opacity-60 mt-1 whitespace-nowrap">
                    Score: {Number.isFinite(it.rarityScore) ? Math.round(it.rarityScore!).toLocaleString() : "—"} · #{Number.isFinite(it.rarityRank) ? it.rarityRank : "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border dark:border-neutral-800 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs opacity-70">
                Page {page} / {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1 text-sm rounded border dark:border-neutral-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
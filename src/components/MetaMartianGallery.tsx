"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import useUmiStore from "@/store/useUmiStore";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { motion } from "framer-motion";

import { publicKey } from "@metaplex-foundation/umi";
import { fetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { fetchMetadata, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { Connection, PublicKey as Web3Pk } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { loadRarityIndex, scoreFromAttributes } from "@/lib/rarity";

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

type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
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

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Card[]>([]);
  const [page, setPage] = useState(1);
  const [rarityIndex, setRarityIndex] = useState<RarityIndex | null>(null);
  const [loadingRarity, setLoadingRarity] = useState(false);

  // For smooth modal opening
  const [pending, startTransition] = useTransition();

  // Reduced motion support
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

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

  // load wallet NFTs and filter by collection
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!signer || !collectionMint) return;

      setLoading(true);
      setErr(null);
      setItems([]);
      try {
        const conn = new Connection(endpoint, "confirmed");
        const owner = new Web3Pk(signer.publicKey.toString());

        // Token + Token-2022 accounts owned by wallet
        const [classic, t22] = await Promise.all([
          conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
          conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] as any[] })),
        ]);

        // Extract NFT mints (amount=1, decimals=0)
        const extractMints = (arr: any[]) =>
          arr
            .map((a) => a.account?.data?.parsed?.info)
            .filter(Boolean)
            .filter((info: any) => {
              const amt = info?.tokenAmount;
              return amt?.amount === "1" && Number(amt?.decimals ?? 0) === 0;
            })
            .map((info: any) => String(info?.mint));

        const mints = Array.from(new Set<string>([
          ...extractMints(classic.value),
          ...extractMints(t22.value),
        ]));

        if (mints.length === 0) {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }

        // Fetch metadata & filter by verified collection
        const cards: Card[] = [];
        await Promise.allSettled(
          mints.map(async (mintStr) => {
            try {
              const mdPda = findMetadataPda(umi, { mint: publicKey(mintStr) });
              const md = await fetchMetadata(umi, mdPda);
              const belongs =
                md.collection &&
                md.collection.__option === "Some" &&
                md.collection.value.key.toString() === collectionMint &&
                Boolean(md.collection.value.verified);
              if (!belongs) return;

              let name = md.name ?? "MetaMartian";
              let image: string | undefined;
              let uri: string | undefined;
              let attributes: any[] | undefined;
              if (md.uri) {
                uri = md.uri;
                try {
                  const res = await fetch(md.uri);
                  const json = await res.json();
                  name = json?.name ?? name;
                  image = json?.image;
                  attributes = Array.isArray(json?.attributes) ? json.attributes : undefined;
                } catch {}
              }
              cards.push({ mint: mintStr, name, image, uri, attributes });
            } catch {}
          })
        );

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
    }
    run();
  }, [signer, collectionMint, endpoint, umi]);

  // Load rarity data and calculate scores/rankings
  useEffect(() => {
    let cancelled = false;
    async function loadRarityData() {
      if (!collectionMint || items.length === 0) return;

      setLoadingRarity(true);
      try {
        // Load rarity index
        const rIndex = await loadRarityIndex({ collectionMint });
        if (cancelled) return;
        
        if (rIndex) {
          setRarityIndex(rIndex);

          // Load collection catalog to calculate rankings
          const catalogUrl = `/collection/${collectionMint}-catalog.local.json`;
          const catalogRes = await fetch(catalogUrl).catch(() => 
            fetch(catalogUrl.replace("-catalog.local.json", "-catalog.json"))
          );

          let allScores: number[] = [];
          if (catalogRes.ok) {
            const catalog = await catalogRes.json();
            
            // Calculate scores for all items in the collection
            for (const item of catalog.items || []) {
              let itemAttrs: any[] = [];
              
              if (Array.isArray(item.attributes)) {
                itemAttrs = item.attributes;
              } else if (item.metadata) {
                try {
                  const metaRes = await fetch(item.metadata);
                  const metaJson = await metaRes.json();
                  itemAttrs = Array.isArray(metaJson.attributes) ? metaJson.attributes : [];
                } catch {
                  itemAttrs = [];
                }
              }
              
              const itemScore = scoreFromAttributes(itemAttrs, rIndex);
              allScores.push(itemScore);
            }
            
            // Sort scores in descending order (highest = rank 1)
            allScores.sort((a, b) => b - a);
          }

          // Calculate scores and rankings for user's NFTs
          const updatedItems = items.map(item => {
            if (!item.attributes) return item;
            
            const rarityScore = scoreFromAttributes(item.attributes, rIndex);
            
            // Calculate rank if we have collection data
            let rarityRank: number | undefined;
            if (allScores.length > 0) {
              rarityRank = 1;
              for (const score of allScores) {
                if (score > rarityScore) {
                  rarityRank++;
                } else {
                  break;
                }
              }
            }
            
            return {
              ...item,
              rarityScore,
              rarityRank
            };
          });

          if (!cancelled) {
            setItems(updatedItems);
          }
        }
      } catch (error) {
        console.warn("Could not load rarity data:", error);
      } finally {
        if (!cancelled) {
          setLoadingRarity(false);
        }
      }
    }

    loadRarityData();
    return () => {
      cancelled = true;
    };
  }, [items.length, collectionMint]); // Only depend on items.length to avoid infinite loops

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
          {loading ? "Loading…" : loadingRarity ? "Loading rarity…" : total === 0 ? "None found" : `${total} found`}
        </div>
      </div>

      {err && <pre className="text-xs text-red-600 whitespace-pre-wrap">{err}</pre>}

      {!err && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                    const itemsForModal = items.map((x) => ({
                      name: x.name,
                      image: x.image,
                      metadataUri: x.uri,    // reveal will fetch attrs
                      mint: x.mint,
                      indexKey: x.mint,      // stable key for caching & shared-element
                    }));
                    const modalIndex = Math.max(0, items.findIndex((x2) => x2.mint === it.mint));

                    openWithData({
                      items: itemsForModal,
                      initialIndex: modalIndex,
                      title: "Your MetaMartian",
                      collectionMint: collectionMint ?? undefined,
                      // ✅ snapshot fixes the 100% / score=1 issue
                      rarityIndexSnapshot: rarityIndex || undefined,
                    });
                  });
                }}
                className="group border rounded-xl overflow-hidden dark:border-neutral-800 cursor-pointer"
                title="Open details"
              >
                <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                  {it.image ? (
                    <motion.img
                      layoutId={prefersReduced ? undefined : `mm-img-${it.mint}`}
                      src={it.image}
                      alt={it.name}
                      className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                      draggable={false}
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-xs opacity-60">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium truncate">{it.name}</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] opacity-60 truncate">{it.mint}</div>
                    {it.rarityRank && (
                      <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 shrink-0">
                        #{it.rarityRank.toLocaleString()} rarest
                      </div>
                    )}
                  </div>
                  {it.rarityScore && (
                    <div className="text-[10px] opacity-60 mt-1">
                      Score: {Math.round(it.rarityScore).toLocaleString()}
                    </div>
                  )}
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
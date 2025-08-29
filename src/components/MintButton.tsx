"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import bs58 from "bs58";

import useUmiStore from "@/store/useUmiStore";
import umiWithCurrentWalletAdapter from "@/lib/umi/umiWithCurrentWalletAdapter";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { useCollectionDB } from "@/store/useCollectionDB";

// Fast polling helper for on-chain metadata
async function pollMetadataOnce(umi: any, mdPda: any, tries = 80, intervalMs = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchMetadata(umi, mdPda);
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  throw new Error("Metadata not found after waiting");
}

import { generateSigner, publicKey, signAllTransactions, some, transactionBuilder } from "@metaplex-foundation/umi";
import {
  fetchCandyMachine,
  fetchCandyGuard,
  findMintCounterPda,
  safeFetchMintCounter,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";
import { fetchMetadata, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit, addMemo } from "@metaplex-foundation/mpl-toolbox";
import MintingOverlay from "@/components/MintingOverlay";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const CM_ID = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!;
const GUARD_ID = "EaLAUSTjvwUuFeDEtkrGjmxGPLFZqSmnaXRnWh4ef314";
const GROUP_LABEL = process.env.NEXT_PUBLIC_CM_GROUP_LABEL || undefined;

const STEPS = [
  "Preparing",
  "Sending transaction",
  "Confirming",
  "Fetching on-chain metadata",
  "Opening…",
];

type Variant = "solid" | "glow";

export default function MintButton({
  onMintSuccess,
  onModalClose,
  variant = "glow",
  fullWidth = true,
  label = "Mint Now",
}: {
  onMintSuccess?: (mintAddress: string) => void;
  onModalClose?: () => void;
  /** Visual style of the CTA */
  variant?: Variant;
  /** Make the button span available width (good on mobile) */
  fullWidth?: boolean;
  /** CTA text */
  label?: string;
}) {
  const signer = useUmiStore((s) => s.signer);
  const [mounted, setMounted] = useState(false);

  // Database store
  const db = useCollectionDB((s) => s.db);
  const getItemByUriOrName = useCollectionDB((s) => s.getItemByUriOrName);

  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  // NEW: quantity + constraint state
  const [qty, setQty] = useState(1);
  const [maxQty, setMaxQty] = useState<number | null>(null);
  const [batchNote, setBatchNote] = useState<string | undefined>(undefined);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);

  const { Modal, openWithData } = useMetaMartianReveal(onModalClose);

  useEffect(() => setMounted(true), []);

  // OPTIONAL: keep cap fresh on connect
  useEffect(() => {
    (async () => {
      if (!signer) return;
      try { await refreshQtyCap(umiWithCurrentWalletAdapter()); } catch {}
    })();
  }, [signer]);

  // Calculate estimated cost based on quantity
  const calculateEstimatedCost = (quantity: number) => {
    // Base mint cost per NFT (this can be adjusted based on your CM settings)
    const baseMintCost = 0.05; // SOL per mint
    // Network fees per transaction (roughly 0.02 SOL per tx)
    const networkFeePerTx = 0.02;
    
    // For batch minting, we have one transaction per NFT
    const totalMintCost = baseMintCost * quantity;
    const totalNetworkFees = networkFeePerTx * quantity;
    
    return totalMintCost + totalNetworkFees;
  };

  // Update estimated cost when quantity changes
  useEffect(() => {
    if (signer && qty > 0) {
      const cost = calculateEstimatedCost(qty);
      setEstimatedCost(cost);
    }
  }, [qty, signer]);

  // ---- helpers for consistent CTA look ----
  const buttonClasses = `relative z-[1] inline-flex items-center justify-center gap-2
                         h-12 px-6 w-full rounded-xl text-base font-semibold
                         bg-black text-white dark:bg-white dark:text-black
                         transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
                         disabled:opacity-60 disabled:pointer-events-none`;

  // --- Precise per-wallet limit with MintCounter PDA ---
  const refreshQtyCap = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>) => {
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const itemsAvailable = Number(cm.itemsLoaded ?? 0);
    const itemsRedeemed  = Number(cm.itemsRedeemed  ?? 0);
    const remainingSupply = Math.max(0, itemsAvailable - itemsRedeemed);

    let mintLimitId: number | undefined;
    let perWalletLeft = Number.POSITIVE_INFINITY;

    try {
      const guard = await fetchCandyGuard(umi, publicKey(GUARD_ID));
      const group = GROUP_LABEL
        ? guard.groups.find((g: any) => String(g.label) === String(GROUP_LABEL))
        : null;
      const active = (group?.guards ?? guard.guards) || {};

      if (active?.mintLimit && 'limit' in active.mintLimit && 'id' in active.mintLimit) {
        const limit = Number(active.mintLimit.limit);
        mintLimitId = Number(active.mintLimit.id ?? 0);

        const pda = findMintCounterPda(umi, {
          candyGuard: guard.publicKey,
          candyMachine: cm.publicKey,
          id: mintLimitId,
          user: umi.identity.publicKey,
        });
        const counter = await safeFetchMintCounter(umi, pda); // null if not initialized
        const already = Number(counter?.count ?? 0);
        perWalletLeft = Math.max(0, limit - already);
      }
    } catch {
      // no guard or not readable — ignore, just clamp by supply
    }

    const mx = Math.max(1, Math.min(10, Math.min(remainingSupply, perWalletLeft)));
    setMaxQty(mx);
    setQty((q) => Math.min(q, mx));
    return { mintLimitId, remainingSupply, perWalletLeft, maxAllowedNow: mx };
  };

    // ---- Fast one-mint helper (O(1) DB lookup, no network/compute) ----
  const mintOne = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>, mintLimitId?: number) => {
    setStepIndex(1);
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const collectionMintStr = cm.collectionMint.toString();

    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    setStepIndex(2);
    const nftMint = generateSigner(umi);
    const builder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 850_000 }))
      .add(addMemo(umi, { memo: "MetaMartian Mint" }))
      .add(
        mintV2(umi, {
          candyMachine: cm.publicKey,
          candyGuard: publicKey(GUARD_ID),
          nftMint,
          collectionMint: cm.collectionMint,
          collectionUpdateAuthority: collectionUpdateAuthorityPk,
          tokenStandard: cm.tokenStandard,
          // NEW: only if guard has Mint Limit
          ...(mintLimitId != null
            ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } }
            : {}),
        })
      );

    setStepIndex(3); // awaiting wallet approval + send
    // TIP: For faster UX, use confirmed commitment instead of finalized:
    // const { signature } = await builder.sendAndConfirm(umi, { commitment: "confirmed" as any });
    const { signature } = await builder.sendAndConfirm(umi);
    const sig58 = bs58.encode(signature);

    // Poll ONLY the on-chain metadata account (fast)
    setStepIndex(4); // "Fetching on-chain metadata"
    const mdPda = findMetadataPda(umi, { mint: nftMint.publicKey });
    const md = await pollMetadataOnce(umi, mdPda, 80, 100); // up to ~8s worst-case

    // ZERO network/compute: look up in the prebuilt DB by uri or name
    let name = md?.name || "MetaMartian";
    let image: string | undefined;
    let attributes: any[] | undefined;
    let yourScore: number | undefined;
    let rarityRank: number | undefined;

    const dbItem = getItemByUriOrName(md?.uri, name);
    if (dbItem) {
      name = dbItem.name;
      image = dbItem.image;
      attributes = dbItem.attributes;
      yourScore = dbItem.score;
      rarityRank = dbItem.rank;
    }

    // Optional tiny image preload for snappy reveal
    if (image) {
      const img = new Image();
      img.src = image;
    }

    setStepIndex(5); // "Opening…"

    // Open reveal using DB data (no further fetch)
    openWithData({
      name,
      image,
      attributes,
      mint: nftMint.publicKey.toString(),
      txSig: sig58,
      collectionMint: db?.collectionMint || collectionMintStr,
      rarityIndexSnapshot: db ? {
        total: db.items.length,
        traits: db.traits,
        overall: db.overall,
        traitAvg: db.traitAvg,
      } : undefined,
      yourScore,
      rarityRank,
    });

    // Let parent update counts etc.
    onMintSuccess?.(nftMint.publicKey.toString());
  };

  // ---- Batch mint with single wallet approval ----
  const mintBatch = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>, qty: number, mintLimitId?: number) => {
    setStepIndex(1);
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    setStepIndex(2);
    setBatchNote(`Building ${qty} transactions...`);

    // 1) Build one builder per mint
    const builders: ReturnType<typeof transactionBuilder>[] = [];
    const nftMints: ReturnType<typeof generateSigner>[] = [];
    for (let i = 0; i < qty; i++) {
      const nftMint = generateSigner(umi);
      nftMints.push(nftMint);
      builders.push(
        transactionBuilder()
          .add(setComputeUnitLimit(umi, { units: 850_000 }))
          .add(addMemo(umi, { memo: "MetaMartian Mint" }))
          .add(
            mintV2(umi, {
              candyMachine: cm.publicKey,
              candyGuard: publicKey(GUARD_ID),
              nftMint,
              collectionMint: cm.collectionMint,
              collectionUpdateAuthority: collectionUpdateAuthorityPk,
              tokenStandard: cm.tokenStandard,
              // NEW: only if guard has Mint Limit
              ...(mintLimitId != null
                ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } }
                : {}),
            })
          )
      );
    }

    // 2) Build transactions with a fresh blockhash
    setBatchNote("Preparing transactions...");
    const txs = await Promise.all(
      builders.map((b) => b.buildWithLatestBlockhash(umi))
    );

    setStepIndex(3);
    setBatchNote("Awaiting wallet approval...");

    // 3) One wallet popup to sign them all
    const signed = await signAllTransactions(
      txs.map((tx, i) => ({ transaction: tx, signers: builders[i].getSigners(umi) }))
    );

    setStepIndex(4);
    setBatchNote("Sending transactions...");

    // 4) Send & confirm all
    const { blockhash, lastValidBlockHeight } = await umi.rpc.getLatestBlockhash();
    const sigs = await Promise.all(signed.map((tx) => umi.rpc.sendTransaction(tx)));
    
    setBatchNote("Confirming transactions...");
    await Promise.all(
      sigs.map((sig) =>
        umi.rpc.confirmTransaction(sig, {
          strategy: { type: "blockhash", blockhash, lastValidBlockHeight },
        })
      )
    );

    setStepIndex(5);
    setBatchNote("Fetching metadata...");

    // 5) Fetch metadata for all minted NFTs
    const reveals: Array<{
      name?: string; image?: string; mint?: string; txSig?: string | null;
      attributes?: any[]; rarityIndexSnapshot?: any; yourScore?: number; rarityRank?: number;
    }> = [];

    const collectionMintStr = cm.collectionMint.toString();

    for (let i = 0; i < qty; i++) {
      setBatchNote(`Processing NFT ${i + 1} of ${qty}...`);

      const nftMint = nftMints[i];
      const sig58 = bs58.encode(sigs[i]);

      // Poll ONLY the on-chain metadata account (fast)
      const mdPda = findMetadataPda(umi, { mint: nftMint.publicKey });
      const md = await pollMetadataOnce(umi, mdPda, 80, 100);

      // ZERO network/compute: look up in the prebuilt DB by uri or name
      let name = md?.name || "MetaMartian";
      let image: string | undefined;
      let attributes: any[] | undefined;
      let yourScore: number | undefined;
      let rarityRank: number | undefined;

      const dbItem = getItemByUriOrName(md?.uri, name);
      if (dbItem) {
        name = dbItem.name;
        image = dbItem.image;
        attributes = dbItem.attributes;
        yourScore = dbItem.score;
        rarityRank = dbItem.rank;
      }

      // Optional tiny image preload
      if (image) {
        const img = new Image();
        img.src = image;
      }

      reveals.push({
        name,
        image,
        attributes,
        mint: nftMint.publicKey.toString(),
        txSig: sig58,
        rarityIndexSnapshot: db ? {
          total: db.items.length,
          traits: db.traits,
          overall: db.overall,
          traitAvg: db.traitAvg,
        } : undefined,
        yourScore,
        rarityRank,
      });

      // Let parent update counts etc.
      onMintSuccess?.(nftMint.publicKey.toString());
    }

    return reveals;
  };



  if (!mounted) {
    return <div className="h-12 w-40 rounded-xl border border-gray-300 dark:border-neutral-800" />;
  }

  // ---- Wallet not connected: style the WalletMultiButton to match ----
  if (!signer) {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <WalletMultiButton
          className={[
            "!h-12 !rounded-xl !px-6 !text-sm !font-semibold",
            "!bg-black !text-white hover:!opacity-90 active:!opacity-80",
            "dark:!bg-white dark:!text-black",
            fullWidth ? "!w-full" : "",
          ].join(" ")}
        />
        {status && <p className="text-xs text-neutral-600">{status}</p>}
      </div>
    );
  }



  const onMint = async () => {
    setBusy(true);
    setStepIndex(0);
    setStatus(null);
    setBatchNote(undefined);

    try {
      const umi = umiWithCurrentWalletAdapter();
      const { mintLimitId, maxAllowedNow } = await refreshQtyCap(umi);
      const allowed = Math.min(qty, maxAllowedNow);

      if (allowed <= 0) {
        setStatus("Mint limit reached or sold out.");
        return;
      }

      let reveals: Array<{
        name?: string; image?: string; mint?: string; txSig?: string | null;
        attributes?: any[]; rarityIndexSnapshot?: any; yourScore?: number; rarityRank?: number;
      }> = [];

      if (allowed === 1) {
        // Single mint - use fast DB lookup approach
        await mintOne(umi, mintLimitId);
        setStatus("Minted!");
        return;
      } else {
        // Multi-mint - use new batch signing approach with fast DB lookups
        reveals = await mintBatch(umi, allowed, mintLimitId);

        // Multi-mint - use new multi-item modal
        openWithData({
          items: reveals,
          title: "Mint successful — MetaMartians",
        });
      }

      setStatus(allowed > 1 ? `Minted ${allowed} items!` : "Minted!");
    } catch (e: any) {
      const logs = e?.getLogs?.();
      setStatus(logs ? `Error: ${e.message ?? e} — Logs: ${logs.join(" | ")}` : e?.message ?? String(e));
    } finally {
      setBusy(false);
      setBatchNote(undefined);
      setStepIndex(0);
      try { await refreshQtyCap(umiWithCurrentWalletAdapter()); } catch {}
    }
  };

  return (
    <>
      <MintingOverlay
        open={busy}
        stepIndex={stepIndex}
        steps={STEPS}
        note={batchNote}   // NEW
      />
      {Modal}

      {/* BUTTON + GLOW (bounded, centered, clipped) */}
      <div className={`flex flex-col items-center gap-3 ${fullWidth ? "w-full" : ""}`}>
        {variant === "glow" ? (
          <div
            className={[
              "relative inline-flex",
              fullWidth ? "w-full sm:w-fit" : "w-fit",
              "rounded-[14px] p-[2px]",
              "bg-gradient-to-r from-violet-500 to-fuchsia-500",
            ].join(" ")}
          >
            <button
              disabled={busy}
              onClick={onMint}
              className={[
                "relative z-[1] inline-flex items-center justify-center gap-2",
                "h-12 px-6 rounded-xl text-base font-semibold",
                "bg-black text-white dark:bg-white dark:text-black",
                "transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                fullWidth ? "w-full" : "w-fit",
                "disabled:opacity-60 disabled:pointer-events-none",
              ].join(" ")}
              aria-busy={busy}
            >
              {busy ? (
                <>
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
                  </svg>
                  Minting…
                </>
              ) : (
                <>
                  <span className="text-lg">🚀</span>
                  {qty > 1 ? `Mint ${qty}` : label}
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={onMint}
            className={[
              "relative inline-flex items-center justify-center gap-2",
              "h-12 px-6 rounded-xl text-base font-semibold",
              "bg-black text-white dark:bg-white dark:text-black",
              "transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
              fullWidth ? "w-full" : "w-fit",
              "disabled:opacity-60 disabled:pointer-events-none",
            ].join(" ")}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
                </svg>
                Minting…
              </>
            ) : (
              <>
                <span className="text-lg">🚀</span>
                {qty > 1 ? `Mint ${qty}` : label}
              </>
            )}
          </button>
        )}

        {/* Quantity picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={busy || qty <= 1}
            className="h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <div className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums">{qty}</div>
          <button
            onClick={() => setQty((q) => Math.min(maxQty ?? 10, q + 1))}
            disabled={busy || (maxQty != null && qty >= maxQty)}
            className="h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
            aria-label="Increase quantity"
          >
            +
          </button>
          <div className="text-xs opacity-70">{maxQty != null ? `Max ${maxQty}` : "—"}</div>
        </div>

        {/* Cost estimation */}
        {signer && estimatedCost > 0 && (
          <div className="text-center">
            <div className="text-sm font-medium text-black dark:text-white">
              You&apos;ll pay approximately <span className="font-semibold">{estimatedCost.toFixed(2)} SOL</span>
            </div>
            <div className="text-xs text-black/60 dark:text-white/60 mt-0.5">
              Includes estimated network fees (~{(0.02 * qty).toFixed(2)} SOL). Final fees depend on congestion.
            </div>
          </div>
        )}

        {/* status lives OUTSIDE the glow wrapper so it doesn't increase its height */}
        {status && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300 text-center">{status}</p>
        )}
      </div>
    </>
  );
}
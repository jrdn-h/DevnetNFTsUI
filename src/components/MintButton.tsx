"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import bs58 from "bs58";

import useUmiStore from "@/store/useUmiStore";
import umiWithCurrentWalletAdapter from "@/lib/umi/umiWithCurrentWalletAdapter";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";
import { useCollectionDB } from "@/store/useCollectionDB";
import { scoreFromAttrs } from "@/lib/rarity/utils";
import type { RaritySnapshot } from "@/types/reveal";
import useSolUsd from "@/hooks/useSolUsd";

import {
  generateSigner,
  publicKey,
  signAllTransactions,
  some,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import {
  fetchCandyMachine,
  fetchCandyGuard,
  findMintCounterPda,
  safeFetchMintCounter,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";
import { fetchMetadata, findMetadataPda, findMasterEditionPda } from "@metaplex-foundation/mpl-token-metadata";
import { ACCOUNT_SIZE as SPL_ACCOUNT_SIZE, MINT_SIZE as SPL_MINT_SIZE } from "@solana/spl-token";
import { setComputeUnitLimit, addMemo } from "@metaplex-foundation/mpl-toolbox";
import MintingOverlay from "@/components/MintingOverlay";

// ---- Wallet button (no SSR) ----
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

  // ---- Config ----
const CM_ID = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!;
const GUARD_ID =
  process.env.NEXT_PUBLIC_CANDY_GUARD_ID ||
  process.env.NEXT_PUBLIC_CM_GUARD_ID ||
  process.env.NEXT_PUBLIC_CANDY_GUARD ||
  ""; // must exist if you're using guards
const GROUP_LABEL = process.env.NEXT_PUBLIC_CM_GROUP_LABEL || undefined;
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_COMPUTE_UNITS = 850_000;

// ---- Metadata fallback helper ----
async function inflateFromMetadataUri(uri?: string) {
  if (!uri) return null;
  try {
    const res = await fetch(uri, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      name: j?.name as string | undefined,
      image: j?.image as string | undefined,
      attributes: Array.isArray(j?.attributes) ? j.attributes : undefined,
    };
  } catch {
    return null;
  }
}

// ---- Account size utilities ----
function base64ByteLength(b64: string) {
  try {
    // works in browser (client components)
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    return bin.length;
  } catch {
    return 0;
  }
}

// Fetch raw account size (bytes) via RPC, returns null if not found.
async function getAccountSizeBytes(umi: ReturnType<typeof umiWithCurrentWalletAdapter>, pubkey: any) {
  try {
    const res: any = await (umi.rpc as any).call?.("getAccountInfo", [pubkey, { encoding: "base64" }]);
    const v = res?.result?.value;
    if (!v) return null;
    // data is [base64, "base64"] on web3 RPC
    const b64 = Array.isArray(v.data) ? v.data[0] : v.data?.[0];
    const len = typeof b64 === "string" ? base64ByteLength(b64) : 0;
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

// ---- Rent estimation helpers ----
async function rentForSizeLamports(umi: ReturnType<typeof umiWithCurrentWalletAdapter>, size: number) {
  try {
    const r: any = await (umi.rpc as any).call?.("getMinimumBalanceForRentExemption", [size]);
    const n = typeof r === "number" ? r : Number(r?.result ?? r?.value ?? r ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Estimate per-NFT rent using SPL sizes from lib + live collection PDA sizes (metadata/master edition). */
async function estimatePerNftRentSol(umi: ReturnType<typeof umiWithCurrentWalletAdapter>, collectionMintPk: any) {
  // SPL mint + token account sizes from the official library (not magic numbers)
  const mintSize = SPL_MINT_SIZE;
  const tokenAccSize = SPL_ACCOUNT_SIZE;

  // Try to read your actual collection metadata/master edition sizes from chain.
  const mdPda = findMetadataPda(umi, { mint: collectionMintPk });
  const mePda = findMasterEditionPda(umi, { mint: collectionMintPk });

  const [mdSizeLive, meSizeLive] = await Promise.all([
    getAccountSizeBytes(umi, mdPda),
    getAccountSizeBytes(umi, mePda),
  ]);

  // Fallbacks only if PDAs aren't found yet (e.g., brand-new dev env).
  // These are *fallbacks*, not baked-in "truth".
  const metadataSize = mdSizeLive ?? 679;       // typical v1 metadata footprint
  const masterEditionSize = meSizeLive ?? 282;  // typical v2 ME footprint

  const [mintL, tokenL, mdL, meL] = await Promise.all([
    rentForSizeLamports(umi, mintSize),
    rentForSizeLamports(umi, tokenAccSize),
    rentForSizeLamports(umi, metadataSize),
    rentForSizeLamports(umi, masterEditionSize),
  ]);

  const totalLamports = mintL + tokenL + mdL + meL;
  return totalLamports / LAMPORTS_PER_SOL;
}

// Carefully ordered to match actual UX states
const STEPS = [
  "Preparing",
  "Awaiting wallet approval",
  "Submitting",
  "Confirming",
  "Fetching on-chain metadata",
  "Opening…",
] as const;

type Variant = "solid" | "glow";

export default function MintButton({
  onMintSuccess,
  onModalClose,
  variant = "glow",
  fullWidth = true,
  label = "Mint Now",
  overlayGifSrc, // optional: "/minting.gif"
}: {
  onMintSuccess?: (mintAddress: string) => void;
  onModalClose?: () => void;
  variant?: Variant;
  fullWidth?: boolean;
  label?: string;
  overlayGifSrc?: string;
}) {
  const signer = useUmiStore((s) => s.signer);
  const [mounted, setMounted] = useState(false);

  // Database store
  const getItemByUriOrName = useCollectionDB((s) => s.getItemByUriOrName);

  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  // Quantity + limits
  const [qty, setQty] = useState(1);
  const [maxQty, setMaxQty] = useState<number | null>(null);
  const [batchNote, setBatchNote] = useState<string | undefined>(undefined);

  // Pricing & fee estimation
  const [perMintPriceSol, setPerMintPriceSol] = useState<number>(0); // pulled from Candy Guard (SOL payment)
  const [perTxFeeSol, setPerTxFeeSol] = useState<number>(0);         // dynamic (base + priority)
  const [perNftRentSol, setPerNftRentSol] = useState<number>(0);     // one-time account rent per NFT

  const estimatedCost = useMemo(
    () => qty * (perMintPriceSol + perNftRentSol + perTxFeeSol),
    [qty, perMintPriceSol, perNftRentSol, perTxFeeSol]
  );

  // USD pricing
  const solUsd = useSolUsd(60_000);
  const estimatedCostUsd = useMemo(
    () => (solUsd ? estimatedCost * solUsd : null),
    [estimatedCost, solUsd]
  );

  const { Modal, openWithData } = useMetaMartianReveal();

  useEffect(() => setMounted(true), []);

  // --- Helpers -------------------------------------------------------------

  // Read current SOL mint price (if solPayment guard present)
  const readMintPriceFromGuard = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>) => {
    try {
      const guard = await fetchCandyGuard(umi, publicKey(GUARD_ID));
      const group = GROUP_LABEL
        ? guard.groups.find((g: any) => String(g.label) === String(GROUP_LABEL))
        : null;
      const active = (group?.guards ?? guard.guards) || {};
      const sp = (active as any)?.solPayment;
      if (!sp) return 0;

      // Handle all common shapes (bigint, number, { basisPoints }, stringy)
      const l: any = (sp as any).lamports;
      let lamports: bigint = BigInt(0);
      if (typeof l === "bigint") lamports = l;
      else if (typeof l === "number") lamports = BigInt(l);
      else if (l && typeof l.basisPoints === "bigint") lamports = l.basisPoints;
      else if (l && typeof l.toString === "function") lamports = BigInt(l.toString());

      const sol = Number(lamports) / LAMPORTS_PER_SOL;
      // console.debug("[mint] solPayment.lamports=", lamports.toString(), "=>", sol, "SOL");
      return Number.isFinite(sol) ? sol : 0;
    } catch (e) {
      // console.warn("[mint] readMintPriceFromGuard failed", e);
      return 0;
    }
  };

  // Estimate per-tx fees in SOL (base fee per signature + priority fee by recent CU prices).
  const estimatePerTxFeesSol = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>) => {
    let lamportsPerSig = 5_000; // fallback
    try {
      const r: any = await (umi.rpc as any).call?.("getFees", []);
      lamportsPerSig = Number(r?.value?.feeCalculator?.lamportsPerSignature ?? lamportsPerSig);
    } catch {}

    // Priority fee (median µ-lamports per CU)
    let microLamportsPerCU = 0;
    try {
      const r: any = await (umi.rpc as any).call?.("getRecentPrioritizationFees", [{ accountKeys: [] }]);
      const arr = Array.isArray(r?.value) ? r.value : [];
      if (arr.length) {
        const vals = arr.map((x: any) => Number(x?.prioritizationFee || 0)).filter(Number.isFinite).sort((a: number, b: number)=>a-b);
        microLamportsPerCU = vals[Math.floor(vals.length / 2)] || 0;
      }
    } catch {}

    // ~2 sigs (wallet + mint key). This keeps us near Phantom's display.
    const sigCount = 2;
    const baseLamports = lamportsPerSig * sigCount;
    const priorityLamports = Math.round((microLamportsPerCU * DEFAULT_COMPUTE_UNITS) / 1_000_000);

    const totalLamports = Math.max(baseLamports + priorityLamports, lamportsPerSig); // never 0
    return totalLamports / LAMPORTS_PER_SOL;
  };

  // Keep per-wallet cap fresh on connect; clamp max to 100
  const refreshQtyCap = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>) => {
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const itemsAvailable = Number(cm.itemsLoaded ?? 0);
    const itemsRedeemed = Number(cm.itemsRedeemed ?? 0);
    const remainingSupply = Math.max(0, itemsAvailable - itemsRedeemed);

    let mintLimitId: number | undefined;
    let perWalletLeft = Number.POSITIVE_INFINITY;

    try {
      const guard = await fetchCandyGuard(umi, publicKey(GUARD_ID));
      const group = GROUP_LABEL ? guard.groups.find((g: any) => String(g.label) === String(GROUP_LABEL)) : null;
      const active = (group?.guards ?? guard.guards) || {};

      if (active?.mintLimit && "limit" in active.mintLimit && "id" in active.mintLimit) {
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
      // ignore, just clamp by supply
    }

    const mx = Math.max(1, Math.min(100, Math.min(remainingSupply, perWalletLeft)));
    setMaxQty(mx);
    setQty((q) => Math.min(q, mx));

    return { mintLimitId, remainingSupply, perWalletLeft, maxAllowedNow: mx };
  };

  // Snapshot utils (unchanged except template bugs fixed)
  async function loadSnapshot(collectionMint: string) {
    const url = `/db/${collectionMint}.json`;
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      console.warn("[mint] rarity DB not found:", url);
      return null;
    }
    const db = await res.json();
    const snapshot: RaritySnapshot = {
      total: db.items.length,
      traits: db.traits,
      overall: db.overall,
      traitAvg: db.traitAvg,
    };
    const scoresDesc: number[] = db.items
      .map((i: any) => Number(i.score))
      .filter(Number.isFinite)
      .sort((a: number, b: number) => b - a);
    const byMetadata = new Map<string, any>(db.items.map((i: any) => [i.metadata, i]));
    return { snapshot, scoresDesc, byMetadata };
  }

  function rankFromScore(scoresDesc: number[], score: number): number | undefined {
    if (!Number.isFinite(score) || !scoresDesc.length) return undefined;
    let lo = 0,
      hi = scoresDesc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (scoresDesc[mid] > score) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }

  // Initial caps + price/fee estimation on connect/mount
  useEffect(() => {
    (async () => {
      if (!signer) return;
      const umi = umiWithCurrentWalletAdapter();
      try {
        await refreshQtyCap(umi);
      } catch {}
      try {
        const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
        const collectionMintPk = cm.collectionMint;

        const [priceSol, feeSol, rentSol] = await Promise.all([
          readMintPriceFromGuard(umi),
          estimatePerTxFeesSol(umi),
          estimatePerNftRentSol(umi, collectionMintPk), // NEW: account rent estimation
        ]);
        setPerMintPriceSol(priceSol || 0);
        setPerTxFeeSol(Math.max(feeSol, 0));   // keep non-negative
        setPerNftRentSol(Math.max(rentSol, 0));
      } catch (e) {
        // keep calm: show at least a conservative rent so UI isn't 0
        if (!perNftRentSol) setPerNftRentSol(0.02);
      }
    })();
  }, [signer]);

  // ---- Mint flows ---------------------------------------------------------

  // Fast polling helper for on-chain metadata
  async function pollMetadataOnce(umi: any, mdPda: any, tries = 80, intervalMs = 100) {
    for (let i = 0; i < tries; i++) {
      try {
        return await fetchMetadata(umi, mdPda);
      } catch {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    throw new Error("Metadata not found after waiting");
  }

  // Single-mint
  const mintOne = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>, mintLimitId?: number) => {
    setStepIndex(0); // Preparing

    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    const nftMint = generateSigner(umi);
    const builder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: DEFAULT_COMPUTE_UNITS }))
      .add(addMemo(umi, { memo: "MetaMartian Mint" }))
      .add(
        mintV2(umi, {
          candyMachine: cm.publicKey,
          candyGuard: publicKey(GUARD_ID),
          nftMint,
          collectionMint: cm.collectionMint,
          collectionUpdateAuthority: collectionUpdateAuthorityPk,
          tokenStandard: cm.tokenStandard,
          ...(GROUP_LABEL ? { group: some(GROUP_LABEL) } : {}),
          ...(mintLimitId != null ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } } : {}),
        })
      );

    // Await wallet
    setStepIndex(1); // Awaiting wallet approval
    const { signature } = await builder.sendAndConfirm(umi); // approval + submit + confirm
    const sig58 = bs58.encode(signature);

    // Fetch on-chain metadata
    setStepIndex(4); // Fetching on-chain metadata
    const mdPda = findMetadataPda(umi, { mint: nftMint.publicKey });
    const md = await pollMetadataOnce(umi, mdPda, 80, 100);

    // Enrich from local DB
    let name = md?.name || "MetaMartian";
    let image: string | undefined;
    let attributes: any[] | undefined;
    let yourScore: number | undefined;
    let rarityRank: number | undefined;

    const foundDbItem = getItemByUriOrName(md?.uri, name);
    if (foundDbItem) {
      name = foundDbItem.name;
      image = foundDbItem.image;
      attributes = foundDbItem.attributes;
      yourScore = foundDbItem.score;
      rarityRank = foundDbItem.rank;
    }

    // Ensure reveal image + attributes are always present (DB lookup → fallback fetch from NFT's metadata URI)
    if ((!image || !attributes) && md?.uri) {
      const meta = await inflateFromMetadataUri(md.uri);
      if (meta) {
        image = image ?? meta.image;
        attributes = attributes ?? meta.attributes;
        // (optional) name = name ?? meta.name;  // keep on-chain name if you prefer
      }
    }

    if (image) {
      const img = new Image();
      img.src = image;
    }

    // Open reveal modal
    setStepIndex(5); // Opening…
    const collectionMintStr = cm.collectionMint.toString();
    const { snapshot, scoresDesc, byMetadata } = (await loadSnapshot(collectionMintStr)) || {
      snapshot: null,
      scoresDesc: [],
      byMetadata: new Map(),
    };
    const dbRow = md?.uri ? byMetadata.get(md.uri) : undefined;

    yourScore = Number.isFinite(Number(dbRow?.score)) ? Number(dbRow.score) : yourScore;
    rarityRank = Number.isFinite(Number(dbRow?.rank)) ? Number(dbRow.rank) : rarityRank;

    if ((!Number.isFinite(yourScore as number) || yourScore == null) && Array.isArray(attributes) && snapshot) {
      yourScore = scoreFromAttrs(attributes, snapshot);
    }
    if ((!Number.isFinite(rarityRank as number) || rarityRank == null) && Number.isFinite(yourScore as number)) {
      rarityRank = rankFromScore(scoresDesc, yourScore as number);
    }

    const revealItem = {
      indexKey: dbRow?.index ?? nftMint.publicKey.toString(),
      name,
      image,
      metadataUri: md?.uri,
      attributes,
      score: Number.isFinite(yourScore as number) ? (yourScore as number) : undefined,
      rank: Number.isFinite(rarityRank as number) ? (rarityRank as number) : undefined,
      mint: nftMint.publicKey.toString(),
      txSig: sig58,
    };

    openWithData({
      items: [revealItem],
      initialIndex: 0,
      title: "Mint successful — MetaMartian",
      collectionMint: collectionMintStr,
      rarityIndexSnapshot: snapshot || undefined,
    });

    onMintSuccess?.(nftMint.publicKey.toString());
  };

  // Batch mint (one approval for many)
  const mintBatch = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>, qtyLocal: number, mintLimitId?: number) => {
    setStepIndex(0); // Preparing
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    setBatchNote(`Building ${qtyLocal} transactions…`);

    const builders: ReturnType<typeof transactionBuilder>[] = [];
    const nftMints: ReturnType<typeof generateSigner>[] = [];
    for (let i = 0; i < qtyLocal; i++) {
      const nftMint = generateSigner(umi);
      nftMints.push(nftMint);
      builders.push(
        transactionBuilder()
          .add(setComputeUnitLimit(umi, { units: DEFAULT_COMPUTE_UNITS }))
          .add(addMemo(umi, { memo: "MetaMartian Mint" }))
          .add(
            mintV2(umi, {
              candyMachine: cm.publicKey,
              candyGuard: publicKey(GUARD_ID),
              nftMint,
              collectionMint: cm.collectionMint,
              collectionUpdateAuthority: collectionUpdateAuthorityPk,
              tokenStandard: cm.tokenStandard,
              ...(GROUP_LABEL ? { group: some(GROUP_LABEL) } : {}),
              ...(mintLimitId != null ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } } : {}),
            })
          )
      );
    }

    setBatchNote("Preparing transactions…");
    const txs = await Promise.all(builders.map((b) => b.buildWithLatestBlockhash(umi)));

    // Wallet approval
    setStepIndex(1); // Awaiting wallet approval
    setBatchNote("Awaiting wallet approval…");
    const signed = await signAllTransactions(
      txs.map((tx, i) => ({ transaction: tx, signers: builders[i].getSigners(umi) }))
    );

    // Submit
    setStepIndex(2); // Submitting
    setBatchNote("Submitting transactions…");
    const { blockhash, lastValidBlockHeight } = await umi.rpc.getLatestBlockhash();
    const sigs = await Promise.all(signed.map((tx) => umi.rpc.sendTransaction(tx)));

    // Confirm
    setStepIndex(3); // Confirming
    setBatchNote("Confirming transactions…");
    await Promise.all(
      sigs.map((sig) =>
        umi.rpc.confirmTransaction(sig, {
          strategy: { type: "blockhash", blockhash, lastValidBlockHeight },
        })
      )
    );

    // Metadata
    setStepIndex(4); // Fetching on-chain metadata
    setBatchNote("Fetching metadata…");

    const reveals: Array<{
      name?: string;
      image?: string;
      metadataUri?: string;
      mint?: string;
      txSig?: string | null;
      attributes?: any[];
    }> = [];

    for (let i = 0; i < qtyLocal; i++) {
      setBatchNote(`Processing NFT ${i + 1} of ${qtyLocal}…`);
      const nftMint = nftMints[i];
      const sig58 = bs58.encode(sigs[i]);

      const mdPda = findMetadataPda(umi, { mint: nftMint.publicKey });
      const md = await pollMetadataOnce(umi, mdPda, 80, 100);

      let name = md?.name || "MetaMartian";
      let image: string | undefined;
      let attributes: any[] | undefined;

      const dbItem = getItemByUriOrName(md?.uri, name);
      if (dbItem) {
        name = dbItem.name;
        image = dbItem.image;
        attributes = dbItem.attributes;
      }

      // Ensure reveal image + attributes are always present (DB lookup → fallback fetch from NFT's metadata URI)
      if ((!image || !attributes) && md?.uri) {
        const meta = await inflateFromMetadataUri(md.uri);
        if (meta) {
          image = image ?? meta.image;
          attributes = attributes ?? meta.attributes;
        }
      }

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
        metadataUri: md?.uri,
      });

      onMintSuccess?.(nftMint.publicKey.toString());
    }

    return { reveals, collectionMint: cm.collectionMint.toString() };
  };

  // ---- Click handler ------------------------------------------------------

  const onMint = async () => {
    if (!GUARD_ID) {
      setStatus("Candy Guard ID missing. Set NEXT_PUBLIC_CANDY_GUARD_ID in .env.local");
      return;
    }

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

      if (allowed === 1) {
        await mintOne(umi, mintLimitId);
        setStatus("Minted!");
        return;
      } else {
        const { reveals, collectionMint } = await mintBatch(umi, allowed, mintLimitId);

        // Open multi-item modal with rarity enrich
        setStepIndex(5); // Opening…
        const { snapshot, scoresDesc, byMetadata } = (await loadSnapshot(collectionMint)) || {
          snapshot: null,
          scoresDesc: [],
          byMetadata: new Map(),
        };

        const revealItems = reveals.map((r) => {
          const dbRow = r.metadataUri ? byMetadata.get(r.metadataUri) : undefined;

          let yourScore: number | undefined =
            Number.isFinite(Number(dbRow?.score)) ? Number(dbRow.score) : undefined;
          let rarityRank: number | undefined =
            Number.isFinite(Number(dbRow?.rank)) ? Number(dbRow.rank) : undefined;

          if ((!Number.isFinite(yourScore as number) || yourScore == null) && Array.isArray(r.attributes) && snapshot) {
            yourScore = scoreFromAttrs(r.attributes, snapshot);
          }
          if ((!Number.isFinite(rarityRank as number) || rarityRank == null) && Number.isFinite(yourScore as number)) {
            rarityRank = rankFromScore(scoresDesc, yourScore as number);
          }

          return {
            indexKey: dbRow?.index ?? r.mint!,
            name: r.name!,
            image: r.image,
            metadataUri: r.metadataUri,
            attributes: r.attributes,
            score: yourScore ?? NaN,
            rank: rarityRank ?? NaN,
            mint: r.mint!,
            txSig: r.txSig,
          };
        });

        openWithData({
          items: revealItems,
          initialIndex: 0,
          title: `Mint successful — MetaMartians`,
          collectionMint,
          rarityIndexSnapshot: snapshot || undefined,
        });

        setStatus(`Minted ${allowed} items!`);
      }
    } catch (e: any) {
      const logs = e?.getLogs?.();
      setStatus(logs ? `Error: ${e.message ?? e} — Logs: ${logs.join(" | ")}` : e?.message ?? String(e));
    } finally {
      setBusy(false);
      setBatchNote(undefined);
      setStepIndex(0);
      try {
        await refreshQtyCap(umiWithCurrentWalletAdapter());
      } catch {}
    }
  };

  // ---- Render -------------------------------------------------------------

  if (!mounted) {
    return <div className="h-12 w-40 rounded-xl border border-gray-300 dark:border-neutral-800" />;
  }

  // Wallet not connected: style the WalletMultiButton to match
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

  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

  return (
    <>
      <MintingOverlay
        open={busy}
        stepIndex={stepIndex}
        steps={[...STEPS]}
        note={batchNote}
        gifSrc={overlayGifSrc}
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
                <>Minting…</>
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
            {busy ? <>Minting…</> : <>
              <span className="text-lg">🚀</span>
              {qty > 1 ? `Mint ${qty}` : label}
            </>}
          </button>
        )}

        {/* Quantity picker (centered + editable) */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={busy || qty <= 1}
            className="h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
            aria-label="Decrease quantity"
          >
            −
          </button>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQty ?? 100}
            value={qty}
            onChange={(e) => {
              const n = parseInt(e.target.value || "0", 10);
              if (Number.isFinite(n)) setQty((_) => clamp(n, 1, maxQty ?? 100));
            }}
            className="h-9 w-16 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white text-center font-semibold tabular-nums"
            aria-label="Quantity to mint"
          />

          <button
            onClick={() => setQty((q) => Math.min(maxQty ?? 100, q + 1))}
            disabled={busy || (maxQty != null && qty >= maxQty)}
            className="h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
            aria-label="Increase quantity"
          >
            +
          </button>

          <div className="text-xs opacity-70">{maxQty != null ? `Max ${maxQty}` : "—"}</div>
        </div>

        {/* Cost estimation */}
        {signer && (perMintPriceSol > 0 || perTxFeeSol > 0 || perNftRentSol > 0) && (
          <div className="text-center leading-tight">
            <div className="text-sm font-medium text-black dark:text-white">
              You&apos;ll pay approximately{" "}
              <span className="font-semibold">{estimatedCost.toFixed(4)} SOL</span>
              {estimatedCostUsd != null ? (
                <span className="opacity-70"> · ~${estimatedCostUsd.toFixed(2)}</span>
              ) : null}
            </div>
            <div className="text-xs text-black/60 dark:text-white/60 mt-0.5">
              {perMintPriceSol > 0 ? (
                <>Includes {perMintPriceSol.toFixed(4)} SOL mint price per NFT, </>
              ) : (
                <>Mint price: 0 SOL (free), </>
              )}
              ~{(perNftRentSol * qty).toFixed(4)} SOL one-time account rent
              {" "}and ~{(perTxFeeSol * qty).toFixed(4)} SOL network fees. Values depend on congestion and rent rates.
            </div>
          </div>
        )}

        {/* status lives OUTSIDE the glow wrapper so it doesn't increase its height */}
        {status && <p className="text-xs text-neutral-700 dark:text-neutral-300 text-center">{status}</p>}
      </div>
    </>
  );
}

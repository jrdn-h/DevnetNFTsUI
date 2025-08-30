"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

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
  unwrapOption,
} from "@metaplex-foundation/umi";
import { base58, base64 } from "@metaplex-foundation/umi/serializers";
import {
  fetchCandyMachine,
  fetchCandyGuard,
  findMintCounterPda,
  safeFetchMintCounter,
  safeFetchCandyGuard,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";
import { fetchMetadata, findMetadataPda, findMasterEditionPda } from "@metaplex-foundation/mpl-token-metadata";
import { ACCOUNT_SIZE as SPL_ACCOUNT_SIZE, MINT_SIZE as SPL_MINT_SIZE } from "@solana/spl-token";
import { setComputeUnitLimit, setComputeUnitPrice, addMemo } from "@metaplex-foundation/mpl-toolbox";
import MintingOverlay from "@/components/MintingOverlay";

// ---- Wallet button (no SSR) ----
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

// ---- Eligibility preflight helpers ----
async function preflightEligibility(umi: ReturnType<typeof umiWithCurrentWalletAdapter>, cmId: string, guardId: string, group?: string) {
  const cm = await fetchCandyMachine(umi, publicKey(cmId));
  const guard = await safeFetchCandyGuard(umi as any, publicKey(guardId)); // returns null if missing
  if (!guard) return { ok: false, reason: "Candy Guard not found" };

  const active = group
    ? (guard.groups?.find((g:any) => String(g.label ?? '')===String(group))?.guards ?? {})
    : (guard.guards ?? {});

  // 1) Use on-chain time
  const slot = await umi.rpc.getSlot();
  const solanaTime = await umi.rpc.getBlockTime(slot);

  const startDate = unwrapOption((active as any).startDate);
  if (startDate && solanaTime != null && solanaTime < Number((startDate as any).date ?? startDate)) {
    return { ok: false, reason: "Mint has not started yet" };
  }

  // 2) Wallet balance check against SOL payment (not incl. tx fees/rent)
  const solPayment = unwrapOption((active as any).solPayment);
  if (solPayment) {
    const acct = await umi.rpc.getAccount(umi.identity.publicKey);
    const need = Number((solPayment as any).lamports?.basisPoints ?? (solPayment as any).lamports ?? 0);
    if (acct && 'lamports' in acct && Number(acct.lamports ?? 0) < need) return { ok:false, reason:"Not enough SOL for mint price" };
  }

  // 3) mintLimit counter (per-wallet)
  const mintLimit = unwrapOption((active as any).mintLimit);
  if (mintLimit) {
    const pda = findMintCounterPda(umi, {
      candyGuard: guard.publicKey,
      candyMachine: cm.publicKey,
      id: Number((mintLimit as any).id),
      user: umi.identity.publicKey,
    });
    const counter = await safeFetchMintCounter(umi, pda);
    if (counter && Number(counter.count) >= Number((mintLimit as any).limit)) {
      return { ok:false, reason:"Per-wallet mint limit reached" };
    }
  }

  return { ok: true as const };
}

async function pickEligibleGroup(umi: ReturnType<typeof umiWithCurrentWalletAdapter>, cmId: string, guardId: string) {
  const guard = await safeFetchCandyGuard(umi as any, publicKey(guardId));
  if (!guard) return { group: undefined, reason: "Candy Guard missing" };

  const groups = guard.groups ?? [];
  const labels = groups.map((g:any)=>String(g.label ?? ''));
  for (const label of labels) {
    if (!label) continue; // Skip empty labels
    const ok = await preflightEligibility(umi, cmId, guardId, label);
    if (ok.ok) return { group: label };
  }
  // try default guards
  const def = await preflightEligibility(umi, cmId, guardId);
  return def.ok ? { group: undefined } : { group: undefined, reason: def.reason };
}

// ---- Fee estimation helpers ----
async function medianMicroLamportsPerCU(umi: any) {
  try {
    const r = await umi.rpc.call("getRecentPrioritizationFees", [{ accountKeys: [] }]);
    const vals = (Array.isArray(r?.result?.value) ? r.result.value : [])
      .map((x: any) => Number(x?.prioritizationFee || 0))
      .filter(Number.isFinite)
      .sort((a: number, b: number) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  } catch {
    return 0;
  }
}

async function withPriorityFeeAndAutoCU(umi: any, core: ReturnType<typeof transactionBuilder>) {
  // draft = CU limit max + core, ONLY for sim
  const draft = transactionBuilder().add(setComputeUnitLimit(umi, { units: 1_400_000 })).add(core);
  const tx = await draft.buildWithLatestBlockhash(umi);

  const serialized: Uint8Array = umi.transactions.serialize(tx);
  const txB64: string = base64.deserialize(serialized)[0];

  const sim = await umi.rpc.call("simulateTransaction", [
    txB64,
    { encoding: "base64", replaceRecentBlockhash: true, sigVerify: false },
  ]);

  const units = Number(sim?.result?.value?.unitsConsumed ?? 400_000);
  const micro = await medianMicroLamportsPerCU(umi);
  const cuLimit = Math.min(1_400_000, Math.ceil(units * 1.2));
  const cuPrice = Math.max(micro, 50);

  // **return a new builder**: CU first, then your core builder
  return transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: cuLimit }))
    .add(setComputeUnitPrice(umi, { microLamports: cuPrice }))
    .add(core);
}

  // ---- Config ----
const CM_ID = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!;
const GUARD_ID =
  process.env.NEXT_PUBLIC_CANDY_GUARD_ID ||
  process.env.NEXT_PUBLIC_CM_GUARD_ID ||
  process.env.NEXT_PUBLIC_CANDY_GUARD ||
  ""; // must exist if you're using guards
const GROUP_LABEL = process.env.NEXT_PUBLIC_CM_GROUP_LABEL || undefined;
const LAMPORTS_PER_SOL = 1_000_000_000;


// ---- Base58 conversion helper ----
const toBase58 = (sig: unknown) =>
  typeof sig === "string" ? sig : base58.deserialize(sig as Uint8Array)[0];

// ---- Debug helpers ----
const debugPrograms = (b: ReturnType<typeof transactionBuilder>) => {
  const ids = b.getInstructions().map((ix) => ix.programId);
  console.log("[mint] programs in tx:", ids.map(String));
};

async function debugSim(umi: any, b: ReturnType<typeof transactionBuilder>) {
  const tx = await b.buildWithLatestBlockhash(umi);
  const u8 = umi.transactions.serialize(tx);
  const b64 = base64.deserialize(u8)[0];
  const sim = await umi.rpc.call("simulateTransaction", [b64, { encoding: "base64", replaceRecentBlockhash: true, sigVerify: false }]);
  console.log("[sim] err:", sim?.result?.value?.err);
  console.log("[sim] logs:", sim?.result?.value?.logs);
}

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
  onPriceChange,
  variant = "glow",
  fullWidth = true,
  label = "Mint Now",
  overlayGifSrc, // optional: "/minting.gif"
}: {
  onMintSuccess?: (mintAddress: string) => void;
  onModalClose?: () => void;
  onPriceChange?: (priceSol: number) => void;
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

  const [perNftRentSol, setPerNftRentSol] = useState<number>(0);     // one-time account rent per NFT

  const estimatedCost = useMemo(
    () => qty * (perMintPriceSol + perNftRentSol),
    [qty, perMintPriceSol, perNftRentSol]
  );

  // Guard group & eligibility
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);

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
        ? guard.groups?.find((g: any) => String(g.label) === String(GROUP_LABEL))
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



  // Keep per-wallet cap fresh on connect; clamp max to 100 + eligibility check
  const refreshQtyCap = async (umi: ReturnType<typeof umiWithCurrentWalletAdapter>) => {
    const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
    // Use itemsAvailable when present (preferred over itemsLoaded)
    const total = Number((cm as any).data?.itemsAvailable ?? (cm as any).itemsAvailable ?? (cm as any).itemsLoaded ?? 0);
    const itemsRedeemed = Number(cm.itemsRedeemed ?? 0);
    const remainingSupply = Math.max(0, total - itemsRedeemed);

    // Auto-select eligible guard group
    let selectedGroup: string | undefined;
    let eligibilityReason: string | null = null;

    try {
      const groupResult = await pickEligibleGroup(umi, CM_ID, GUARD_ID);
      selectedGroup = groupResult.group;
      eligibilityReason = groupResult.reason || null;
      setSelectedGroup(selectedGroup);
      setEligibilityReason(eligibilityReason);
    } catch (e) {
      console.warn("[mint] guard group selection failed:", e);
      setEligibilityReason("Unable to check eligibility");
    }

    let mintLimitId: number | undefined;
    let perWalletLeft = Number.POSITIVE_INFINITY;

    try {
      const guard = await safeFetchCandyGuard(umi, publicKey(GUARD_ID));
      if (guard) {
        const group = selectedGroup ? guard.groups?.find((g: any) => String(g.label) === String(selectedGroup)) : null;
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
      }
    } catch {
      // ignore, just clamp by supply
    }

    const mx = Math.max(1, Math.min(100, Math.min(remainingSupply, perWalletLeft)));
    setMaxQty(mx);
    setQty((q) => Math.min(q, mx));

    return { mintLimitId, remainingSupply, perWalletLeft, maxAllowedNow: mx, selectedGroup, eligibilityReason };
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

    // Validate DB structure
    if (!db || typeof db !== 'object') {
      console.warn("[mint] invalid rarity DB format:", db);
      return null;
    }

    if (!db.items || !Array.isArray(db.items)) {
      console.warn("[mint] rarity DB missing items array:", db);
      return null;
    }

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

        const [priceSol, rentSol] = await Promise.all([
          readMintPriceFromGuard(umi),
          estimatePerNftRentSol(umi, collectionMintPk), // NEW: account rent estimation
        ]);
        setPerMintPriceSol(priceSol || 0);
        onPriceChange?.(priceSol || 0);
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

    // Validate Candy Guard matches Candy Machine
    const expectedGuard = cm.mintAuthority.toString();
    if (GUARD_ID !== expectedGuard) {
      console.warn("[mint] GUARD_ID mismatch!", { GUARD_ID, expectedGuard });
      setStatus("Wrong Candy Guard for this Candy Machine");
      return;
    }

    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    const nftMint = generateSigner(umi);
    const coreBuilder = transactionBuilder()
      .add(addMemo(umi, { memo: "MetaMartian Mint" }))
      .add(
        mintV2(umi, {
          candyMachine: cm.publicKey,
          candyGuard: publicKey(GUARD_ID),
          nftMint,
          collectionMint: cm.collectionMint,
          collectionUpdateAuthority: collectionUpdateAuthorityPk,
          tokenStandard: cm.tokenStandard,
          ...(selectedGroup ? { group: some(selectedGroup) } : {}),
          ...(mintLimitId != null ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } } : {}),
        })
      );

    // Use dynamic fees + compute limit
    const tuned = await withPriorityFeeAndAutoCU(umi, coreBuilder);

    // Debug: check programs and simulate
    debugPrograms(tuned);
    await debugSim(umi, tuned);

    // Await wallet
    setStepIndex(1); // Awaiting wallet approval
    const { signature } = await tuned.sendAndConfirm(umi); // approval + submit + confirm
    const sig58 = toBase58(signature);

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

    // Validate Candy Guard matches Candy Machine
    const expectedGuard = cm.mintAuthority.toString();
    if (GUARD_ID !== expectedGuard) {
      console.warn("[mint] GUARD_ID mismatch!", { GUARD_ID, expectedGuard });
      setStatus("Wrong Candy Guard for this Candy Machine");
      return;
    }

    const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
    const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

    setBatchNote(`Building ${qtyLocal} transactions…`);

    const coreBuilders: ReturnType<typeof transactionBuilder>[] = [];
    const nftMints: ReturnType<typeof generateSigner>[] = [];
    for (let i = 0; i < qtyLocal; i++) {
      const nftMint = generateSigner(umi);
      nftMints.push(nftMint);
      coreBuilders.push(
        transactionBuilder()
          .add(addMemo(umi, { memo: "MetaMartian Mint" }))
          .add(
            mintV2(umi, {
              candyMachine: cm.publicKey,
              candyGuard: publicKey(GUARD_ID),
              nftMint,
              collectionMint: cm.collectionMint,
              collectionUpdateAuthority: collectionUpdateAuthorityPk,
              tokenStandard: cm.tokenStandard,
              ...(selectedGroup ? { group: some(selectedGroup) } : {}),
              ...(mintLimitId != null ? { mintArgs: { mintLimit: some({ id: mintLimitId }) } } : {}),
            })
          )
      );
    }

    setBatchNote("Preparing transactions…");
    // Apply CU tuning to EACH builder (no packing for CMv3)
    const tunedBuilders = await Promise.all(
      coreBuilders.map((b) => withPriorityFeeAndAutoCU(umi, b))
    );

    // Debug: check programs and simulate each transaction
    tunedBuilders.forEach((b: ReturnType<typeof transactionBuilder>, i: number) => {
      console.log(`[mint] Transaction ${i}:`);
      debugPrograms(b);
    });

    // Debug simulation for first transaction only (to avoid spam)
    if (tunedBuilders.length > 0) {
      await debugSim(umi, tunedBuilders[0]);
    }

    // Build transactions
    const txs = await Promise.all(tunedBuilders.map((b) => b.buildWithLatestBlockhash(umi)));

    setStepIndex(1);
    setBatchNote("Awaiting wallet approval…");
    // One wallet popup for all transactions
    const signed = await signAllTransactions(
      txs.map((tx: any, i: number) => ({ transaction: tx, signers: tunedBuilders[i].getSigners(umi) }))
    );

    setStepIndex(2);
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
      const sig58 = toBase58(sigs[i]); // 1:1 mapping now

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

    // Check eligibility
    if (eligibilityReason) {
      setStatus(eligibilityReason);
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
        const batchResult = await mintBatch(umi, allowed, mintLimitId);
        if (!batchResult) return;

        const { reveals, collectionMint } = batchResult;

        // Open multi-item modal with rarity enrich
        setStepIndex(5); // Opening…
        const { snapshot, scoresDesc, byMetadata } = (await loadSnapshot(collectionMint)) || {
          snapshot: null,
          scoresDesc: [],
          byMetadata: new Map(),
        };

        const revealItems = reveals.map((r: any) => {
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
              disabled={busy || !!eligibilityReason}
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
            disabled={busy || !!eligibilityReason}
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

        {/* Quantity picker (number perfectly centered) */}
        <div className="w-full">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* – on the left, aligned to the right side of its column */}
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={busy || qty <= 1}
              className="justify-self-end h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
              aria-label="Decrease quantity"
            >
              −
            </button>

            {/* The number (editable) sits in the AUTO middle column, which is centered in the grid */}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty ?? 100}
              value={qty}
              onChange={(e) => {
                const n = parseInt(e.target.value || "0", 10);
                if (Number.isFinite(n)) setQty(Math.min(Math.max(n, 1), maxQty ?? 100));
              }}
              className="justify-self-center h-9 w-20 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white text-center font-semibold tabular-nums"
              aria-label="Quantity to mint"
            />

            {/* + on the right, aligned to the left side of its column */}
            <button
              onClick={() => setQty((q) => Math.min(maxQty ?? 100, q + 1))}
              disabled={busy || (maxQty != null && qty >= maxQty)}
              className="justify-self-start h-9 w-9 rounded-lg border border-black/10 bg-white text-black dark:border-white/10 dark:bg-zinc-900 dark:text-white disabled:opacity-50"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Optional: max note under the control, also centered */}
          <div className="mt-1 text-center text-xs opacity-70">
            {maxQty != null ? `Max ${Math.min(maxQty, 100)}` : "—"}
          </div>
        </div>

        {/* Cost estimation */}
        {signer && (perMintPriceSol > 0 || perNftRentSol > 0) && (
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
              ~{(perNftRentSol * qty).toFixed(4)} SOL one-time account rent.
              (Network fees are small and variable, so not shown.)
            </div>
          </div>
        )}

        {/* status lives OUTSIDE the glow wrapper so it doesn't increase its height */}
        {(status || eligibilityReason) && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300 text-center">
            {eligibilityReason || status}
          </p>
        )}
      </div>
    </>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import bs58 from "bs58";

import useUmiStore from "@/store/useUmiStore";
import umiWithCurrentWalletAdapter from "@/lib/umi/umiWithCurrentWalletAdapter";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";

import { generateSigner, publicKey, transactionBuilder } from "@metaplex-foundation/umi";
import { fetchCandyMachine, mintV2 } from "@metaplex-foundation/mpl-candy-machine";
import { fetchMetadata, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { setComputeUnitLimit, addMemo } from "@metaplex-foundation/mpl-toolbox";
import MintingOverlay from "@/components/MintingOverlay";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const CM_ID = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!;
const GUARD_ID = "EaLAUSTjvwUuFeDEtkrGjmxGPLFZqSmnaXRnWh4ef314";

const STEPS = [
  "Preparing",
  "Fetching Candy Machine",
  "Building transaction",
  "Awaiting wallet signature",
  "Confirming on-chain",
  "Fetching metadata",
  "Loading image",
];

export default function MintButton({
  onMintSuccess,
}: {
  onMintSuccess?: (mintAddress: string) => void;
}) {
  const signer = useUmiStore((s) => s.signer);
  const [mounted, setMounted] = useState(false);

  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const { Modal, openForMint } = useMetaMartianReveal();

  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-10 w-40 rounded-2xl border border-gray-300 dark:border-neutral-800" />;
  }

  if (!signer) {
    return (
      <div className="flex flex-col items-center gap-2">
        <WalletMultiButton />
        {status && <p className="text-xs text-neutral-600">{status}</p>}
      </div>
    );
  }

  const onMint = async () => {
    setBusy(true);
    setStepIndex(0);
    setStatus(null);

    try {
      const umi = umiWithCurrentWalletAdapter();

      // (1) Fetch CM
      setStepIndex(1);
      const cm = await fetchCandyMachine(umi, publicKey(CM_ID));

      // (2) Collection UA (if still needed)
      const collectionMd = await fetchMetadata(umi, findMetadataPda(umi, { mint: cm.collectionMint }));
      const collectionUpdateAuthorityPk = collectionMd.updateAuthority;

      // (3) Build tx
      setStepIndex(2);
      const nftMint = generateSigner(umi);
      const builder = transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 800_000 }))
        .add(addMemo(umi, { memo: "MetaMartian Mint" }))
        .add(
          mintV2(umi, {
            candyMachine: cm.publicKey,
            candyGuard: publicKey(GUARD_ID),
            nftMint,
            collectionMint: cm.collectionMint,
            collectionUpdateAuthority: collectionUpdateAuthorityPk,
            tokenStandard: cm.tokenStandard,
          })
        );

      // (4) Await sig
      setStepIndex(3);

      // (5) Send + confirm
      setStepIndex(4);
      const { signature } = await builder.sendAndConfirm(umi);
      const sig58 = bs58.encode(signature);

      // (6–7) Open reveal for this mint (fetch metadata/image/attributes internally)
      setStepIndex(5);
      await openForMint(umi, nftMint.publicKey, {
        txSig: sig58,
        collectionMint: cm.collectionMint.toString(),
      });

      setStatus("Minted!");
      onMintSuccess?.(nftMint.publicKey.toString());
    } catch (e: any) {
      const logs = e?.getLogs?.();
      setStatus(logs ? `Error: ${e.message ?? e} — Logs: ${logs.join(" | ")}` : e?.message ?? String(e));
    } finally {
      setBusy(false);
      setStepIndex(0);
    }
  };

  return (
    <>
      <MintingOverlay open={busy} stepIndex={stepIndex} steps={STEPS} />
      {Modal}

      <div className="flex flex-col items-center gap-3">
        <button
          disabled={busy}
          onClick={onMint}
          className="rounded-2xl px-5 py-3 bg-black dark:bg-white text-white dark:text-black disabled:opacity-50 transition-colors"
        >
          {busy ? "Minting…" : "Mint"}
        </button>

        {status && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300 text-center">{status}</p>
        )}
        {/* Removed the extra "Your MetaMartian!" mini card here */}
      </div>
    </>
  );
}
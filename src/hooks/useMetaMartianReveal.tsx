"use client";

import { useCallback, useMemo, useState } from "react";
import type { Umi, PublicKey as UmiPk } from "@metaplex-foundation/umi";
import { publicKey as toUmiPk } from "@metaplex-foundation/umi";
import {
  fetchMetadata,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import MetaMartianRevealModal from "@/components/MetaMartianRevealModal";

type Attr = { trait_type?: string; value?: unknown };

type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
};

type Last = {
  name?: string;
  image?: string;
  mint?: string;
  txSig?: string | null;
  attributes?: Attr[];
  collectionMint?: string;
  rarityIndexSnapshot?: RarityIndex;
  yourScore?: number;
};

const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"; // Metaplex Token Metadata

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function waitForAccountExists(
  umi: Umi,
  addr: UmiPk,
  tries = 24,
  delayMs = 500
) {
  for (let i = 0; i < tries; i++) {
    const acc = await umi.rpc.getAccount(addr).catch(() => null);
    if (acc && acc.exists) return true;
    await sleep(delayMs);
  }
  return false;
}

/**
 * Given an input that may be a mint OR already a metadata PDA,
 * return the metadata PDA, polling if necessary when starting from a mint.
 */
async function resolveMetadataPda(
  umi: Umi,
  input: string | UmiPk,
  opts?: { tries?: number; delayMs?: number }
): Promise<{ mdPda: UmiPk; mintPk: UmiPk }> {
  const pk = typeof input === "string" ? toUmiPk(input) : input;
  const acc = await umi.rpc.getAccount(pk).catch(() => null);

  // If it already IS a metadata account, use it directly.
  if (acc?.exists && acc.owner?.toString() === TOKEN_METADATA_PROGRAM_ID) {
    // We still need the mint for the modal; read the metadata to get it.
    const md = await fetchMetadata(umi, pk);
    return { mdPda: pk, mintPk: md.mint };
  }

  // Otherwise treat input as a mint and derive the metadata PDA.
  const mdPda = findMetadataPda(umi, { mint: pk });

  // Wait for the PDA to appear (devnet lag/race after mint).
  const ok = await waitForAccountExists(
    umi,
    mdPda[0], // Use mdPda[0] to get the PublicKey from the PDA tuple
    opts?.tries ?? 24,
    opts?.delayMs ?? 500
  );
  if (!ok) {
    throw new Error(
      "Metadata account not found yet. This can happen right after minting on devnet. Try again in a few seconds."
    );
  }

  return { mdPda: mdPda[0], mintPk: pk }; // Return mdPda[0] as PublicKey
}

export default function useMetaMartianReveal() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<Last | null>(null);

  const close = useCallback(() => setOpen(false), []);

  /** Open with pre-fetched data (name/image/attrs) */
  const openWithData = useCallback((data: Last) => {
    setLast(data);
    setOpen(true);
  }, []);

  /**
   * Open for a given mint (or metadata PDA) and (optionally) a txSig/collectionMint.
   * Robust to being called immediately after a mint on devnet.
   */
  const openForMint = useCallback(
    async (
      umi: Umi,
      mintOrMetadata: string | UmiPk,
      opts?: { txSig?: string | null; collectionMint?: string }
    ) => {
      // 1) Resolve metadata PDA (supports either mint or metadata input)
      const { mdPda, mintPk } = await resolveMetadataPda(umi, mintOrMetadata, {
        tries: 24,
        delayMs: 500,
      });

      // 2) Fetch on-chain metadata
      const md = await fetchMetadata(umi, mdPda);

      // 3) Pull JSON
      let name = md.name || "MetaMartian";
      let image: string | undefined;
      let attributes: Attr[] | undefined;
      if (md.uri) {
        try {
          const res = await fetch(md.uri);
          const json = await res.json();
          name = json?.name ?? name;
          image = json?.image;
          attributes = Array.isArray(json?.attributes) ? json.attributes : undefined;
        } catch {
          /* ignore offchain errors */
        }
      }

      // 4) Prefer provided collection mint, otherwise try to infer
      const collectionMint =
        opts?.collectionMint ??
        (md.collection?.__option === "Some" ? md.collection.value.key.toString() : undefined) ??
        undefined;

      setLast({
        name,
        image,
        attributes,
        mint: mintPk.toString(),
        txSig: opts?.txSig ?? null,
        collectionMint,
      });
      setOpen(true);
    },
    []
  );

  const reopen = useCallback(() => {
    if (last) setOpen(true);
  }, [last]);

  const Modal = useMemo(
    () => (
      <MetaMartianRevealModal
        open={open}
        onClose={close}
        name={last?.name}
        image={last?.image}
        mint={last?.mint}
        txSig={last?.txSig ?? null}
        collectionMint={last?.collectionMint}
        attributes={last?.attributes}
        rarityIndexSnapshot={last?.rarityIndexSnapshot}
        yourScore={last?.yourScore}
      />
    ),
    [open, close, last]
  );

  return { Modal, openForMint, openWithData, reopen, last };
}
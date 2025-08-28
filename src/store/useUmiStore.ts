// src/store/useUmiStore.ts
"use client";

import { create } from "zustand";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import {
  Umi,
  Signer,
  createNoopSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromWalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";

// ✅ Only these two plugins are needed
import { mplCandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

interface UmiState {
  umi: Umi;
  signer: Signer | null;
  updateSigner: (wallet: WalletAdapter) => void;
}

const endpoint =
  (process.env.NEXT_PUBLIC_RPC_URL || "").trim() ||
  "https://api.devnet.solana.com";

// Base Umi with CM + Token Metadata registered, plus a no-op signer for reads
const baseUmi = createUmi(endpoint)
  .use(mplTokenMetadata())
  .use(mplCandyMachine())
  .use(
    signerIdentity(
      createNoopSigner(publicKey("11111111111111111111111111111111"))
    )
  );

const useUmiStore = create<UmiState>()((set, get) => ({
  umi: baseUmi,
  signer: null,
  updateSigner: (wallet) => {
    try {
      const newSigner = createSignerFromWalletAdapter(wallet);
      const current = get().signer;
      if (!current || current.publicKey.toString() !== newSigner.publicKey.toString()) {
        set({ signer: newSigner });
      }
    } catch (e) {
      console.error("[useUmiStore] updateSigner error:", e);
      set({ signer: null });
    }
  },
}));

export default useUmiStore;

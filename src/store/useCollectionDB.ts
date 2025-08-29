"use client";

import { create } from "zustand";

export type DBItem = {
  index: string; // 0-based, string
  name: string;
  image: string;
  metadata: string;
  attributes: Array<{ trait_type?: string; value?: any }>;
  score: number; // precomputed rarity score
  rank: number; // precomputed rarity rank (1 = rarest)
  minted?: boolean;
};

export type CollectionDB = {
  version: number;
  collectionMint: string;
  generatedAt: string;
  overall: { avgObserved: number; minObserved: number; maxObserved: number };
  traits: Record<string, Record<string, number>>;
  traitAvg: Record<string, number>;
  items: DBItem[];
  // NEW: Fast lookup indexes
  __byUri?: Record<string, number>;
  __byName?: Record<string, number>;
};

type S = {
  db?: CollectionDB;
  loading: boolean;
  error?: string;
  load: (collectionMint: string) => Promise<void>;
  getItemByIndex: (index: number) => CollectionDB["items"][0] | undefined;
  getItemByName: (name: string) => CollectionDB["items"][0] | undefined;
  getItemByMetadata: (metadataUri: string) => CollectionDB["items"][0] | undefined;
  getItemByUriOrName: (uri?: string, name?: string) => CollectionDB["items"][0] | undefined;
};

export const useCollectionDB = create<S>((set, get) => ({
  db: undefined,
  loading: false,
  error: undefined,

  load: async (collectionMint: string) => {
    const currentDb = get().db;
    if (currentDb?.collectionMint === collectionMint) {
      // Already loaded the right database
      return;
    }

    set({ loading: true, error: undefined });

    try {
      const res = await fetch(`/db/${collectionMint}.json`, {
        cache: "force-cache",
        headers: {
          "Cache-Control": "max-age=3600", // Cache for 1 hour
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load database: ${res.status} ${res.statusText}`);
      }

      const json = await res.json() as CollectionDB;

      // Build fast lookup indexes
      const byUri: Record<string, number> = {};
      const byName: Record<string, number> = {};
      json.items.forEach((it, i) => {
        if (it.metadata) byUri[it.metadata] = i;
        if (it.name) byName[it.name] = i;
      });

      set({ db: { ...json, __byUri: byUri, __byName: byName }, loading: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load collection database";
      set({ error: errorMessage, loading: false });
      console.error("Failed to load collection database:", err);
    }
  },

  getItemByIndex: (index: number) => {
    const db = get().db;
    if (!db) return undefined;
    return db.items[index];
  },

  getItemByName: (name: string) => {
    const db = get().db;
    if (!db) return undefined;

    // Extract number from name like "MetaMartian #0001" -> 0 (zero-based)
    const match = name.match(/#(\d+)$/);
    if (!match) return undefined;

    const humanNumber = parseInt(match[1], 10);
    const zeroBasedIndex = humanNumber - 1;

    return db.items[zeroBasedIndex];
  },

  getItemByMetadata: (metadataUri: string) => {
    const db = get().db;
    if (!db) return undefined;
    return db.items.find(item => item.metadata === metadataUri);
  },

  getItemByUriOrName: (uri?: string, name?: string) => {
    const db = get().db;
    if (!db) return undefined;

    const byUri = db.__byUri || {};
    const byName = db.__byName || {};

    const pos = (uri && byUri[uri] !== undefined)
      ? byUri[uri]
      : (name && byName[name] !== undefined)
        ? byName[name]
        : undefined;

    return pos !== undefined ? db.items[pos] : undefined;
  },
}));

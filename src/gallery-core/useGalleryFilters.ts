import { useMemo, useState } from "react";
import type { CoreItem, Snapshot } from "./types";

export type SortKey = "num-asc" | "num-desc" | "rarity-asc" | "rarity-desc";

const normType = (x: any) => {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
};
const normVal = (v: any) =>
  v == null || v === "" ? "None" : typeof v === "object" ? JSON.stringify(v) : String(v);

export function useGalleryFilters(
  items: CoreItem[],
  opts: {
    snapshot?: Snapshot;              // full collection snapshot (for trait lists + score fallback)
    mintedLookup?: (key: string) => boolean; // optional (collection page)
    enableMintedFilter?: boolean;
  } = {}
) {
  const { snapshot, mintedLookup, enableMintedFilter = false } = opts;

  const [selectedTraits, setSelectedTraits] = useState<Record<string, Set<string>>>({});
  const [minterFilter, setMinterFilter] = useState<"all" | "minted" | "unminted">("all");
  const [sortKey, setSortKey] = useState<SortKey>("num-asc");

  // trait values come from snapshot (global) for stable lists
  const traitTypes = useMemo(() => (snapshot ? Object.keys(snapshot.traits).sort() : []), [snapshot]);
  const traitValuesByType = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!snapshot) return map;
    for (const tt of Object.keys(snapshot.traits)) map[tt] = Object.keys(snapshot.traits[tt]).sort();
    return map;
  }, [snapshot]);

  // filter by selected traits
  const traitFiltered = useMemo(() => {
    const active = Object.keys(selectedTraits);
    if (active.length === 0) return items;
    return items.filter((it) => {
      for (const tt of active) {
        const allowed = selectedTraits[tt];
        const found = it.attributes?.find((a) => normType(a?.trait_type) === tt);
        const val = found ? normVal(found.value) : "None";
        if (!allowed.has(val)) return false;
      }
      return true;
    });
  }, [items, selectedTraits]);

  // optional minted filter (collection page)
  const mintedFiltered = useMemo(() => {
    if (!enableMintedFilter || !mintedLookup) return traitFiltered;
    if (minterFilter === "minted") return traitFiltered.filter((it) => mintedLookup(it.indexKey));
    if (minterFilter === "unminted") return traitFiltered.filter((it) => !mintedLookup(it.indexKey));
    return traitFiltered;
  }, [traitFiltered, enableMintedFilter, mintedLookup, minterFilter]);

  // sort
  const filteredSorted = useMemo(() => {
    const out = [...mintedFiltered];
    switch (sortKey) {
      case "num-asc":  out.sort((a, b) => Number(a.indexKey) - Number(b.indexKey)); break;
      case "num-desc": out.sort((a, b) => Number(b.indexKey) - Number(a.indexKey)); break;
      case "rarity-asc":  out.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)); break;
      case "rarity-desc": out.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)); break;
    }
    return out;
  }, [mintedFiltered, sortKey]);

  return {
    filteredSorted,
    traitTypes,
    traitValuesByType,
    selectedTraits,
    setSelectedTraits,
    clearAllTraits: () => setSelectedTraits({}),
    minterFilter, setMinterFilter,
    sortKey, setSortKey,
  };
}

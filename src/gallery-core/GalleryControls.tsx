import React from "react";

export function GalleryControls(props: {
  // number search
  searchNum: string;
  setSearchNum: (s: string) => void;
  onSearch: () => void;

  // minted filter (optionally show)
  showMinted: boolean;
  mintedCounts?: { minted: number; unminted: number };
  minterFilter: "all" | "minted" | "unminted";
  setMinterFilter: (v: any) => void;

  // sort
  sortKey: string;
  setSortKey: (s: any) => void;

  // traits
  traitTypes: string[];
  traitValuesByType: Record<string, string[]>;
  selectedTraits: Record<string, Set<string>>;
  toggleTraitValue: (tt: string, val: string) => void;
  clearAllTraits: () => void;
}) {
  const {
    searchNum, setSearchNum, onSearch,
    showMinted, mintedCounts, minterFilter, setMinterFilter,
    sortKey, setSortKey,
    traitTypes, traitValuesByType, selectedTraits, toggleTraitValue, clearAllTraits
  } = props;

  return (
    <aside className="lg:sticky lg:top-20 h-fit space-y-4 rounded-2xl border p-4 dark:border-neutral-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur">
      <div className="space-y-1">
        <div className="text-xs font-medium opacity-70">Find by number</div>
        <div className="flex gap-2">
          <input
            inputMode="numeric" pattern="[0-9]*"
            value={searchNum}
            onChange={(e) => setSearchNum(e.target.value.replace(/\D+/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="h-9 w-28 rounded-lg border px-2 text-sm dark:border-neutral-700"
            placeholder="e.g. 123"
          />
          <button onClick={onSearch} disabled={!searchNum} className="h-9 rounded-lg border px-3 text-sm disabled:opacity-50 dark:border-neutral-700">
            Go
          </button>
        </div>
        <p className="text-[11px] opacity-60">Jumps to the card and opens its details.</p>
      </div>

      {showMinted && (
        <div>
          <div className="text-xs font-medium opacity-70">Minted</div>
          <select value={minterFilter} onChange={(e) => setMinterFilter(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-lg border px-2 text-sm dark:border-neutral-700">
            <option value="all">All</option>
            <option value="minted">Minted ({mintedCounts?.minted ?? "—"})</option>
            <option value="unminted">Not minted ({mintedCounts?.unminted ?? "—"})</option>
          </select>
        </div>
      )}

      <div>
        <div className="text-xs font-medium opacity-70">Sort</div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border px-2 text-sm dark:border-neutral-700">
          <option value="num-asc">Number ↑</option>
          <option value="num-desc">Number ↓</option>
          <option value="rarity-desc">Rarity ↑ (rare first)</option>
          <option value="rarity-asc">Rarity ↓ (common first)</option>
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium opacity-70">Filter by traits</div>
          <button onClick={clearAllTraits} className="text-xs opacity-80 underline hover:opacity-100">Clear all</button>
        </div>

        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {traitTypes.map((tt) => {
            const values = traitValuesByType[tt] || [];
            const selected = selectedTraits[tt] || new Set<string>();
            const selectedCount = selected.size;
            return (
              <details key={tt} className="group rounded-lg border px-2 py-1 dark:border-neutral-800">
                <summary className="flex cursor-pointer list-none items-center justify-between py-1">
                  <span className="text-sm">{tt}</span>
                  <span className="text-[10px] opacity-60">
                    {selectedCount > 0 ? `${selectedCount} selected` : `${values.length}`}
                  </span>
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {values.map((val) => {
                    const checked = selected.has(val);
                    return (
                      <label key={`${tt}:${val}`} className={`flex items-start gap-2 rounded-lg border px-2 py-1 text-xs dark:border-neutral-800 ${checked ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleTraitValue(tt, val)} className="mt-0.5 h-3 w-3"/>
                        <span className="min-w-0 flex-1 break-words leading-snug">{val}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] opacity-60">Select multiple values per trait.</p>
      </div>
    </aside>
  );
}

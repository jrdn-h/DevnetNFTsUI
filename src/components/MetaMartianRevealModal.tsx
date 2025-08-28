"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Attribute = { trait_type?: string; value?: unknown };
type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  avgTraitScoreByType?: Record<string, number>;
  overall?: {
    avgObserved?: number;
    minObserved?: number;
    maxObserved?: number;
    avgTheoretical?: number;
    minTheoretical?: number;
    maxTheoretical?: number;
  };
};
type TraitStat = { traitType: string; value: string; pct?: number; score?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  name?: string;
  image?: string;
  mint?: string;
  txSig?: string | null;
  collectionMint?: string;
  attributes?: Attribute[];
  rarityIndexUrlOverride?: string;
  /** Optional explicit title override */
  title?: string;
};

export default function MetaMartianRevealModal({
  open,
  onClose,
  name = "MetaMartian",
  image,
  mint,
  txSig,
  collectionMint,
  attributes,
  rarityIndexUrlOverride,
  title,
}: Props) {
  const [traitStats, setTraitStats] = useState<TraitStat[]>([]);
  const [yourOverall, setYourOverall] = useState<number | null>(null);
  const [avgOverall, setAvgOverall] = useState<number | null>(null);
  const [maxOverall, setMaxOverall] = useState<number | null>(null);
  const [minOverall, setMinOverall] = useState<number | null>(null);
  const [avgTraitScoreByType, setAvgTraitScoreByType] = useState<Record<string, number>>({});
  const [loadingRarity, setLoadingRarity] = useState<boolean>(false);
  const [rarityErr, setRarityErr] = useState<string | null>(null);

  // Backdrop ref (for outside click)
  const backdropRef = useRef<HTMLDivElement>(null);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Close on clicking outside the panel
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const endpoint = (process.env.NEXT_PUBLIC_RPC_URL || "").toLowerCase();
  const clusterParam = endpoint.includes("devnet") ? "?cluster=devnet" : endpoint.includes("testnet") ? "?cluster=testnet" : "";

  const rarityIndexUrl = useMemo(() => {
    if (rarityIndexUrlOverride) return rarityIndexUrlOverride;
    if (process.env.NEXT_PUBLIC_RARITY_INDEX_URL) return process.env.NEXT_PUBLIC_RARITY_INDEX_URL;
    if (collectionMint) return `/rarity/${collectionMint}.json`;
    return undefined;
  }, [rarityIndexUrlOverride, collectionMint]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open) return;

      if (!attributes || attributes.length === 0) {
        setTraitStats([]);
        setYourOverall(null);
        setAvgOverall(null);
        setMaxOverall(null);
        setMinOverall(null);
        setAvgTraitScoreByType({});
        return;
      }

      setLoadingRarity(true);
      setRarityErr(null);
      try {
        let index: RarityIndex | undefined;
        if (rarityIndexUrl) {
          const res = await fetch(rarityIndexUrl).catch(() => null);
          if (res?.ok) index = (await res.json()) as RarityIndex;
        }

        // per-trait for THIS NFT
        const stats: TraitStat[] = attributes.map((a) => {
          const traitType = String(a?.trait_type ?? "—");
          const value =
            a?.value === null || a?.value === undefined || a?.value === ""
              ? "None"
              : typeof a?.value === "object"
              ? JSON.stringify(a.value)
              : String(a.value);

          if (!index) return { traitType, value };

          const total = Math.max(1, Number(index.total || 0));
          const count = index.traits?.[traitType]?.[value] ?? 0;
          const safe = Math.max(1, Number(count));
          const pct = (safe / total) * 100;
          const score = total / safe; // same as 100/pct
          return { traitType, value, pct, score };
        });

        // your overall (sum of your trait scores where available)
        const yourSum = stats.reduce((s, t) => s + (t.score ?? 0), 0);
        if (!cancelled) setYourOverall(isFinite(yourSum) && yourSum > 0 ? yourSum : null);

        if (index) {
          // prefer observed stats from the file; fallback to theoretical if missing
          const avgObs = index.overall?.avgObserved ?? null;
          const minObs = index.overall?.minObserved ?? null;
          const maxObs = index.overall?.maxObserved ?? null;

          let avgByType = index.avgTraitScoreByType ?? {};
          if (!avgByType || Object.keys(avgByType).length === 0) {
            // fallback: #distinct values per trait type
            const tmp: Record<string, number> = {};
            for (const tt of Object.keys(index.traits || {})) {
              tmp[tt] = Object.keys(index.traits[tt] || {}).length;
            }
            avgByType = tmp;
          }

          if (!cancelled) {
            setAvgOverall(avgObs ?? index.overall?.avgTheoretical ?? null);
            setMinOverall(minObs ?? index.overall?.minTheoretical ?? null);
            setMaxOverall(maxObs ?? index.overall?.maxTheoretical ?? null);
            setAvgTraitScoreByType(avgByType);
          }
        } else {
          if (!cancelled) {
            setAvgOverall(null);
            setMinOverall(null);
            setMaxOverall(null);
            setAvgTraitScoreByType({});
          }
        }

        if (!cancelled) setTraitStats(stats);
      } catch (e: any) {
        if (!cancelled) setRarityErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoadingRarity(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [open, attributes, rarityIndexUrl]);

  if (!open) return null;

  const nice = (n: number, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

  // Context-aware title (fits minting & gallery view)
  const headerTitle =
    title ?? (txSig ? "Mint successful — MetaMartian" : "MetaMartian details");

  return (
    <div
      ref={backdropRef}
      onClick={onBackdropClick}
      className="fixed inset-0 z-[70] flex h-[100svh] items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm sm:px-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-[64rem] overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl dark:bg-zinc-900/95"
        // stop clicks inside from closing
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-white/80 px-5 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
          <h3 className="text-base font-semibold">{headerTitle}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-black/10 px-3 py-1 text-xs opacity-80 hover:opacity-100 dark:border-white/10"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="mm-scroll max-h-[92svh] overflow-y-auto px-5 pb-6">
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* IMAGE WELL */}
            <div className="w-full">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-black/10 dark:ring-white/10">
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-black" />
                <div className="absolute inset-0 p-2">
                  <div className="relative h-full w-full overflow-hidden rounded-xl bg-white/50 dark:bg-black/30">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt={name}
                        className="absolute inset-0 h-full w-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-sm opacity-60">
                        No image found
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10" />
                  </div>
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-lg font-medium">{name}</div>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs opacity-80">
                  {mint && (
                    <a
                      href={`https://explorer.solana.com/address/${mint}${clusterParam}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Mint address
                    </a>
                  )}
                  {txSig && (
                    <>
                      <span>•</span>
                      <a
                        href={`https://explorer.solana.com/tx/${txSig}${clusterParam}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Transaction
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ATTRIBUTES / RARITY */}
            <div className="w-full">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold">Attributes & Rarity</h4>
                {loadingRarity && <span className="text-xs opacity-70">Calculating…</span>}
              </div>

              {rarityErr && (
                <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{rarityErr}</p>
              )}

              {/* Overall metrics (observed when available) */}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Your Overall Score</div>
                  <div className="text-lg font-semibold">
                    {yourOverall != null ? nice(yourOverall, 2) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Sum of your trait scores. Higher is rarer.
                  </div>
                </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Average Overall</div>
                  <div className="text-lg font-semibold">
                    {avgOverall != null ? nice(avgOverall, 2) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Collection average overall score (observed).
                  </div>
                </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Highest / Lowest (observed)</div>
                  <div className="text-lg font-semibold">
                    {maxOverall != null ? nice(maxOverall, 2) : "—"} /{" "}
                    {minOverall != null ? nice(minOverall, 2) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Computed from cache across minted items.
                  </div>
                </div>
              </div>

              {/* Trait list */}
              <div className="mt-4 grid gap-2">
                {traitStats.map((t, i) => (
                  <div
                    key={`${t.traitType}-${t.value}-${i}`}
                    className="rounded-xl border p-3 dark:border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate">
                        <div className="text-[11px] uppercase tracking-wide opacity-60">
                          {t.traitType}
                        </div>
                        <div className="text-sm font-medium truncate">{t.value}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {t.pct != null ? `${nice(t.pct, 2)}%` : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full bg-black/70 dark:bg-white/80 transition-all"
                        style={{ width: `${Math.max(1, Math.min(100, t.pct ?? 0))}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between text-[11px] opacity-70">
                      <span>Score: {t.score != null ? nice(t.score, 2) : "—"}</span>
                      <span>
                        Avg Score (collection):{" "}
                        {avgTraitScoreByType[t.traitType] != null
                          ? nice(avgTraitScoreByType[t.traitType], 0)
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* end right column */}
          </div>
        </div>
      </div>

      {/* Scoped scrollbar styling */}
      <style jsx global>{`
        .mm-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.35) transparent; }
        .mm-scroll::-webkit-scrollbar { width: 8px; }
        .mm-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.35); border-radius: 9999px; }
        .mm-scroll::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-color-scheme: dark) {
          .mm-scroll { scrollbar-color: rgba(255,255,255,0.35) transparent; }
          .mm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.35); }
        }
      `}</style>
    </div>
  );
}
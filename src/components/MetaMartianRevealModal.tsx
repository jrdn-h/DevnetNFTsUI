"use client";

import { useEffect, useMemo, useRef, useState } from "react";


import type { RevealItem, RaritySnapshot } from "@/types/reveal";
import { traitStatsFrom, scoreFromAttrs } from "@/lib/rarity/utils";

type TraitStat = { traitType: string; value: string; pct?: number; score?: number; count?: number };

// normalize trait keys exactly like collection builder
const normType = (x: any) => {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
};
const normVal = (v: any) =>
  v === null || v === undefined || v === ""
    ? "None"
    : typeof v === "object"
    ? JSON.stringify(v)
    : String(v);

// helpers for shared-element transitions
const isInViewport = (el: Element) => {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  // require at least partial visibility
  return r.bottom >= 0 && r.right >= 0 && r.top <= vh && r.left <= vw;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: RevealItem[];        // ← unified
  initialIndex?: number;      // ← unified
  collectionMint?: string;
  rarityIndexSnapshot?: RaritySnapshot; // ← unified
};

export default function MetaMartianRevealModal({
  open, onClose, title,
  items, initialIndex = 0,
  collectionMint,
  rarityIndexSnapshot,
}: Props) {
  const [rarityErr, setRarityErr] = useState<string | null>(null);



  // (Optional but robust) Force a fresh render per open
  const [sessionKey, setSessionKey] = useState(0);

  // Image ready state for smooth loading
  const [imgReady, setImgReady] = useState(false);

  // Reduced motion support
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Shared-element return control
  const [useSharedReturn, setUseSharedReturn] = useState(true);

  const [index, setIndex] = useState(initialIndex);

  // Active item
  const active = items[Math.max(0, Math.min(items.length - 1, index))];

  // Local attrs that can lazily hydrate from metadataUri, reset on item change
  const [loadedAttrs, setLoadedAttrs] = useState<any[]>(active?.attributes ?? []);
  useEffect(() => { setLoadedAttrs(active?.attributes ?? []); }, [active?.indexKey]);

  // Helper to resolve a stable key for caching
  const activeKey = useMemo(() => {
    const base = active?.indexKey || active?.mint || active?.metadataUri || active?.name || "item";
    return `${collectionMint ?? ""}::${String(base)}`;
  }, [active, collectionMint]);

  // Reset nav + lazy state whenever the modal opens with a new dataset or index
  useEffect(() => {
    if (!open) return;

    // start at the requested item
    setIndex(initialIndex);

    // clear lazy-loaded attrs and transient UI state
    setLoadedAttrs(active?.attributes ?? []);
    setRarityErr(null);
  }, [open, initialIndex, items]);

  // Force fresh render when modal opens with new data
  useEffect(() => {
    if (open) setSessionKey((k) => k + 1);
  }, [open, items, initialIndex]);

  // keep background in sync
  useEffect(() => {
    if (!open || !active?.indexKey) return;
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("mm:scroll-to-card", { detail: { indexKey: active.indexKey } }));
    });
  }, [open, active?.indexKey]);

  // Image ready state for smooth loading
  useEffect(() => {
    let cancelled = false;
    setImgReady(false);
    if (!active?.image) return;
    const i = new Image();
    i.src = active.image;
    (i.decode?.() ?? Promise.resolve()).catch(() => {}).finally(() => {
      if (!cancelled) setImgReady(true);
    });
    return () => { cancelled = true; };
  }, [active?.image]);

  // Backdrop ref (for outside click)
  const backdropRef = useRef<HTMLDivElement>(null);

  // Lock background scroll while open (with scrollbar compensation)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;

    const sw = window.innerWidth - document.documentElement.clientWidth; // scrollbar width
    if (sw > 0) document.body.style.paddingRight = `${sw}px`;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);

  // Close on Escape (+ optional prev/next with Arrow keys when multi)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // prev/next when multiple items are shown
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && items.length > 1) {
        e.preventDefault();
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
        if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, items]);

  // Close on clicking outside the panel
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const endpoint = (process.env.NEXT_PUBLIC_RPC_URL || "").toLowerCase();
  const clusterParam = endpoint.includes("devnet") ? "?cluster=devnet" : endpoint.includes("testnet") ? "?cluster=testnet" : "";

  const rarityIndexUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_RARITY_INDEX_URL) return process.env.NEXT_PUBLIC_RARITY_INDEX_URL;
    if (collectionMint) return `/rarity/${collectionMint}.json`;
    return undefined;
  }, [collectionMint]);

  useEffect(() => {
    let dead = false;
    if ((loadedAttrs?.length ?? 0) > 0 || !active?.metadataUri) return;
    (async () => {
      try {
        const r = await fetch(active.metadataUri!, { cache: "no-store" });
        const j = await r.json();
        const got = Array.isArray(j?.attributes) ? j.attributes : [];
        if (!dead) setLoadedAttrs(got);
      } catch {}
    })();
    return () => { dead = true; };
  }, [active?.metadataUri, loadedAttrs?.length]);





  // Compute trait stats directly from the snapshot (no internal fetches)
  const traitStats = useMemo(
    () => traitStatsFrom(loadedAttrs, rarityIndexSnapshot),
    [loadedAttrs, rarityIndexSnapshot, active?.indexKey]
  );

  // Your overall score: prefer precomputed score from item, else sum of trait scores
  const yourOverall = useMemo(() => {
    const s = Number(active?.score);
    if (Number.isFinite(s)) return s;
    if (!traitStats.length) return null;
    return traitStats.reduce((acc, t) => acc + (t.score || 0), 0);
  }, [active?.score, traitStats]);

  // Observed collection stats come straight from the snapshot
  const avgOverall  = rarityIndexSnapshot?.overall?.avgObserved ?? null;
  const minOverall  = rarityIndexSnapshot?.overall?.minObserved ?? null;
  const maxOverall  = rarityIndexSnapshot?.overall?.maxObserved ?? null;

  // (Optional) tiny "calculating" flag while attrs are still hydrating
  const loadingRarity = !loadedAttrs?.length && !!active?.metadataUri;

  const nice = (n: number, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

  // Context-aware title (fits minting & gallery view)
  const headerTitle = title ?? (active?.txSig ? "Mint successful — MetaMartian" : "MetaMartian details");

  const indexedTitle = items.length > 1 ? `${headerTitle} (${index + 1}/${items.length})` : headerTitle;

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[70] flex h-[100svh] items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm sm:px-6 opacity-100 transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      onClick={onBackdropClick}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-[64rem] overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl dark:bg-zinc-900/95 translate-y-0 opacity-100 transition duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-white/80 px-5 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
          <h3 className="text-base font-semibold">{indexedTitle}</h3>
          <div className="flex items-center gap-2">
            {items.length > 1 && (
              <div className="mr-2 text-xs opacity-80 tabular-nums">
                {index + 1} / {items.length}
              </div>
            )}
            {/* Navigation buttons removed - now outside panel */}
            <button
              onClick={() => onClose()}
              className="rounded-full border border-black/10 px-3 py-1 text-xs opacity-80 hover:opacity-100 dark:border-white/10"
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mm-scroll max-h-[92svh] overflow-y-auto px-5 pb-6">
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* IMAGE */}
            <div className="w-full">
              <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                {active?.image ? (
                  <>
                    <img
                      src={active.image}
                      alt={active.name}
                      className="block h-full w-full object-contain transition-opacity duration-150"
                      draggable={false}
                      style={{ imageRendering: "pixelated" }} // keeps 8-bit art crisp
                    />
                    {!imgReady && (
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-black/5 to-transparent dark:from-white/10" />
                    )}
                  </>
                ) : (
                  <div className="grid h-full w-full place-items-center text-sm opacity-60">
                    No image found
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5 dark:ring-white/5" />
              </div>

              {/* Navigation arrows moved outside panel */}

              <div className="mt-3 text-center">
                <div className="text-lg font-medium">{active?.name}</div>
                {active?.rank && Number.isFinite(active.rank) && (
                  <div className="mt-1 text-sm font-semibold text-purple-600 dark:text-purple-400">
                    #{active.rank.toLocaleString()} rarest
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs opacity-80">
                  {active?.mint && (
                    <a
                      href={`https://explorer.solana.com/address/${active.mint}${clusterParam}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Mint address
                    </a>
                  )}
                  {active?.txSig && (
                    <>
                      <span>•</span>
                      <a
                        href={`https://explorer.solana.com/tx/${active.txSig}${clusterParam}`}
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
              </div>

              {rarityErr && (
                <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{rarityErr}</p>
              )}

              {/* Overall metrics (observed when available) */}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Your Overall Score</div>
                  <div className="text-lg font-semibold">
                    {active?.score && Number.isFinite(active.score) ? nice(active.score, 0) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Sum of your trait scores. Higher is rarer.
                  </div>
                </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Average Overall</div>
                  <div className="text-lg font-semibold">
                    {rarityIndexSnapshot?.overall?.avgObserved && Number.isFinite(rarityIndexSnapshot.overall.avgObserved) ? nice(rarityIndexSnapshot.overall.avgObserved, 0) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Collection average overall score (observed).
                  </div>
                </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Highest / Lowest (observed)</div>
                  <div className="text-lg font-semibold">
                    {rarityIndexSnapshot?.overall?.maxObserved && Number.isFinite(rarityIndexSnapshot.overall.maxObserved) ? nice(rarityIndexSnapshot.overall.maxObserved, 0) : "—"} /{" "}
                    {rarityIndexSnapshot?.overall?.minObserved && Number.isFinite(rarityIndexSnapshot.overall.minObserved) ? nice(rarityIndexSnapshot.overall.minObserved, 0) : "—"}
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
                       <span>Count in collection: {t.count != null ? Math.round(t.count).toLocaleString() : "—"}</span>
                       <span>Score: {t.score != null ? nice(t.score, 2) : "—"}</span>
                     </div>
                  </div>
                ))}
              </div>
            </div>
            {/* end right column */}
          </div>
        </div>
      </div>

      {/* === OUTSIDE-OF-POPUP NAV ARROWS === */}
      {open && items.length > 1 && (
        <div className="pointer-events-none fixed inset-y-0 left-0 right-0 z-[80] flex items-center justify-between px-3 sm:px-6">
          {/* Prev */}
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
            disabled={index === 0}
            aria-label="Previous"
            className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-black/10 bg-white/85 shadow-lg backdrop-blur hover:bg-white disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900/85 dark:hover:bg-zinc-900"
          >
            <svg viewBox="0 0 24 24" className="block h-5 w-5" aria-hidden>
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Next */}
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(items.length - 1, i + 1)); }}
            disabled={index >= items.length - 1}
            aria-label="Next"
            className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-black/10 bg-white/85 shadow-lg backdrop-blur hover:bg-white disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900/85 dark:hover:bg-zinc-900"
          >
            <svg viewBox="0 0 24 24" className="block h-5 w-5" aria-hidden style={{ transform: "scaleX(-1)" }}>
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
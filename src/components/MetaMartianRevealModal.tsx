"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Attribute = { trait_type?: string; value?: unknown };
type RarityIndex = {
  total: number;
  traits: Record<string, Record<string, number>>;
  overall?: { avgObserved: number; minObserved: number; maxObserved: number };
  traitAvg?: Record<string, number>;
};
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

// (Optional safety) coerce total if snapshot arrives without it
const coerceIndex = (idx?: RarityIndex) => {
  if (!idx) return undefined;
  let total = Number(idx.total || 0);
  if (!total || total <= 0) {
    let best = 0;
    for (const tt of Object.keys(idx.traits || {})) {
      const sum = Object.values(idx.traits[tt] || {}).reduce((a, b) => a + Number(b || 0), 0);
      if (sum > best) best = sum;
    }
    total = best || 1;
  }
  return { ...idx, total };
};

// helpers for shared-element transitions
const isInViewport = (el: Element) => {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  // require at least partial visibility
  return r.bottom >= 0 && r.right >= 0 && r.top <= vh && r.left <= vw;
};

// ADD
type MintedItem = {
  name?: string;
  image?: string;
  mint?: string;
  txSig?: string | null;
  attributes?: Attribute[];
  rarityIndexSnapshot?: RarityIndex;
  yourScore?: number;
  rarityRank?: number;
  indexKey?: string;        // stable key (e.g., catalog index or mint)
  metadataUri?: string;     // where to fetch attributes if they weren't passed
};

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
  rarityIndexSnapshot?: RarityIndex;
  yourScore?: number;
  /** Optional callback when modal closes - useful for refreshing supply after minting */
  onModalClose?: () => void;
  /** Optional rarity rank (1-based) when known from sorting */
  rarityRank?: number;
  /** Optional: show multiple newly minted items in one modal */
  items?: MintedItem[];
  /** Optional: start index when items are provided */
  initialIndex?: number;
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
  rarityIndexSnapshot,
  yourScore,
  onModalClose,
  rarityRank: providedRank,
  items,
  initialIndex,
}: Props) {
  const [traitStats, setTraitStats] = useState<TraitStat[]>([]);
  const [yourOverall, setYourOverall] = useState<number | null>(null);
  const [avgOverall, setAvgOverall] = useState<number | null>(null);
  const [maxOverall, setMaxOverall] = useState<number | null>(null);
  const [minOverall, setMinOverall] = useState<number | null>(null);
  const [avgTraitScoreByType, setAvgTraitScoreByType] = useState<Record<string, number>>({});
  const [loadingRarity, setLoadingRarity] = useState<boolean>(false);
  const [rarityErr, setRarityErr] = useState<string | null>(null);

  // ADD caches
  const attrCacheRef = useRef(new Map<string, Attribute[]>());

  // ADD local override attrs so we can compute when the props didn't include attributes
  const [lazyAttrs, setLazyAttrs] = useState<Attribute[] | null>(null);

  // (Optional but robust) Force a fresh render per open
  const [sessionKey, setSessionKey] = useState(0);

  // Image ready state for smooth loading
  const [imgReady, setImgReady] = useState(false);

  // Reduced motion support
  const prefersReduced = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Shared-element return control
  const [useSharedReturn, setUseSharedReturn] = useState(true);

  // ADD state and derived item
  const [index, setIndex] = useState<number>(initialIndex ?? 0);
  const multi = Array.isArray(items) && items.length > 0;
  const active = useMemo(
    () => (multi ? items![Math.max(0, Math.min(index, items!.length - 1))] : null),
    [multi, items, index]
  );

  // Use active item when present, else fall back to single props
  const effName = active?.name ?? name;
  const effImage = active?.image ?? image;
  const effMint = active?.mint ?? mint;
  const effTxSig = active?.txSig ?? txSig;
  const effAttributes = active?.attributes ?? attributes;
  const effRarityIndexSnapshot = active?.rarityIndexSnapshot ?? rarityIndexSnapshot;
  const effYourScore = active?.yourScore ?? yourScore;
  const effRank = (active?.rarityRank ?? providedRank) || undefined;

  // Use the effective snapshot everywhere in the effect
  const effectiveRaritySnapshot = effRarityIndexSnapshot;

  // Helper to resolve a stable key for caching
  const activeKey = useMemo(() => {
    const base = active?.indexKey || active?.mint || active?.metadataUri || effName || "item";
    return `${collectionMint ?? ""}::${String(base)}`;
  }, [active, effName, collectionMint]);

  // Reset nav + lazy state whenever the modal opens with a new dataset or index
  useEffect(() => {
    if (!open) return;

    // start at the requested item
    setIndex(initialIndex ?? 0);

    // clear lazy-loaded attrs and transient UI state
    setLazyAttrs(null);
    setTraitStats([]);
    setYourOverall(null);
    setAvgOverall(null);
    setMinOverall(null);
    setMaxOverall(null);
    setRarityErr(null);
  }, [open, initialIndex, items]);

  // Force fresh render when modal opens with new data
  useEffect(() => {
    if (open) setSessionKey((k) => k + 1);
  }, [open, items, initialIndex]);

  // Determine if we should use shared-element return
  useEffect(() => {
    if (!open) return;
    // resolve the card element by the same key you passed to items[index].indexKey
    const key = active?.indexKey ?? active?.mint ?? activeKey;
    const el = key ? document.getElementById(`mm-card-${key}`) : null;
    setUseSharedReturn(!!el && isInViewport(el));
  }, [open, active?.indexKey, active?.mint, activeKey]);

  // Image ready state for smooth loading
  useEffect(() => {
    let cancelled = false;
    setImgReady(false);
    if (!effImage) return;
    const i = new Image();
    i.src = effImage;
    (i.decode?.() ?? Promise.resolve()).catch(() => {}).finally(() => {
      if (!cancelled) setImgReady(true);
    });
    return () => { cancelled = true; };
  }, [effImage]);

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
        onModalClose?.();
        return;
      }
      // OPTIONAL: prev/next when multiple items are shown
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && Array.isArray(items) && items.length > 1) {
        e.preventDefault();
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
        if (e.key === "ArrowRight") setIndex((i) => Math.min(items!.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onModalClose, items]);

  // Close on clicking outside the panel
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
      onModalClose?.();
    }
  };

  const endpoint = (process.env.NEXT_PUBLIC_RPC_URL || "").toLowerCase();
  const clusterParam = endpoint.includes("devnet") ? "?cluster=devnet" : endpoint.includes("testnet") ? "?cluster=testnet" : "";

  const rarityIndexUrl = useMemo(() => {
    if (rarityIndexUrlOverride) return rarityIndexUrlOverride;
    if (process.env.NEXT_PUBLIC_RARITY_INDEX_URL) return process.env.NEXT_PUBLIC_RARITY_INDEX_URL;
    if (collectionMint) return `/rarity/${collectionMint}.json`;
    return undefined;
  }, [rarityIndexUrlOverride, collectionMint]);

  // Lazy attribute loading effect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open) return;

      const haveAttrsFromProps = Array.isArray(effAttributes) && effAttributes.length > 0;
      if (haveAttrsFromProps) return;

      if (!attrCacheRef.current.has(activeKey)) {
        // try lazy fetch via metadataUri
        if (active?.metadataUri) {
          try {
            const res = await fetch(active.metadataUri, { cache: "no-store" });
            const json = await res.json();
            const got: Attribute[] = Array.isArray(json?.attributes) ? json.attributes : [];
            if (!cancelled) {
              attrCacheRef.current.set(activeKey, got);
              setLazyAttrs(got);
            }
          } catch {/* ignore */}
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeKey, active?.metadataUri, effAttributes]);

  // OPTIONAL: Preload neighbors for snappy prev/next
  useEffect(() => {
    const preload = async (item?: MintedItem) => {
      if (!item?.metadataUri) return;
      const k = item.indexKey || item.mint || item.metadataUri;
      if (!k || attrCacheRef.current.has(k)) return;
      try {
        const r = await fetch(item.metadataUri, { cache: "no-store" });
        const j = await r.json();
        const got: Attribute[] = Array.isArray(j?.attributes) ? j.attributes : [];
        attrCacheRef.current.set(k, got);
      } catch {/* ignore */}
    };
    if (multi) {
      preload(items![index - 1]);
      preload(items![index + 1]);
    }
  }, [multi, items, index]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open) return;

      // gather attrs from props OR lazy OR cache; fetch if needed
      const haveAttrsFromProps = Array.isArray(effAttributes) && effAttributes.length > 0;
      const cached = attrCacheRef.current.get(activeKey);
      const attrsToUse = haveAttrsFromProps ? effAttributes
                         : cached ? cached
                         : lazyAttrs ?? [];

      if (!attrsToUse || attrsToUse.length === 0) {
        setTraitStats([]);
        setYourOverall(null);
        setAvgOverall(null);
        setMaxOverall(null);
        setMinOverall(null);
        setAvgTraitScoreByType({});
        // Don't return if you want to wait for lazy load; the lazy effect will re-run
        return;
      }

      // Use snapshot if provided
      if (effectiveRaritySnapshot) {
        const snap = coerceIndex(effectiveRaritySnapshot);
        const total = Math.max(1, Number(snap?.total || 0));
        const attrs = attrsToUse;

        const stats = attrs.map((a) => {
          const traitType = normType(a?.trait_type);
          const value = normVal(a?.value);
          const count = snap?.traits?.[traitType]?.[value] ?? 0;
          const safe = Math.max(1, count);
          const pct = (safe / total) * 100;
          const score = total / safe;
          return { traitType, value, pct, score, count };
        });

        const yourSum = typeof effYourScore === "number"
          ? effYourScore
          : stats.reduce((s, t) => s + (t.score ?? 0), 0);

        setTraitStats(stats);
        setYourOverall(Number.isFinite(yourSum) ? yourSum : null);
        setAvgOverall(snap?.overall?.avgObserved ?? null);
        setMinOverall(snap?.overall?.minObserved ?? null);
        setMaxOverall(snap?.overall?.maxObserved ?? null);
        setLoadingRarity(false);
        return; // ✅ Use snapshot and skip network work
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
        const stats: TraitStat[] = attrsToUse.map((a) => {
          const traitType = normType(a?.trait_type);
          const value = normVal(a?.value);

          if (!index) return { traitType, value };

          const total = Math.max(1, Number(index.total || 0));
          const count = index.traits?.[traitType]?.[value] ?? 0;
          const safe = Math.max(1, Number(count));
          const pct = (safe / total) * 100;
          const score = total / safe; // same as 100/pct
          return { traitType, value, pct, score, count };
        });

        // your overall (sum of your trait scores where available)
        const yourSum = stats.reduce((s, t) => s + (t.score ?? 0), 0);
        if (!cancelled) setYourOverall(isFinite(yourSum) && yourSum > 0 ? yourSum : null);

        if (index) {
          // prefer observed stats from the file; fallback to theoretical if missing
          const avgObs = index.overall?.avgObserved ?? null;
          const minObs = index.overall?.minObserved ?? null;
          const maxObs = index.overall?.maxObserved ?? null;

          let avgByType = index.traitAvg ?? {};
          if (!avgByType || Object.keys(avgByType).length === 0) {
            // fallback: #distinct values per trait type
            const tmp: Record<string, number> = {};
            for (const tt of Object.keys(index.traits || {})) {
              tmp[tt] = Object.keys(index.traits[tt] || {}).length;
            }
            avgByType = tmp;
          }

          if (!cancelled) {
            setAvgOverall(avgObs ?? null);
            setMinOverall(minObs ?? null);
            setMaxOverall(maxObs ?? null);
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
  }, [open, effAttributes, rarityIndexUrl, effectiveRaritySnapshot, effYourScore, activeKey, lazyAttrs]);

  const nice = (n: number, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

  // Use provided rank from gallery sorting, or don't show rank if not available
  const displayRank = effRank ? effRank.toLocaleString() : null;

  // Context-aware title (fits minting & gallery view)
  const headerTitle =
    title ?? (effTxSig ? "Mint successful — MetaMartian" : "MetaMartian details");

  const indexedTitle = multi ? `${headerTitle} (${index + 1}/${items!.length})` : headerTitle;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mm-overlay"
          ref={backdropRef}
          className="fixed inset-0 z-[70] flex h-[100svh] items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm sm:px-6"
          role="dialog"
          aria-modal="true"
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={prefersReduced ? { duration: 0.1 } : { duration: 0.12 }}
          onClick={onBackdropClick}
        >
          {/* Panel */}
          <motion.div
            key={`mm-panel-${sessionKey}`}
            className="relative w-full max-w-[64rem] overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl dark:bg-zinc-900/95 will-change-transform"
            // stop clicks inside from closing
            onClick={(e) => e.stopPropagation()}
            initial={prefersReduced ? { opacity: 1 } : { y: 8, scale: 0.985, opacity: 0.98 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { y: 6, scale: 0.99, opacity: 0 }}
            transition={prefersReduced ? { duration: 0.1 } : { duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-white/80 px-5 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
          <h3 className="text-base font-semibold">{indexedTitle}</h3>
          <div className="flex items-center gap-2">
            {multi && (
              <div className="mr-2 text-xs opacity-80 tabular-nums">
                {index + 1} / {items!.length}
              </div>
            )}
            {multi && (
              <>
                <button
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="rounded-full border border-black/10 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40 dark:border-white/10"
                >
                  Prev
                </button>
                <button
                  onClick={() => setIndex((i) => Math.min(items!.length - 1, i + 1))}
                  disabled={index >= items!.length - 1}
                  className="rounded-full border border-black/10 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40 dark:border-white/10"
                >
                  Next
                </button>
              </>
            )}
            <button
              onClick={() => {
                onClose();
                onModalClose?.();
              }}
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
                {effImage ? (
                  <>
                    <motion.img
                      layoutId={useSharedReturn && !prefersReduced ? `mm-img-${active?.indexKey ?? active?.mint ?? activeKey}` : undefined}
                      src={effImage}
                      alt={effName}
                      className="block h-full w-full object-contain will-change-transform"
                      draggable={false}
                      style={{ imageRendering: "pixelated" }} // keeps 8-bit art crisp
                      initial={false}   // prevents flash on index change
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

              <div className="mt-3 text-center">
                <div className="text-lg font-medium">{effName}</div>
                {displayRank && (
                  <div className="mt-1 text-sm font-semibold text-purple-600 dark:text-purple-400">
                    #{displayRank} rarest
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs opacity-80">
                  {effMint && (
                    <a
                      href={`https://explorer.solana.com/address/${effMint}${clusterParam}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Mint address
                    </a>
                  )}
                  {effTxSig && (
                    <>
                      <span>•</span>
                      <a
                        href={`https://explorer.solana.com/tx/${effTxSig}${clusterParam}`}
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
                     {yourOverall != null ? nice(yourOverall, 0) : "—"}
                   </div>
                   <div className="text-[11px] opacity-60">
                     Sum of your trait scores. Higher is rarer.
                   </div>
                 </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Average Overall</div>
                  <div className="text-lg font-semibold">
                    {avgOverall != null ? nice(avgOverall, 0) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    Collection average overall score (observed).
                  </div>
                </div>
                <div className="rounded-xl border p-3 dark:border-white/10">
                  <div className="text-xs opacity-70">Highest / Lowest (observed)</div>
                  <div className="text-lg font-semibold">
                    {maxOverall != null ? nice(maxOverall, 0) : "—"} /{" "}
                    {minOverall != null ? nice(minOverall, 0) : "—"}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
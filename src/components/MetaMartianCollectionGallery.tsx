"use client";

import { useEffect, useMemo, useState } from "react";
import useMetaMartianReveal from "@/hooks/useMetaMartianReveal";

type CatalogItem = {
  index: string;
  name: string;
  image: string | null;
  metadata: string; // metadata URI
  minted?: boolean; // <- new
};
type Catalog = {
  collectionMint: string;
  total: number;
  items: CatalogItem[];
};

export default function MetaMartianCollectionGallery({
  pageSize = 24,
  collectionMint,
  catalogUrlOverride,
}: {
  pageSize?: number;
  collectionMint?: string;
  catalogUrlOverride?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [page, setPage] = useState(0);

  const { Modal, openWithData } = useMetaMartianReveal();

  // Build URL to catalog file
  const catalogUrl = useMemo(() => {
    if (catalogUrlOverride) return catalogUrlOverride;
    if (!collectionMint && !process.env.NEXT_PUBLIC_COLLECTION_MINT) return null;
    const cm = collectionMint || process.env.NEXT_PUBLIC_COLLECTION_MINT!;
    return `/collection/${cm}-catalog.json`;
  }, [collectionMint, catalogUrlOverride]);

  // Load catalog JSON
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!catalogUrl) return;
      setLoading(true);
      try {
        const res = await fetch(catalogUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Catalog;
        if (!cancelled) {
          setCatalog(json);
          setPage(0);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("Failed to load catalog:", e?.message || e);
          setCatalog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [catalogUrl]);

  const total = catalog?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = catalog?.items.slice(page * pageSize, (page + 1) * pageSize) ?? [];

  // Click handler: open modal even if not minted (use metadata JSON)
  const onCardClick = async (it: CatalogItem) => {
    // Open via metadata JSON (works for minted & unminted)
    try {
      const res = await fetch(it.metadata);
      const json = await res.json();
      openWithData({
        name: json?.name ?? it.name ?? "MetaMartian",
        image: json?.image ?? it.image ?? undefined,
        attributes: Array.isArray(json?.attributes) ? json.attributes : undefined,
        txSig: null,
        mint: undefined,
        collectionMint: catalog?.collectionMint,
      });
    } catch (e) {
      console.error("Failed to open metadata:", e);
    }
  };

  return (
    <div className="w-full">
      {Modal}

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">
          Entire Collection{" "}
          {catalog?.collectionMint
            ? `· ${catalog.collectionMint.slice(0, 4)}…${catalog.collectionMint.slice(-4)}`
            : ""}
        </h3>
        <div className="text-xs opacity-70">
          {loading ? "Loading…" : `${total.toLocaleString()} items`}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {loading &&
          Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          ))}

        {!loading &&
          pageItems.map((it) => (
            <button
              key={it.index}
              onClick={() => onCardClick(it)}
              className="group relative overflow-hidden rounded-xl border text-left transition hover:shadow-md dark:border-neutral-800"
              title="View details"
            >
              {/* Minted badge */}
              <div className="pointer-events-none absolute left-2 top-2 z-10">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    it.minted ? "bg-emerald-500/90 text-white" : "bg-neutral-300/90 text-neutral-900 dark:bg-neutral-700/90 dark:text-white"
                  }`}
                >
                  {it.minted ? "Minted" : "Not minted"}
                </span>
              </div>

              <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image}
                    alt={it.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    draggable={false}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs opacity-60">
                    No image
                  </div>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-sm font-medium">{it.name}</div>
                <div className="truncate text-[10px] opacity-60">#{it.index}</div>
              </div>
            </button>
          ))}
      </div>

      {/* Pagination */}
      {!loading && pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <div className="text-xs opacity-70">
            Page {page + 1} / {pageCount}
          </div>
          <button
            className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50 dark:border-neutral-700"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

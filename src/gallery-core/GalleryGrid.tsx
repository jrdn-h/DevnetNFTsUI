import React from "react";
import { FoundBeacon } from "./FoundBeacon";
import type { CoreItem } from "./types";

export function GalleryGrid(props: {
  items: CoreItem[];
  flashKey: string | null;
  stickyKey: string | null;
  onCardClick: (item: CoreItem) => void;
  showMintedBadge?: boolean;
  mintedLookup?: (key: string) => boolean;
  onCardHover?: (item: CoreItem) => void;
}) {
  const { items, flashKey, stickyKey, onCardClick, showMintedBadge = false, mintedLookup, onCardHover } = props;

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
      style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
    >
      {items.map((it) => {
        const isHighlighted = flashKey === it.indexKey || stickyKey === it.indexKey;
        const isMinted = showMintedBadge && mintedLookup ? mintedLookup(it.indexKey) : false;

        return (
          <button
            key={it.indexKey}
            id={`mm-card-${it.indexKey}`}
            onMouseEnter={() => {
              // clear sticky highlight on hover of that card
              if (stickyKey === it.indexKey && onCardHover) {
                onCardHover(it);
              }
            }}
            onPointerEnter={() => {
              // Preload image on hover
              if (it.image) {
                const img = new Image();
                img.src = it.image;
              }
            }}
            onPointerDown={() => {
              // Preload image on touch/press
              if (it.image) {
                const img = new Image();
                img.src = it.image;
              }
            }}
            onClick={() => onCardClick(it)}
            className={`group relative overflow-hidden rounded-xl border text-left transition
              dark:border-neutral-800 hover:shadow-md
              ${isHighlighted ? "scale-[1.015]" : ""}
              ${!isHighlighted && stickyKey === it.indexKey ? "ring-2 ring-emerald-400/70 shadow-[0_0_0_2px_rgba(16,185,129,.25)]" : ""}`}
            title="View details"
          >
            {isHighlighted && <FoundBeacon />}

            {showMintedBadge && (
              <div className="pointer-events-none absolute left-2 top-2 z-10 flex gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    isMinted
                      ? "bg-emerald-500/90 text-white"
                      : "bg-neutral-300/90 text-neutral-900 dark:bg-neutral-700/90 dark:text-white"
                  }`}
                >
                  {isMinted ? "Minted" : "Not minted"}
                </span>
              </div>
            )}

            <div className="aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900">
              {it.image ? (
                <img
                  src={it.image}
                  alt={it.name}
                  className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03] will-change-transform"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              ) : (
                <div className="h-full w-full grid place-items-center text-xs opacity-60">
                  No image
                </div>
              )}
            </div>

            <div className="p-2">
              <div className="truncate text-sm font-medium">{it.name}</div>
              <div className="text-[10px] opacity-60 whitespace-nowrap">
                Score: {Number.isFinite(it.score) ? Math.round(it.score!).toLocaleString() : "—"} · #{Number.isFinite(it.rank) ? it.rank : "—"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

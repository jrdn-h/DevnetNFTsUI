"use client";
import { useState, useCallback } from "react";
import MetaMartianRevealModal from "@/components/MetaMartianRevealModal";
import type { RevealItem, RaritySnapshot } from "@/types/reveal";

type Ctx = {
  title?: string;
  collectionMint?: string;
  snapshot?: RaritySnapshot;
  initialIndex?: number;
  onClose?: () => void;
};

export default function useMetaMartianReveal() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RevealItem[]>([]);
  const [ctx, setCtx] = useState<Ctx>({});

  const openWithData = useCallback((opts: {
    items: RevealItem[];
    initialIndex?: number;
    title?: string;
    collectionMint?: string;
    rarityIndexSnapshot?: RaritySnapshot;
    onModalClose?: () => void;
  }) => {
    setItems(opts.items);
    setCtx({
      initialIndex: opts.initialIndex ?? 0,
      title: opts.title,
      collectionMint: opts.collectionMint,
      snapshot: opts.rarityIndexSnapshot,
      onClose: opts.onModalClose,
    });
    setOpen(true);
  }, []);

  const Modal = (
    <MetaMartianRevealModal
      open={open}
      onClose={() => { setOpen(false); ctx.onClose?.(); }}
      title={ctx.title}
      items={items}
      initialIndex={ctx.initialIndex ?? 0}
      collectionMint={ctx.collectionMint}
      rarityIndexSnapshot={ctx.snapshot}
    />
  );

  return { Modal, openWithData };
}
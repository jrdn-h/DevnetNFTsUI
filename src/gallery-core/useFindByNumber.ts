import { useCallback, useMemo, useRef, useState } from "react";
import type { CoreItem } from "./types";

export function useFindByNumber(filteredSorted: CoreItem[], pageBump = 60) {
  const [searchNum, setSearchNum] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [sticky, setSticky] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const posByIndex = useMemo(() => {
    const m = new Map<string, number>();
    filteredSorted.forEach((x, i) => m.set(x.indexKey, i));
    return m;
  }, [filteredSorted]);

  const onSearch = useCallback((openAt: (i: number, item: CoreItem) => void, grow: (min: number) => void) => {
    const nHuman = Number(searchNum.trim());
    if (!Number.isFinite(nHuman)) return;
    const nZero = Math.max(0, nHuman - 1);
    const i = posByIndex.get(String(nZero));
    if (i == null) return;

    const item = filteredSorted[i];
    grow(i + Math.max(24, pageBump));

    if (item?.image) { const img = new Image(); img.src = item.image; }
    setFlash(item.indexKey);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFlash(null), 1600);

    openAt(i, item);
    requestAnimationFrame(() => {
      const el = document.getElementById(`mm-card-${item.indexKey}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchNum, posByIndex, filteredSorted, pageBump]);

  return { searchNum, setSearchNum, flash, setFlash, sticky, setSticky, posByIndex, onSearch };
}

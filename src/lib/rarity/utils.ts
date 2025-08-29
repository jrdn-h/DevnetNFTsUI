import type { RaritySnapshot } from "@/types/reveal";

export const normType = (x: any) => {
  const s = (x ?? "—").toString().trim();
  return s.length ? s : "—";
};
export const normVal = (v: any) =>
  v === null || v === undefined || v === ""
    ? "None"
    : typeof v === "object"
    ? JSON.stringify(v)
    : String(v);

/** Sum of (total / count) across trait types in snapshot. */
export function scoreFromAttrs(attrs: any[] = [], snap?: RaritySnapshot | null) {
  if (!snap) return NaN;
  const total = Math.max(1, Number(snap.total || 0));
  const traits = snap.traits || {};
  let sum = 0;
  for (const tt of Object.keys(traits)) {
    const a = attrs.find((t: any) => normType(t?.trait_type) === tt);
    const val = a ? normVal(a.value) : "None";
    const count = traits[tt]?.[val] ?? 0;
    sum += total / Math.max(1, count);
  }
  return sum;
}

/** Per-trait % / score / count from snapshot. */
export function traitStatsFrom(attrs: any[] = [], snap?: RaritySnapshot | null) {
  if (!snap) return [];
  const total = Math.max(1, Number(snap.total || 0));
  return attrs.map((a: any) => {
    const traitType = normType(a?.trait_type);
    const value = normVal(a?.value);
    const count = snap.traits?.[traitType]?.[value] ?? 0;
    const safe = Math.max(1, count);
    return {
      traitType,
      value,
      count,
      pct: (safe / total) * 100,
      score: total / safe,
    };
  });
}

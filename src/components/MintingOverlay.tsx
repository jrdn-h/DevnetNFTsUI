"use client";

import { Fragment } from "react";

type Props = {
  open: boolean;
  stepIndex: number;       // 0-based index into steps
  steps: string[];
  title?: string;
  subtitle?: string;
  /** Shows an extra line under the progress bar, e.g., "Mint 2 of 3" */
  note?: string;
  /** Optional: show a GIF instead of the spinner */
  gifSrc?: string;
};

export default function MintingOverlay({
  open,
  stepIndex,
  steps,
  title = "Minting your MetaMartian…",
  subtitle = "Please approve in your wallet and keep this tab open.",
  note,
  gifSrc,
}: Props) {
  if (!open) return null;

  const total = Math.max(steps.length, 1);
  const safeIndex = Math.min(Math.max(stepIndex, 0), total - 1);
  const pct = ((safeIndex + 1) / total) * 100;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-[min(92vw,28rem)] rounded-2xl border border-white/10 bg-white/90 p-5 shadow-2xl dark:bg-zinc-900/90">
        {/* Top: gif/spinner + title */}
        <div className="flex items-center gap-4">
          {/* GIF (preferred) or fallback spinner */}
          {gifSrc ? (
            <img
              src={gifSrc}
              alt="Minting in progress"
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10"
            />
          ) : (
            <div className="relative h-12 w-12">
              {/* track */}
              <div className="absolute inset-0 rounded-full border-2 border-black/10 dark:border-white/10" />
              {/* arc */}
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-black/70 dark:border-t-white/80 animate-spin"
                style={{ animationDuration: "900ms" }}
              />
              {/* inner pulse */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-black/5 to-black/0 dark:from-white/10 dark:to-white/0 animate-pulse" />
            </div>
          )}

          <div className="flex-1">
            <h3 className="text-base font-semibold leading-tight">{title}</h3>
            <p className="text-xs opacity-70">{subtitle}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full bg-black/70 dark:bg-white/80 transition-all"
            style={{ width: `${pct.toFixed(1)}%` }}
          />
        </div>

        {/* Optional batch note */}
        {note && <div className="mt-2 text-xs opacity-80">{note}</div>}

        {/* Stepper */}
        <ol className="mt-3 space-y-2 text-sm">
          {steps.map((s, i) => {
            const active = i === safeIndex;
            const done = i < safeIndex;
            return (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={[
                    "mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    done
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : active
                      ? "border-black/60 text-black/80 dark:border-white/60 dark:text-white/80"
                      : "border-black/20 text-black/40 dark:border-white/20 dark:text-white/40",
                  ].join(" ")}
                  aria-hidden
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={[active ? "font-medium" : done ? "opacity-80" : "opacity-60"].join(" ")}>
                  {s}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Dots animation */}
        <div className="mt-4 flex items-center gap-1.5">
          {[0, 1, 2].map((d) => (
            <Fragment key={d}>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-black/70 dark:bg-white/80 animate-bounce"
                style={{ animationDelay: `${d * 120}ms` }}
              />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

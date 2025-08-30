import React from "react";

export function FoundBeacon() {
  return (
    <>
      {/* soft spinning gradient halo */}
      <span
        className="pointer-events-none absolute -inset-[3px] rounded-2xl
                   bg-[conic-gradient(at_50%_50%,#22c55e_0deg,#06b6d4_120deg,#a78bfa_240deg,#22c55e_360deg)]
                   animate-[spin_2.8s_linear_infinite] opacity-55 blur-md"
      />
      {/* bright ring + glow */}
      <span
        className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-emerald-400/80
                   shadow-[0_0_0_3px_rgba(16,185,129,.50),0_0_40px_12px_rgba(16,185,129,.35)]"
      />
      {/* ripple ping */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2
                   rounded-full border-2 border-emerald-400/50 animate-ping"
      />
    </>
  );
}

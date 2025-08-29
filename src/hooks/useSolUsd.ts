"use client";
import { useEffect, useState } from "react";

/** Polls SOL/USD using Jupiter (fallback: CoinGecko). */
export default function useSolUsd(pollMs = 60_000) {
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    async function pull() {
      let price: number | null = null;
      try {
        const r = await fetch("https://price.jup.ag/v6/price?ids=SOL", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          price = Number(j?.data?.SOL?.price ?? null);
        }
      } catch {}

      if (price == null) {
        try {
          const r2 = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
            { cache: "no-store" }
          );
          if (r2.ok) {
            const j2 = await r2.json();
            price = Number(j2?.solana?.usd ?? null);
          }
        } catch {}
      }

      if (live && Number.isFinite(price as number)) setUsd(price!);
    }

    pull();
    const id = setInterval(pull, pollMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return usd;
}

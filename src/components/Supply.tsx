"use client";

import { useEffect, useState } from "react";
import useUmiStore from "@/store/useUmiStore";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchCandyMachine } from "@metaplex-foundation/mpl-candy-machine";

const CM_ID = process.env.NEXT_PUBLIC_CANDY_MACHINE_ID!;

export default function Supply({ refreshTrigger }: { refreshTrigger?: number }) {
  // Use the read-only Umi from the store so this works while logged out
  const umi = useUmiStore((s) => s.umi);

  const [line, setLine] = useState<{
    available: number;
    redeemed: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    
    const fetchWithRetry = async (retries = 5, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        if (cancelled) return;
        
        try {
          const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
          // itemsAvailable/itemsLoaded and itemsRedeemed are bigints → coerce to number for display
          const available = Number(
            cm.data.itemsAvailable ?? BigInt(0)
          );
          const redeemed = Number(cm.itemsRedeemed ?? BigInt(0));
          if (!cancelled) setLine({ available, redeemed });
          return; // Success, exit retry loop
        } catch (e) {
          if (i === retries - 1) {
            // Last attempt failed
            if (!cancelled) setLine({ available: 0, redeemed: 0 });
          } else {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    };

    fetchWithRetry();
    
    return () => {
      cancelled = true;
    };
  }, [umi, refreshTrigger]);

  if (!line) return null;

  const remaining = Math.max(0, line.available - line.redeemed);

  return (
    <p className="text-sm">
      {remaining} / {line.available} remaining
    </p>
  );
}

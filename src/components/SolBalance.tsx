"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getCachedBalance, subscribeToBalance } from "@/lib/balanceCache";

export default function SolBalance() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const pill =
    "inline-flex items-center gap-2 h-9 px-3 rounded-xl " +
    "border border-white/20 bg-white/10 backdrop-blur-xl text-sm " +
    "dark:border-white/10 dark:bg-white/5";
  const errPill =
    "inline-flex items-center gap-2 h-9 px-3 rounded-xl " +
    "border border-red-300/60 bg-red-100/60 text-red-800 " +
    "dark:border-red-800 dark:bg-red-900/30 dark:text-red-300";

  useEffect(() => {
    if (!connected || !publicKey || !connection) {
      setBalance(null);
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToBalance(publicKey, (newBalance, isLoading) => {
      setBalance(newBalance);
      setLoading(isLoading);
    });
    getCachedBalance(connection, publicKey).catch(() => {});
    return unsubscribe;
  }, [connection, publicKey, connected]);

  if (!connected || !publicKey) return null;

  if (!connection) {
    return (
      <div className={errPill} role="status" aria-live="polite">
        <span className="text-xs">Connection Error</span>
      </div>
    );
  }

  if (loading && balance === null) {
    return (
      <div className={pill} role="status" aria-live="polite">
        <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
        <span className="opacity-80">Loading…</span>
      </div>
    );
  }

  return (
    <div className={pill} title="Wallet SOL balance">
      <svg className="w-4 h-4 text-purple-500" viewBox="0 0 397.7 311.7" fill="currentColor" aria-hidden>
        <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
        <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
        <path d="M333.1,120.1c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H275c-5.8,0-8.7-7-4.6-11.1L333.1,120.1z"/>
      </svg>
      <span className="font-semibold">
        {balance !== null ? `${balance.toFixed(3)} SOL` : "-- SOL"}
      </span>
    </div>
  );
}

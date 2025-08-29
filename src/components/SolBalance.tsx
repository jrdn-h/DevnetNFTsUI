"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function SolBalance() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey || !connection) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      setLoading(true);
      try {
        // Double-check connection exists before calling getBalance
        if (!connection || !connection.getBalance) {
          throw new Error("Connection not available");
        }
        
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        setBalance(solBalance);
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    // Set up interval to refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);

    return () => clearInterval(interval);
  }, [connection, publicKey, connected]);

  if (!connected || !publicKey) {
    return null;
  }

  // If connection is not available, show error state
  if (!connection) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <span className="text-red-600 dark:text-red-400 text-xs">Connection Error</span>
      </div>
    );
  }

  if (loading && balance === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-zinc-800">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-gray-600 dark:text-gray-300">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
      <svg 
        className="w-4 h-4 text-purple-600 dark:text-purple-400" 
        viewBox="0 0 397.7 311.7"
        fill="currentColor"
      >
        <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
        <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
        <path d="M333.1,120.1c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H275c-5.8,0-8.7-7-4.6-11.1L333.1,120.1z"/>
      </svg>
      <span className="font-medium text-gray-900 dark:text-white">
        {balance !== null ? `${balance.toFixed(3)} SOL` : "-- SOL"}
      </span>
    </div>
  );
}

// Global balance cache to prevent multiple components from making duplicate getBalance calls
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

type BalanceCache = {
  balance: number;
  timestamp: number;
  loading: boolean;
};

const cache = new Map<string, BalanceCache>();
const CACHE_DURATION = 30000; // 30 seconds
const subscribers = new Map<string, Set<(balance: number | null, loading: boolean) => void>>();

// Debounced fetch to prevent multiple simultaneous calls for the same wallet
const pendingFetches = new Map<string, Promise<number>>();

export async function getCachedBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<number> {
  const key = publicKey.toString();
  const now = Date.now();
  const cached = cache.get(key);

  // Return cached value if still fresh
  if (cached && (now - cached.timestamp) < CACHE_DURATION && !cached.loading) {
    return cached.balance;
  }

  // If there's already a pending fetch for this wallet, wait for it
  const pendingFetch = pendingFetches.get(key);
  if (pendingFetch) {
    return pendingFetch;
  }

  // Set loading state and notify subscribers
  cache.set(key, { balance: cached?.balance || 0, timestamp: now, loading: true });
  notifySubscribers(key, cached?.balance || null, true);

  // Create new fetch promise
  const fetchPromise = (async () => {
    try {
      const lamports = await connection.getBalance(publicKey);
      const balance = lamports / LAMPORTS_PER_SOL;
      
      // Update cache
      cache.set(key, { balance, timestamp: Date.now(), loading: false });
      
      // Notify all subscribers
      notifySubscribers(key, balance, false);
      
      return balance;
    } catch (error) {
      console.error("Error fetching balance:", error);
      
      // Keep old balance if available, but mark as not loading
      const oldCached = cache.get(key);
      if (oldCached) {
        cache.set(key, { ...oldCached, loading: false });
        notifySubscribers(key, oldCached.balance, false);
        return oldCached.balance;
      }
      
      // No cached value, notify subscribers of error
      cache.delete(key);
      notifySubscribers(key, null, false);
      throw error;
    } finally {
      // Remove from pending fetches
      pendingFetches.delete(key);
    }
  })();

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

export function subscribeToBalance(
  publicKey: PublicKey,
  callback: (balance: number | null, loading: boolean) => void
): () => void {
  const key = publicKey.toString();
  
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  
  subscribers.get(key)!.add(callback);
  
  // Immediately call with cached value if available
  const cached = cache.get(key);
  if (cached) {
    callback(cached.balance, cached.loading);
  }
  
  // Return unsubscribe function
  return () => {
    const subs = subscribers.get(key);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        subscribers.delete(key);
        cache.delete(key); // Clean up cache when no subscribers
      }
    }
  };
}

function notifySubscribers(key: string, balance: number | null, loading: boolean) {
  const subs = subscribers.get(key);
  if (subs) {
    subs.forEach(callback => callback(balance, loading));
  }
}

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(cache.entries());
  for (const [key, cached] of entries) {
    if ((now - cached.timestamp) > CACHE_DURATION * 2 && !subscribers.has(key)) {
      cache.delete(key);
    }
  }
}, CACHE_DURATION);

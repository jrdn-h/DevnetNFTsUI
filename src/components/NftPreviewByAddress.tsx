"use client";

import { useEffect, useState } from "react";
import useUmiStore from "@/store/useUmiStore";
import { publicKey } from "@metaplex-foundation/umi";
import {
  fetchMetadata,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";

type Meta = { name?: string; image?: string; symbol?: string; uri?: string };

export default function NftPreviewByAddress({ address }: { address: string }) {
  const umi = useUmiStore((s) => s.umi);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<string>("Loading NFT…");

  useEffect(() => {
    let cancelled = false;
    
    // Reset state when address changes
    setMeta(null);
    setErr(null);
    setLoading("Loading NFT…");
    
    const waitForMetadata = async (tries = 12, delayMs = 1000) => {
      const mintPk = publicKey(address);
      const mdPda = findMetadataPda(umi, { mint: mintPk });

      for (let i = 0; i < tries; i++) {
        if (cancelled) return;
        
        if (!cancelled && i > 0) {
          setLoading(`Loading NFT… (${i + 1}/${tries})`);
        }
        
        try {
          // Check if account exists first
          const acc = await umi.rpc.getAccount(mdPda[0]).catch(() => null);
          if (acc && acc.exists) {
            const onchain = await fetchMetadata(umi, mdPda);
            
            // Fetch JSON metadata
            const res = await fetch(onchain.uri);
            const json = await res.json();

            if (!cancelled) {
              setMeta({
                name: json?.name,
                image: json?.image,
                symbol: json?.symbol,
                uri: onchain.uri,
              });
              setErr(null);
            }
            return; // Success
          }
        } catch (e: any) {
          // If this is the last attempt, show error
          if (i === tries - 1) {
            if (!cancelled) {
              setErr(
                (e?.message ?? String(e)) +
                  `\nTip: pass the NFT **mint address** (not your wallet or token account).` +
                  `\nMetadata PDA not found after ${tries} attempts.`
              );
              setMeta(null);
            }
            return;
          }
        }
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      // If we get here, we exhausted all tries without finding the account
      if (!cancelled) {
        setErr(`Metadata PDA not found after ${tries} attempts. The NFT might not be fully confirmed yet.`);
        setMeta(null);
      }
    };

    waitForMetadata();
    
    return () => {
      cancelled = true;
    };
  }, [address, umi]);

  if (err) {
    return (
      <pre className="text-xs text-red-600 whitespace-pre-wrap">{err}</pre>
    );
  }
  if (!meta) return <p className="text-xs opacity-70">{loading}</p>;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border dark:border-neutral-800">
      {meta.image && (
        <img
          src={meta.image}
          alt={meta.name ?? "NFT"}
          className="h-16 w-16 rounded-lg object-cover"
        />
      )}
      <div className="text-sm">
        <div className="font-medium">{meta.name ?? "Unnamed"}</div>
        {meta.symbol && <div className="text-xs opacity-70">{meta.symbol}</div>}
        <a
          href={meta.uri}
          target="_blank"
          rel="noreferrer"
          className="underline text-xs"
        >
          Open metadata JSON
        </a>
      </div>
    </div>
  );
}


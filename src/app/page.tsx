"use client";

import { useState } from "react";
import MetaplexLogo from "@/assets/logos/metaplex-logo.png";
import Header from "@/components/header";
import MintButton from "@/components/MintButton";
import Supply from "@/components/Supply";
import NftPreviewByAddress from "@/components/NftPreviewByAddress";
import MetaMartianGallery from "@/components/MetaMartianGallery";

export default function Home() {
  const [lastMintedNft, setLastMintedNft] = useState<string | null>(null);
  const [supplyRefresh, setSupplyRefresh] = useState<number>(0);
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <Header />

      <div className="flex flex-col items-center gap-4">
        <Supply refreshTrigger={supplyRefresh} />
        <MintButton onMintSuccess={(mintAddress) => {
          setLastMintedNft(mintAddress);
          setSupplyRefresh(prev => prev + 1);
        }} />
        {lastMintedNft && (
          <div className="mt-4 p-4 border rounded-lg dark:border-neutral-800">
            <h3 className="text-sm font-medium mb-2 text-center">Your MetaMartian!</h3>
            <NftPreviewByAddress address={lastMintedNft} />
          </div>
        )}
        
        {/* MetaMartian Gallery */}
        <div className="mt-8 w-full max-w-4xl">
          <MetaMartianGallery pageSize={12} />
        </div>
      </div>

      <div className="relative z-[-1] flex place-items-center ">
        <img
          className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70] dark:invert"
          src={MetaplexLogo.src}
          alt="<Metaplex Logo"
          width={500}
        />
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:w-full lg:max-w-5xl lg:grid-cols-4 lg:text-left">
        <a
          href="https://developers.metaplex.com"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Docs{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Learn about Solana and the Metaplex programs from the developer hub.
          </p>
        </a>

        <a
          href="https://github.com/metaplex-foundation"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Github{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            The Metaplex Foundation&apos;s Github projects.
          </p>
        </a>

        <a
          href="https://discord.com/invite/metaplex"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Discord{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Come chat and find support in the Metaplex Discord server.
          </p>
        </a>

        <a
          href="https://x.com/metaplex"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Twitter{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-balance text-sm opacity-50">
            The Metaplex Twitter/X account for news and updates.
          </p>
        </a>
      </div>
    </main>
  );
}

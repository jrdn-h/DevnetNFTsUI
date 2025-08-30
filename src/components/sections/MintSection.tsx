import Image from "next/image";
import MintButton from "@/components/MintButton";
import Supply from "@/components/Supply";
import { useMemo, useState } from "react";

type MintPhase = "live" | "upcoming" | "paused" | "soldout" | "ended";

interface MintSectionProps {
  title?: string;
  description?: string;
  /** Optional SSR fallback until button fetches the real price */
  priceSol?: number;
  /** Optional precomputed USD price per SOL */
  solUsd?: number;
  /** Optional known status/phase */
  phase?: MintPhase;
  /** ISO timestamp for start if upcoming (enables countdown) */
  startsAtIso?: string;
  mintImage?: string;
  mintGif?: string;
  features?: string[];
}

export default function MintSection({
  title = "Mint Your MetaMartian",
  description = "Join the cosmic adventure by minting your unique MetaMartian. Each one is procedurally generated with rare traits and comes with its own story from across the universe.",
  priceSol = 0.1,
  solUsd,
  phase = "live",
  startsAtIso,
  mintImage,
  mintGif,
  features = [
    "Unique procedurally generated traits",
    "Rich backstory and lore",
    "High-quality artwork",
    "Community membership",
    "Future utility and rewards",
  ],
}: MintSectionProps) {
  const [supplyRefreshTrigger, setSupplyRefreshTrigger] = useState(0);
  const [priceSolLive, setPriceSolLive] = useState<number | undefined>(undefined);

  const handleMintSuccess = () => {
    // Increment the refresh trigger to update supply after successful mint
    setSupplyRefreshTrigger(prev => prev + 1);
  };

  // Prefer live price from button; fall back to prop
  const effectivePriceSol = priceSolLive ?? priceSol;
  const priceUsd = useMemo(
    () => (solUsd ? (effectivePriceSol * solUsd).toFixed(2) : undefined),
    [effectivePriceSol, solUsd]
  );

  // Formatting helpers
  const formatSol = (n: number, maxDp = 4) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: maxDp });
  const priceSolFmt = useMemo(() => formatSol(effectivePriceSol, 3), [effectivePriceSol]);

  // Phase chips
  const phaseChip = {
    live: { text: "MINTING NOW LIVE", className: "from-violet-500 to-fuchsia-500" },
    upcoming: { text: "MINT STARTS SOON", className: "from-amber-500 to-pink-500" },
    paused: { text: "MINT PAUSED", className: "from-zinc-500 to-zinc-700" },
    soldout: { text: "SOLD OUT", className: "from-emerald-500 to-teal-500" },
    ended: { text: "MINT ENDED", className: "from-zinc-500 to-zinc-700" },
  }[phase];

  // Button state
  const isDisabled =
    phase === "paused" || phase === "soldout" || phase === "ended" || phase === "upcoming";

  return (
    <section
      id="mint"
      className="scroll-mt-24 py-20 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-black"
      aria-labelledby="mint-title"
    >
      <div className="mx-auto max-w-7xl px-4">
        {/* Header */}
        <header className="text-center mb-12">
          <span
            className={`inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r ${phaseChip.className} text-white text-sm font-medium shadow-lg mb-6 font-tech`}
            role="status"
          >
            <span className="mr-2">{phase === "live" ? "🔑" : phase === "upcoming" ? "⏳" : "ℹ️"}</span>
            {phaseChip.text}
          </span>

          <h2 id="mint-title" className="text-4xl md:text-5xl font-bold font-pixel mb-4">
            {title}
          </h2>

          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto font-cosmic">
            {description}
          </p>
        </header>

        {/* Main */}
        <div className="grid gap-10 lg:grid-cols-[480px_auto] xl:grid-cols-[520px_auto]">
          {/* Preview (sticky on desktop) */}
          <aside className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-200 dark:border-zinc-800 p-6 shadow-lg lg:sticky lg:top-28">
            <h3 className="text-xl font-semibold font-retro mb-3 text-center">Preview</h3>

            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-zinc-800">
              {mintGif ? (
                // GIF fallback uses <img> to preserve animation
                <img src={mintGif} alt="MetaMartian preview" className="w-full h-auto object-cover" />
              ) : mintImage ? (
                <Image
                  src={mintImage}
                  alt="MetaMartian preview"
                  width={800}
                  height={800}
                  className="w-full h-auto object-cover"
                  priority
                />
              ) : (
                <div className="aspect-square bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="text-6xl mb-2">🛸</div>
                    <div className="font-pixel text-sm">Your MetaMartian</div>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary info under preview */}
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-xl border dark:border-neutral-800 p-3">
                <dt className="opacity-60">Price</dt>
                <dd className="font-tech">
                  {priceSolLive == null ? "—" : `${priceSolFmt} SOL`}
                  {priceUsd ? ` · ~$${priceUsd}` : ""}
                </dd>
              </div>
              {/* REMOVE the Est. Fee block entirely */}
            </dl>
          </aside>

          {/* Mint panel */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-200 dark:border-zinc-800 p-8 shadow-lg max-w-xl mx-auto lg:self-center lg:mt-6 overflow-hidden">
            <div className="flex flex-col gap-6 justify-center min-h-[400px]">
              {/* Compact stats ribbon */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border dark:border-neutral-800 p-4">
                  <div className="text-xs opacity-60">Status</div>
                  <div className="font-medium">
                    {phase === "upcoming" && startsAtIso ? (
                      <span className="font-tech">
                        Starts {new Date(startsAtIso).toLocaleString()}
                      </span>
                    ) : (
                      phase.toUpperCase()
                    )}
                  </div>
                </div>

                <div className="rounded-xl border dark:border-neutral-800 p-4">
                  <div className="text-xs opacity-60">Price</div>
                  <div className="font-tech font-semibold">
                    {priceSolLive == null ? "—" : `${priceSolFmt} SOL`}
                    {priceUsd ? <span className="opacity-70"> · ~${priceUsd}</span> : null}
                  </div>
                </div>

                <div className="rounded-xl border dark:border-neutral-800 p-4">
                  <div className="text-xs opacity-60">Supply</div>
                  <div className="flex items-center gap-2">
                    <Supply refreshTrigger={supplyRefreshTrigger} />
                  </div>
                </div>
              </div>



              {/* CTA */}
              <div className="flex flex-col items-center gap-3">
                <div className={isDisabled ? "opacity-50 pointer-events-none" : ""}>
                  <MintButton
                    variant="glow"
                    fullWidth
                    overlayGifSrc="/minting.gif"
                    onPriceChange={setPriceSolLive}
                    onMintSuccess={handleMintSuccess}
                    onModalClose={handleMintSuccess}
                  />
                </div>
              </div>

              {/* Safety + links */}
              <div className="flex flex-wrap items-center gap-3 text-xs opacity-70">
                <span className="rounded-full border px-2 py-1 dark:border-neutral-800">
                  Verified collection
                </span>
                <a
                  href={`https://explorer.solana.com/address/${process.env.NEXT_PUBLIC_CANDY_MACHINE_ID || ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:opacity-100"
                >
                  View on Explorer
                </a>
                <a
                  href="/collection"
                  className="underline hover:opacity-100"
                >
                  Browse full collection
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits grid */}
        {features?.length ? (
          <div className="mt-10 rounded-3xl border border-gray-200 dark:border-zinc-800 p-6 bg-white dark:bg-zinc-900 shadow-lg">
            <h3 className="text-lg font-semibold font-retro mb-4 text-center">Why mint a MetaMartian?</h3>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                  <span className="font-cosmic">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Sticky mobile CTA */}
        <div className="fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden">
          <div className="mx-auto max-w-md rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur shadow-xl p-3 flex flex-col items-center gap-3">
            <div className="text-sm font-tech text-center">
              {priceSolLive == null ? "—" : `${priceSolFmt} SOL`}
              {priceUsd ? <span className="opacity-70"> · ~${priceUsd}</span> : null}
            </div>
            <MintButton
              variant="glow"
              fullWidth={false}
              overlayGifSrc="/minting.gif"
              onPriceChange={setPriceSolLive}
              onMintSuccess={handleMintSuccess}
              onModalClose={handleMintSuccess}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

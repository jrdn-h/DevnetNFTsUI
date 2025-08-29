import Image from "next/image";
import MintButton from "@/components/MintButton";
import Supply from "@/components/Supply";

interface MintSectionProps {
  title?: string;
  description?: string;
  price?: string;
  maxSupply?: number;
  mintImage?: string;
  mintGif?: string;
  features?: string[];
}

export default function MintSection({
  title = "Mint",
  description = "Connect your wallet and mint a MetaMartian.",
  price = "0.1 SOL",
  features = [
    "Unique procedurally generated traits",
    "Rich backstory and lore", 
    "High-quality artwork",
    "Community membership",
    "Future utility and rewards"
  ],
  mintImage,
  mintGif,
}: MintSectionProps) {
  return (
    <section id="mint" className="scroll-mt-24 border-t py-16 dark:border-neutral-900 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-black">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-bold">Mint</h2>
          <Supply />
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* Mint panel */}
          <div className="rounded-3xl border p-6 dark:border-neutral-800">
            <p className="text-sm opacity-80">{description}</p>
            
            {/* Features list */}
            <div className="mt-4 space-y-2">
              {features.slice(0, 3).map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm opacity-80">
                  <div className="h-1.5 w-1.5 rounded-full bg-current"></div>
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-5">
              <MintButton
                onMintSuccess={(mint) => console.log('Minted:', mint)}
              />
            </div>
          </div>

          {/* Mint preview */}
          <div className="rounded-3xl border p-6 dark:border-neutral-800">
            <h3 className="text-base font-semibold mb-4">Preview</h3>
            
            {mintGif ? (
              <div className="overflow-hidden rounded-2xl border dark:border-neutral-800">
                <img
                  src={mintGif}
                  alt="Mint Preview"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : mintImage ? (
              <div className="overflow-hidden rounded-2xl border dark:border-neutral-800">
                <Image
                  src={mintImage}
                  alt="Mint Preview"
                  width={400}
                  height={400}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="grid place-items-center rounded-2xl border p-8 text-sm opacity-60 dark:border-neutral-800 bg-gradient-to-br from-purple-400 to-pink-500 aspect-square">
                <div className="text-6xl">🚀</div>
              </div>
            )}
          </div>
        </div>

        {/* Additional info */}
        {features.length > 3 && (
          <div className="mt-8 rounded-3xl border p-6 dark:border-neutral-800">
            <h3 className="text-lg font-semibold mb-4">What you get</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.slice(3).map((feature, index) => (
                <div key={index + 3} className="flex items-center gap-2 text-sm opacity-80">
                  <div className="h-1.5 w-1.5 rounded-full bg-current"></div>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

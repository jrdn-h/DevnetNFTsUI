import Image from "next/image";

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
  description?: string;
  heroImage?: string;
  heroGif?: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

export default function HeroSection({
  title = "The MetaMartians Have Landed",
  subtitle = "A pixel-perfect collection on Solana",
  description = "Mint your Martian, explore the galaxy, and join the crew.",
  heroImage,
  heroGif,
  ctaText = "Mint Now",
  onCtaClick,
}: HeroSectionProps) {
  return (
    <section id="banner" className="relative bg-gradient-to-b from-white to-zinc-50 text-zinc-900 dark:from-zinc-950 dark:to-black dark:text-zinc-100">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-prose text-base opacity-80">
            {description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {onCtaClick && (
              <button
                onClick={onCtaClick}
                className="rounded-2xl bg-black px-5 py-3 text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                {ctaText}
              </button>
            )}
            <button
              onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-2xl border px-5 py-3 hover:bg-black hover:text-white dark:border-neutral-700 dark:hover:bg-white dark:hover:text-black"
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Hero Image/GIF */}
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border shadow-sm dark:border-neutral-800">
          {heroGif ? (
            <img
              src={heroGif}
              alt="MetaMartian Hero"
              className="h-full w-full object-cover"
            />
          ) : heroImage ? (
            <Image
              src={heroImage}
              alt="MetaMartian Hero"
              width={500}
              height={500}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
              <div className="text-6xl">👽</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

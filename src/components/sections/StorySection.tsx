import Image from "next/image";

interface StoryTimelineItem {
  title: string;
  description: string;
  year?: string;
  image?: string;
  gif?: string;
}

interface StorySectionProps {
  title?: string;
  description?: string;
  timeline?: StoryTimelineItem[];
  backgroundImage?: string;
  backgroundGif?: string;
}

export default function StorySection({
  title = "Story",
  description = "From a distant purple moon, MetaMartians crash-landed on Solana. Journey through the cosmic tale of how they came to be.",
  timeline = [
    {
      title: "The Great Cosmic Convergence",
      year: "2089",
      description: "Across the universe, different alien civilizations discovered interdimensional portals that connected their worlds to Earth's digital realm.",
    },
    {
      title: "Digital Awakening", 
      year: "2091",
      description: "The first MetaMartians manifested as digital beings, retaining their unique traits and memories from their home planets.",
    },
    {
      title: "The Collection Begins",
      year: "2024", 
      description: "These cosmic beings now seek human collectors to preserve their stories and help them explore this new digital frontier.",
    }
  ],
  backgroundImage,
  backgroundGif,
}: StorySectionProps) {
  return (
    <section id="story" className="scroll-mt-24 border-t py-16 dark:border-neutral-900 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-black">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">Story</h2>
          <p className="mt-3 max-w-prose opacity-80">
            {description}
          </p>
          
          {/* Timeline items as simple cards */}
          <div className="mt-6 space-y-4">
            {timeline.map((item, index) => (
              <div key={index} className="rounded-2xl border p-4 dark:border-neutral-800">
                <div className="flex items-center gap-3 mb-2">
                  {item.year && (
                    <span className="text-xs px-2 py-1 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium">
                      {item.year}
                    </span>
                  )}
                  <h3 className="font-semibold">{item.title}</h3>
                </div>
                <p className="text-sm opacity-80">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Big media slot */}
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl border shadow-sm dark:border-neutral-800">
          {backgroundGif ? (
            <img 
              src={backgroundGif} 
              alt="Story media" 
              className="h-full w-full object-cover" 
            />
          ) : backgroundImage ? (
            <Image
              src={backgroundImage}
              alt="Story media"
              fill
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
              <div className="text-6xl">🌌</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

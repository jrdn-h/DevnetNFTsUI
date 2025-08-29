import Image from "next/image";

interface AboutSectionProps {
  title?: string;
  description?: string;
  features?: Array<{
    title: string;
    description: string;
    icon?: string;
    image?: string;
  }>;
  aboutImage?: string;
  aboutGif?: string;
}

export default function AboutSection({
  title = "About MetaMartians",
  description = "MetaMartians are a unique collection of digital beings from across the cosmos. Each character represents a different alien civilization with its own culture, technology, and story.",
  features = [
    {
      title: "Unique Traits",
      description: "Each MetaMartian has carefully crafted traits that make them one-of-a-kind.",
      icon: "✨"
    },
    {
      title: "Cosmic Stories",
      description: "Every character comes with rich lore and backstory from their home planet.",
      icon: "🌌"
    },
    {
      title: "Community Driven",
      description: "Join a community of collectors and help shape the MetaMartian universe.",
      icon: "👥"
    }
  ],
  aboutImage,
  aboutGif,
}: AboutSectionProps) {
  return (
    <section id="about" className="py-20 bg-white dark:bg-zinc-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Image Side */}
          <div className="order-2 lg:order-1">
            <div className="relative">
              {aboutGif ? (
                <img
                  src={aboutGif}
                  alt="About MetaMartians"
                  className="w-full h-auto rounded-3xl shadow-xl"
                />
              ) : aboutImage ? (
                <Image
                  src={aboutImage}
                  alt="About MetaMartians"
                  width={600}
                  height={600}
                  className="w-full h-auto rounded-3xl shadow-xl"
                />
              ) : (
                <div className="w-full aspect-square bg-gradient-to-br from-blue-400 to-purple-400 rounded-3xl shadow-xl flex items-center justify-center">
                  <div className="text-8xl">🛸</div>
                </div>
              )}
            </div>
          </div>

          {/* Content Side */}
          <div className="order-1 lg:order-2">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6 font-pixel">
              {title}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              {description}
            </p>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start space-x-6 p-8 bg-gray-50 dark:bg-zinc-800 rounded-xl hover:shadow-lg transition-shadow duration-200"
                >
                  {feature.image ? (
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      width={100}
                      height={100}
                      className="flex-shrink-0 rounded-lg"
                    />
                  ) : (
                    <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-r from-purple-400 to-pink-400 rounded-lg flex items-center justify-center text-4xl">
                      {feature.icon}
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 font-retro">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

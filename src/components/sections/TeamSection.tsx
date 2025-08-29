import Image from "next/image";

interface TeamMember {
  name: string;
  role: string;
  description: string;
  image?: string;
  gif?: string;
  social?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
}

interface TeamSectionProps {
  title?: string;
  description?: string;
  members?: TeamMember[];
}

export default function TeamSection({
  title = "Team",
  description = "The cosmic minds behind MetaMartians, bringing together art, technology, and storytelling from across the universe.",
  members = [
    {
      name: "Captain Comet",
      role: "Founder / Martian Wrangler", 
      description: "Visionary artist who conceptualized the MetaMartian universe and designed the unique alien civilizations.",
      social: {
        twitter: "#",
        linkedin: "#"
      }
    },
    {
      name: "Pixel Piper",
      role: "Artist / Lore Keeper",
      description: "Blockchain architect responsible for the smart contracts and technical infrastructure of the MetaMartian ecosystem.",
      social: {
        twitter: "#",
        github: "#"
      }
    }
  ],
}: TeamSectionProps) {
  return (
    <section id="team" className="scroll-mt-24 border-t py-24 dark:border-neutral-900 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-black">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 font-pixel">{title}</h2>
          <p className="text-lg md:text-xl opacity-80 max-w-3xl mx-auto">{description}</p>
        </div>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {members.map((member, index) => (
            <div key={index} className="flex flex-col sm:flex-row items-center sm:items-start gap-8 rounded-3xl border p-8 dark:border-neutral-800 hover:shadow-lg transition-shadow">
              <div className="h-32 w-32 sm:h-40 sm:w-40 overflow-hidden rounded-3xl border dark:border-neutral-800 flex-shrink-0">
                {member.gif ? (
                  <img 
                    src={member.gif} 
                    alt={member.name} 
                    className="h-full w-full object-cover" 
                  />
                ) : member.image ? (
                  <Image
                    src={member.image}
                    alt={member.name}
                    width={160}
                    height={160}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-5xl">
                    {index === 0 ? '👨‍🎨' : '👩‍💻'}
                  </div>
                )}
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="text-2xl md:text-3xl font-bold mb-2">{member.name}</div>
                <p className="text-lg md:text-xl font-medium opacity-90 mb-4">{member.role}</p>
                <p className="text-base md:text-lg opacity-80 mb-6 leading-relaxed">{member.description}</p>
                <div className="flex justify-center sm:justify-start gap-4 text-base opacity-80">
                  {member.social?.twitter && (
                    <a href={member.social.twitter} className="hover:text-blue-500 transition-colors font-medium">X</a>
                  )}
                  {member.social?.linkedin && (
                    <a href={member.social.linkedin} className="hover:text-blue-600 transition-colors font-medium">LinkedIn</a>
                  )}
                  {member.social?.github && (
                    <a href={member.social.github} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors font-medium">GitHub</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

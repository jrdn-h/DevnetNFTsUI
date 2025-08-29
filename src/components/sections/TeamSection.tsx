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
    <section id="team" className="scroll-mt-24 border-t py-16 dark:border-neutral-900 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-black">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-2xl font-bold">Team</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {members.map((member, index) => (
            <div key={index} className="flex items-center gap-4 rounded-3xl border p-4 dark:border-neutral-800">
              <div className="h-20 w-20 overflow-hidden rounded-2xl border dark:border-neutral-800">
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
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-3xl">
                    {index === 0 ? '👨‍🎨' : '👩‍💻'}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold">{member.name}</div>
                <p className="text-sm opacity-80">{member.role}</p>
                <div className="mt-1 flex gap-3 text-sm opacity-80">
                  {member.social?.twitter && (
                    <a href={member.social.twitter} className="underline">X</a>
                  )}
                  {member.social?.linkedin && (
                    <a href={member.social.linkedin} className="underline">LinkedIn</a>
                  )}
                  {member.social?.github && (
                    <a href={member.social.github} className="underline">GitHub</a>
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

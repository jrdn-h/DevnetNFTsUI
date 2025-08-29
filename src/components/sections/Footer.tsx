import Link from "next/link";

interface FooterLink {
  name: string;
  href: string;
}

interface FooterSectionProps {
  title: string;
  links: FooterLink[];
}

interface FooterProps {
  sections?: FooterSectionProps[];
  socialLinks?: {
    twitter?: string;
    discord?: string;
    instagram?: string;
    opensea?: string;
  };
  copyright?: string;
}

export default function Footer({
  sections = [
    {
      title: "Project",
      links: [
        { name: "Home", href: "/" },
        { name: "Gallery", href: "/gallery" },
        { name: "Collection", href: "/collection" },
      ]
    },
    {
      title: "Community", 
      links: [
        { name: "Discord", href: "#" },
        { name: "Twitter", href: "#" },
        { name: "OpenSea", href: "#" },
      ]
    }
  ],
  socialLinks = {
    twitter: "https://x.com",
    discord: "https://discord.gg",
    instagram: "#",
    opensea: "#"
  },
  copyright = `© ${new Date().getFullYear()} MetaMartians. All rights reserved.`,
}: FooterProps) {
  return (
    <footer className="border-t py-10 text-sm opacity-80 dark:border-neutral-900">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 md:flex-row">
        <p>{copyright}</p>
        <div className="flex gap-4">
          <a href={socialLinks.twitter} target="_blank" className="underline" rel="noreferrer">X</a>
          <a href={socialLinks.discord} target="_blank" className="underline" rel="noreferrer">Discord</a>
          <Link href="/gallery" className="underline">Gallery</Link>
        </div>
      </div>
    </footer>
  );
}

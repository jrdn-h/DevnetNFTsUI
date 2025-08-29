"use client";

import React from "react";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/sections/HeroSection";
import AboutSection from "@/components/sections/AboutSection";
import StorySection from "@/components/sections/StorySection";
import TeamSection from "@/components/sections/TeamSection";
import MintSection from "@/components/sections/MintSection";
import Footer from "@/components/sections/Footer";

export default function Home() {
  const scrollToMint = () => {
    document.getElementById('mint')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Navigation />
      <main>
        <HeroSection 
          title="MetaMartians"
          subtitle="Explore the Universe of Digital Collectibles"
          description="Join the adventure with unique NFT characters exploring the cosmos. Each MetaMartian has its own story and traits waiting to be discovered."
          ctaText="Mint Now"
          onCtaClick={scrollToMint}
          heroImage="/hero.png"
          // heroImage="/images/hero-metamartian.png" // Add your hero image path here
          // heroGif="/images/hero-animation.gif" // Or add your hero GIF path here
        />

        <MintSection 
          title="Mint Your MetaMartian"
          description="Join the cosmic adventure by minting your unique MetaMartian. Each one is procedurally generated with rare traits and comes with its own story from across the universe."
          priceSol={0.1}
          // mintImage="/images/mint-preview.png" // Add your mint preview image here
          // mintGif="/images/mint-animation.gif" // Or add your mint animation GIF here
          mintGif="/mint.gif"
          features={[
            "Unique procedurally generated traits",
            "Rich backstory and lore",
            "High-quality artwork",
            "Community membership",
            "Future utility and rewards"
          ]}
        />
        
        <AboutSection 
          title="About MetaMartians"
          description="MetaMartians are a unique collection of digital beings from across the cosmos. Each character represents a different alien civilization with its own culture, technology, and story."
          // aboutImage="/images/about-image.png" // Add your about image path here
          // aboutGif="/images/about-animation.gif" // Or add your about GIF path here
          aboutGif="/about.gif"
          features={[
            {
              title: "Unique Traits",
              description: "Each MetaMartian has carefully crafted traits that make them one-of-a-kind.",
              image: "/feature1.png"
            },
            {
              title: "Cosmic Stories",
              description: "Every character comes with rich lore and backstory from their home planet.",
              image: "/feature2.png"
            },
            {
              title: "Community Driven",
              description: "Join a community of collectors and help shape the MetaMartian universe.",
              image: "/feature3.png"
            }
          ]}
        />

        <StorySection 
          title="The MetaMartian Story"
          description="Journey through the cosmic tale of how MetaMartians came to be, from distant galaxies to digital reality."
          // backgroundImage="/images/story-background.png" // Add your story background image here
          // backgroundGif="/images/story-background.gif" // Or add your story background GIF here
          backgroundGif="/story.gif"
          timeline={[
            {
              title: "The Great Cosmic Convergence",
              year: "2089",
              description: "Across the universe, different alien civilizations discovered interdimensional portals that connected their worlds to Earth's digital realm.",
              // image: "/images/timeline-1.png" // Add timeline images here
              // gif: "/images/timeline-1.gif"
              gif: "/timeline1.gif",
            },
            {
              title: "Digital Awakening",
              year: "2091", 
              description: "The first MetaMartians manifested as digital beings, retaining their unique traits and memories from their home planets.",
              // image: "/images/timeline-2.png"
              // gif: "/images/timeline-2.gif"
              gif: "/timeline2.gif",
            },
            {
              title: "The Collection Begins",
              year: "2024",
              description: "These cosmic beings now seek human collectors to preserve their stories and help them explore this new digital frontier.",
              // image: "/images/timeline-3.png"
              // gif: "/images/timeline-3.gif"
              gif: "/timeline3.gif",
            }
          ]}
        />

        <TeamSection 
          title="Meet the Team"
          description="The cosmic minds behind MetaMartians, bringing together art, technology, and storytelling from across the universe."
          members={[
            {
              name: "Jordan",
              role: "Technical Lead",
              description: "Blockchain architect responsible for the smart contracts and technical infrastructure of the MetaMartian ecosystem.",
              // image: "/images/team-member-1.png" // Add team member images here
              // gif: "/images/team-member-1.gif"
              gif: "/team1.gif",
              social: {
                twitter: "#",
                linkedin: "#"
              }
            },
            {
              name: "Zach", 
              role: "Creative Director",
              description: "Visionary artist who conceptualized the MetaMartian universe and designed the unique alien civilizations.",
              // image: "/images/team-member-2.png"
              // gif: "/images/team-member-2.gif"
              gif: "/team2.gif",
              social: {
                twitter: "#",
                github: "#"
              }
            }
          ]}
        />

      </main>
      
      <Footer 
        sections={[
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
          },
          {
            title: "Resources",
            links: [
              { name: "Documentation", href: "#" },
              { name: "FAQ", href: "#" },
              { name: "Support", href: "#" },
            ]
          }
        ]}
        socialLinks={{
          twitter: "#",
          discord: "#",
          instagram: "#",
          opensea: "#"
        }}
        copyright="2025 MetaMartians. All rights reserved."
      />
    </>
  );
}
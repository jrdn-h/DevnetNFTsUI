"use client";

import Navigation from "@/components/Navigation";
import MetaMartianCollectionGallery from "@/components/MetaMartianCollectionGallery";
import Footer from "@/components/sections/Footer";

export default function GalleryPage() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-white dark:bg-zinc-900 pt-20">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {/* Header Section */}
          <div className="text-center py-4">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              MetaMartian Collection
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Explore the complete MetaMartian collection with advanced filtering. Connect your wallet to see your owned assets or browse the entire collection with rarity rankings and trait filters.
            </p>
          </div>

          {/* Gallery Content */}
          <div className="bg-gray-50 dark:bg-zinc-800 rounded-3xl p-6 lg:p-8">
            <MetaMartianCollectionGallery pageStep={16} />
          </div>
        </div>
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



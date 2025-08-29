"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ThemeSwitcher from "@/components/themeSwitcher";
import SolBalance from "@/components/SolBalance";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const navItems = [
  { name: "Home", href: "/", sections: ["banner", "mint", "about", "story", "team"] },
  { name: "Gallery", href: "/gallery", sections: [] },
  { name: "Collection", href: "/collection", sections: [] },
];

export default function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-black/10 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 relative">
              <Image
                src="/PFP.png"
                alt="MetaMartians Logo"
                width={40}
                height={40}
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="text-xl font-bold font-pixel">MetaMartians</div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <div key={item.name} className="relative group">
                <Link
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "text-black dark:text-white bg-black/5 dark:bg-white/5"
                      : "text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {item.name}
                </Link>
                
                {/* Dropdown for Home sections */}
                {item.sections.length > 0 && pathname === "/" && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    {item.sections.map((section) => (
                      <button
                        key={section}
                        onClick={() => scrollToSection(section)}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {section.charAt(0).toUpperCase() + section.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Theme Switcher, Wallet Button & SOL Balance */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeSwitcher />
            <WalletMultiButton />
            <SolBalance />
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-black/10 dark:border-white/10">
            <div className="space-y-2">
              {navItems.map((item) => (
                <div key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive(item.href)
                        ? "text-black dark:text-white bg-black/5 dark:bg-white/5"
                        : "text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {item.name}
                  </Link>
                  
                  {/* Mobile sections for Home */}
                  {item.sections.length > 0 && pathname === "/" && (
                    <div className="ml-4 space-y-1">
                      {item.sections.map((section) => (
                        <button
                          key={section}
                          onClick={() => scrollToSection(section)}
                          className="block w-full text-left px-3 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        >
                          {section.charAt(0).toUpperCase() + section.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Mobile Theme Switcher, Wallet Button & SOL Balance */}
              <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-2">
                <div className="flex justify-center">
                  <ThemeSwitcher />
                </div>
                <WalletMultiButton />
                <div className="flex justify-center">
                  <SolBalance />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

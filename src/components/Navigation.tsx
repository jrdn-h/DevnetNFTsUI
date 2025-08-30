"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ThemeSwitcher from "@/components/themeSwitcher";
import SolBalance from "@/components/SolBalance";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

// Home sections promoted to top-level nav
const sectionIds = ["banner", "mint", "about", "story", "team"] as const;

export default function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- GLASS TOKENS (match dock) ---
  const hairline = "rounded-[1.1rem] p-px bg-gradient-to-br from-white/25 via-white/10 to-transparent shadow-[0_8px_30px_rgba(0,0,0,.12)]";
  const glassNav = "rounded-[1.1rem] border-0 bg-white/10 backdrop-blur-xl dark:bg-white/5"; // no border, no ring
  const link  = "px-3 py-2 rounded-lg text-sm font-medium transition";
  const linkActive = "text-black dark:text-white bg-white/20 dark:bg-white/10";
  const linkHover  = "text-gray-700 dark:text-gray-200 hover:text-black dark:hover:text-white hover:bg-white/10";

  // NEW: neon pill for Collection
  const collectionPill =
    "relative rounded-full px-4 py-2 font-semibold tracking-tight " +
    "bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-violet-400/20 " +
    "text-black dark:text-white backdrop-blur-xl " +
    "shadow-[0_0_18px_rgba(34,197,94,.28),0_0_28px_rgba(6,182,212,.22)] " +
    "ring-1 ring-white/20 dark:ring-white/10";

  const isHome = pathname === "/";
  const isActive = (href: string) => (href === "/" ? isHome : pathname.startsWith(href));

  const scrollToSection = (sectionId: string) => {
    if (!isHome) return; // handled via anchor when not on home
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  };

  // Build the nav: Home + sections + Collection (Gallery removed)
  const topNav = useMemo(
    () => [
      { label: "Home", kind: "page" as const, href: "/" },
      ...sectionIds.map((id) => ({ label: id.charAt(0).toUpperCase() + id.slice(1), kind: "section" as const, id })),
      { label: "Collection", kind: "page" as const, href: "/collection" },
    ],
    []
  );

  // --- AUTO-HIDE ON IDLE, SHOW ON SCROLL/MOVE ---
  const [hidden, setHidden] = useState(false);
  const [hovering, setHovering] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const IDLE_MS = 1200;
    const TOP_PIN = 2; // <- if at top, never hide

    const show = () => setHidden(false);

    const scheduleHide = () => {
      // never hide at top, and never hide while hovering
      if (window.scrollY <= TOP_PIN || hovering) {
        setHidden(false);
        return;
      }
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (!hovering && window.scrollY > TOP_PIN) setHidden(true);
      }, IDLE_MS);
    };

    const onScroll = () => { show(); scheduleHide(); };
    const onMove   = () => { show(); scheduleHide(); };
    const onTouch  = () => { show(); scheduleHide(); };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });

    // initialize (if we mount at top, keep visible)
    if (window.scrollY <= TOP_PIN) setHidden(false); else scheduleHide();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouch);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [hovering]);

  return (
    <header
      className={[
        "sticky top-0 z-50 transition-all duration-300",
        hidden ? "-translate-y-4 opacity-0 pointer-events-none" : "translate-y-0 opacity-100",
      ].join(" ")}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* apply hover to the HAIRLINE wrapper so the whole shell floats */}
        <div
          className={`mt-2 ${hairline} transition-transform duration-200 transform-gpu hover:-translate-y-0.5`}
        >
          <nav className={glassNav}>
            <div className="flex justify-between items-center h-16 px-3">
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

              {/* Desktop nav */}
              <div className="hidden md:flex items-center space-x-2">
                {topNav.map((item) => {
                  if (item.kind === "page") {
                    const isCollection = item.href === "/collection";
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={isCollection
                          ? collectionPill
                          : `${link} ${isActive(item.href) ? linkActive : linkHover}`
                        }
                      >
                        {item.label}
                      </Link>
                    );
                  }
                  // section link
                  return isHome ? (
                    <button
                      key={item.label}
                      onClick={() => scrollToSection(item.id)}
                      className={`${link} ${linkHover}`}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      key={item.label}
                      href={`/#${item.id}`}
                      className={`${link} ${linkHover}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              {/* Right cluster */}
              <div className="hidden md:flex items-center space-x-3">
                <ThemeSwitcher />
                <WalletMultiButton />
                <SolBalance />
              </div>

              {/* Mobile menu toggler */}
              <button
                onClick={() => setMobileMenuOpen((s) => !s)}
                className={`${link} md:hidden ${linkHover}`}
                aria-label="Toggle navigation"
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

            {/* Mobile menu (glassy) */}
            {mobileMenuOpen && (
              <div className="md:hidden px-3 pb-3">
                <div className={`rounded-xl ${glassNav} px-2 py-3`}>
                  <div className="space-y-2">
                    {topNav.map((item) =>
                      item.kind === "page" ? (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={item.href === "/collection"
                            ? `${collectionPill} block w-full text-center`
                            : `block ${link} ${isActive(item.href) ? linkActive : linkHover}`
                          }
                        >
                          {item.label}
                        </Link>
                      ) : isHome ? (
                        <button
                          key={item.label}
                          onClick={() => scrollToSection(item.id)}
                          className={`block w-full text-left ${link} ${linkHover}`}
                        >
                          {item.label}
                        </button>
                      ) : (
                        <Link
                          key={item.label}
                          href={`/#${item.id}`}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`block ${link} ${linkHover}`}
                        >
                          {item.label}
                        </Link>
                      )
                    )}

                    {/* Right cluster in mobile */}
                    <div className="pt-3 border-t border-white/20 dark:border-white/10 space-y-2">
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
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

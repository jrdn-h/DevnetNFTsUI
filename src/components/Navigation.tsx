"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import ThemeSwitcher from "@/components/themeSwitcher";
import SolBalance from "@/components/SolBalance";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

// Home sections promoted to top-level nav
const sectionIds = ["mint", "about", "story", "team"] as const;

export default function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // refs for desktop nav items
  const navRefs = useRef<Record<NavKey, HTMLElement | null>>({
    home: null, mint: null, about: null, story: null, team: null, collection: null,
  });
  const getNavRef = (key: NavKey) => (el: HTMLElement | null) => {
    navRefs.current[key] = el;
  };

  const isCollectionPage = pathname.startsWith("/collection");

  // orbit + container
  const navBarRef = useRef<HTMLDivElement | null>(null);
  const orbitRef  = useRef<HTMLDivElement | null>(null);

  // State
  const [activeKey, setActiveKey] = useState<NavKey>("home");
  const [hoverKey,  setHoverKey]  = useState<NavKey | null>(null);

  // Hover timers / lock
  const hoverInTimer  = useRef<number | null>(null);
  const hoverOutTimer = useRef<number | null>(null);
  const hoverLockUntil = useRef<number>(0);

  // Stable orbit positioning (works on Home, and on Collection only while hovering)
  const positionOrbit = useCallback((key: NavKey | null) => {
    // Hide on /collection unless hovering something
    if (isCollectionPage && !key) return;

    const el   = key ? navRefs.current[key] : null;
    const wrap = navBarRef.current;
    const orb  = orbitRef.current;
    if (!el || !wrap || !orb) return;

    const eb = el.getBoundingClientRect();
    const wb = wrap.getBoundingClientRect();

    // Slightly bigger when hovered (but we debounce hover below)
    const padX = hoverKey === key ? ORBIT_PAD_X + 4 : ORBIT_PAD_X;
    const padY = hoverKey === key ? ORBIT_PAD_Y + 2 : ORBIT_PAD_Y;

    const w = eb.width  + padX * 2;
    const h = eb.height + padY * 2;
    const x = eb.left - wb.left - padX;
    const y = eb.top  - wb.top  - padY;

    orb.style.width  = `${w}px`;
    orb.style.height = `${h}px`;
    orb.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [hoverKey, isCollectionPage]);

  // update on hover/active/resize
  useEffect(() => {
    positionOrbit(hoverKey ?? activeKey);
  }, [hoverKey, activeKey, positionOrbit]);

  useEffect(() => {
    const onResize = () => positionOrbit(hoverKey ?? activeKey);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hoverKey, activeKey, positionOrbit]);

  // Hover handlers with hysteresis (less twitchy)
  const onItemEnter = (key: NavKey) => {
    // cancel pending out
    if (hoverOutTimer.current) { window.clearTimeout(hoverOutTimer.current); hoverOutTimer.current = null; }

    // respect a tiny delay before engaging hover target
    if (hoverInTimer.current) window.clearTimeout(hoverInTimer.current);
    hoverInTimer.current = window.setTimeout(() => {
      setHoverKey(key);
      hoverLockUntil.current = performance.now() + HOVER_LOCK_MS; // short lock
    }, HOVER_IN_MS);
  };

  const onItemLeave = (key: NavKey) => {
    if (hoverInTimer.current) { window.clearTimeout(hoverInTimer.current); hoverInTimer.current = null; }

    // don't immediately drop hover; wait a moment for adjacent item
    if (hoverOutTimer.current) window.clearTimeout(hoverOutTimer.current);
    hoverOutTimer.current = window.setTimeout(() => {
      // while locked, keep hover
      if (performance.now() < hoverLockUntil.current) return;
      setHoverKey((k) => (k === key ? null : k));
    }, HOVER_OUT_MS);
  };

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

  // --- ORBIT CONFIG (less sensitive + better sizing) ---
  const ORBIT_PAD_X = 14;
  const ORBIT_PAD_Y = 8;
  const ORBIT_EASE = "cubic-bezier(.22,.9,.24,1)";

  // Hover hysteresis (tune if you like)
  const HOVER_IN_MS  = 90;   // how long to stay over an item before orbit targets it
  const HOVER_OUT_MS = 120;  // how long to wait before orbit returns to active after leave
  const HOVER_LOCK_MS = 180; // short lock to avoid rapid back/forth

  type NavKey = "home" | "mint" | "about" | "story" | "team" | "collection";

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

  // Scroll sync (Home only; paused while hovering so no jitter)
  useEffect(() => {
    if (isCollectionPage || pathname !== "/") {
      setActiveKey(isCollectionPage ? "collection" : "home");
      return;
    }

    const sections = [
      { id: "mint",  el: document.getElementById("mint") },
      { id: "about", el: document.getElementById("about") },
      { id: "story", el: document.getElementById("story") },
      { id: "team",  el: document.getElementById("team")  },
    ].filter((x): x is { id: Exclude<NavKey,"home"|"collection">; el: HTMLElement } => !!x.el);

    const TOP_PIN_Y = 72;
    const FOCUS_Y   = 96;

    let ticking = false;
    const update = () => {
      ticking = false;

      // Pause scroll-driven changes during hover (prevents tug-of-war)
      if (hoverKey) return;

      if (window.scrollY <= TOP_PIN_Y) {
        setActiveKey("home");
        positionOrbit("home");
        return;
      }

      // Choose section whose top is closest to a fixed focus line
      let best: { id: NavKey; d: number } | null = null;
      for (const { id, el } of sections) {
        const d = Math.abs(el.getBoundingClientRect().top - FOCUS_Y);
        if (!best || d < best.d) best = { id, d };
      }
      if (best) setActiveKey(best.id);
    };

    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname, isCollectionPage, hoverKey, positionOrbit]);

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
              <div ref={navBarRef} className="relative hidden md:flex items-center space-x-2">

                {/* Neon glass OVAL — hidden on /collection unless hovering */}
                {(!isCollectionPage || hoverKey) && (
                  <div
                    ref={orbitRef}
                    className="pointer-events-none absolute left-0 top-0 -z-0 rounded-full"
                    style={{
                      transition: `transform 240ms ${ORBIT_EASE}, width 160ms ${ORBIT_EASE}, height 160ms ${ORBIT_EASE}`,
                    }}
                    aria-hidden
                  >
                    {/* tighter glow — no long rays */}
                    <span
                      className="absolute -inset-2 rounded-full blur-xl opacity-95 mix-blend-screen
                                 bg-[radial-gradient(100%_70%_at_50%_50%,rgba(34,197,94,.55),rgba(6,182,212,.42)_40%,rgba(167,139,250,.35)_60%,transparent_80%)]"
                    />
                    {/* outline-only ring (no inner fill) */}
                    <span className="absolute inset-0 rounded-full ring-1 ring-white/35 dark:ring-white/25" />
                  </div>
                )}

                {/* Links (give them z-index so they sit above the oval) */}
                {[
                  { key: "home",       label: "Home",       href: "/" },
                  { key: "mint",       label: "Mint",       section: "mint" },
                  { key: "about",      label: "About",      section: "about" },
                  { key: "story",      label: "Story",      section: "story" },
                  { key: "team",       label: "Team",       section: "team" },
                  { key: "collection", label: "Collection", href: "/collection", pill: true },
                ].map((item) => {
                  const base = "relative z-10 px-3 py-2 rounded-lg text-sm font-medium transition";
                  const hover = "text-gray-700 dark:text-gray-200 hover:text-black dark:hover:text-white hover:bg-white/10";
                  const active = "text-black dark:text-white bg-white/20 dark:bg-white/10";
                  const cls = item.pill
                    ? "relative z-10 rounded-full px-4 py-2 font-semibold tracking-tight " +
                      "bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-violet-400/20 text-black dark:text-white " +
                      "backdrop-blur-xl shadow-[0_0_18px_rgba(34,197,94,.28),0_0_28px_rgba(6,182,212,.22)] " +
                      "ring-1 ring-white/20 dark:ring-white/10"
                    : `${base} ${activeKey === (item.key as NavKey) ? active : hover}`;

                  // Use hysteresis hover handlers

                  if (item.href) {
                    return (
                      <Link
                        key={item.key}
                        ref={getNavRef(item.key as NavKey)}
                        href={item.href}
                        onMouseEnter={() => onItemEnter(item.key as NavKey)}
                        onMouseLeave={() => onItemLeave(item.key as NavKey)}
                        className={cls}
                      >
                        {item.label}
                      </Link>
                    );
                  }
                  // section buttons: smooth-scroll on home; anchor otherwise
                  return (
                    <button
                      key={item.key}
                      ref={getNavRef(item.key as NavKey)}
                      onMouseEnter={() => onItemEnter(item.key as NavKey)}
                      onMouseLeave={() => onItemLeave(item.key as NavKey)}
                      onClick={() => {
                        if (pathname === "/") {
                          document.getElementById(item.section!)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        } else {
                          window.location.href = `/#${item.section}`;
                        }
                      }}
                      className={cls}
                    >
                      {item.label}
                    </button>
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

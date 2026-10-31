import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { Logo } from './Logo';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  const scrollToSection = (e, sectionId) => {
    if (!isHome) return;
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#17234d]/10 bg-[#ffffff]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo */}
        <Link
          to="/"
          className="focus-visible:outline-2 focus-visible:outline-[#2846e8] focus-visible:outline-offset-2 rounded-lg"
          aria-label="MeraGovernment homepage"
          onClick={() => setMobileMenuOpen(false)}
        >
          <Logo />
        </Link>

        {/* Centre Navigation: Desktop */}
        <nav
          className="hidden md:flex items-center gap-1 lg:gap-2"
          aria-label="Primary navigation"
        >
          <a
            href="#capabilities"
            onClick={(e) => scrollToSection(e, 'capabilities')}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-[#414c66] hover:text-[#17234d] hover:bg-[#c7d4ff]/30 transition-craft focus-visible:outline-2 focus-visible:outline-[#2846e8]"
          >
            Capabilities
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => scrollToSection(e, 'how-it-works')}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-[#414c66] hover:text-[#17234d] hover:bg-[#c7d4ff]/30 transition-craft focus-visible:outline-2 focus-visible:outline-[#2846e8]"
          >
            How it works
          </a>
          <a
            href="#transparency"
            onClick={(e) => scrollToSection(e, 'transparency')}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-[#414c66] hover:text-[#17234d] hover:bg-[#c7d4ff]/30 transition-craft focus-visible:outline-2 focus-visible:outline-[#2846e8]"
          >
            Transparency
          </a>
        </nav>

        {/* Right CTA */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            to="/app"
            className="btn-press group inline-flex items-center gap-1.5 rounded-lg border-2 border-[#17234d] bg-[#2846e8] px-4 py-2 text-sm font-bold text-[#ffffff] shadow-solid-sm hover:bg-[#1f37b8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2846e8]"
          >
            <span>Launch App</span>
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            to="/app"
            className="btn-press rounded-lg border border-[#17234d] bg-[#2846e8] px-3 py-1.5 text-xs font-bold text-[#ffffff]"
          >
            Launch App
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-[#17234d] hover:bg-[#c7d4ff]/40 focus-visible:outline-2 focus-visible:outline-[#2846e8]"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#17234d]/10 bg-[#ffffff] px-4 pt-3 pb-6 shadow-lg">
          <div className="flex flex-col space-y-2">
            <a
              href="#capabilities"
              onClick={(e) => scrollToSection(e, 'capabilities')}
              className="rounded-lg px-3 py-2.5 text-base font-semibold text-[#17234d] hover:bg-[#c7d4ff]/40"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => scrollToSection(e, 'how-it-works')}
              className="rounded-lg px-3 py-2.5 text-base font-semibold text-[#17234d] hover:bg-[#c7d4ff]/40"
            >
              How it works
            </a>
            <a
              href="#transparency"
              onClick={(e) => scrollToSection(e, 'transparency')}
              className="rounded-lg px-3 py-2.5 text-base font-semibold text-[#17234d] hover:bg-[#c7d4ff]/40"
            >
              Transparency
            </a>
            <div className="pt-3 border-t border-[#17234d]/10">
              <Link
                to="/app"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#17234d] bg-[#2846e8] py-2.5 text-center text-sm font-bold text-[#ffffff] shadow-solid-sm"
              >
                <span>Launch App</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

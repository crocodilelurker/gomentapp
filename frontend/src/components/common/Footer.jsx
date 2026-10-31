import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="bg-[#ffffff] text-[#17234d] py-8 border-t border-[#17234d]/10 text-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Logo size="default" />
          
          <nav className="flex flex-wrap items-center gap-4 text-[#414c66] font-medium" aria-label="Footer navigation">
            <a href="#capabilities" className="hover:text-[#2846e8] transition-craft">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-[#2846e8] transition-craft">
              How it works
            </a>
            <a href="#transparency" className="hover:text-[#2846e8] transition-craft">
              Transparency
            </a>
            <Link to="/app" className="font-bold text-[#2846e8] hover:underline">
              Launch App
            </Link>
          </nav>
        </div>

        <div className="pt-3 border-t border-[#17234d]/10 flex flex-col md:flex-row md:items-center justify-between gap-2 text-[#414c66]">
          <p>
            MeraGovernment is an independent civic information platform and is not an official government portal.
          </p>
          <p>© {new Date().getFullYear()} MeraGovernment. Civic Technology Initiative.</p>
        </div>
      </div>
    </footer>
  );
}

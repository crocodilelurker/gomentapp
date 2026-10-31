import React from 'react';

/**
 * Original MeraGovernment logo symbol and wordmark.
 * Modern geometric civic symbol: an open civic folio / beacon node representing
 * transparency, public access, and grounded information.
 */
export function Logo({ size = 'default', showWordmark = true, invert = false }) {
  const isLarge = size === 'lg';
  const iconSize = isLarge ? 36 : 28;

  return (
    <div className="flex items-center gap-2.5 select-none">
      {/* Original Geometric Civic Symbol */}
      <div
        className={`relative flex items-center justify-center rounded-lg border-2 ${
          invert
            ? 'bg-[#ffffff] border-[#ffffff] text-[#2846e8]'
            : 'bg-[#2846e8] border-[#17234d] text-[#ffffff] shadow-solid-sm'
        }`}
        style={{ width: iconSize, height: iconSize }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Central civic portal / pillar & open document wings */}
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M8 7h8" />
          <path d="M8 11h8" />
          <path d="M8 15h4" />
        </svg>
      </div>

      {showWordmark && (
        <span
          className={`font-extrabold tracking-tight ${
            isLarge ? 'text-2xl' : 'text-xl'
          } ${invert ? 'text-[#ffffff]' : 'text-[#17234d]'}`}
        >
          Mera<span className={invert ? 'text-[#ffbd96]' : 'text-[#2846e8]'}>Government</span>
        </span>
      )}
    </div>
  );
}


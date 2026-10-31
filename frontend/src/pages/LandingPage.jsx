import React from 'react';
import { HeroSection } from '../components/landing/HeroSection';
import { WhatItDoes } from '../components/landing/WhatItDoes';
import { HowItWorksSection } from '../components/landing/HowItWorksSection';

export function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none">
      {/* Scroll 1: Navigation & Hero with query CTA */}
      <HeroSection />

      {/* Scroll 2: What MeraGovernment Does (3 Core Capabilities) */}
      <WhatItDoes />

      {/* Scroll 3: How It Works + Transparency & Advisory + Final CTA */}
      <HowItWorksSection />
    </main>
  );
}

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { LandingPage } from './pages/LandingPage';
import { AppPage } from './pages/AppPage';

export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-[#ffffff] text-[#17234d] selection:bg-[#c7d4ff] selection:text-[#17234d]">
      {/* Skip to Content for Keyboard Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border-2 focus:border-[#17234d] focus:bg-[#2846e8] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-[#ffffff] focus:shadow-solid-sm"
      >
        Skip to main content
      </a>

      {/* Global Navigation */}
      <Navbar />

      {/* Main Routed Content */}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </div>

      {/* Global Civic Footer */}
      <Footer />
    </div>
  );
}

export default App;


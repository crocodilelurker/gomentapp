import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck, Binary, BookOpen, Layers } from 'lucide-react';

export function HeroSection() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      navigate(`/app?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/app');
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#ffbd96] py-10 sm:py-14 lg:py-16 border-b-2 border-[#17234d]">
      {/* Background dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: 'radial-gradient(#17234d 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* Left Column: Proposition & Real Query CTA (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Platform Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#17234d] bg-[#ffffff] px-3.5 py-1 text-xs font-bold text-[#17234d] shadow-solid-sm">
              <ShieldCheck className="w-4 h-4 text-[#2846e8]" />
              <span>Independent Civic Information Platform</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#17234d] leading-[1.08] text-balance">
              Government policies,{' '}
              <span className="text-[#2846e8]">
                made easier to understand.
              </span>
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg font-medium text-[#414c66] max-w-xl text-pretty leading-relaxed">
              Ask questions about available government policy documents, search relevant information through semantic retrieval, and inspect supporting sources.
            </p>

            {/* Real Search Form — NO mock data */}
            <form onSubmit={handleSearch} className="pt-2 max-w-xl">
              <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                <div className="relative flex-1">
                  <label htmlFor="hero-query-input" className="sr-only">
                    Ask a question about government policy documents
                  </label>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[#414c66]" aria-hidden="true" />
                  <input
                    id="hero-query-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter your policy question..."
                    className="w-full rounded-lg border-2 border-[#17234d] bg-[#ffffff] py-3.5 pl-11 pr-4 text-sm font-medium text-[#17234d] placeholder-[#414c66]/60 shadow-solid-sm focus:border-[#2846e8] focus:ring-2 focus:ring-[#c7d4ff] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-press inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[#17234d] bg-[#2846e8] px-6 py-3.5 text-sm font-extrabold text-[#ffffff] shadow-solid-deep-ink hover:bg-[#1f37b8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2846e8] shrink-0"
                >
                  <span>Ask a Question</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="text-xs text-[#414c66] flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#2846e8]" />
              <span>Connects to local RAG service for transparent document retrieval and source verification.</span>
            </div>
          </div>

          {/* Right Column: Architectural Schematic — ZERO mock data (5 cols) */}
          <div className="lg:col-span-5">
            <div className="rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-5 sm:p-6 shadow-solid-ultramarine-lg space-y-4">
              <div className="flex items-center justify-between border-b border-[#17234d]/10 pb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#17234d]">
                  RAG Retrieval Architecture
                </span>
                <span className="rounded bg-[#c7d4ff] px-2 py-0.5 text-[11px] font-bold text-[#17234d]">
                  Gateway Route
                </span>
              </div>

              {/* Schematic Flow: Query -> Embeddings -> Vector Search -> Grounded Synthesis */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center gap-3 rounded-lg border border-[#17234d]/15 bg-[#f4f6fb] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2846e8] text-[#ffffff] shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#17234d]">1. Citizen Query</p>
                    <p className="text-[11px] text-[#414c66]">Natural language inquiry received via gateway</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-[#17234d]/15 bg-[#f4f6fb] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#17234d] text-[#e8ec97] shrink-0">
                    <Binary className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#17234d]">2. Semantic Vector Match</p>
                    <p className="text-[11px] text-[#414c66]">Cosine similarity search over ingested policy chunks</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-[#17234d]/15 bg-[#f4f6fb] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2846e8] text-[#ffffff] shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#17234d]">3. Source Attributions</p>
                    <p className="text-[11px] text-[#414c66]">Retrieved passages returned directly for citizen verification</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#17234d]/10 flex items-center justify-between text-[11px] text-[#414c66]">
                <span className="font-mono">POST /api/rag/ask</span>
                <span className="font-mono">POST /api/rag/retrieve</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

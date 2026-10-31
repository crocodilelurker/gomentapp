import React from 'react';
import { MessageSquare, Search, FileCheck, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function WhatItDoes() {
  return (
    <section id="capabilities" className="py-12 sm:py-16 bg-[#ffffff] border-b-2 border-[#17234d]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-2xl mb-8 sm:mb-10">
          <span className="rounded-md bg-[#c7d4ff] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[#17234d]">
            What MeraGovernment Does
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-[#17234d] tracking-tight">
            Three core capabilities for exploring public information
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#414c66]">
            Built to provide a direct, transparent bridge between citizen questions and ingested policy documents.
          </p>
        </div>

        {/* Expressive 3-Capability Asymmetrical Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
          
          {/* Capability 1: Ask in Natural Language (4 cols) */}
          <div className="md:col-span-4 flex flex-col justify-between rounded-xl border-2 border-[#17234d] bg-[#c7d4ff]/25 p-5 sm:p-6 shadow-solid-sm">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-[#17234d] bg-[#2846e8] text-[#ffffff] mb-4">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-extrabold text-[#17234d]">
                Ask questions
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#414c66] leading-relaxed">
                Citizens can ask questions in natural language without needing technical policy terminology or bureaucratic acronyms.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-[#17234d]/10 flex items-center gap-2 text-xs font-bold text-[#2846e8]">
              <span>Natural query input</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Capability 2: Search Policies (4 cols) */}
          <div className="md:col-span-4 flex flex-col justify-between rounded-xl border-2 border-[#17234d] bg-[#e8ec97]/40 p-5 sm:p-6 shadow-solid-sm">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-[#17234d] bg-[#17234d] text-[#e8ec97] mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-extrabold text-[#17234d]">
                Search policies
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#414c66] leading-relaxed">
                The semantic retrieval system finds relevant passages from available policy documents using vector similarity search.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-[#17234d]/10 flex items-center gap-2 text-xs font-bold text-[#17234d]">
              <span>ChromaDB vector retrieval</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Capability 3: Explore Sources (4 cols) */}
          <div className="md:col-span-4 flex flex-col justify-between rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-5 sm:p-6 shadow-solid-deep-ink">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-[#17234d] bg-[#2846e8] text-[#ffffff] mb-4">
                <FileCheck className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-extrabold text-[#17234d]">
                Explore sources
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#414c66] leading-relaxed">
                Answers include supporting source passages returned by the backend, allowing citizens to inspect the primary text directly.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-[#17234d]/10 flex items-center justify-between">
              <span className="text-xs font-bold text-[#2846e8]">Inspectable excerpts</span>
              <Link
                to="/app"
                className="btn-press inline-flex items-center gap-1 rounded bg-[#2846e8] px-2.5 py-1 text-xs font-bold text-[#ffffff]"
              >
                <span>Try App</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}


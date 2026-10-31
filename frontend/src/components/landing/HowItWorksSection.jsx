import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle } from 'lucide-react';

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Ask a question',
    description: 'Enter your inquiry about government schemes or policy documents in everyday language.',
    badgeColor: 'bg-[#ffbd96] text-[#17234d]',
  },
  {
    step: '02',
    title: 'Retrieve policy passages',
    description: 'The semantic retrieval pipeline scans available policy documents for matching text sections.',
    badgeColor: 'bg-[#e8ec97] text-[#17234d]',
  },
  {
    step: '03',
    title: 'Receive answer with sources',
    description: 'The system delivers an answer grounded in the retrieved text, accompanied by the primary excerpts.',
    badgeColor: 'bg-[#c7d4ff] text-[#17234d]',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-12 sm:py-16 bg-[#17234d] text-[#ffffff] border-b-2 border-[#17234d]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Section Header */}
        <div className="max-w-2xl">
          <span className="rounded-md bg-[#2846e8] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[#ffffff]">
            The Retrieval Process
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-[#ffffff] tracking-tight">
            How It Works
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#c7d4ff]">
            A direct, verifiable workflow from your question to source-backed policy information.
          </p>
        </div>

        {/* 3 Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {WORKFLOW_STEPS.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl border-2 border-[#ffffff]/20 bg-[#ffffff]/5 p-5 sm:p-6 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`rounded-lg px-2.5 py-1 font-mono text-xs font-black ${item.badgeColor}`}>
                  Step {item.step}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-[#ffffff]">
                {item.title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#ffffff]/80 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Transparency Statement & Civic Disclosure */}
        <div id="transparency" className="rounded-xl border-2 border-[#e8ec97]/40 bg-[#ffffff]/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e8ec97] shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-xs sm:text-sm">
              <p className="font-extrabold text-[#ffffff]">
                Transparency & Citizen Advisory
              </p>
              <p className="text-[#c7d4ff] leading-relaxed">
                AI-generated information can contain errors. Review the provided sources and consult the relevant official government authority before making important decisions.
              </p>
              <p className="text-xs text-[#ffffff]/70 pt-1">
                MeraGovernment is an independent civic information platform and is not an official government portal. Coverage is strictly limited to policy documents currently ingested into the system.
              </p>
            </div>
          </div>
        </div>

        {/* Final CTA Bar */}
        <div className="rounded-xl border-2 border-[#ffffff]/20 bg-[#ffbd96] p-6 sm:p-8 text-[#17234d] flex flex-col sm:flex-row items-center justify-between gap-5 shadow-solid-deep-ink">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#17234d]">
              Ready to explore available policy documents?
            </h3>
            <p className="text-xs sm:text-sm font-medium text-[#414c66]">
              Ask your question and inspect the cited source passages returned by the backend.
            </p>
          </div>
          <Link
            to="/app"
            className="btn-press inline-flex items-center gap-2 rounded-lg border-2 border-[#17234d] bg-[#2846e8] px-6 py-3 text-sm font-extrabold text-[#ffffff] shadow-solid-deep-ink hover:bg-[#1f37b8] shrink-0"
          >
            <span>Ask a Question</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}


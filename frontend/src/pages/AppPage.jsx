import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Search, 
  Send, 
  BookOpen, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  RefreshCw,
  SlidersHorizontal,
  Layers
} from 'lucide-react';
import { askQuestion, retrieveChunks } from '../services/apiService';
import { useHealth } from '../hooks/useHealth';
import { Skeleton } from '../components/ui/Skeleton';

export function AppPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState('ask'); // 'ask' or 'retrieve'
  const [topK, setTopK] = useState(5);
  
  const [loading, setLoading] = useState(false);
  const [answerData, setAnswerData] = useState(null);
  const [retrieveData, setRetrieveData] = useState(null);
  const [error, setError] = useState(null);

  const { gateway, rag, loading: healthLoading, refresh: checkHealth } = useHealth();

  // If initial query provided via URL, auto-execute
  useEffect(() => {
    if (initialQuery.trim()) {
      handleSearch(initialQuery.trim(), mode, topK);
    }
  }, [initialQuery]);

  const handleSearch = async (queryString, searchMode, k) => {
    if (!queryString.trim()) return;
    setLoading(true);
    setError(null);
    setSearchParams({ q: queryString });

    try {
      if (searchMode === 'ask') {
        const result = await askQuestion(queryString, k);
        setAnswerData(result);
        setRetrieveData(null);
      } else {
        const result = await retrieveChunks(queryString, k);
        setRetrieveData(result);
        setAnswerData(null);
      }
    } catch (err) {
      setError(err.message || 'An error occurred while connecting to the backend gateway.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    handleSearch(query, mode, topK);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] py-8 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2846e8] hover:underline mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to MeraGovernment Landing</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17234d] tracking-tight">
              Policy & Scheme Inquirer
            </h1>
            <p className="text-xs sm:text-sm text-[#414c66] mt-0.5">
              Query the RAG service via the central API Gateway (port 8000).
            </p>
          </div>

          {/* Real Backend Status Widget */}
          <div className="flex items-center gap-2 rounded-lg border border-[#17234d]/15 bg-[#ffffff] px-3 py-2 text-xs font-medium shadow-sm">
            <span className="text-[#414c66]">Gateway Status:</span>
            {healthLoading ? (
              <span className="text-gray-400">Verifying...</span>
            ) : gateway ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live (8000)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600" title="Start backend with docker compose up">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Offline
              </span>
            )}
            <button
              onClick={checkHealth}
              className="rounded p-1 hover:bg-[#c7d4ff]/30 text-[#414c66]"
              title="Refresh connection status"
              aria-label="Refresh status"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Query Input Card */}
        <div className="rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-5 sm:p-6 shadow-solid-sm">
          <form onSubmit={onSubmit} className="space-y-4">
            
            {/* Mode Selector Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#17234d]/10 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('ask')}
                  className={`btn-press rounded-lg px-3 py-1.5 text-xs font-bold transition-craft ${
                    mode === 'ask'
                      ? 'bg-[#2846e8] text-[#ffffff] shadow-solid-sm'
                      : 'bg-[#f4f6fb] text-[#414c66] hover:bg-[#c7d4ff]/30'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  Q&A Answer Mode (/api/rag/ask)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('retrieve')}
                  className={`btn-press rounded-lg px-3 py-1.5 text-xs font-bold transition-craft ${
                    mode === 'retrieve'
                      ? 'bg-[#17234d] text-[#ffffff] shadow-solid-sm'
                      : 'bg-[#f4f6fb] text-[#414c66] hover:bg-[#c7d4ff]/30'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 inline mr-1" />
                  Passage Search (/api/rag/retrieve)
                </button>
              </div>

              {/* Top-K selector */}
              <div className="flex items-center gap-2 text-xs font-medium text-[#414c66]">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <label htmlFor="top-k-select">Passages (Top-K):</label>
                <select
                  id="top-k-select"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="rounded border border-[#17234d]/20 bg-[#ffffff] px-2 py-1 text-xs font-bold text-[#17234d]"
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </div>
            </div>

            {/* Input Field */}
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-5 w-5 text-[#414c66]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about a government scheme, eligibility criteria, or required certificates..."
                className="w-full rounded-lg border-2 border-[#17234d] bg-[#ffffff] py-3.5 pl-11 pr-28 text-sm font-medium text-[#17234d] placeholder-[#414c66]/60 focus:border-[#2846e8] focus:ring-2 focus:ring-[#c7d4ff] focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="btn-press absolute right-2 inline-flex items-center gap-1.5 rounded-md border border-[#17234d] bg-[#2846e8] px-4 py-2 text-xs font-bold text-[#ffffff] shadow-solid-sm hover:bg-[#1f37b8] disabled:opacity-50"
              >
                {loading ? (
                  <span>Searching...</span>
                ) : (
                  <>
                    <span>Submit</span>
                    <Send className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-xs text-red-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Gateway Connection Error</p>
              <p className="mt-1 leading-relaxed">{error}</p>
              <p className="mt-2 text-[11px] text-red-700">
                Note: Ensure the backend stack is running via <code>docker compose up</code> and your <code>.env</code> file contains valid <code>OPENROUTER_API_KEY</code> and <code>OPENAI_API_KEY</code>.
              </p>
            </div>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <div className="rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-6 space-y-4 shadow-solid-sm">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <div className="pt-4 border-t border-[#17234d]/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        )}

        {/* Answer Result View */}
        {answerData && !loading && (
          <div className="rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-6 sm:p-8 shadow-solid-sm space-y-6">
            <div className="flex items-center justify-between border-b border-[#17234d]/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2846e8] text-[#ffffff]">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h2 className="text-xl font-extrabold text-[#17234d]">
                  Grounded Policy Answer
                </h2>
              </div>
              <span className="rounded-md bg-[#e8ec97] px-2.5 py-0.5 text-xs font-bold text-[#17234d]">
                Generated from Ingested Documents
              </span>
            </div>

            {/* Answer Text */}
            <div className="prose max-w-none text-sm text-[#17234d] leading-relaxed whitespace-pre-wrap">
              {answerData.answer}
            </div>

            {/* Sources & Excerpts */}
            {answerData.sources && answerData.sources.length > 0 && (
              <div className="pt-6 border-t border-[#17234d]/10 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#414c66] flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[#2846e8]" />
                  <span>Cited Primary Source Passages ({answerData.sources.length})</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  {answerData.sources.map((src, i) => (
                    <div
                      key={src.id || i}
                      className="rounded-lg border border-[#17234d]/15 bg-[#f4f6fb] p-4 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-[#2846e8]">
                        <span>
                          Source #{i + 1}: {src.metadata?.scheme_name || src.metadata?.source || 'Policy Document'}
                        </span>
                        {src.score !== undefined && (
                          <span className="rounded bg-[#c7d4ff] px-1.5 py-0.5 text-[#17234d]">
                            Score: {src.score.toFixed(3)}
                          </span>
                        )}
                      </div>
                      <p className="text-[#17234d] font-sans leading-relaxed">
                        "{src.text}"
                      </p>
                      {src.metadata?.department && (
                        <p className="text-[10px] text-[#414c66]">
                          Department: {src.metadata.department}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Semantic Retrieve Result View */}
        {retrieveData && !loading && (
          <div className="rounded-xl border-2 border-[#17234d] bg-[#ffffff] p-6 sm:p-8 shadow-solid-sm space-y-6">
            <div className="flex items-center justify-between border-b border-[#17234d]/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#17234d] text-[#e8ec97]">
                  <Layers className="w-4 h-4" />
                </span>
                <h2 className="text-xl font-extrabold text-[#17234d]">
                  Retrieved Policy Passages
                </h2>
              </div>
              <span className="text-xs font-bold text-[#414c66]">
                Query: "{retrieveData.query}"
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {retrieveData.results?.map((res, i) => (
                <div
                  key={res.id || i}
                  className="rounded-lg border-2 border-[#17234d]/15 bg-[#ffffff] p-4 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold text-[#2846e8]">
                      Chunk #{res.metadata?.chunk_index ?? i} · {res.metadata?.source || 'Document'}
                    </span>
                    <span className="rounded bg-[#e8ec97] px-2 py-0.5 font-bold text-[#17234d]">
                      Similarity Score: {res.score?.toFixed(4)}
                    </span>
                  </div>
                  <p className="text-[#17234d] leading-relaxed font-sans font-medium">
                    "{res.text}"
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-[#414c66] pt-1">
                    {res.metadata?.scheme_name && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        Scheme: {res.metadata.scheme_name}
                      </span>
                    )}
                    {res.metadata?.department && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        Dept: {res.metadata.department}
                      </span>
                    )}
                    {res.metadata?.release_date && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        Date: {res.metadata.release_date}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State before search */}
        {!loading && !answerData && !retrieveData && !error && (
          <div className="rounded-xl border-2 border-dashed border-[#17234d]/20 bg-[#ffffff] p-8 text-center space-y-3">
            <BookOpen className="w-8 h-8 text-[#2846e8] mx-auto" />
            <h3 className="text-base font-bold text-[#17234d]">
              Ready for your civic policy inquiry
            </h3>
            <p className="text-xs text-[#414c66] max-w-md mx-auto">
              Enter your question above to query available policy documents. All answers are grounded in documents ingested into the vector database.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}


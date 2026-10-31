/**
 * Gateway and service endpoints.
 * In development, Vite's dev proxy forwards `/api` and `/health` to `http://localhost:8000`.
 * In production or custom setups, `VITE_API_BASE_URL` can override the base origin.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const ENDPOINTS = {
  HEALTH: `${API_BASE_URL}/health`,
  RAG_HEALTH: `${API_BASE_URL}/api/rag/health`,
  PSS_HEALTH: `${API_BASE_URL}/api/pss/health`,
  RAG_ASK: `${API_BASE_URL}/api/rag/ask`,
  RAG_RETRIEVE: `${API_BASE_URL}/api/rag/retrieve`,
  RAG_INGEST: `${API_BASE_URL}/api/rag/ingest`,
};


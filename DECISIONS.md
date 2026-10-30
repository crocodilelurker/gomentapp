# Decisions

## 2026-10-30 — Microservices foundation

- **Architecture:** Microservices, one folder per service, so each team can own its service independently.
- **Orchestration:** A single root `docker-compose.yml` runs every service in one stack/network.
- **Gateway:** A custom Express `api-gateway` instead of a production gateway (Kong, Nginx, etc.). It is the only service with published `ports`; every other service uses `expose` only.
- **Routing config:** All gateway → service mappings live in `api-gateway/src/constants/routes.js` (`path`, `target`, `rewriteTo`).
- **Ports:** Every container listens on `8000` internally. Services reach each other by compose service name (e.g. `http://policy-scheme-service:8000`).
- **Global env:** One root `.env` is loaded into every service via `env_file`. `.env` is gitignored and `.env.example` is committed as the template.
- **Proxy library:** `http-proxy-middleware` is pinned to v3. v4 is ESM-only and Jest's CommonJS runtime can't load it without experimental flags.
- **Gateway body handling:** The gateway has no body parser, so request bodies stream through to services unchanged.
- **Runtime:** `node:24-alpine` images run as the non-root `node` user. Express 5.
- **Testing:** Jest + Supertest. Gateway tests forward to a real local upstream server instead of mocks.
- **Startup order:** `policy-scheme-service` has a `/health` healthcheck, and the gateway waits for it to be healthy (`depends_on: service_healthy`).

## 2026-10-30 — rag-service

- **Language/framework:** Python 3.12 + FastAPI + uvicorn. It's the first non-Node service; the gateway treats it like any other (`/api/rag` → `http://rag-service:8000`).
- **Pipeline shape:** Five explicit steps, one module each (ingestion, chunking, embedding, vector store, generation), orchestrated by `RagService`.
- **Input format:** UTF-8 `.txt` only for now. Non-UTF-8 is rejected (400) rather than guessed, to avoid corrupted characters.
- **Chunking:** Custom recursive splitter (no LangChain dependency). Defaults are 500 chars with 50 chars of word-aligned overlap, and the overlap counts toward the chunk size limit.
- **Embeddings (superseded below):** `Qwen/Qwen3-Embedding-0.6B` via sentence-transformers, run locally (no API key). It uses the model's `query` prompt for questions and normalized vectors. CPU-only PyTorch in Docker. The model loads lazily on first use.
- **Vector store:** ChromaDB `PersistentClient` inside the service (no separate DB container), cosine space, persisted in a named volume. Telemetry is off.
- **LLM:** OpenAI `gpt-4o-mini` via the Responses API, temperature 0, grounded "answer ONLY from excerpts" instructions.
- **Idempotent ingest:** The document id is a SHA-256 of the sanitized text, and a document's old chunks are deleted before re-indexing.
- **Env layering:** Shared keys (`OPENAI_API_KEY`, service URLs) go in the root `.env`. rag-service-specific settings go in `rag-service/.env`, loaded second so it wins.
- **Testing:** Real in-memory ChromaDB. A deterministic word-hashing embedder and a recording generator stand in for the embedding and LLM providers, so tests run offline.

## 2026-10-30 — rag-service embeddings moved to OpenRouter (Nemotron)

- **Embeddings:** NVIDIA Nemotron via OpenRouter's OpenAI-compatible `/embeddings` endpoint, replacing local Qwen. The default is `nvidia/nemotron-3.5-embed-1b:free` (newest, multilingual, free tier), configurable with `EMBEDDING_MODEL`.
- **Client:** The existing `openai` SDK with `base_url=https://openrouter.ai/api/v1`, so no new dependency. `sentence-transformers` and PyTorch are removed, which makes the Docker image much smaller and drops the model-cache volume.
- **Query vs document:** Requests send OpenRouter's `input_type` (`search_document` for chunks, `search_query` for questions). Chunks are embedded in batches of 64.
- **Keys:** `OPENROUTER_API_KEY` is in the global `.env` next to `OPENAI_API_KEY`. Generation stays on OpenAI `gpt-4o-mini`.
- **Errors:** A missing embedding key returns `503` on `/ingest`, `/retrieve` and `/ask`, and OpenRouter failures return `502`.

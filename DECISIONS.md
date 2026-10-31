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

## 2026-10-31 — policy-scheme-service: storage, catalog and vector linking

- **Three stores, each with one job:** MinIO holds the raw and parsed files, a relational catalog holds provenance, metatags and status, and ChromaDB holds only chunks and embeddings plus `document_id`. Binary files never go in a database.
- **Content addressing:** `document_id` = SHA-256 of the raw bytes. It is the object key (`raw/<id>.<ext>`, `parsed/<id>.txt`), the catalog primary key and the chunk pointer in the vector DB. User file names are display-only (base name, control characters removed).
- **Idempotency:** An identical file is never stored or embedded twice (`200 duplicate: true`). Only `FAILED` documents are retried on re-upload, and `POST /policies/:id/reindex` is the manual retry.
- **Write order:** Objects are written first and the catalog row second, then indexing runs. A catalog row always points to objects that exist, and writing the same object again is harmless because keys are content addressed.
- **Object storage image:** `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`. Official `minio/minio` images are no longer published on Docker Hub, and `bitnami/minio` moved to the frozen `bitnamilegacy`. pgsty is a maintained community build of MinIO with the same CLI.
- **S3 client:** `@aws-sdk/client-s3` v3 (the Node equivalent of boto3) with path-style addressing, and checksums only when required, for compatibility with non-AWS servers. Moving to AWS S3 or Cloudflare R2 is a config change only.
- **Credentials:** MinIO root user/password live in the global `.env`. Compose maps them to the service's generic `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. A dedicated MinIO service account is a production follow-up.
- **Catalog engine:** SQLite via the built-in `node:sqlite` (no native dependency), stored in the `policy-catalog-data` volume. The `document_catalog` schema follows the agreed ledger and adds metatag columns, `size_bytes`, `chunk_count`, `error_message` and `updated_at`. Moving to PostgreSQL later means swapping only `DocumentCatalog`.
- **Extraction location:** policy-scheme-service extracts text (for `.txt`: strict UTF-8 decode) and stores it under `parsed/`. rag-service still does sanitization, chunking and embedding. New formats (PDF/DOCX) are added as entries in `lib/fileTypes.js`.
- **Indexing is synchronous (superseded below):** Upload waited for rag-service and returned `502` on indexing failure.
- **Originals are served through the service:** `/policies/:id/file` streams from MinIO through the gateway, because MinIO is internal, so presigned URLs would not reach clients.
- **rag-service contract:** `/ingest` accepts `document_id` (pattern `^[A-Za-z0-9_-]{1,128}$`) and `category`. Its fallback id is now the SHA-256 of the raw bytes, matching policy-scheme-service.
- **Testing:** Real SQLite (in memory and on a temp file) and a real local HTTP server for the rag client. A command-recording fake S3 client and in-memory storage/rag stand-ins are used so tests need no MinIO.

## 2026-10-31 — Policy summaries (Eligibility / Benefits / Requirements)

- **Fixed layout:** Every summary has three numbered, point-wise sections: 1 Eligibility (Who are eligible), 2 Benefits (What are the benefits), 3 Requirements (What are the required documents or proofs).
- **Grounding:** `gpt-4o-mini` at temperature 0 with "use ONLY the document" instructions. A section the document doesn't cover is an empty list (shown as "Not stated in the document."), never a guess.
- **Reliable shape:** OpenAI structured outputs (`json_schema`, `strict: true`) force exactly three string arrays. Output is still validated, and points are cleaned of bullets/numbering, extra whitespace, empties and case-insensitive duplicates. Uppercase markers such as "(SC)" are kept as content.
- **Long documents:** If the text is longer than `SUMMARY_MAX_CHARS` (default 60000), it is summarised in parts (500-char overlap), then a merge call combines the parts and removes duplicates.
- **Where:** rag-service `POST /summarize` generates the summary (it owns the OpenAI setup). policy-scheme-service calls it on upload, stores `summaries/<sha256>.json` in MinIO, and tracks `summary_status` / `summary_path` / `summary_error` in the catalog.
- **Failure isolation:** A failed summary never fails the upload (`summary_status: FAILED`), and indexing and summarising run independently. Re-upload retries only failed steps, and `POST /policies/:id/summarize` regenerates on demand.
- **Formats:** Stored as JSON, which is the canonical form. Markdown is rendered on request (`?format=markdown`).
- **Catalog migration:** New columns are added with `ALTER TABLE` when an older catalog file is opened. Older rows have `summary_status = NULL` and are summarised on their next re-upload or via `/summarize`.

## 2026-10-31 — Background processing for indexing and summaries

- **Async uploads:** `POST /policies` returns `202 Accepted` once the files are in MinIO and the catalog row exists. Indexing (`INDEX`) and summarising (`SUMMARIZE`) run as separate background jobs.
- **Queue choice:** A durable job table (`processing_jobs`) in the existing SQLite catalog, plus an in-process worker. There are no new containers (Redis/BullMQ etc.), and queued work survives restarts. Moving to a dedicated queue later only means replacing `JobQueue`/`JobWorker`.
- **Visible state:** Documents (`extraction_status`, `summary_status`) and jobs share one lifecycle: `PENDING → PROCESSING → COMPLETED | FAILED`. `GET /policies/:id/status` gives one `processing_status`, each step's status and error, and the document's jobs. `GET /jobs?status=…` shows the queue.
- **Retries:** Up to `JOB_MAX_ATTEMPTS` (default 3) with exponential backoff (`JOB_RETRY_BASE_MS` × 2^(attempt−1): 10s, 20s). While waiting, the step is `PENDING` with the last error. 4xx responses from rag-service and missing stored files are permanent and fail immediately.
- **No duplicate work:** At most one active job per document and step. Re-uploads, `/reindex` and `/summarize` return the existing queued or running job instead of adding another.
- **Concurrency:** `JOB_CONCURRENCY` (default 1), to respect rate limits on free OpenRouter models. The worker wakes as soon as a job is queued; the poll interval (`JOB_POLL_INTERVAL_MS`) only catches due retries.
- **Crash safety:** On startup, jobs and steps left `PROCESSING` go back to `PENDING`. On `SIGTERM` the worker stops claiming jobs and lets running ones finish.
- **Schema upgrade:** Adding `PROCESSING` changes a CHECK constraint, which SQLite can't alter, so older catalog files are rebuilt once in a transaction when opened.
- **API changes:** `/reindex` and `/summarize` now return `202 { document, job }`. The synchronous `502` responses (`IndexingError`, `SummaryError`) are removed, and failures show up in the status instead.
- **Test fixture:** `policy-scheme-service/tests/fixtures/sample-policy.txt` is fictional test data, created at the user's explicit request. It is labelled as fictional inside the file and is used by an end-to-end route test and for manual `curl` testing.

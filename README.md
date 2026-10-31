# gomentapp
README.md
This is a hackathon repo 
The theme is "Civic Pulse, Digital Governance & Public Information"


## Folder Structure

```
.
├── docker-compose.yml        # Runs all services in one stack
├── .env.example              # Template for the GLOBAL .env shared by every service
├── test-reports/             # runN.md — per-iteration tester briefs and results
├── api-gateway/              # Express gateway — the ONLY service exposed to the host
│   ├── src/
│   │   ├── constants/routes.js   # Gateway path -> internal service route map
│   │   ├── app.js
│   │   └── server.js
│   └── tests/
├── frontend/                 # React (Vite) civic application & landing page
│   ├── src/
│   ├── tests/
│   ├── server.js             # Minimal static asset runner & health check
│   └── Dockerfile
├── policy-scheme-service/    # Express — policy upload, storage & catalog — internal only
│   ├── .env.example          # S3/MinIO endpoint + bucket, catalog path, upload limit
│   ├── src/
│   │   ├── catalog/documentCatalog.js  # SQLite metadata ledger (document_catalog)
│   │   ├── storage/s3ObjectStore.js    # S3-compatible object storage (MinIO)
│   │   ├── clients/ragClient.js        # Sends parsed text to rag-service
│   │   ├── services/policyService.js   # Upload → store → catalogue → queue; runs the background jobs
│   │   ├── jobs/jobQueue.js            # Durable job queue (SQLite processing_jobs table)
│   │   ├── jobs/jobWorker.js           # Background worker: runs queued jobs, retries, concurrency
│   │   ├── summary/summaryFormat.js    # 3-section summary layout + Markdown rendering
│   │   ├── validation/policyMetadata.js # Metatag rules
│   │   ├── lib/                         # SHA-256 hashing, file types + text extraction
│   │   ├── app.js                       # HTTP routes
│   │   ├── config.js
│   │   └── server.js
│   └── tests/
└── rag-service/              # Python (FastAPI) RAG pipeline — internal only
    ├── .env.example          # rag-service-only settings (chunking, embeddings, Chroma, model)
    ├── app/
    │   ├── pipeline/
    │   │   ├── ingestion.py      # Step 1 — UTF-8 reading + sanitization
    │   │   ├── chunking.py       # Step 2 — boundary-aware chunks, overlap, metadata
    │   │   ├── embedding.py      # Step 3 — Nemotron embeddings via OpenRouter
    │   │   ├── vector_store.py   # Steps 3.3 & 4 — ChromaDB index + cosine top-K
    │   │   ├── generation.py     # Step 5 — grounded prompt + OpenAI gpt-4o-mini
    │   │   └── summarization.py  # 3-section point-wise policy summaries
    │   ├── service.py        # Orchestrates the five steps
    │   ├── api.py            # HTTP endpoints
    │   ├── config.py         # Env-driven settings
    │   └── main.py           # Production wiring (uvicorn entrypoint)
    └── tests/
```

## How to install

Prerequisites: Docker (with Compose v2), plus Node.js 24+ and Python 3.12+ for local development.

```bash
cp .env.example .env                          # then set OPENAI_API_KEY, OPENROUTER_API_KEY, MINIO_ROOT_USER/PASSWORD
cp rag-service/.env.example rag-service/.env
cp policy-scheme-service/.env.example policy-scheme-service/.env
docker compose up --build                     # gateway available at http://localhost:8000
```

Run a service's unit tests locally:

```bash
cd api-gateway && npm install && npm test
cd policy-scheme-service && npm install && npm test
cd frontend && npm install && npm test
cd rag-service && python3 -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements-dev.txt && pytest
```

The policy-scheme-service tests use a real in-memory SQLite catalog, a real local HTTP server in place of rag-service (client tests), a fake S3 client that records commands (storage adapter tests), and small in-memory stand-ins for storage and rag-service (service and route tests). They need no MinIO.

The rag-service tests use a real in-memory ChromaDB, a small deterministic word-hashing embedder in place of OpenRouter, and a recording generator in place of OpenAI. They run offline and need no API keys.

### Adding a new service

1. Create `<name>-service/` with its own `Dockerfile`, `src/` and `tests/` (copy the layout of an existing service). It listens on port `8000` inside its container.
2. Add it to `docker-compose.yml` with `env_file: .env` and `expose: ["8000"]` — **do not** add `ports`.
3. Add its internal URL (`http://<name>-service:8000`) to `.env.example`, and add it to `SERVICE_URLS` in `api-gateway/src/constants/routes.js`.
4. Add a mapping entry to `ROUTES` in that same file.

### Route mapping

`api-gateway/src/constants/routes.js`:

```js
{ path: '/api/pss', target: SERVICE_URLS.POLICY_SCHEME_SERVICE, rewriteTo: '' }
// GET /api/pss/health -> GET http://policy-scheme-service:8000/health
```

The gateway strips `path` and puts `rewriteTo` in its place before forwarding.

## policy-scheme-service

The front door for policy documents. Each document is split across three stores, and binary files are never put in a database:

| Layer | Technology | Holds |
| --- | --- | --- |
| Object storage | MinIO (`pgsty/minio`, S3 API) | `raw/<sha256>.txt` (the original upload, never changed), `parsed/<sha256>.txt` (the extracted text) and `summaries/<sha256>.json` (the summary) |
| Metadata catalog | SQLite `document_catalog` + `processing_jobs` (`policy-catalog-data` volume) | Provenance, metatags, size, storage paths, `extraction_status` and `summary_status` (`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`), chunk count, errors, and the background job queue |
| Vector DB | ChromaDB in rag-service | Chunks and embeddings only. Every chunk carries `document_id` |

`document_id` is the **SHA-256 of the raw file bytes**. It is the object key, the catalog primary key and the vector-DB pointer, all at once.

**Upload flow** (`POST /api/pss/policies`). It returns `202 Accepted` as soon as the file is safely stored:
1. Check the file type (`.txt`) and size (≤ `MAX_UPLOAD_BYTES`), then validate the metatags.
2. Extract the text (strict UTF-8, BOM stripped, `\n` line endings, NFC).
3. Compute the SHA-256. **If it is already catalogued, return `200 duplicate: true`** with no new storage or processing. Only steps that `FAILED` are queued again (then `202`).
4. Write the raw and parsed objects to MinIO, then insert the catalog row (both steps `PENDING`).
5. Queue two background jobs and respond `202` with the document and the jobs:
   - **`INDEX`**: send the parsed text, `document_id` and metatags to rag-service `/ingest`, then record `chunk_count`.
   - **`SUMMARIZE`**: ask rag-service `/summarize` and store `summaries/<sha256>.json`.

### Background processing

A worker inside policy-scheme-service runs the jobs. It starts a job as soon as one is queued, runs at most `JOB_CONCURRENCY` at a time, and its `JOB_POLL_INTERVAL_MS` timer only picks up retries that have become due.

Each step (`extraction_status` / `summary_status` on the document, `status` on the job) moves through:

```
PENDING ──► PROCESSING ──► COMPLETED
   ▲             │
   └── retry ────┤  (after 10s, 20s, … up to JOB_MAX_ATTEMPTS)
                 └──► FAILED   (last attempt used, or an error that retrying can't fix, e.g. a 4xx from rag-service)
```

- While a retry is waiting, the step is `PENDING` and its error field holds the last error.
- Indexing and summarising are independent: one failing never blocks the other.
- Jobs live in SQLite (`processing_jobs`), so queued work survives a restart. Jobs that were `PROCESSING` during a shutdown are re-queued on startup. On `SIGTERM`, running jobs finish first.
- **Following progress:** `GET /api/pss/policies/:document_id/status` returns one `processing_status` (`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`; `INCOMPLETE` if a summary was never generated), each step's status and error, and the document's jobs with attempts and timestamps. `GET /api/pss/jobs?status=PROCESSING` shows what the worker is doing right now.

```bash
curl http://localhost:8000/api/pss/policies/<document_id>/status
curl "http://localhost:8000/api/pss/jobs?status=PROCESSING"
```

**Sample file for manual testing:** [policy-scheme-service/tests/fixtures/sample-policy.txt](policy-scheme-service/tests/fixtures/sample-policy.txt) is a small **fictional** policy with all three summary sections, labelled as test data inside the file. Never present it as a real scheme.

```bash
curl -F file=@policy-scheme-service/tests/fixtures/sample-policy.txt \
  -F scheme_name="Sample Village Solar Pump Assistance Scheme" \
  -F department="Sample Department of Testing" -F release_date=2026-01-15 \
  http://localhost:8000/api/pss/policies
```

### Summary

Every policy gets a summary in three point-wise sections, generated by `gpt-4o-mini` from the document text only:

1. **Eligibility** (Who are eligible)
2. **Benefits** (What are the benefits)
3. **Requirements** (What are the required documents or proofs)

Points are one fact each, with numbers and dates kept as written. A section the document does not cover is empty, and Markdown shows "Not stated in the document." for it. Documents longer than `SUMMARY_MAX_CHARS` (rag-service) are summarised in parts, and the parts are then merged without duplicates.

```bash
curl http://localhost:8000/api/pss/policies/<document_id>/summary                    # JSON
curl "http://localhost:8000/api/pss/policies/<document_id>/summary?format=markdown"  # Markdown
```

### Metatags (multipart form fields)

| Field | Required | Rule |
| --- | --- | --- |
| `scheme_name` | yes | ≤ 200 chars |
| `department` | yes | ≤ 200 chars |
| `release_date` | no | `YYYY-MM-DD`, a real calendar date |
| `category` | no | ≤ 100 chars |
| `language` | no | Language code, e.g. `en`, `hi-IN` |
| `jurisdiction` | no | ≤ 100 chars (e.g. central / state name) |
| `source_url` | no | `http(s)` URL of the official source |

`scheme_name`, `department`, `release_date` and `category` are also copied onto every chunk in the vector DB.

### Endpoints (through the gateway at `/api/pss`)

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/pss/policies` | multipart `file` + metatags. `202` stored and jobs queued (`{ document, duplicate, jobs }`), `200` duplicate with nothing to redo, `400` bad/empty/non-UTF-8 file, `413` too large, `415` not `.txt`, `422` invalid metatags, `503` object storage down |
| GET | `/api/pss/policies/:document_id/status` | Background processing status: `processing_status`, `indexing`, `summary`, `jobs[]` |
| GET | `/api/pss/jobs` | Background jobs, newest first. Filter: `status` (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`). `limit` 1–100 |
| GET | `/api/pss/policies` | Catalog, newest first. Filters: `department`, `category`, `status`. Paging: `limit` (1–100, default 50), `offset` |
| GET | `/api/pss/policies/:document_id` | One catalog record |
| GET | `/api/pss/policies/:document_id/file` | Download the original file (original file name) |
| GET | `/api/pss/policies/:document_id/parsed` | Download the parsed text |
| POST | `/api/pss/policies/:document_id/reindex` | Queue re-indexing from the stored parsed text. `202 { document, job }`. An already queued or running job is returned instead of a duplicate |
| GET | `/api/pss/policies/:document_id/summary` | The 3-section summary as JSON (`sections[]` with `number`, `title`, `question`, `points`). `?format=markdown` returns Markdown. `404` with `summary_status` / `summary_error` while the summary is `PENDING` / `PROCESSING`, or if it `FAILED` |
| POST | `/api/pss/policies/:document_id/summarize` | Queue summary regeneration. `202 { document, job }` |

```bash
curl -F file=@<policy>.txt -F scheme_name="<scheme>" -F department="<dept>" -F release_date=<YYYY-MM-DD> \
  http://localhost:8000/api/pss/policies
```

A `document_id` returned in rag-service `sources[].metadata` can be used directly with `/api/pss/policies/:document_id/file` to show citizens the original official document.

Notes:
- MinIO is internal only. To look inside it: `docker compose exec minio mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"`, then `docker compose exec minio mc ls --recursive local/policies`.
- The bucket (`S3_BUCKET`, default `policies`) is created automatically on the first upload.
- Switching to AWS S3 or Cloudflare R2 is a config change only (`S3_ENDPOINT`, `S3_REGION`, credentials, `S3_FORCE_PATH_STYLE`).

## rag-service

A five-step RAG pipeline for policy documents (`.txt`, UTF-8):

1. **Ingestion & sanitization**: decode as UTF-8 (BOM-safe, NFC-normalized), strip control characters, extra whitespace, scanning specks and page numbers, re-join hyphenated words and hard-wrapped lines, and keep bullets and numbered items on their own lines.
2. **Semantic chunking**: recursive split on paragraphs → lines → sentences (incl. `।`) → clauses → words, with `CHUNK_OVERLAP` characters of word-aligned overlap. Every chunk, overlap included, is ≤ `CHUNK_SIZE`. Each chunk is tagged with `source`, `scheme_name`, `department`, `release_date`, `document_id`, `chunk_index` and `total_chunks`.
3. **Embedding & indexing**: `EMBEDDING_MODEL` on OpenRouter (default `nvidia/nemotron-3.5-embed-1b:free`, multilingual) embeds chunks with `input_type: search_document`, in batches of 64. Vectors are stored in a persistent ChromaDB collection using cosine distance.
4. **Retrieval**: the query is embedded with the same model using `input_type: search_query`, and the top `RAG_TOP_K` chunks are returned by cosine similarity.
5. **Generation**: a grounded prompt (strict instructions + numbered, source-labelled excerpts + question) is sent to `OPENAI_MODEL` (default `gpt-4o-mini`) at temperature 0.

### Endpoints (through the gateway at `/api/rag`)

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/api/rag/health` | – | Service status |
| POST | `/api/rag/ingest` | multipart: `file` (.txt), optional `scheme_name`, `department`, `release_date`, `category`, `document_id` | `201 { document_id, chunks }` |
| POST | `/api/rag/retrieve` | JSON `{ query, top_k? }` (top_k 1–20) | Top-K chunks with `score` and `metadata` |
| POST | `/api/rag/ask` | JSON `{ query, top_k? }` | `{ answer, sources }` from gpt-4o-mini |
| POST | `/api/rag/summarize` | JSON `{ text, scheme_name? }` | `{ eligibility[], benefits[], requirements[] }`: point lists grounded only in `text` (strict JSON-schema output, points cleaned of bullets, numbering and duplicates) |

```bash
curl -F file=@policy.txt -F scheme_name="<scheme>" -F department="<dept>" -F release_date=2026-01-01 \
  http://localhost:8000/api/rag/ingest
curl -H 'Content-Type: application/json' -d '{"query":"Who is eligible?"}' http://localhost:8000/api/rag/ask
```

Notes:
- Normally policy-scheme-service calls `/ingest` and passes its `document_id`, so chunks point back to the stored original. Without one, the id defaults to the SHA-256 of the uploaded bytes. Re-ingesting the same id replaces its chunks instead of duplicating them.
- Embeddings need `OPENROUTER_API_KEY`. Without it, `/ingest`, `/retrieve` and `/ask` return `503`. OpenRouter errors (including rate limits on `:free` models) return `502`.
- Changing `EMBEDDING_MODEL` changes the vector size. Use a new `CHROMA_COLLECTION` (or remove the `rag-chroma-data` volume) and re-ingest.
- `/ask` and `/summarize` also need `OPENAI_API_KEY`: `503` until it is set, `502` if OpenAI returns an error.

## Overview of current State

- `api-gateway` (Express): published on host port `8000`, health at `GET /health`, proxies mapped prefixes to internal services, returns `404` for unmapped paths and `502` if a service is unreachable.
- `policy-scheme-service` (Express): internal only, reachable at `/api/pss/*`. Uploads `.txt` policies with metatags, stores the raw and parsed files in MinIO under their SHA-256, catalogues them in SQLite, de-duplicates identical files, and returns `202` immediately. Indexing into the vector DB (via rag-service) and the 3-section point-wise summary (Eligibility, Benefits, Requirements) then run as durable background jobs, with automatic retries. Progress is visible at `/policies/:id/status` and `/jobs`. Original files and summaries can be fetched by `document_id`.
- `minio`: internal only S3-compatible object storage, data in the `minio-data` volume.
- `rag-service` (Python/FastAPI): internal only, reachable at `/api/rag/*`. Ingests `.txt` policies into ChromaDB with Nemotron embeddings (via OpenRouter), serves top-K retrieval, and answers questions with gpt-4o-mini. ChromaDB data persists in a named volume.
- `frontend` (React/Vite): internal only, health at `GET /health`, serves civic landing page and policy inquirer app, reachable through the gateway at `/`.
- Every container listens on port `8000` internally; services reach each other by compose service name.
- The global `.env` is loaded into every service through `env_file`. A service may add its own `<service>/.env` after it (rag-service and policy-scheme-service do).

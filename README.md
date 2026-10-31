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
├── policy-scheme-service/    # Express service — internal only
│   ├── src/
│   │   ├── app.js
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
    │   │   └── generation.py     # Step 5 — grounded prompt + OpenAI gpt-4o-mini
    │   ├── service.py        # Orchestrates the five steps
    │   ├── api.py            # HTTP endpoints
    │   ├── config.py         # Env-driven settings
    │   └── main.py           # Production wiring (uvicorn entrypoint)
    └── tests/
```

## How to install

Prerequisites: Docker (with Compose v2), plus Node.js 24+ and Python 3.12+ for local development.

```bash
cp .env.example .env                          # then set OPENAI_API_KEY and OPENROUTER_API_KEY
cp rag-service/.env.example rag-service/.env
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

The rag-service tests use a real in-memory ChromaDB, a small deterministic word-hashing embedder in place of OpenRouter, and a recording generator in place of OpenAI. They run offline and need no API keys.

### Adding a new service

1. Create `<name>-service/` (copy `policy-scheme-service/` as a starting point). It listens on port `8000` inside its container.
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
| POST | `/api/rag/ingest` | multipart: `file` (.txt), optional `scheme_name`, `department`, `release_date` | `201 { document_id, chunks }` |
| POST | `/api/rag/retrieve` | JSON `{ query, top_k? }` (top_k 1–20) | Top-K chunks with `score` and `metadata` |
| POST | `/api/rag/ask` | JSON `{ query, top_k? }` | `{ answer, sources }` from gpt-4o-mini |

```bash
curl -F file=@policy.txt -F scheme_name="<scheme>" -F department="<dept>" -F release_date=2026-01-01 \
  http://localhost:8000/api/rag/ingest
curl -H 'Content-Type: application/json' -d '{"query":"Who is eligible?"}' http://localhost:8000/api/rag/ask
```

Notes:
- Re-ingesting identical text replaces its chunks instead of duplicating them (the document id is a hash of the sanitized text).
- Embeddings need `OPENROUTER_API_KEY`. Without it, `/ingest`, `/retrieve` and `/ask` return `503`. OpenRouter errors (including rate limits on `:free` models) return `502`.
- Changing `EMBEDDING_MODEL` changes the vector size. Use a new `CHROMA_COLLECTION` (or remove the `rag-chroma-data` volume) and re-ingest.
- `/ask` also needs `OPENAI_API_KEY`: `503` until it is set, `502` if OpenAI returns an error.

## Overview of current State

- `api-gateway` (Express): published on host port `8000`, health at `GET /health`, proxies mapped prefixes to internal services, returns `404` for unmapped paths and `502` if a service is unreachable.
- `policy-scheme-service` (Express): internal only, health at `GET /health`, reachable through the gateway at `GET /api/pss/health`.
- `rag-service` (Python/FastAPI): internal only, reachable at `/api/rag/*`. Ingests `.txt` policies into ChromaDB with Nemotron embeddings (via OpenRouter), serves top-K retrieval, and answers questions with gpt-4o-mini. ChromaDB data persists in a named volume.
- `frontend` (React/Vite): internal only, health at `GET /health`, serves civic landing page and policy inquirer app, reachable through the gateway at `/`.
- Every container listens on port `8000` internally; services reach each other by compose service name.
- The global `.env` is loaded into every service through `env_file`. A service may add its own `<service>/.env` after it (rag-service does).

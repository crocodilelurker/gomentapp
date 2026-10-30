# Test Run 2 — Tester Brief

**Date issued:** 2026-10-30
**Previous run:** [run1.md](run1.md): 14 / 14 unit tests passed (`api-gateway`, `policy-scheme-service`). No Docker or end-to-end testing has been done yet.

---

## What changed since Run 1

1. **`policy-scheme-service`**: renamed from `core-service`. The health response now reports `"service": "policy-scheme-service"`, and the service is reached through the gateway at `/api/pss`.
2. **`api-gateway`**: has a new route, `/api/rag`, which forwards to `rag-service`.
3. **`rag-service`** (new, Python/FastAPI): a five-step RAG pipeline for policy documents.
   - Step 1: read UTF-8 `.txt` and clean it.
   - Step 2: split into overlapping chunks tagged with metadata.
   - Step 3: embed with **NVIDIA Nemotron via OpenRouter** (`nvidia/nemotron-3.5-embed-1b:free`) and store in ChromaDB.
   - Step 4: return the top-K chunks by cosine similarity.
   - Step 5: answer with **OpenAI `gpt-4o-mini`**, using only the retrieved chunks.
4. **Env files**:
   - Root `.env` has two new keys: `OPENAI_API_KEY` and `OPENROUTER_API_KEY`.
   - New `rag-service/.env` holds the model names, ChromaDB settings, chunk size and overlap, and top-K.

This run covers four parts:
- **A.** All unit tests.
- **B.** The full Docker stack, tested for the first time.
- **C.** rag-service end to end with real API keys.
- **D.** Failure handling.

---

## Before you start

- Docker with Compose v2, Node.js 24+, Python 3.12+.
- An **OpenAI API key** and an **OpenRouter API key**. Do not commit them.
- **At least one real policy document** saved as a UTF-8 `.txt` file, for example an official government scheme guideline copied from the department's website. Note its real scheme name, department and release date. **Do not write or invent a policy document**: answers must be checked against real text.
- For the negative tests:
  - Any `.pdf` file.
  - A `.txt` file saved in a non-UTF-8 encoding (e.g. Latin-1 / Windows-1252 containing `é`).
  - An empty `.txt` file.

---

## A. Unit tests

Run each command from the repo root and record pass/fail counts and duration.

```bash
cd api-gateway && npm install && npm test && cd ..
cd policy-scheme-service && npm install && npm test && cd ..
cd rag-service && python3 -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements-dev.txt && pytest -v && deactivate && cd ..
```

| Service | Test file | Expected tests |
|---|---|---|
| `api-gateway` | `tests/routes.test.js` | 4 (now also validates the new `/api/rag` route) |
| `api-gateway` | `tests/app.test.js` | 8 |
| `policy-scheme-service` | `tests/app.test.js` | 2 |
| `rag-service` | `tests/test_ingestion.py` (Step 1) | 22 |
| `rag-service` | `tests/test_chunking.py` (Step 2) | 13 |
| `rag-service` | `tests/test_embedding.py` (Step 3, OpenRouter) | 8 |
| `rag-service` | `tests/test_vector_store.py` (Steps 3.3, 4) | 4 |
| `rag-service` | `tests/test_generation.py` (Step 5) | 7 |
| `rag-service` | `tests/test_service.py` (all steps together) | 9 |
| `rag-service` | `tests/test_api.py` (HTTP layer) | 18 (including parametrized cases) |
| `rag-service` | `tests/test_config.py` | 2 |
| **Total** | | **97** |

If pytest collects a different number than expected, report it, even if everything passes. The rag-service tests need no API keys and no internet.

---

## B. Docker stack

```bash
cp .env.example .env                           # fill in OPENAI_API_KEY and OPENROUTER_API_KEY
cp rag-service/.env.example rag-service/.env
docker compose up --build -d
docker compose ps
```

| # | Check | How | Expected |
|---|---|---|---|
| B1 | All three containers start and become healthy | `docker compose ps` | `api-gateway`, `policy-scheme-service`, `rag-service` all `running` and `healthy` |
| B2 | Only the gateway is published | `docker compose ps` (PORTS column) | Only `api-gateway` shows `0.0.0.0:8000->8000`. The other two show only `8000/tcp` |
| B3 | Internal services are not reachable from the host | `curl localhost:8001`, or try any other port; there is no direct route | Connection refused. Only port 8000 answers |
| B4 | Gateway health | `curl localhost:8000/health` | `{"service":"api-gateway","status":"ok"}` |
| B5 | policy-scheme-service through gateway | `curl localhost:8000/api/pss/health` | `{"service":"policy-scheme-service","status":"ok"}` |
| B6 | rag-service through gateway | `curl localhost:8000/api/rag/health` | `{"service":"rag-service","status":"ok"}` |
| B7 | Unmapped path | `curl -i localhost:8000/api/nothing` | `404` `{"error":"Route not found"}` |

---

## C. rag-service end to end

Every call below goes **through the gateway** (`localhost:8000/api/rag/...`). Replace `<...>` with the real values for your document.

### C1. Missing keys

Leave `OPENROUTER_API_KEY` empty first, then run `docker compose up -d --force-recreate rag-service`.

| # | Check | Expected |
|---|---|---|
| C1.1 | `POST /ingest` with your policy file | `503`, detail mentions `OPENROUTER_API_KEY` |
| C1.2 | `POST /retrieve` | `503` |
| C1.3 | Set `OPENROUTER_API_KEY` but leave `OPENAI_API_KEY` empty, recreate, ingest, then `POST /ask` | Ingest and retrieve work. `/ask` returns `503` mentioning `OPENAI_API_KEY` |

Set both keys and recreate before continuing.

### C2. Ingestion (Steps 1–3)

```bash
curl -i -F file=@<policy>.txt -F scheme_name="<real scheme name>" \
  -F department="<real department>" -F release_date=<YYYY-MM-DD> \
  localhost:8000/api/rag/ingest
```

| # | Check | Expected |
|---|---|---|
| C2.1 | Ingest a real policy `.txt` | `201` `{ "document_id": "...", "chunks": N }`. Record N and the file size |
| C2.2 | Re-ingest the **same** file | Same `document_id`, same `chunks`. In C3, `top_k=20` must show **no duplicate** chunk ids or texts |
| C2.3 | Ingest a second, different real policy | New `document_id` |
| C2.4 | Upload a `.pdf` | `415` |
| C2.5 | Upload a non-UTF-8 `.txt` | `400` "File must be UTF-8 encoded text" |
| C2.6 | Upload an empty / whitespace-only `.txt` | `400` |
| C2.7 | Ingest without `scheme_name` / `department` / `release_date` | `201`. Those fields are absent from chunk metadata (C3) |
| C2.8 | Large real document (a few MB, if available) | `201`. Note the time taken and any errors |

### C3. Retrieval (Step 4)

```bash
curl -s -H 'Content-Type: application/json' \
  -d '{"query":"<a question the document answers>","top_k":5}' localhost:8000/api/rag/retrieve
```

| # | Check | Expected |
|---|---|---|
| C3.1 | Ask a question the document clearly answers | The top results contain the passage that answers it. Paste the top result and give a relevance judgment |
| C3.2 | Scores | Sorted from highest to lowest. Each result has `id`, `text`, `score`, `metadata` |
| C3.3 | Metadata | `source`, `scheme_name`, `department`, `release_date`, `document_id`, `chunk_index`, `total_chunks` match what you uploaded |
| C3.4 | Chunk quality (read 5–10 chunks) | Each is at most 500 characters. Words aren't cut mid-way. Bullet and numbered lists aren't broken apart where they fit. Consecutive chunks (`chunk_index` n and n+1) share a short overlap. No page numbers or scanning junk |
| C3.5 | Default top-K | Omit `top_k`. You get 4 results |
| C3.6 | Bounds | `top_k: 0` and `top_k: 21` give `422`. `top_k: 20` works. An empty `query` gives `422` |
| C3.7 | Two documents ingested | A question specific to document 2 ranks document 2's chunks first |
| C3.8 | Multilingual (observe only) | Ask the C3.1 question in Hindi or another Indian language. Record whether the right passage still ranks highly. This is an observation, not pass/fail |

### C4. Generation (Step 5)

```bash
curl -s -H 'Content-Type: application/json' \
  -d '{"query":"<question>"}' localhost:8000/api/rag/ask
```

| # | Check | Expected |
|---|---|---|
| C4.1 | Answerable question | Correct, plain-language answer that matches the document. Check it against the real text |
| C4.2 | Question the document doesn't cover (e.g. about a different scheme) | Says the information is unavailable. **No invented facts** |
| C4.3 | Sources | `sources` lists the chunks used, and the answer's claims appear in them |
| C4.4 | Eligibility-style question (age / income / landholding thresholds, if the document has them) | Thresholds quoted correctly |
| C4.5 | Repeat C4.1 three times | Answers are consistent (temperature is 0) |

### C5. Persistence

| # | Check | Expected |
|---|---|---|
| C5.1 | `docker compose restart rag-service`, then retrieve | Same results. The data survived |
| C5.2 | `docker compose down` then `up -d` (no `-v`), then retrieve | Same results |
| C5.3 | `docker compose down -v` then `up -d`, then retrieve | Empty `results`. `/ask` returns "No policy documents have been ingested yet…" |

---

## D. Failure handling

| # | Check | How | Expected |
|---|---|---|---|
| D1 | Downstream service down | `docker compose stop rag-service`, then `curl -i localhost:8000/api/rag/health` | `502` `{"error":"Upstream service unavailable"}`. Start it again afterwards |
| D2 | Invalid OpenRouter key | Set a wrong `OPENROUTER_API_KEY`, recreate, ingest | `502` "The embedding model request failed" |
| D3 | Invalid OpenAI key | Valid OpenRouter key, wrong `OPENAI_API_KEY`, recreate, `/ask` | `/retrieve` works. `/ask` returns `502` "The language model request failed" |
| D4 | Rate limits on the free embedding model | Ingest several documents or send many queries quickly | If OpenRouter rate-limits, the API returns `502`, not a crash. Record when it started |
| D5 | Logs | `docker compose logs rag-service api-gateway` | No unhandled tracebacks, no API keys printed |

---

## Known limitations (do not report as bugs)

- Misspelled OCR headers are not corrected.
- A word that is *really* hyphenated across a line break (e.g. `self-` / `employed`) gets joined into `selfemployed`.
- Only `.txt` is supported. PDF and DOCX are out of scope for this run.
- `:free` OpenRouter models have rate limits set by OpenRouter.
- Changing `EMBEDDING_MODEL` after ingesting needs a fresh collection (`down -v`) and re-ingesting.

---

## Results (tester fills in, same format as Run 1)

**Tester:**
**Date:**
**Overall Status:**

### Summary

| Area | Checks | Passed | Failed | Notes |
|---|---|---|---|---|
| A. Unit — `api-gateway` | 12 | | | |
| A. Unit — `policy-scheme-service` | 2 | | | |
| A. Unit — `rag-service` | 83 | | | |
| B. Docker stack | 7 | | | |
| C. rag-service end to end | 27 | | | |
| D. Failure handling | 5 | | | |

### Detailed results

List every check ID (A, B1–B7, C1.1–C5.3, D1–D5) as PASS / FAIL / OBSERVED, with a note.

### Bugs found

For each bug, give: check ID, steps to reproduce, expected result, actual result, and relevant logs or response body.

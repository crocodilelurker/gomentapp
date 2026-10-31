# Test Report — Run 3

**Date:** 2026-10-31  
**Overall Status:** PASSED (18 / 18 tests passing across Node services)

---

## Summary

| Service | Suites | Passed | Failed | Duration | Status |
|---|---|---|---|---|---|
| `api-gateway` | 2 | 12 | 0 | ~3.82s | PASS |
| `policy-scheme-service` | 1 | 2 | 0 | ~1.66s | PASS |
| `frontend` | 1 | 4 | 0 | ~0.43s | PASS |
| **Total** | **4** | **18** | **0** | **~5.91s** | **PASS** |

---

## Service Breakdown

### `api-gateway`
- **`tests/routes.test.js`**
  - PASS: every route has a path starting with "/"
  - PASS: every route targets a valid http(s) URL
  - PASS: every rewriteTo is empty or starts with "/"
  - PASS: no two routes share the same path
- **`tests/app.test.js`**
  - PASS: GET /health reports the gateway status
  - PASS: strips the gateway prefix and forwards to the target service
  - PASS: replaces the gateway prefix with rewriteTo
  - PASS: forwards a request to the bare prefix as the target root
  - PASS: forwards the JSON request body untouched
  - PASS: routes each prefix to its own target
  - PASS: returns 404 for paths that are not mapped
  - PASS: returns 502 when the target service is unreachable

### `policy-scheme-service`
- **`tests/app.test.js`**
  - PASS: GET /health reports the service status
  - PASS: returns 404 for unknown routes

### `frontend`
- **`tests/server.test.js`**
  - PASS: GET /health reports service status
  - PASS: GET / serves index.html with text/html content-type
  - PASS: GET static asset serves file with correct MIME type
  - PASS: GET client route /app falls back to index.html for SPA


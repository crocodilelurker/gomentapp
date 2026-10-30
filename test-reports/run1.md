# Test Report — Run 1

**Date:** 2026-10-30  
**Overall Status:** PASSED (14 / 14 tests passing)

---

## Summary

| Service | Suites | Passed | Failed | Duration | Status |
|---|---|---|---|---|---|
| `api-gateway` | 2 | 12 | 0 | ~0.73s | PASS |
| `policy-scheme-service` | 1 | 2 | 0 | ~0.56s | PASS |
| **Total** | **3** | **14** | **0** | **~1.29s** | **PASS** |

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


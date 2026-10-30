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

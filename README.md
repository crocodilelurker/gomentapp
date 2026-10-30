# gomentapp
README.md
This is a hackathon repo 
The theme is "Civic Pulse, Digital Governance & Public Information"


## Folder Structure

```
.
├── docker-compose.yml        # Runs all services in one stack
├── .env.example              # Template for the GLOBAL .env shared by every service
├── api-gateway/              # Express gateway — the ONLY service exposed to the host
│   ├── src/
│   │   ├── constants/routes.js   # Gateway path -> internal service route map
│   │   ├── app.js
│   │   └── server.js
│   └── tests/
└── policy-scheme-service/    # Express service — internal only
    ├── src/
    │   ├── app.js
    │   └── server.js
    └── tests/
```

## How to install

Prerequisites: Docker (with Compose v2) and Node.js 24+ for local development.

```bash
cp .env.example .env          # then fill in real values
docker compose up --build     # gateway available at http://localhost:8000
```

Run a service's unit tests locally:

```bash
cd api-gateway && npm install && npm test
cd policy-scheme-service && npm install && npm test
```

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

## Overview of current State

- `api-gateway` (Express): published on host port `8000`, health at `GET /health`, proxies mapped prefixes to internal services, returns `404` for unmapped paths and `502` if a service is unreachable.
- `policy-scheme-service` (Express): internal only, health at `GET /health`, reachable through the gateway at `GET /api/pss/health`.
- Every container listens on port `8000` internally; services reach each other by compose service name.
- The global `.env` is loaded into every service through `env_file`.
// Gateway route map — the single place to wire public URLs to internal services.
//
// A request to `path` on the gateway is forwarded to `target`. The `path` prefix
// is stripped and replaced with `rewriteTo` before forwarding:
//
//   { path: '/api/pss', target: SERVICE_URLS.POLICY_SCHEME_SERVICE, rewriteTo: '' }
//     GET /api/pss/health   ->  GET http://policy-scheme-service:8000/health
//
//   { path: '/api/pss', target: SERVICE_URLS.POLICY_SCHEME_SERVICE, rewriteTo: '/v1' }
//     GET /api/pss/health   ->  GET http://policy-scheme-service:8000/v1/health
//
// Inside the compose stack, services resolve each other by service name.

const SERVICE_URLS = {
  POLICY_SCHEME_SERVICE: process.env.POLICY_SCHEME_SERVICE_URL || 'http://policy-scheme-service:8000',
  RAG_SERVICE: process.env.RAG_SERVICE_URL || 'http://rag-service:8000',
  FRONTEND_SERVICE: process.env.FRONTEND_SERVICE_URL || 'http://frontend:8000',
};

const ROUTES = [
  { path: '/api/pss', target: SERVICE_URLS.POLICY_SCHEME_SERVICE, rewriteTo: '' },
  { path: '/api/rag', target: SERVICE_URLS.RAG_SERVICE, rewriteTo: '' },
  { path: '/', target: SERVICE_URLS.FRONTEND_SERVICE, rewriteTo: '' },
];

module.exports = { SERVICE_URLS, ROUTES };

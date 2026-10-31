const { RagClientError } = require('../errors');
const { SUMMARY_KEYS } = require('../summary/summaryFormat');

// Talks to rag-service: indexing (chunk + embed under our document_id) and point-wise summaries.
class RagClient {
  constructor({ baseUrl, timeoutMs = 120000, summaryTimeoutMs = 300000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.summaryTimeoutMs = summaryTimeoutMs;
    this.fetch = fetchImpl;
  }

  async ingest({ documentId, filename, text, metadata }) {
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain; charset=utf-8' }), filename);
    form.append('document_id', documentId);
    for (const [name, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined && value !== '') form.append(name, String(value));
    }

    const { body, status } = await this.#post('/ingest', { body: form }, this.timeoutMs);
    if (typeof body?.chunks !== 'number') {
      throw new RagClientError('rag-service returned an unexpected response', status);
    }
    return { chunks: body.chunks, documentId: body.document_id };
  }

  // Returns { eligibility: string[], benefits: string[], requirements: string[] }.
  async summarize({ text, schemeName }) {
    const payload = schemeName ? { text, scheme_name: schemeName } : { text };
    const { body, status } = await this.#post(
      '/summarize',
      { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      this.summaryTimeoutMs,
    );
    const valid = SUMMARY_KEYS.every((key) => Array.isArray(body?.[key]) && body[key].every((p) => typeof p === 'string'));
    if (!valid) throw new RagClientError('rag-service returned an invalid summary', status);
    return Object.fromEntries(SUMMARY_KEYS.map((key) => [key, body[key]]));
  }

  async #post(path, init, timeoutMs) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, { method: 'POST', ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new RagClientError(`rag-service is unreachable: ${error.cause?.code ?? error.message}`);
    }

    const raw = await response.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // non-JSON body; reported below
    }

    if (!response.ok) {
      const detail = body?.detail ?? body?.error ?? raw;
      throw new RagClientError(
        `rag-service responded ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
        response.status,
      );
    }
    return { body, status: response.status };
  }
}

module.exports = { RagClient };

// Same contract as RagClient; records each request so tests can assert what reached rag-service.
class RecordingRagClient {
  constructor({ chunks = 3 } = {}) {
    this.calls = []; // ingest requests
    this.summaryCalls = [];
    this.chunks = chunks;
    this.summary = { eligibility: ['eligibility point'], benefits: ['benefit point'], requirements: [] };
    this.error = null; // thrown by ingest
    this.summaryError = null; // thrown by summarize
    this.hold = null; // optional promise both calls wait on, to observe work in progress
  }

  async ingest(request) {
    this.calls.push(request);
    if (this.hold) await this.hold;
    if (this.error) throw this.error;
    return { chunks: this.chunks, documentId: request.documentId };
  }

  async summarize(request) {
    this.summaryCalls.push(request);
    if (this.hold) await this.hold;
    if (this.summaryError) throw this.summaryError;
    return this.summary;
  }
}

module.exports = { RecordingRagClient };

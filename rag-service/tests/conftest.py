import math
import re
import uuid
import zlib

import chromadb
import pytest

from app.pipeline.vector_store import ChromaVectorStore
from app.service import RagService


class HashingEmbedder:
    """Deterministic bag-of-words embedder so tests run offline without calling OpenRouter.

    Texts sharing words get similar vectors, which is enough to exercise retrieval ordering.
    """

    dimensions = 256

    def _embed(self, text):
        vector = [0.0] * self.dimensions
        for word in re.findall(r"\w+", text.lower()):
            vector[zlib.crc32(word.encode()) % self.dimensions] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def embed_documents(self, texts):
        return [self._embed(text) for text in texts]

    def embed_query(self, text):
        return self._embed(text)


class RecordingGenerator:
    """Records the prompts it receives so tests can assert on what reaches the LLM.

    Structured (JSON) calls return queued `json_responses` in order, or three empty sections.
    """

    def __init__(self):
        self.calls = []
        self.json_calls = []
        self.json_responses = []

    def generate(self, instructions, prompt):
        self.calls.append({"instructions": instructions, "prompt": prompt})
        return f"generated answer #{len(self.calls)}"

    def generate_json(self, instructions, prompt, schema_name, schema):
        self.json_calls.append({"instructions": instructions, "prompt": prompt, "schema_name": schema_name, "schema": schema})
        if self.json_responses:
            return self.json_responses.pop(0)
        return {"eligibility": [], "benefits": [], "requirements": []}


@pytest.fixture
def store():
    # EphemeralClient shares state within a process, so isolate each test by collection name.
    return ChromaVectorStore(chromadb.EphemeralClient(), f"test-{uuid.uuid4().hex}")


@pytest.fixture
def embedder():
    return HashingEmbedder()


@pytest.fixture
def generator():
    return RecordingGenerator()


@pytest.fixture
def service(store, embedder, generator):
    return RagService(
        embedder=embedder,
        store=store,
        generator=generator,
        chunk_size=200,
        chunk_overlap=20,
        default_top_k=3,
    )

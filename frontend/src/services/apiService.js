import { ENDPOINTS } from '../constants/api';

/**
 * Ask a natural language question grounded in policy documents.
 * @param {string} query 
 * @param {number} [top_k] 
 */
export async function askQuestion(query, top_k = 5) {
  const response = await fetch(ENDPOINTS.RAG_ASK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k }),
  });

  if (!response.ok) {
    let errorDetail = 'Failed to get answer from policy service';
    try {
      const data = await response.json();
      if (data.detail) errorDetail = data.detail;
      else if (data.error) errorDetail = data.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Perform semantic search for matching policy document chunks.
 * @param {string} query 
 * @param {number} [top_k] 
 */
export async function retrieveChunks(query, top_k = 5) {
  const response = await fetch(ENDPOINTS.RAG_RETRIEVE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k }),
  });

  if (!response.ok) {
    let errorDetail = 'Failed to retrieve policy documents';
    try {
      const data = await response.json();
      if (data.detail) errorDetail = data.detail;
      else if (data.error) errorDetail = data.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Check connectivity of Gateway and internal services.
 */
export async function checkGatewayHealth() {
  try {
    const res = await fetch(ENDPOINTS.HEALTH);
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkRagHealth() {
  try {
    const res = await fetch(ENDPOINTS.RAG_HEALTH);
    return res.ok;
  } catch {
    return false;
  }
}


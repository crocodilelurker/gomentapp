import { useState, useEffect } from 'react';
import { checkGatewayHealth, checkRagHealth } from '../services/apiService';

/**
 * Hook to check live backend connectivity against the actual API gateway.
 * Never reports false positives or fake status.
 */
export function useHealth() {
  const [status, setStatus] = useState({
    gateway: null,
    rag: null,
    loading: true,
  });

  const verifyHealth = async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    try {
      const [gwOk, ragOk] = await Promise.all([
        checkGatewayHealth(),
        checkRagHealth(),
      ]);
      setStatus({
        gateway: gwOk,
        rag: ragOk,
        loading: false,
      });
    } catch {
      setStatus({
        gateway: false,
        rag: false,
        loading: false,
      });
    }
  };

  useEffect(() => {
    verifyHealth();
  }, []);

  return { ...status, refresh: verifyHealth };
}


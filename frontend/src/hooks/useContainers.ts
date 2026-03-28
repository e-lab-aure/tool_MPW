/**
 * Hook pour recuperer et rafraichir la liste des conteneurs Podman.
 * Effectue un polling toutes les 3 secondes et expose les actions
 * start / stop / restart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Container, ContainerAction } from "../types";

const POLL_INTERVAL_MS = 3000;

interface UseContainersReturn {
  containers: Container[];
  loading: boolean;
  error: string | null;
  triggerAction: (id: string, action: ContainerAction) => Promise<void>;
}

export function useContainers(): UseContainersReturn {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Charge la liste des conteneurs depuis l'API. */
  const fetchContainers = useCallback(async () => {
    try {
      const response = await fetch("/api/containers/");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: Container[] = await response.json();
      setContainers(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(`Impossible de joindre l'API : ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Lance une action (start/stop/restart) sur un conteneur. */
  const triggerAction = useCallback(
    async (id: string, action: ContainerAction): Promise<void> => {
      try {
        const response = await fetch(`/api/containers/${id}/${action}`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Rafraichit immediatement la liste apres une action
        await fetchContainers();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur inconnue";
        setError(`Action ${action} echouee : ${message}`);
      }
    },
    [fetchContainers],
  );

  // Charge au montage, puis rafraichit toutes les POLL_INTERVAL_MS ms
  useEffect(() => {
    fetchContainers();
    intervalRef.current = setInterval(fetchContainers, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchContainers]);

  return { containers, loading, error, triggerAction };
}

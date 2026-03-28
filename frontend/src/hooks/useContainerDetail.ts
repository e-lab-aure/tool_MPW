/**
 * Hook pour charger les details d'un conteneur (reseaux, montages, taille).
 * Appele uniquement a la selection d'un conteneur, pas dans le polling principal.
 */

import { useEffect, useState } from "react";
import type { ContainerDetail } from "../types";

interface UseContainerDetailReturn {
  detail: ContainerDetail | null;
  loading: boolean;
  error: string | null;
}

export function useContainerDetail(
  containerId: string | null,
  active: boolean,
): UseContainerDetailReturn {
  const [detail, setDetail] = useState<ContainerDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ne charge que si l'onglet Info est actif et qu'un conteneur est selectionne
    if (!containerId || !active) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/containers/${containerId}/inspect`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ContainerDetail>;
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Erreur inconnue";
          setError(`Impossible de charger les details : ${message}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, active]);

  return { detail, loading, error };
}

/**
 * Hook pour charger et modifier la politique de demarrage automatique des conteneurs.
 * Les policies ne font pas partie du polling principal : elles sont chargees au montage
 * et rafraichies manuellement apres chaque toggle pour ne pas surcharger l'API.
 */

import { useCallback, useEffect, useState } from "react";
import type { AutostartEntry } from "../types";

interface UseAutostartReturn {
  /** Dictionnaire id -> restart_policy ("always" | "no") */
  policies: Record<string, string>;
  /** Dictionnaire id -> mechanism ("restart_policy" | "systemd" | "none") */
  mechanisms: Record<string, string>;
  /** Id du conteneur dont le toggle est en cours, null sinon */
  toggleLoading: string | null;
  /** Message d'erreur du dernier toggle, null sinon */
  toggleError: string | null;
  /** Bascule la politique de demarrage automatique d'un conteneur */
  toggle: (id: string, enabled: boolean) => Promise<void>;
  /** Recharge toutes les policies depuis l'API */
  refresh: () => Promise<void>;
}

export function useAutostart(): UseAutostartReturn {
  const [policies, setPolicies] = useState<Record<string, string>>({});
  const [mechanisms, setMechanisms] = useState<Record<string, string>>({});
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  /** Charge les policies de tous les conteneurs en une seule requete batch. */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/containers/autostart");
      if (!response.ok) return;

      const data: AutostartEntry[] = await response.json();
      const policyMap: Record<string, string> = {};
      const mechanismMap: Record<string, string> = {};
      data.forEach((entry) => {
        policyMap[entry.id] = entry.restart_policy;
        mechanismMap[entry.id] = entry.mechanism;
      });
      setPolicies(policyMap);
      setMechanisms(mechanismMap);
    } catch {
      // Echec non bloquant : l'autostart est une fonctionnalite secondaire
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Active ou desactive l'autostart d'un conteneur.
   * Met a jour l'etat local immediatement pour une UX reactive,
   * sans attendre un rafraichissement complet.
   */
  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      setToggleLoading(id);
      setToggleError(null);
      try {
        const response = await fetch(`/api/containers/${id}/autostart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });

        if (response.ok) {
          setPolicies((prev) => ({
            ...prev,
            [id]: enabled ? "always" : "no",
          }));
        } else {
          // Recuperer le message d'erreur retourne par le backend
          const data = await response.json().catch(() => ({}));
          const message: string = data?.detail ?? `Erreur ${response.status}`;
          setToggleError(message);
        }
      } catch {
        setToggleError("Impossible de joindre l'API.");
      } finally {
        setToggleLoading(null);
      }
    },
    [],
  );

  return { policies, mechanisms, toggleLoading, toggleError, toggle, refresh };
}

/**
 * Hook pour streamer les logs d'un conteneur via WebSocket.
 * Gere la reconnexion automatique avec backoff exponentiel en cas de deconnexion
 * inattendue, et ferme proprement la connexion quand le conteneur change.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry } from "../types";

const MAX_LOG_ENTRIES = 2000;

/**
 * Delais de reconnexion en ms (backoff exponentiel, plafonne a 30s).
 * Un decrochage reseau temporaire est transparents pour l'utilisateur.
 */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

interface UseLogsReturn {
  entries: LogEntry[];
  connected: boolean;
  clear: () => void;
}

export function useLogs(containerId: string | null): UseLogsReturn {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mis a false au demontage pour stopper les tentatives de reconnexion. */
  const activeRef = useRef<boolean>(false);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  useEffect(() => {
    // Ferme la connexion precedente proprement
    activeRef.current = false;
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!containerId) {
      setEntries([]);
      setConnected(false);
      return;
    }

    setEntries([]);
    retryCountRef.current = 0;
    activeRef.current = true;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/containers/${containerId}/logs?tail=200`;

    /** Cree une connexion WebSocket et programme la reconnexion si necessaire. */
    function connect(): void {
      if (!activeRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connexion etablie : on reinitialise le compteur de tentatives
        retryCountRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const entry: LogEntry = JSON.parse(event.data as string);
          setEntries((prev) => {
            const next = [...prev, entry];
            return next.length > MAX_LOG_ENTRIES
              ? next.slice(next.length - MAX_LOG_ENTRIES)
              : next;
          });
        } catch {
          // Ligne de log non-JSON : ajoutee telle quelle en stdout
          setEntries((prev) => [
            ...prev,
            { stream: "stdout" as const, text: event.data as string },
          ]);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
        if (!activeRef.current) return;

        // Reconnexion avec backoff exponentiel
        const delay =
          RECONNECT_DELAYS_MS[
            Math.min(retryCountRef.current, RECONNECT_DELAYS_MS.length - 1)
          ];
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      activeRef.current = false;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [containerId]);

  return { entries, connected, clear };
}

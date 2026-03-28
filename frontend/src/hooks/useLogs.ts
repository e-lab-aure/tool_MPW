/**
 * Hook pour streamer les logs d'un conteneur via WebSocket.
 * Ouvre une connexion a l'ouverture, la ferme proprement a la fermeture
 * ou quand le conteneur selectionne change.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry } from "../types";

const MAX_LOG_ENTRIES = 2000;

interface UseLogsReturn {
  entries: LogEntry[];
  connected: boolean;
  clear: () => void;
}

export function useLogs(containerId: string | null): UseLogsReturn {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  useEffect(() => {
    // Ferme la connexion precedente proprement
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

    // Determine le protocole WS selon l'environnement (http -> ws, https -> wss)
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/containers/${containerId}/logs?tail=200`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const entry: LogEntry = JSON.parse(event.data as string);
        setEntries((prev) => {
          // Limite le nombre d'entrees pour eviter les fuites memoire
          const next = [...prev, entry];
          return next.length > MAX_LOG_ENTRIES
            ? next.slice(next.length - MAX_LOG_ENTRIES)
            : next;
        });
      } catch {
        // Ligne de log non-JSON : on l'ajoute telle quelle en stdout
        setEntries((prev) => [
          ...prev,
          { stream: "stdout", text: event.data as string },
        ]);
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [containerId]);

  return { entries, connected, clear };
}

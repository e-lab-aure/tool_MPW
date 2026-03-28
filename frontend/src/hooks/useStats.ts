/**
 * Hook pour streamer les metriques temps reel d'un conteneur via WebSocket.
 * Met a jour les stats a chaque frame emise par l'API Podman (~1/s).
 */

import { useEffect, useRef, useState } from "react";
import type { ContainerStats } from "../types";

interface UseStatsReturn {
  stats: ContainerStats | null;
  connected: boolean;
}

export function useStats(containerId: string | null): UseStatsReturn {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Ferme la connexion precedente proprement
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!containerId) {
      setStats(null);
      setConnected(false);
      return;
    }

    setStats(null);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/containers/${containerId}/stats`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: ContainerStats = JSON.parse(event.data as string);
        setStats(data);
      } catch {
        // Ignore les frames malformees
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

  return { stats, connected };
}

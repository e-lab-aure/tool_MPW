/**
 * Hook pour streamer les metriques temps reel d'un conteneur via WebSocket.
 * Gere la reconnexion automatique avec backoff exponentiel pour maintenir
 * le flux de metriques meme en cas de deconnexion temporaire.
 */

import { useEffect, useRef, useState } from "react";
import type { ContainerStats } from "../types";

/** Delais de reconnexion en ms (backoff exponentiel, plafonne a 30s). */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

interface UseStatsReturn {
  stats: ContainerStats | null;
  connected: boolean;
}

export function useStats(containerId: string | null): UseStatsReturn {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mis a false au demontage pour stopper les tentatives de reconnexion. */
  const activeRef = useRef<boolean>(false);

  useEffect(() => {
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
      setStats(null);
      setConnected(false);
      return;
    }

    setStats(null);
    retryCountRef.current = 0;
    activeRef.current = true;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/containers/${containerId}/stats`;

    /** Cree une connexion WebSocket et programme la reconnexion si necessaire. */
    function connect(): void {
      if (!activeRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
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
        if (!activeRef.current) return;

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

  return { stats, connected };
}

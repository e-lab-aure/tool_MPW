/**
 * Panneau de logs temps reel d'un conteneur.
 * Affiche stdout (blanc) et stderr (orange) avec auto-scroll configurable.
 */

import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../types";

interface LogsPanelProps {
  entries: LogEntry[];
  connected: boolean;
  onClear: () => void;
}

export function LogsPanel({ entries, connected, onClear }: LogsPanelProps) {
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas a chaque nouvelle entree
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, autoScroll]);

  return (
    <div className="flex h-full flex-col">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between border-b border-slate-700/50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "animate-pulse bg-emerald-400" : "bg-slate-600"
            }`}
          />
          {connected ? "Stream actif" : "Deconnecte"}
          <span className="text-slate-700">|</span>
          <span>{entries.length} lignes</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle auto-scroll */}
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              autoScroll
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-slate-500 hover:text-slate-400"
            }`}
            title="Toggle auto-scroll"
          >
            Auto-scroll
          </button>

          {/* Bouton effacer */}
          <button
            onClick={onClear}
            className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-400"
            title="Effacer les logs"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Zone d'affichage des logs */}
      <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-xs leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-slate-600">En attente de logs...</p>
        ) : (
          entries.map((entry, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all ${
                entry.stream === "stderr" ? "text-orange-400" : "text-slate-300"
              }`}
            >
              {entry.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * Panneau de logs temps reel d'un conteneur.
 * Affiche stdout (blanc) et stderr (orange) avec auto-scroll et filtre de recherche.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "../types";

interface LogsPanelProps {
  entries: LogEntry[];
  connected: boolean;
  onClear: () => void;
}

export function LogsPanel({ entries, connected, onClear }: LogsPanelProps) {
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Filtre les entrees de logs selon le terme de recherche.
   * La comparaison est insensible a la casse.
   */
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.text.toLowerCase().includes(q));
  }, [entries, search]);

  // Auto-scroll vers le bas a chaque nouvelle entree (si filtre inactif ou tout affiche)
  useEffect(() => {
    if (autoScroll && !search && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, autoScroll, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Barre d'outils */}
      <div className="flex flex-col gap-2 border-b border-slate-700/50 px-3 py-2">
        {/* Ligne 1 : statut + controles */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "animate-pulse bg-emerald-400" : "bg-slate-600"
              }`}
            />
            {connected ? "Stream actif" : "Deconnecte"}
            <span className="text-slate-700">|</span>
            <span>
              {search ? `${filtered.length} / ${entries.length}` : `${entries.length}`} lignes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                autoScroll
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-slate-500 hover:text-slate-400"
              }`}
              title="Activer/desactiver le defilement automatique"
            >
              Auto-scroll
            </button>

            <button
              onClick={onClear}
              className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-400"
              title="Effacer les logs"
            >
              Effacer
            </button>
          </div>
        </div>

        {/* Ligne 2 : champ de recherche */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les logs..."
            className="w-full rounded border border-slate-700/50 bg-slate-800/50 py-1 pl-7 pr-3 text-xs text-slate-300 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Zone d'affichage des logs */}
      <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-xs leading-relaxed">
        {filtered.length === 0 ? (
          <p className="text-slate-600">
            {entries.length === 0
              ? "En attente de logs..."
              : "Aucune ligne ne correspond au filtre."}
          </p>
        ) : (
          filtered.map((entry, i) => (
            <LogLine key={i} entry={entry} highlight={search} />
          ))
        )}
        {/* Ancre de scroll - visible uniquement quand aucun filtre n'est actif */}
        {!search && <div ref={bottomRef} />}
      </div>
    </div>
  );
}

/** Ligne de log avec surlignage optionnel du terme de recherche. */
function LogLine({ entry, highlight }: { entry: LogEntry; highlight: string }) {
  const baseClass = entry.stream === "stderr" ? "text-orange-400" : "text-slate-300";

  if (!highlight) {
    return (
      <div className={`whitespace-pre-wrap break-all ${baseClass}`}>
        {entry.text}
      </div>
    );
  }

  // Surligne toutes les occurrences du terme recherche
  const parts = entry.text.split(new RegExp(`(${escapeRegex(highlight)})`, "gi"));

  return (
    <div className={`whitespace-pre-wrap break-all ${baseClass}`}>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-500/30 text-amber-300 px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </div>
  );
}

/** Echappe les caracteres speciaux d'une chaine pour l'utilisation dans une RegExp. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

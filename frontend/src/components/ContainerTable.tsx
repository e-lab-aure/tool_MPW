/**
 * Tableau principal listant tous les conteneurs Podman.
 * Inclut la recherche par nom/image, le filtre par etat et le tri par colonne.
 * Permet de selectionner un conteneur pour voir ses details et d'executer des actions.
 */

import { useMemo, useState } from "react";
import type { Container, ContainerAction } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ContainerTableProps {
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (id: string, action: ContainerAction) => void;
  actionLoading: string | null;
  autostartPolicies: Record<string, string>;
  autostartMechanisms: Record<string, string>;
}

type SortKey = "name" | "state" | "created";
type SortDir = "asc" | "desc";
type StateFilter = "all" | "running" | "stopped";

/** Formate un timestamp Unix en date lisible. */
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formate les ports exposes pour l'affichage. */
function formatPorts(container: Container): string {
  if (container.ports.length === 0) return "-";
  return (
    container.ports
      .filter((p) => p.host_port !== null)
      .map((p) => `${p.host_port}:${p.container_port}/${p.protocol}`)
      .join(", ") || "-"
  );
}

export function ContainerTable({
  containers,
  selectedId,
  onSelect,
  onAction,
  actionLoading,
  autostartPolicies,
  autostartMechanisms,
}: ContainerTableProps) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /**
   * Bascule le tri : clique sur la meme colonne inverse la direction,
   * clique sur une nouvelle colonne active le tri ascendant.
   */
  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  /**
   * Applique la recherche, le filtre d'etat et le tri.
   * Memorise le resultat pour eviter de recalculer a chaque render.
   */
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    return [...containers]
      .filter((c) => {
        // Filtre textuel sur le nom et l'image
        if (query && !c.name.toLowerCase().includes(query) && !c.image.toLowerCase().includes(query)) {
          return false;
        }
        // Filtre d'etat
        if (stateFilter === "running" && c.state.toLowerCase() !== "running") return false;
        if (stateFilter === "stopped" && c.state.toLowerCase() === "running") return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") cmp = a.name.localeCompare(b.name);
        else if (sortKey === "state") cmp = a.state.localeCompare(b.state);
        else if (sortKey === "created") cmp = a.created - b.created;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [containers, search, stateFilter, sortKey, sortDir]);

  return (
    <div className="flex flex-col h-full">
      {/* Barre de recherche et filtres */}
      <div className="flex items-center gap-2 border-b border-slate-700/50 px-4 py-2">
        {/* Recherche */}
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
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
            placeholder="Rechercher par nom ou image..."
            className="w-full rounded border border-slate-700/50 bg-slate-800/50 py-1.5 pl-8 pr-3 text-xs text-slate-300 placeholder-slate-600 focus:border-slate-500 focus:outline-none"
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

        {/* Filtre d'etat */}
        <div className="flex items-center gap-1 shrink-0">
          {(["all", "running", "stopped"] as StateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStateFilter(f)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                stateFilter === f
                  ? f === "running"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : f === "stopped"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-slate-700 text-slate-200"
                  : "text-slate-500 hover:text-slate-400"
              }`}
            >
              {f === "all" ? "Tous" : f === "running" ? "Actifs" : "Arretes"}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-x-auto">
        {filtered.length === 0 ? (
          <EmptyState hasSearch={!!search || stateFilter !== "all"} />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500">
                <SortableHeader label="Nom" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3">Image</th>
                <SortableHeader label="Etat" sortKey="state" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3">Ports</th>
                <SortableHeader label="Cree le" sortKey="created" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-center">Demarrage</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((c) => {
                const isSelected = c.id === selectedId;
                const isLoading = actionLoading === c.id;
                const isRunning = c.state.toLowerCase() === "running";
                const isAutostart = autostartPolicies[c.id] === "always";
                const mechanism = autostartMechanisms[c.id];

                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      isSelected ? "bg-slate-700/40" : "hover:bg-slate-800/60"
                    }`}
                  >
                    {/* Nom */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        )}
                        <span className="font-medium text-slate-100">{c.name}</span>
                        <span className="font-mono text-xs text-slate-600">{c.short_id}</span>
                      </div>
                    </td>

                    {/* Image */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-400">
                        {c.image.length > 40 ? `${c.image.slice(0, 37)}...` : c.image}
                      </span>
                    </td>

                    {/* Etat */}
                    <td className="px-4 py-3">
                      <StatusBadge state={c.state} />
                    </td>

                    {/* Ports */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-400">{formatPorts(c)}</span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(c.created)}</td>

                    {/* Autostart */}
                    <td className="px-4 py-3 text-center">
                      {mechanism === undefined ? (
                        <span className="text-xs text-slate-700">...</span>
                      ) : isAutostart ? (
                        mechanism === "systemd" ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-medium bg-blue-500/15 text-blue-400"
                            title="Gere par systemd"
                          >
                            systemd
                          </span>
                        ) : (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400"
                            title="Restart policy : always"
                          >
                            auto
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-slate-600">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isRunning && (
                          <ActionButton
                            label="Demarrer"
                            disabled={isLoading}
                            onClick={() => onAction(c.id, "start")}
                            variant="success"
                            icon={
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                              />
                            }
                          />
                        )}
                        {isRunning && (
                          <ActionButton
                            label="Arreter"
                            disabled={isLoading}
                            onClick={() => onAction(c.id, "stop")}
                            variant="danger"
                            icon={
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
                              />
                            }
                          />
                        )}
                        <ActionButton
                          label="Redemarrer"
                          disabled={isLoading}
                          onClick={() => onAction(c.id, "restart")}
                          variant="neutral"
                          icon={
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                            />
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** En-tete de colonne triable avec indicateur de direction. */
interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}

function SortableHeader({ label, sortKey, current, dir, onSort }: SortableHeaderProps) {
  const active = current === sortKey;
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 uppercase tracking-wider transition-colors ${
          active ? "text-slate-300" : "text-slate-500 hover:text-slate-400"
        }`}
      >
        {label}
        <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {active && dir === "asc" ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          ) : active && dir === "desc" ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          )}
        </svg>
      </button>
    </th>
  );
}

/** Etat vide : aucun resultat apres filtrage ou liste vraiment vide. */
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <svg
        className="mb-3 h-12 w-12 opacity-30"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
        />
      </svg>
      <p className="text-sm">
        {hasSearch ? "Aucun conteneur ne correspond a la recherche" : "Aucun conteneur trouve"}
      </p>
      {hasSearch && (
        <p className="mt-1 text-xs text-slate-600">
          Modifiez votre recherche ou les filtres actifs
        </p>
      )}
    </div>
  );
}

/** Bouton d'action compact avec icone SVG. */
interface ActionButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant: "success" | "danger" | "neutral";
  icon: React.ReactNode;
}

const VARIANT_STYLES: Record<ActionButtonProps["variant"], string> = {
  success: "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 border-emerald-500/30",
  danger: "text-red-400 hover:bg-red-500/10 hover:text-red-300 border-red-500/30",
  neutral: "text-slate-400 hover:bg-slate-500/10 hover:text-slate-300 border-slate-500/30",
};

function ActionButton({ label, disabled, onClick, variant, icon }: ActionButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_STYLES[variant]}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        {icon}
      </svg>
    </button>
  );
}

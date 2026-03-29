/**
 * Tableau principal listant tous les conteneurs Podman.
 * Permet de selectionner un conteneur pour voir ses details,
 * et d'executer des actions start/stop/restart directement depuis le tableau.
 */

import type { Container, ContainerAction } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ContainerTableProps {
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (id: string, action: ContainerAction) => void;
  actionLoading: string | null;
  autostartPolicies: Record<string, string>;
}

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

/** Formate les ports pour l'affichage. */
function formatPorts(container: Container): string {
  if (container.ports.length === 0) return "-";

  return container.ports
    .filter((p) => p.host_port !== null)
    .map((p) => `${p.host_port}:${p.container_port}/${p.protocol}`)
    .join(", ") || "-";
}

export function ContainerTable({
  containers,
  selectedId,
  onSelect,
  onAction,
  actionLoading,
  autostartPolicies,
}: ContainerTableProps) {
  if (containers.length === 0) {
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
        <p className="text-sm">Aucun conteneur trouve</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3">Nom</th>
            <th className="px-4 py-3">Image</th>
            <th className="px-4 py-3">Etat</th>
            <th className="px-4 py-3">Ports</th>
            <th className="px-4 py-3">Cree le</th>
            <th className="px-4 py-3 text-center">Demarrage</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {containers.map((c) => {
            const isSelected = c.id === selectedId;
            const isLoading = actionLoading === c.id;
            const isRunning = c.state.toLowerCase() === "running";
            const isAutostart = autostartPolicies[c.id] === "always";

            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`cursor-pointer transition-colors duration-150 ${
                  isSelected
                    ? "bg-slate-700/40"
                    : "hover:bg-slate-800/60"
                }`}
              >
                {/* Nom du conteneur */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                    <span className="font-medium text-slate-100">
                      {c.name}
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      {c.short_id}
                    </span>
                  </div>
                </td>

                {/* Image */}
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-slate-400">
                    {c.image.length > 40
                      ? `${c.image.slice(0, 37)}...`
                      : c.image}
                  </span>
                </td>

                {/* Badge d'etat */}
                <td className="px-4 py-3">
                  <StatusBadge state={c.state} />
                </td>

                {/* Ports */}
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-slate-400">
                    {formatPorts(c)}
                  </span>
                </td>

                {/* Date de creation */}
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDate(c.created)}
                </td>

                {/* Indicateur demarrage automatique (read-only) */}
                <td className="px-4 py-3 text-center">
                  {autostartPolicies[c.id] !== undefined ? (
                    isAutostart ? (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400">
                        auto
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">-</span>
                    )
                  ) : (
                    <span className="text-slate-700 text-xs">...</span>
                  )}
                </td>

                {/* Boutons d'action */}
                <td className="px-4 py-3">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Bouton Start (uniquement si arrete) */}
                    {!isRunning && (
                      <ActionButton
                        label="Start"
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

                    {/* Bouton Stop (uniquement si en cours) */}
                    {isRunning && (
                      <ActionButton
                        label="Stop"
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

                    {/* Bouton Restart (toujours disponible) */}
                    <ActionButton
                      label="Restart"
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

const VARIANT_STYLES = {
  success:
    "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 border-emerald-500/30",
  danger:
    "text-red-400 hover:bg-red-500/10 hover:text-red-300 border-red-500/30",
  neutral:
    "text-slate-400 hover:bg-slate-500/10 hover:text-slate-300 border-slate-500/30",
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
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        {icon}
      </svg>
    </button>
  );
}

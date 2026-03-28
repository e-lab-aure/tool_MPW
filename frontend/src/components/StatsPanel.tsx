/**
 * Panneau de metriques temps reel d'un conteneur.
 * Affiche CPU, RAM et trafic reseau avec des barres de progression.
 */

import type { ContainerStats } from "../types";

interface StatsPanelProps {
  stats: ContainerStats | null;
  connected: boolean;
}

/** Convertit des octets en chaine lisible (KB, MB, GB). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Calcule la couleur d'une barre de progression selon le pourcentage. */
function barColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

interface MetricBarProps {
  label: string;
  percent: number;
  detail: string;
}

/** Composant de metrique avec barre de progression. */
function MetricBar({ label, percent, detail }: MetricBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-300">{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="text-right text-xs text-slate-500">
        {clamped.toFixed(1)}%
      </div>
    </div>
  );
}

export function StatsPanel({ stats, connected }: StatsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Indicateur de connexion */}
      <div className="flex items-center gap-2 border-b border-slate-700/50 px-3 py-2 text-xs text-slate-500">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "animate-pulse bg-emerald-400" : "bg-slate-600"
          }`}
        />
        {connected ? "Metriques en direct" : "Deconnecte"}
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-4">
        {!stats ? (
          <p className="text-xs text-slate-600">
            En attente des premieres metriques...
          </p>
        ) : (
          <div className="space-y-6">
            {/* CPU */}
            <MetricBar
              label="CPU"
              percent={stats.cpu_percent}
              detail={`${stats.cpu_percent.toFixed(2)}%`}
            />

            {/* RAM */}
            <MetricBar
              label="Memoire"
              percent={stats.memory_percent}
              detail={`${formatBytes(stats.memory_usage)} / ${formatBytes(stats.memory_limit)}`}
            />

            {/* Reseau */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Reseau
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-slate-500">Entrant</p>
                  <p className="mt-1 font-mono text-sm text-emerald-400">
                    {formatBytes(stats.net_input)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-slate-500">Sortant</p>
                  <p className="mt-1 font-mono text-sm text-blue-400">
                    {formatBytes(stats.net_output)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

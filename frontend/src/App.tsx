/**
 * Composant racine de Master Pod Warden.
 * Orchestre la mise en page : tableau des conteneurs (gauche) et
 * panneau de detail (droite) avec onglets Logs / Stats / Info.
 */

import { useState } from "react";
import { ContainerTable } from "./components/ContainerTable";
import { Header } from "./components/Header";
import { InfoPanel } from "./components/InfoPanel";
import { LogsPanel } from "./components/LogsPanel";
import { StatsPanel } from "./components/StatsPanel";
import { useAutostart } from "./hooks/useAutostart";
import { useContainerDetail } from "./hooks/useContainerDetail";
import { useContainers } from "./hooks/useContainers";
import { useLogs } from "./hooks/useLogs";
import { useStats } from "./hooks/useStats";
import type { ContainerAction, DetailTab } from "./types";

export function App() {
  const { containers, loading, error, triggerAction } = useContainers();
  const { policies: autostartPolicies, toggleLoading, toggle: toggleAutostart } = useAutostart();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("logs");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Streams temps reel - actifs uniquement sur l'onglet correspondant
  const { entries: logEntries, connected: logsConnected, clear: clearLogs } =
    useLogs(selectedId);
  const { stats, connected: statsConnected } = useStats(
    activeTab === "stats" ? selectedId : null,
  );

  // Details (reseaux, montages, taille) - charge uniquement sur l'onglet Info
  const { detail, loading: detailLoading, error: detailError } =
    useContainerDetail(selectedId, activeTab === "info");

  /** Selectionne un conteneur et bascule sur l'onglet logs par defaut. */
  function handleSelect(id: string): void {
    if (selectedId === id) {
      setSelectedId(null);
    } else {
      setSelectedId(id);
      setActiveTab("logs");
    }
  }

  /** Execute une action et gere l'etat de chargement. */
  async function handleAction(id: string, action: ContainerAction): Promise<void> {
    setActionLoading(id);
    await triggerAction(id, action);
    setActionLoading(null);
  }

  const selectedContainer = containers.find((c) => c.id === selectedId);
  const isConnected = !error && !loading;

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <Header connected={isConnected} />

      <div className="flex min-h-0 flex-1">
        {/* Panneau gauche : liste des conteneurs */}
        <div
          className={`flex flex-col border-r border-slate-700/50 ${
            selectedId ? "w-1/2" : "w-full"
          } transition-all duration-200`}
        >
          <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-slate-300">Conteneurs</h2>
              {!loading && (
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {containers.length}
                </span>
              )}
            </div>
            {loading && (
              <span className="text-xs text-slate-500">Chargement...</span>
            )}
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <ContainerTable
              containers={containers}
              selectedId={selectedId}
              onSelect={handleSelect}
              onAction={handleAction}
              actionLoading={actionLoading}
              autostartPolicies={autostartPolicies}
            />
          </div>
        </div>

        {/* Panneau droit : detail du conteneur selectionne */}
        {selectedId && selectedContainer && (
          <div className="flex w-1/2 flex-col">
            {/* En-tete avec onglets */}
            <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-200">
                  {selectedContainer.name}
                </span>
                <span className="font-mono text-xs text-slate-600">
                  {selectedContainer.short_id}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {(["logs", "stats", "info"] as DetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "bg-slate-700 text-slate-100"
                        : "text-slate-500 hover:text-slate-400"
                    }`}
                  >
                    {tab}
                  </button>
                ))}

                <button
                  onClick={() => setSelectedId(null)}
                  className="ml-2 rounded p-1 text-slate-500 transition-colors hover:text-slate-400"
                  aria-label="Fermer le panneau"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenu de l'onglet actif */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeTab === "logs" && (
                <LogsPanel
                  entries={logEntries}
                  connected={logsConnected}
                  onClear={clearLogs}
                />
              )}
              {activeTab === "stats" && (
                <StatsPanel stats={stats} connected={statsConnected} />
              )}
              {activeTab === "info" && (
                <InfoPanel
                  detail={detail}
                  loading={detailLoading}
                  error={detailError}
                  autostartEnabled={
                    selectedId ? autostartPolicies[selectedId] === "always" : false
                  }
                  autostartKnown={
                    selectedId ? selectedId in autostartPolicies : false
                  }
                  autostartLoading={toggleLoading === selectedId}
                  onToggleAutostart={() => {
                    if (selectedId) {
                      toggleAutostart(
                        selectedId,
                        autostartPolicies[selectedId] !== "always",
                      );
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

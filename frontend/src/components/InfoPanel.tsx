/**
 * Panneau d'informations detaillees d'un conteneur.
 * Affiche les reseaux, les montages (volumes/bind mounts) et la taille de l'image.
 */

import type { ContainerDetail } from "../types";

interface InfoPanelProps {
  detail: ContainerDetail | null;
  loading: boolean;
  error: string | null;
  /** true si la politique "always" est active, false sinon */
  autostartEnabled: boolean;
  /** true si la policy a ete chargee (distingue "desactive" de "inconnu") */
  autostartKnown: boolean;
  /** Mecanisme detecte : "restart_policy" | "systemd" | "none" */
  autostartMechanism: string;
  /** true pendant que le toggle est en cours d'enregistrement */
  autostartLoading: boolean;
  /** Message d'erreur du dernier toggle, null si aucun */
  autostartError: string | null;
  /** Callback pour basculer l'autostart (inactif si gere par systemd) */
  onToggleAutostart: () => void;
}

/** Convertit des octets en chaine lisible (MB, GB). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Tronque un chemin long en gardant le debut et la fin. */
function truncatePath(path: string, maxLen: number = 48): string {
  if (path.length <= maxLen) return path;
  return `${path.slice(0, 20)}...${path.slice(-(maxLen - 23))}`;
}

export function InfoPanel({
  detail,
  loading,
  error,
  autostartEnabled,
  autostartKnown,
  autostartMechanism,
  autostartLoading,
  autostartError,
  onToggleAutostart,
}: InfoPanelProps) {
  /** Les conteneurs geres par systemd ne peuvent pas etre modifies via l'API. */
  const isSystemd = autostartMechanism === "systemd";
  const canToggle = autostartKnown && !isSystemd;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-slate-500">
        Chargement des details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">

      {/* Demarrage automatique */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Demarrage automatique
        </h3>
        <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-300">
                {autostartEnabled ? "Actif" : "Inactif"}
              </p>
              {isSystemd && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-blue-500/15 text-blue-400">
                  systemd
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {isSystemd
                ? "Gere par une unite systemd - non modifiable via l'interface."
                : autostartEnabled
                  ? "Le conteneur redemarre automatiquement au demarrage du service Podman."
                  : "Le conteneur ne demarre pas automatiquement."}
            </p>
          </div>
          {autostartKnown && (
            <button
              title={
                isSystemd
                  ? "Gere par systemd - non modifiable ici"
                  : autostartEnabled
                    ? "Desactiver l'autostart"
                    : "Activer l'autostart"
              }
              aria-label={
                isSystemd
                  ? "Gere par systemd"
                  : autostartEnabled
                    ? "Desactiver l'autostart"
                    : "Activer l'autostart"
              }
              disabled={autostartLoading || !canToggle}
              onClick={canToggle ? onToggleAutostart : undefined}
              className={`relative ml-4 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                canToggle ? "cursor-pointer" : "cursor-not-allowed"
              } ${
                autostartEnabled
                  ? isSystemd
                    ? "bg-blue-500"
                    : "bg-emerald-500"
                  : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                  autostartEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          )}
        </div>
      </section>

      {/* Message d'erreur autostart (ex: version Podman insuffisante) */}
      {autostartError && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          {autostartError}
        </p>
      )}

      {/* Taille de l'image */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Taille
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-800/50 p-3">
            <p className="text-xs text-slate-500">Image totale</p>
            <p className="mt-1 font-mono text-sm text-slate-200">
              {formatBytes(detail.size_root_fs)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/50 p-3">
            <p className="text-xs text-slate-500">Couche ecriture</p>
            <p className="mt-1 font-mono text-sm text-slate-200">
              {formatBytes(detail.size_rw)}
            </p>
          </div>
        </div>
      </section>

      {/* Reseaux */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Reseaux
          <span className="ml-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-slate-400">
            {detail.networks.length}
          </span>
        </h3>
        {detail.networks.length === 0 ? (
          <p className="text-xs text-slate-600">Aucun reseau</p>
        ) : (
          <div className="space-y-2">
            {detail.networks.map((net) => (
              <div
                key={net.name}
                className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span className="text-xs font-medium text-slate-300">
                    {net.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                  <Row label="IP" value={net.ip_address || "-"} />
                  <Row label="Gateway" value={net.gateway || "-"} />
                  <Row label="MAC" value={net.mac_address || "-"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Montages */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Montages
          <span className="ml-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-slate-400">
            {detail.mounts.length}
          </span>
        </h3>
        {detail.mounts.length === 0 ? (
          <p className="text-xs text-slate-600">Aucun montage</p>
        ) : (
          <div className="space-y-2">
            {detail.mounts.map((mount, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  {/* Badge type : volume en vert, bind en orange, autre en gris */}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      mount.type === "volume"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : mount.type === "bind"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-slate-500/15 text-slate-400"
                    }`}
                  >
                    {mount.type}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      mount.rw
                        ? "bg-slate-600/50 text-slate-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {mount.rw ? "rw" : "ro"}
                  </span>
                </div>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 text-slate-500">Hote</span>
                    <span
                      className="truncate text-slate-300"
                      title={mount.source}
                    >
                      {truncatePath(mount.source)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 text-slate-500">Cible</span>
                    <span
                      className="truncate text-slate-300"
                      title={mount.destination}
                    >
                      {truncatePath(mount.destination)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Ligne label/valeur pour les grilles d'informations. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{value}</span>
    </>
  );
}

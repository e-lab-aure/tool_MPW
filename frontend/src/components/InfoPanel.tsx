/**
 * Panneau d'informations detaillees d'un conteneur.
 * Affiche les reseaux, les montages (volumes/bind mounts) et la taille de l'image.
 */

import { useEffect, useState } from "react";
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
  /** Nom du conteneur, utilise pour les commandes systemd */
  containerName: string;
  /** Id du conteneur, utilise pour appeler l'endpoint de generation Quadlet */
  containerId: string;
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

/** Contenu d'un fichier Quadlet retourne par le backend. */
interface QuadletFile {
  content: string;
  filename: string;
  install_path: string;
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
  containerName,
  containerId,
}: InfoPanelProps) {
  /** Les conteneurs geres par systemd ne peuvent pas etre modifies via l'API. */
  const isSystemd = autostartMechanism === "systemd";
  const canToggle = autostartKnown && !isSystemd;

  /** Indique si la section Quadlet doit etre affichee. */
  const showQuadlet = autostartKnown && (isSystemd || !!autostartError);

  /** Fichier Quadlet genere par le backend, null si non encore charge. */
  const [quadlet, setQuadlet] = useState<QuadletFile | null>(null);
  const [quadletLoading, setQuadletLoading] = useState(false);
  const [quadletError, setQuadletError] = useState<string | null>(null);

  /**
   * Charge le fichier Quadlet depuis le backend au moment ou la section devient visible.
   * On ne recharge pas si le contenu est deja disponible pour ce meme conteneur.
   */
  useEffect(() => {
    if (!showQuadlet) return;
    if (quadlet !== null) return;

    setQuadletLoading(true);
    setQuadletError(null);

    fetch(`/api/containers/${containerId}/quadlet`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<QuadletFile>;
      })
      .then((data) => setQuadlet(data))
      .catch((e: Error) =>
        setQuadletError(`Impossible de generer le fichier Quadlet : ${e.message}`),
      )
      .finally(() => setQuadletLoading(false));
  }, [showQuadlet, containerId, quadlet]);

  /**
   * Commande pour activer le service Quadlet apres avoir sauvegarde le fichier .container.
   * systemd detecte automatiquement les fichiers Quadlet dans le repertoire surveille.
   */
  const cmdActivate =
    `systemctl --user daemon-reload && ` +
    `systemctl --user enable --now ${containerName}.service`;

  /**
   * Commande pour desactiver et supprimer le service Quadlet.
   * Apres suppression du fichier .container, on recharge systemd.
   */
  const cmdDeactivate =
    `systemctl --user disable --now ${containerName}.service && ` +
    `rm ~/.config/containers/systemd/${containerName}.container && ` +
    `systemctl --user daemon-reload`;

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

      {/* Section Quadlet */}
      {showQuadlet && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Gestion via Quadlet (systemd)
          </h3>
          {quadletLoading && (
            <p className="text-xs text-slate-500">Generation du fichier Quadlet...</p>
          )}
          {quadletError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {quadletError}
            </p>
          )}
          {quadlet && !quadletLoading && (
            <div className="space-y-3">
              {/* Repertoire a creer si absent */}
              <div>
                <p className="mb-1 text-xs text-slate-500">
                  1. Creer le repertoire si absent :
                </p>
                <CopyableCommand
                  label="Creer le repertoire Quadlet"
                  command="mkdir -p ~/.config/containers/systemd"
                />
              </div>

              {/* Fichier .container a creer */}
              <div>
                <p className="mb-1 text-xs text-slate-500">
                  2. Creer le fichier{" "}
                  <code className="font-mono text-slate-400">{quadlet.install_path}</code>
                </p>
                <CopyableBlock content={quadlet.content} label={quadlet.filename} />
              </div>

              {/* Commande pour activer ou desactiver selon le contexte */}
              {isSystemd ? (
                <div>
                  <p className="mb-1 text-xs text-slate-500">
                    3. Pour desactiver et supprimer le service :
                  </p>
                  <CopyableCommand
                    label="Desactiver le service Quadlet"
                    command={cmdDeactivate}
                  />
                </div>
              ) : (
                <div>
                  <p className="mb-1 text-xs text-slate-500">
                    3. Apres avoir sauvegarde le fichier, activer le service :
                  </p>
                  <CopyableCommand
                    label="Activer le service Quadlet"
                    command={cmdActivate}
                  />
                </div>
              )}
            </div>
          )}
        </section>
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

/**
 * Bloc multi-ligne affichant un fichier texte (ex: fichier Quadlet) avec bouton copier.
 * Utilise une balise pre pour conserver l'indentation et les retours a la ligne.
 */
function CopyableBlock({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);

  /** Copie le contenu dans le presse-papiers avec fallback pour HTTP. */
  function handleCopy() {
    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(content).then(confirm);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      confirm();
    }
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30">
      <div className="flex items-center justify-between border-b border-slate-700/50 px-3 py-1.5">
        <span className="font-mono text-xs text-slate-500">{label}</span>
        <button
          onClick={handleCopy}
          title="Copier le fichier"
          aria-label="Copier le fichier"
          className={`shrink-0 rounded border px-2 py-0.5 text-xs transition-colors duration-150 ${
            copied
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
          }`}
        >
          {copied ? "Copie !" : "Copier"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-300">
        {content}
      </pre>
    </div>
  );
}

/** Bloc de commande avec label et bouton copier. */
function CopyableCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  /**
   * Copie la commande dans le presse-papiers.
   * Utilise navigator.clipboard si disponible (HTTPS), sinon fallback
   * sur document.execCommand pour les contextes HTTP (reseau local).
   */
  function handleCopy() {
    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(command).then(confirm);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      confirm();
    }
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
      <p className="mb-2 text-xs text-slate-500">{label}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all font-mono text-xs leading-relaxed text-slate-300">
          {command}
        </code>
        <button
          onClick={handleCopy}
          title="Copier la commande"
          aria-label="Copier la commande"
          className={`ml-1 shrink-0 rounded border px-2 py-1 text-xs transition-colors duration-150 ${
            copied
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
          }`}
        >
          {copied ? "Copie !" : "Copier"}
        </button>
      </div>
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

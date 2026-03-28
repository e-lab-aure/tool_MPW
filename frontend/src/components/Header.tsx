/**
 * Barre de navigation superieure de MPW.
 * Affiche le nom du projet et l'indicateur de connexion au backend.
 */

interface HeaderProps {
  /** Indique si le backend repond correctement. */
  connected: boolean;
}

export function Header({ connected }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-700/50 bg-slate-900 px-6 py-4">
      <div className="flex items-center gap-3">
        {/* Icone conteneur stylisee */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            Master Pod Warden
          </h1>
          <p className="text-xs text-slate-500">Podman Container Manager</p>
        </div>
      </div>

      {/* Indicateur de connexion au backend */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "animate-pulse bg-emerald-400" : "bg-red-400"
          }`}
        />
        <span className={connected ? "text-emerald-400" : "text-red-400"}>
          {connected ? "Podman connecte" : "Podman hors ligne"}
        </span>
      </div>
    </header>
  );
}

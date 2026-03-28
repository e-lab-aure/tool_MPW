/**
 * Badge visuel representant l'etat courant d'un conteneur.
 * Code couleur : vert = running, rouge = exited, jaune = paused, gris = autre.
 */

interface StatusBadgeProps {
  state: string;
}

const STATE_STYLES: Record<string, string> = {
  running: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  exited: "bg-red-500/20 text-red-400 border border-red-500/30",
  stopped: "bg-red-500/20 text-red-400 border border-red-500/30",
  paused: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  created: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};

const STATE_DOTS: Record<string, string> = {
  running: "bg-emerald-400 animate-pulse",
  exited: "bg-red-400",
  stopped: "bg-red-400",
  paused: "bg-amber-400",
  created: "bg-blue-400",
};

export function StatusBadge({ state }: StatusBadgeProps) {
  const normalized = state.toLowerCase();
  const style =
    STATE_STYLES[normalized] ??
    "bg-slate-500/20 text-slate-400 border border-slate-500/30";
  const dot = STATE_DOTS[normalized] ?? "bg-slate-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {normalized}
    </span>
  );
}

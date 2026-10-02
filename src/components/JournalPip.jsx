import { colors } from "../theme/palette.js";

// ── Pastille « journal » d'un jour ───────────────────────────────────────────
// Pleine quand quelque chose est noté ce jour-là (bien-être, poids, repas ou
// note), creuse sinon : la semaine se lit d'un coup d'œil, et les trous se
// comblent sans changer d'écran.
export function JournalPip({ isDark, filled, onClick, label }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: "100%", height: 20, borderRadius: 999, cursor: "pointer", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: filled ? c.accent + "22" : "transparent",
        border: `1px solid ${filled ? c.accent + "66" : c.border}`,
        color: filled ? c.accent : c.textDim,
      }}
    >
      {/* Un crayon : à 11 px, c'est la seule silhouette qui se lit encore, et
          elle dit « à écrire » plutôt que « à lire ». */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20.5h4L20.5 8 16.5 4 4 16.5v4z" />
      </svg>
    </button>
  );
}

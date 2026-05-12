import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";

// ─── BOTTOM NAV (mobile) ─────────────────────────────────────────────────────
// Barre de navigation fixe en bas d'écran sur mobile. 4 onglets principaux.
// Aujourd'hui · Semaine · Cycles · Stats. Profil reste accessible via l'avatar.

const TABS = [
  { key: "accueil", label: "Accueil",  glyph: "⌂" },
  { key: "week",    label: "Semaine",  glyph: "▦" },
  { key: "cycles",  label: "Cycles",   glyph: "↻" },
  { key: "dash",    label: "Stats",    glyph: "▤" },
];

export function BottomNav({ viewMode, onChange, extraTabs }) {
  const { isDark } = useThemeCtx();

  const bg          = isDark ? "#1a1f1c" : "#fcf8ef";
  const border      = isDark ? "#2a302a" : "#e6dfd1";
  const textMuted   = isDark ? "#7a7570" : "#8a7f70";
  const accent      = isDark ? "#c8906a" : "#8b4c20";
  const accentBg    = isDark ? "#2a1a10" : "#ecddd4";

  // viewMode "week"/"month"/"year" → tous matchent l'onglet "week"
  const activeKey = ["month", "year"].includes(viewMode) ? "week" : viewMode;

  const allTabs = [...TABS, ...(extraTabs || [])];

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: Z.sticky,
        background: bg,
        borderTop: `1px solid ${border}`,
        boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {allTabs.map(t => {
        const active = activeKey === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              padding: "8px 4px 8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              color: active ? accent : textMuted,
              position: "relative",
            }}
          >
            <span
              style={{
                fontSize: 18,
                lineHeight: 1,
                width: 32,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                background: active ? accentBg : "transparent",
                transition: "background 0.15s",
                color: active ? accent : textMuted,
              }}
              aria-hidden="true"
            >
              {t.glyph}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 600 : 500,
              letterSpacing: "0.04em",
              lineHeight: 1.2,
            }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

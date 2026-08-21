import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";
import { colors } from "../theme/palette.js";

// ─── BOTTOM NAV (mobile) ─────────────────────────────────────────────────────
// Barre de navigation fixe en bas d'écran sur mobile. 4 onglets principaux.
// Aujourd'hui · Semaine · Cycles · Stats. Profil reste accessible via l'avatar.
//
// Icônes SVG monoligne — viewBox 24×24, stroke 1.8, round caps.

function NavIcon({ kind, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  switch (kind) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11 L12 4 L21 11 V20 H14 V14 H10 V20 H3 Z" />
        </svg>
      );
    case "cal":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "cycle":
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 14-5.3" />
          <path d="M20 12a8 8 0 0 1-14 5.3" />
          <path d="M18 3v4h-4M6 21v-4h4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M6 17v-6M11 17v-9M16 17v-4M21 17V7" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <path d="M4 5v15M9 5v15M14 5l5 14M19 19l-5-14" />
          <path d="M4 5h5M14 5h-2" />
        </svg>
      );
    case "db":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    default:
      return null;
  }
}

const TABS = [
  { key: "accueil", label: "Accueil",    icon: "home"  },
  { key: "week",    label: "Calendrier", icon: "cal"   },
  { key: "cycles",  label: "Cycles",     icon: "cycle" },
  { key: "dash",    label: "Stats",      icon: "chart" },
  { key: "library", label: "Database",   icon: "db"    },
];

export function BottomNav({ viewMode, onChange, extraTabs }) {
  const { isDark } = useThemeCtx();

  const bg          = colors(isDark).bgScrim;   // semi-transparent + flou
  const border      = colors(isDark).border;
  const textMuted   = colors(isDark).textMuted;
  const accent      = colors(isDark).accent;

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
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: `0.5px solid ${border}`,
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
              gap: 4,
              color: active ? accent : textMuted,
              position: "relative",
            }}
          >
            <span
              style={{
                width: 36,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: active ? accent : textMuted,
              }}
            >
              <NavIcon kind={t.icon || "home"} size={20} />
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

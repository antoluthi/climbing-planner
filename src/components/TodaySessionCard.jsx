import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES } from "../lib/constants.js";

// ─── TODAY SESSION CARD ───────────────────────────────────────────────────────
// Card unique pour une séance dans la vue liste mobile.

export function TodaySessionCard({ session, onTap, onToggleDone }) {
  const { isDark } = useThemeCtx();

  const surfaceCard  = isDark ? "#241b13" : "#ffffff";
  const border       = isDark ? "#3a2e22" : "#e6dfd1";
  const text         = isDark ? "#f0e6d0" : "#2a2218";
  const textMid      = isDark ? "#c4b69c" : "#5a4d3c";
  const textLight    = isDark ? "#a89a82" : "#8a7f70";
  const accent       = isDark ? "#e0a875" : "#8b4c20";

  const fb = session.feedback;
  const status = fb?.status ?? (fb?.done ? "done" : null);
  const done = status === "done" || status === "adapted";
  const missed = status === "not_done";

  const chargeColor = getChargeColor(session.charge || 0);
  const typeColor = (() => {
    if (session.blocks?.length) {
      const main = session.blocks.find(b => (b.type || b.blockType) === "Grimpe");
      if (main) return BLOCK_TYPES["Grimpe"].color;
      const ex = session.blocks.find(b => (b.type || b.blockType) === "Exercices");
      if (ex) return BLOCK_TYPES["Exercices"].color;
      const susp = session.blocks.find(b => (b.type || b.blockType) === "Suspension");
      if (susp) return BLOCK_TYPES["Suspension"].color;
    }
    return chargeColor;
  })();

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggleDone?.();
  };

  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      style={{
        background: surfaceCard,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 12,
        cursor: "pointer",
        opacity: done ? 0.7 : 1,
        transition: "opacity 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ width: 4, borderRadius: 2, background: typeColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {session.startTime && (
          <div style={{ fontSize: 11, color: accent, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {session.startTime}
            {session.estimatedTime ? ` · ${session.estimatedTime} min` : ""}
          </div>
        )}
        <div style={{
          fontSize: 15, fontWeight: 600, color: done ? textMid : text, marginTop: 2,
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: textLight,
          lineHeight: 1.3,
        }}>
          {session.name || session.title}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {session.type && (
            <span style={tagStyle({ bg: isDark ? "#2a2010" : "#fef2dc", fg: isDark ? "#e6c46a" : "#b8881a" })}>
              {session.type}
            </span>
          )}
          {done && fb?.rpe != null && (
            <span style={tagStyle({ bg: isDark ? "#1a2a1d" : "#e7f2e0", fg: isDark ? "#82c894" : "#4a7050" })}>
              Fait · RPE {fb.rpe}
            </span>
          )}
          {missed && (
            <span style={tagStyle({ bg: isDark ? "#2a1612" : "#fbecec", fg: isDark ? "#f08070" : "#b83030" })}>
              Manquée
            </span>
          )}
          {!done && !missed && session.blocks?.length > 0 && (
            <span style={tagStyle({ bg: isDark ? "#2e2419" : "#f0ebde", fg: textMid })}>
              {session.blocks.length} bloc{session.blocks.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
        {session.charge != null && (
          <span style={{
            background: chargeColor + "22", color: chargeColor,
            borderRadius: 14, padding: "3px 9px",
            fontSize: 11, fontWeight: 700,
            minWidth: 24, textAlign: "center",
          }}>{session.charge}</span>
        )}
        <button
          onClick={handleToggle}
          aria-label={done ? "Marquer non fait" : "Marquer fait"}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: done ? "2px solid #2e6b3f" : `2px solid ${border}`,
            background: done ? "#2e6b3f" : "transparent",
            color: done ? "#fff" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >✓</button>
      </div>
    </div>
  );
}

function tagStyle({ bg, fg }) {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 10,
    background: bg,
    color: fg,
    letterSpacing: "0.02em",
  };
}

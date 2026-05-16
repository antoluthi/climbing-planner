import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { localDateStr } from "../lib/helpers.js";

// ─── NOTES JOURNALIÈRES ──────────────────────────────────────────────────────

export function DailyNotesSection({ notes, onSave, creatine, onToggleCreatine }) {
  const { styles, isDark } = useThemeCtx();
  const today = localDateStr(new Date());
  const [text, setText] = useState(notes[today] || "");

  // Sync if today's note changes externally
  const savedText = notes[today] || "";
  const [lastSaved, setLastSaved] = useState(savedText);

  const handleBlur = () => {
    if (text !== lastSaved) {
      onSave(today, text);
      setLastSaved(text);
    }
  };

  // Recent entries (last 5, excluding today if empty)
  const recent = Object.entries(notes)
    .filter(([d, t]) => d !== today && t?.trim())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const taStyle = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#241b13" : "#e8e3da",
    border: `1px solid ${isDark ? "#3a2e22" : "#ccc6b8"}`,
    borderRadius: 6, color: isDark ? "#f0e6d0" : "#2a2218",
    fontSize: 12, fontFamily: "inherit", lineHeight: 1.5,
    padding: "10px 12px", resize: "vertical", minHeight: 72,
    outline: "none", transition: "border-color 0.15s",
  };

  return (
    <div style={styles.dashSection}>
      <div style={{ ...styles.dashSectionTitle, marginBottom: 8 }}>
        Notes du jour
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginLeft: 8 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>
      <textarea
        style={taStyle}
        placeholder="Comment tu te sens ? Observations, intentions du jour..."
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={!!creatine?.[today]}
            onChange={() => onToggleCreatine?.(today)}
            style={{ cursor: "pointer", width: 14, height: 14, accentColor: isDark ? "#e0a875" : "#8b4c20" }}
          />
          <span style={{ fontSize: 12, color: isDark ? "#a89a82" : "#a89a82" }}>
            Créatine prise
            {creatine?.[today] && <span style={{ marginLeft: 6, fontSize: 10, color: isDark ? "#e0a875" : "#8b4c20" }}>▲</span>}
          </span>
        </label>
      {recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {recent.map(([d, t]) => (
            <div key={d} style={{ marginBottom: 6, fontSize: 11, color: isDark ? "#a89a82" : "#a89a82" }}>
              <span style={{ fontWeight: 600, marginRight: 6, color: isDark ? "#a89a82" : "#8a7060" }}>{fmtDate(d)}</span>
              {t.length > 100 ? t.slice(0, 100) + "…" : t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

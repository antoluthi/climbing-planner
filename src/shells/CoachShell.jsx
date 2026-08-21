import { ThemeContext } from "../theme/ThemeContext.jsx";
import { ClimbingPlannerLogo } from "../components/Logo.jsx";
import { DayNightToggle } from "../components/DayNightToggle.jsx";
import { colors } from "../theme/palette.js";

export function CoachShell({ isDark, toggleTheme, styles }) {
  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: [] }}>
      <div style={{ ...styles.app, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div style={styles.grain} />
        <ClimbingPlannerLogo isDark={isDark} size={48} />
        <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, color: colors(isDark).accent, fontWeight: 600 }}>
          Vue Coach
        </div>
        <div style={{ fontSize: 13, color: colors(isDark).textMuted, maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
          Barre latérale athlètes, multi-calendrier, gestion de séances — en construction.
        </div>
        <DayNightToggle isDark={isDark} onToggle={toggleTheme} style={{ marginTop: 16 }} />
      </div>
    </ThemeContext.Provider>
  );
}

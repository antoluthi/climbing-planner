import { ThemeContext } from "../theme/ThemeContext.jsx";
import { ClimbingPlannerLogo } from "../components/Logo.jsx";
import { DayNightToggle } from "../components/DayNightToggle.jsx";

export function AthleteShell({ isDark, toggleTheme, styles }) {
  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: [] }}>
      <div style={{ ...styles.app, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div style={styles.grain} />
        <ClimbingPlannerLogo isDark={isDark} size={48} />
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: isDark ? "#e0a875" : "#8b4c20", fontWeight: 600 }}>
          Vue Athlète
        </div>
        <div style={{ fontSize: 13, color: isDark ? "#a89a82" : "#8a7f70", maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
          Planning simplifié, feedback séances, lecture seule — en construction.
        </div>
        <DayNightToggle isDark={isDark} onToggle={toggleTheme} style={{ marginTop: 16 }} />
      </div>
    </ThemeContext.Provider>
  );
}

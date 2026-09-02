import { colors } from "../theme/palette.js";
import { getDiscipline } from "../lib/disciplines.js";
import { RUN_DISCIPLINES } from "../lib/run-goals.js";

// ─── OBJECTIF DE KILOMÈTRES ──────────────────────────────────────────────────
// Une bascule, et surtout la phrase qui dit ce qu'elle compte : sans elle, on
// se demanderait pourquoi une sortie à vélo n'apparaît pas dans le total.
export function RunGoalSection({ isDark, styles, enabled, onChange }) {
  const c = colors(isDark);
  const on = !!enabled;
  const comptees = RUN_DISCIPLINES.map(d => getDiscipline(d).label).join(" et ");

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Objectif de course</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ maxWidth: 250 }}>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>Kilomètres par semaine</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            Ajoute des blocs de course dans <strong>Cycles</strong> : un volume de
            départ, une progression en pour-cent, et chaque semaine réglable à la
            main. La semaine en cours s’affiche alors à l’accueil et au calendrier.
          </div>
          <div style={{ fontSize: 11, color: c.textDim, marginTop: 5, lineHeight: 1.4 }}>
            Seules les séances de <strong>{comptees}</strong> comptent — un
            kilomètre à vélo n’a pas le même prix pour les jambes.
          </div>
        </div>

        <button
          onClick={() => onChange(!on)}
          aria-pressed={on}
          aria-label="Objectif de kilomètres par semaine"
          style={{
            flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: "none",
            background: on ? c.accent : c.border,
            position: "relative", cursor: "pointer",
            transition: "background 0.25s", padding: 0,
          }}
        >
          <div style={{
            position: "absolute", top: 3, left: on ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: c.onColor, transition: "left 0.25s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }} />
        </button>
      </div>
    </div>
  );
}

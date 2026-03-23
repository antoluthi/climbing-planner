import { useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";

// ─── CHOICE MODAL ─────────────────────────────────────────────────────────────
// Shown when clicking "+" on a day — lets user choose between a prefabricated
// session from the catalog, or a quick custom session.

export function AddSessionChoiceModal({ onPrefaite, onPersonnalisee, onClose }) {
  const { styles, isDark } = useThemeCtx();

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#6a7470" : "#9a9080";
  const cardBg = isDark ? "#1a1f1c" : "#f5f2ec";
  const cardBorder = isDark ? "#2e3430" : "#d8d3ca";
  const cardHover = isDark ? "#22281f" : "#eae7de";
  const accent = isDark ? "#7ab890" : "#4a8060";

  const cardStyle = {
    background: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: 10,
    padding: "18px 20px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
    textAlign: "left",
    transition: "background 0.15s, border-color 0.15s",
  };

  return (
    <div style={styles.confirmOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.confirmModal,
          width: "min(400px, 94vw)",
          gap: 0,
          padding: "20px 20px 22px",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: textMain, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            Ajouter une séance
          </span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {/* Préfaite */}
          <button
            style={cardStyle}
            onClick={onPrefaite}
            onMouseEnter={e => { e.currentTarget.style.background = cardHover; e.currentTarget.style.borderColor = accent + "66"; }}
            onMouseLeave={e => { e.currentTarget.style.background = cardBg; e.currentTarget.style.borderColor = cardBorder; }}
          >
            <span style={{ fontSize: 22 }}>📋</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textMain }}>Séance préfaite</span>
            <span style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>
              Choisir dans le catalogue de séances et de blocs
            </span>
          </button>

          {/* Personnalisée */}
          <button
            style={cardStyle}
            onClick={onPersonnalisee}
            onMouseEnter={e => { e.currentTarget.style.background = cardHover; e.currentTarget.style.borderColor = accent + "66"; }}
            onMouseLeave={e => { e.currentTarget.style.background = cardBg; e.currentTarget.style.borderColor = cardBorder; }}
          >
            <span style={{ fontSize: 22 }}>✏️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: textMain }}>Personnalisée</span>
            <span style={{ fontSize: 11, color: textMuted, lineHeight: 1.5 }}>
              Événement libre — nom, dates, heure, couleur, contenu
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

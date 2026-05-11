import { useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";

// ─── DEADLINE DETAIL MODAL ────────────────────────────────────────────────────

const TYPE_LABELS = { competition: "Compétition", sortie: "Sortie", objectif: "Objectif" };
const PRIORITY_ICON = { A: "A", B: "B", C: "C" };
const PRIORITY_LABEL = { A: "Priorité A — Principale", B: "Priorité B — Secondaire", C: "Priorité C — Indicatif" };

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function DeadlineDetailModal({ deadline: dl, onClose, onEdit }) {
  const { styles, isDark } = useThemeCtx();

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#7a8080" : "#8a8070";
  const surfaceAlt = isDark ? "#1a1f1c" : "#f0ece4";
  const border = isDark ? "#2a2f2a" : "#d8d3ca";

  const dateStr = dl.endDate
    ? `${fmtDate(dl.startDate)} → ${fmtDate(dl.endDate)}`
    : fmtDate(dl.startDate);

  return (
    <div style={styles.confirmOverlay} onClick={onClose}>
      <div
        style={{ ...styles.confirmModal, width: "min(400px, 94vw)", gap: 0, padding: 0, overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header strip in deadline color */}
        <div style={{ background: dl.color + "22", borderBottom: `2px solid ${dl.color}55`, padding: "16px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: textMain, lineHeight: 1.2, fontFamily: "'Newsreader', Georgia, serif", marginBottom: 6 }}>
                {PRIORITY_ICON[dl.priority]} {dl.label}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: dl.color, background: dl.color + "22", border: `1px solid ${dl.color}44`, borderRadius: 10, padding: "1px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {TYPE_LABELS[dl.type] || dl.type}
                </span>
                <span style={{ fontSize: 10, color: textMuted, background: surfaceAlt, border: `1px solid ${border}`, borderRadius: 10, padding: "1px 8px" }}>
                  {PRIORITY_LABEL[dl.priority]}
                </span>
              </div>
            </div>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Date */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: textMuted, width: 52, flexShrink: 0 }}>Date</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: textMain }}>{dateStr}</span>
          </div>

          {/* Note */}
          {dl.note && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 11, color: textMuted, width: 52, flexShrink: 0, paddingTop: 2 }}>Note</span>
              <span style={{ fontSize: 13, color: textMain, lineHeight: 1.5, fontStyle: "italic" }}>{dl.note}</span>
            </div>
          )}

          {/* Color swatch */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: textMuted, width: 52, flexShrink: 0 }}>Couleur</span>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: dl.color, border: `2px solid ${dl.color}88`, flexShrink: 0 }} />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button style={styles.confirmCancelBtn} onClick={onClose}>Fermer</button>
            <button
              style={{ ...styles.confirmDeleteBtn, background: dl.color, cursor: "pointer" }}
              onClick={() => onEdit(dl)}
            >
              Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

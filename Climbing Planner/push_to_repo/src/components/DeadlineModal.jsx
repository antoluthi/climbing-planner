import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { CUSTOM_CYCLE_COLORS } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";

// ─── DEADLINE MODAL ───────────────────────────────────────────────────────────

const DEADLINE_TYPES = ["competition", "sortie", "objectif"];
const DEADLINE_TYPE_LABELS = { competition: "Compétition", sortie: "Sortie", objectif: "Objectif" };
const PRIORITY_LABELS = { A: "A — Principale", B: "B — Secondaire", C: "C — Indicatif" };

const DEADLINE_COLORS = [
  "#f43f5e", "#f97316", "#f59e0b", "#22d3ee",
  "#a78bfa", "#60a5fa", "#34d399", "#e879f9",
  "#c8906a", "#94a3b8", "#fb923c", "#facc15",
];

export function DeadlineModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();

  const [label, setLabel] = useState(initial?.label || "");
  const [type, setType] = useState(initial?.type || "competition");
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [color, setColor] = useState(initial?.color || DEADLINE_COLORS[0]);
  const [priority, setPriority] = useState(initial?.priority || "A");
  const [note, setNote] = useState(initial?.note || "");

  const canSave = label.trim() && startDate;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id || generateId(),
      label: label.trim(),
      type,
      startDate,
      endDate: endDate || null,
      color,
      priority,
      note: note.trim(),
    });
  };

  const labelColor = isDark ? "#8a9090" : "#6b7060";
  const inputStyle = { ...styles.customFormInput, width: "100%", boxSizing: "border-box" };
  const fieldStyle = { ...styles.customFormField, flex: 1 };

  return (
    <div style={styles.confirmOverlay}>
      <div style={{ ...styles.confirmModal, width: "min(420px, 96vw)", gap: 14, padding: "20px 22px" }}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier l'échéance" : "Nouvelle échéance"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Label */}
        <input
          style={inputStyle}
          placeholder="Nom de l'échéance… (ex: Coupe régionale)"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />

        {/* Type + Priorité */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={fieldStyle}>
            <span style={styles.customFormLabel}>Type</span>
            <select
              style={{ ...styles.customFormSelect, width: "100%" }}
              value={type}
              onChange={e => setType(e.target.value)}
            >
              {DEADLINE_TYPES.map(t => (
                <option key={t} value={t}>{DEADLINE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div style={{ ...fieldStyle, flex: "0 0 auto" }}>
            <span style={styles.customFormLabel}>Priorité</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["A", "B", "C"].map(p => (
                <button
                  key={p}
                  title={PRIORITY_LABELS[p]}
                  onClick={() => setPriority(p)}
                  style={{
                    width: 32, height: 32, borderRadius: 5, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: priority === p ? `2px solid ${color}` : `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
                    background: priority === p ? color + "33" : (isDark ? "#252b27" : "#ddd7cc"),
                    color: priority === p ? color : (isDark ? "#8a9090" : "#6b7060"),
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Palette couleurs */}
        <div>
          <div style={{ fontSize: 10, color: labelColor, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.1em" }}>Couleur</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {DEADLINE_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                  border: color === c ? "3px solid #fff" : "3px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={fieldStyle}>
            <span style={styles.customFormLabel}>Date de début</span>
            <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div style={fieldStyle}>
            <span style={styles.customFormLabel}>Date de fin <span style={{ fontStyle: "italic", fontWeight: 400 }}>(optionnel)</span></span>
            <input style={inputStyle} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* Note */}
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 52, fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}
          placeholder="Note… (optionnel)"
          value={note}
          onChange={e => setNote(e.target.value)}
        />

        {/* Boutons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={styles.confirmCancelBtn} onClick={onClose}>Annuler</button>
          <button
            style={{ ...styles.confirmDeleteBtn, background: canSave ? color : (isDark ? "#333" : "#ccc"), cursor: canSave ? "pointer" : "default" }}
            onClick={handleSave}
            disabled={!canSave}
          >
            {initial ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

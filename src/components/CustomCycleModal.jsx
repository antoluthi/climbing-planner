import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { CUSTOM_CYCLE_COLORS } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";

// ─── CUSTOM CYCLE MODAL ───────────────────────────────────────────────────────

export function CustomCycleModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || CUSTOM_CYCLE_COLORS[0]);
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [isRepetitive, setIsRepetitive] = useState(initial?.isRepetitive || false);
  const [onWeeks, setOnWeeks] = useState(initial?.onWeeks || 8);
  const [offWeeks, setOffWeeks] = useState(initial?.offWeeks || 4);

  const canSave = name.trim() && startDate && (isRepetitive || endDate);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id || generateId(),
      name: name.trim(),
      color,
      startDate,
      endDate: isRepetitive ? "" : endDate,
      description: description.trim(),
      isRepetitive,
      onWeeks: +onWeeks,
      offWeeks: +offWeeks,
    });
  };

  const inputStyle = { ...styles.customFormInput, width: "100%", boxSizing: "border-box" };
  const fieldStyle = { ...styles.customFormField, flex: 1 };
  const labelColor = isDark ? "#a89a82" : "#6b7060";

  return (
    <div style={styles.confirmOverlay}>
      <div style={{ ...styles.confirmModal, width: "min(400px, 96vw)", gap: 14, padding: "20px 22px" }}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier le cycle" : "Nouveau cycle personnalisé"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Nom */}
        <input style={inputStyle} placeholder="Nom du cycle… (ex: Créatine, Décharge)" value={name} onChange={e => setName(e.target.value)} />

        {/* Palette couleurs */}
        <div>
          <div style={{ fontSize: 10, color: labelColor, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.1em" }}>Couleur</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {CUSTOM_CYCLE_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{
                width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                border: color === c ? "3px solid #fff" : "3px solid transparent",
                boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        {/* Répétitif */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: labelColor, cursor: "pointer" }}>
          <input type="checkbox" checked={isRepetitive} onChange={e => setIsRepetitive(e.target.checked)} style={{ accentColor: color }} />
          Cycle répétitif (alterne ON / OFF depuis la date de début)
        </label>

        {/* Dates */}
        {!isRepetitive ? (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={fieldStyle}>
              <span style={styles.customFormLabel}>Date de début</span>
              <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <span style={styles.customFormLabel}>Date de fin</span>
              <input style={inputStyle} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ ...fieldStyle, flex: "2 1 140px" }}>
              <span style={styles.customFormLabel}>Date de début</span>
              <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={{ ...fieldStyle, flex: "0 0 80px" }}>
              <span style={styles.customFormLabel}>ON (sem.)</span>
              <input style={inputStyle} type="number" min="1" max="52" value={onWeeks} onChange={e => setOnWeeks(e.target.value)} />
            </div>
            <div style={{ ...fieldStyle, flex: "0 0 80px" }}>
              <span style={styles.customFormLabel}>OFF (sem.)</span>
              <input style={inputStyle} type="number" min="1" max="52" value={offWeeks} onChange={e => setOffWeeks(e.target.value)} />
            </div>
          </div>
        )}

        {/* Description */}
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 52, fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}
          placeholder="Notes… (optionnel)"
          value={description}
          onChange={e => setDescription(e.target.value)}
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

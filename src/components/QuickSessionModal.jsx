import { useState, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { generateId } from "../lib/storage.js";

// ─── QUICK SESSION MODAL ──────────────────────────────────────────────────────
// Séance rapide : non enregistrée en base, stockée dans data.quickSessions[]

const COLOR_PALETTE = [
  "#f43f5e", "#f97316", "#f59e0b", "#84cc16",
  "#22d3ee", "#60a5fa", "#a78bfa", "#e879f9",
  "#34d399", "#c8906a", "#94a3b8", "#ffffff",
];

function fmt2(n) { return String(n).padStart(2, "0"); }

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${fmt2(Math.floor(total / 60) % 24)}:${fmt2(total % 60)}`;
}

export function QuickSessionModal({ initial, defaultDate, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();

  const today = defaultDate || new Date().toISOString().slice(0, 10);

  const [name, setName]         = useState(initial?.name || "");
  const [color, setColor]       = useState(initial?.color || "#60a5fa");
  const [startDate, setStartDate] = useState(initial?.startDate || today);
  const [multiDay, setMultiDay] = useState(!!(initial?.endDate));
  const [endDate, setEndDate]   = useState(initial?.endDate || today);
  const [allDay, setAllDay]     = useState(initial?.allDay ?? true);
  const [startTime, setStartTime] = useState(initial?.startTime || "09:00");
  const [duration, setDuration] = useState(initial?.duration ?? 90);
  const [content, setContent]   = useState(initial?.content || "");
  const [isObjective, setIsObjective] = useState(initial?.isObjective ?? false);

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const canSave = name.trim() && startDate;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id || generateId(),
      name: name.trim(),
      color,
      startDate,
      endDate: multiDay && endDate > startDate ? endDate : undefined,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : addMinutes(startTime, Number(duration) || 0),
      duration: allDay ? undefined : Number(duration) || undefined,
      content: content.trim() || undefined,
      isQuick: true,
      isObjective,
    });
    onClose();
  };

  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#7a8080" : "#8a8070";
  const inputBg = isDark ? "#1a1f1c" : "#f5f2ec";
  const inputBorder = isDark ? "#2e3430" : "#d0cbc2";
  const surface = isDark ? "#161a17" : "#ffffff";

  const inputStyle = {
    ...styles.customFormInput,
    background: inputBg,
    border: `1px solid ${inputBorder}`,
    color: textMain,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 11,
    color: textMuted,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={styles.confirmOverlay} onClick={onClose}>
      <div
        style={{ ...styles.confirmModal, width: "min(440px, 96vw)", gap: 0, padding: 0, overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: color + "22", borderBottom: `2px solid ${color}55`, padding: "14px 18px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: textMain, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {initial ? "Modifier la séance" : "Séance personnalisée"}
          </span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>

          {/* Nom */}
          <div>
            <label style={labelStyle}>Nom *</label>
            <input
              style={inputStyle}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex : Stage falaise, Sortie bloc…"
              autoFocus
            />
          </div>

          {/* Couleur */}
          <div>
            <label style={labelStyle}>Couleur</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: c,
                    border: color === c ? `2.5px solid ${isDark ? "#fff" : "#333"}` : `2px solid ${isDark ? "#2a2f2a" : "#ccc"}`,
                    cursor: "pointer", flexShrink: 0,
                    boxShadow: color === c ? `0 0 0 2px ${c}66` : "none",
                    transition: "transform 0.1s",
                    transform: color === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Dates */}
          <div>
            <label style={labelStyle}>Date</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ ...labelStyle, marginBottom: 0, textTransform: "none", fontWeight: 500, fontSize: 12 }}>Plusieurs jours</span>
                <div
                  onClick={() => setMultiDay(v => !v)}
                  style={{
                    width: 34, height: 18, borderRadius: 9,
                    background: multiDay ? color : (isDark ? "#2a3028" : "#ccc"),
                    position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: multiDay ? 16 : 2,
                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s",
                  }} />
                </div>
              </label>
              {multiDay && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: textMuted, whiteSpace: "nowrap" }}>jusqu'au</span>
                  <input type="date" style={{ ...inputStyle, flex: 1 }} value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* Heure */}
          <div>
            <label style={labelStyle}>Heure</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}>
              <div
                onClick={() => setAllDay(v => !v)}
                style={{
                  width: 34, height: 18, borderRadius: 9,
                  background: allDay ? color : (isDark ? "#2a3028" : "#ccc"),
                  position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: allDay ? 16 : 2,
                  width: 14, height: 14, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 12, color: textMuted }}>Toute la journée</span>
            </label>
            {!allDay && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ ...labelStyle, textTransform: "none", fontWeight: 500, fontSize: 11, marginBottom: 3 }}>Début</span>
                  <input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ ...labelStyle, textTransform: "none", fontWeight: 500, fontSize: 11, marginBottom: 3 }}>Durée (min)</span>
                  <input
                    type="number"
                    min={0} max={1440} step={15}
                    style={inputStyle}
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    placeholder="90"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Objectif */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <div
                onClick={() => setIsObjective(v => !v)}
                style={{
                  width: 34, height: 18, borderRadius: 9,
                  background: isObjective ? color : (isDark ? "#2a3028" : "#ccc"),
                  position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: isObjective ? 16 : 2,
                  width: 14, height: 14, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 12, color: isObjective ? textMain : textMuted, fontWeight: isObjective ? 600 : 400 }}>Objectif</span>
            </label>
          </div>

          {/* Contenu */}
          <div>
            <label style={labelStyle}>Contenu</label>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Objectifs, détails, participants…"
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: "10px 18px 14px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: `1px solid ${inputBorder}` }}>
          <button style={styles.confirmCancelBtn} onClick={onClose}>Annuler</button>
          <button
            style={{ ...styles.confirmDeleteBtn, background: canSave ? color : (isDark ? "#3a3028" : "#ccc"), cursor: canSave ? "pointer" : "default", opacity: canSave ? 1 : 0.6 }}
            onClick={handleSave}
            disabled={!canSave}
          >
            {initial ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

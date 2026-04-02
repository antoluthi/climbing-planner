import { useState, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { addDays, localDateStr } from "../lib/helpers.js";
import { isDateInCustomCycle } from "../lib/constants.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";

export function DayLogModal({ initialDate, data, onClose, onSaveNote, onToggleCreatine, onSaveWeight, onAddHooper }) {
  const { isDark } = useThemeCtx();
  const today = localDateStr(new Date());
  const [dateISO, setDateISO] = useState(initialDate);
  const dateObj = new Date(dateISO + "T12:00:00");
  const isToday = dateISO === today;
  const isFutureDay = dateISO > today;

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Notes
  const [noteText, setNoteText] = useState(data.notes?.[dateISO] || "");
  const [noteSaved, setNoteSaved] = useState(data.notes?.[dateISO] || "");
  useEffect(() => {
    setNoteText(data.notes?.[dateISO] || "");
    setNoteSaved(data.notes?.[dateISO] || "");
  }, [dateISO]);
  const noteDirty = noteText !== noteSaved;

  // Weight
  const [weightInput, setWeightInput] = useState(
    data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : ""
  );
  useEffect(() => {
    setWeightInput(data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "");
  }, [dateISO]);
  const weightSavedStr = data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "";
  const weightDirty = weightInput.trim() !== weightSavedStr;

  // Creatine
  const hasCreatine = !!data.creatine?.[dateISO];
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));

  // Hooper
  const HCRIT = [
    { key: "fatigue",  label: "Fatigue",    sub: "épuisement général" },
    { key: "stress",   label: "Stress",      sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures", sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",   sub: "1 = excellent · 7 = très mauvais" },
  ];
  const existingH = (data.hooper || []).find(h => h.date === dateISO);
  const [hForm, setHForm] = useState(
    existingH
      ? { fatigue: existingH.fatigue, stress: existingH.stress, soreness: existingH.soreness, sleep: existingH.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
  );
  useEffect(() => {
    const h = (data.hooper || []).find(e => e.date === dateISO);
    setHForm(h
      ? { fatigue: h.fatigue, stress: h.stress, soreness: h.soreness, sleep: h.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
    );
  }, [dateISO]);
  const hAllFilled = hForm.fatigue && hForm.stress && hForm.soreness && hForm.sleep;
  const hTotal = hAllFilled ? hForm.fatigue + hForm.stress + hForm.soreness + hForm.sleep : null;
  const hFormDirty = existingH
    ? (hForm.fatigue !== existingH.fatigue || hForm.stress !== existingH.stress ||
       hForm.soreness !== existingH.soreness || hForm.sleep !== existingH.sleep)
    : hAllFilled;
  const hCanSave = hAllFilled && (!existingH || hFormDirty);

  // Unified save
  const [savedAnim, setSavedAnim] = useState(false);
  const anyDirty = noteDirty || weightDirty || hCanSave;
  const handleSaveAll = () => {
    if (!anyDirty) return;
    if (noteDirty) { onSaveNote(dateISO, noteText); setNoteSaved(noteText); }
    if (weightDirty) {
      const val = parseFloat(weightInput.replace(",", "."));
      if (!isNaN(val) && val > 0) onSaveWeight(dateISO, Math.round(val * 10) / 10);
      else if (weightInput.trim() === "") onSaveWeight(dateISO, null);
    }
    if (hCanSave) {
      onAddHooper({ date: dateISO, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), ...hForm, total: hTotal });
    }
    setSavedAnim(true);
    setTimeout(() => onClose(), 700);
  };

  const bg = isDark ? "#161b17" : "#f5f0e8";
  const border = isDark ? "#2a2f2a" : "#d4cfc7";
  const sectionBg = isDark ? "#1e231f" : "#e8e3da";
  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#9ca3af" : "#6b7280";
  const accentGreen = isDark ? "#c8906a" : "#8b4c20";
  const borderStyle = `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`;
  const sLabel = { fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, display: "block" };
  const btnNum = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };
  const dateFull = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(4px)", padding: "20px 12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>

        {/* Header navigation */}
        <div style={{ position: "sticky", top: 0, background: bg, borderBottom: `1px solid ${border}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, zIndex: 1 }}>
          <button
            onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), -1).toISOString().slice(0, 10))}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 22, padding: "0 6px", lineHeight: 1, fontFamily: "inherit" }}
          >‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: textMain, textTransform: "capitalize" }}>{dateFull}</div>
            {isToday && <div style={{ fontSize: 10, color: accentGreen, letterSpacing: "0.06em" }}>{"AUJOURD'HUI"}</div>}
            {isFutureDay && <div style={{ fontSize: 10, color: textMuted, letterSpacing: "0.06em" }}>{"À VENIR"}</div>}
          </div>
          <button
            onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), 1).toISOString().slice(0, 10))}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 22, padding: "0 6px", lineHeight: 1, fontFamily: "inherit" }}
          >›</button>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 18, padding: "0 6px", marginLeft: 4, lineHeight: 1, fontFamily: "inherit" }}
          >✕</button>
        </div>

        <div style={{ padding: "18px 18px 24px" }}>

          {/* Notes */}
          <div style={{ marginBottom: 22 }}>
            <span style={sLabel}>Notes</span>
            <textarea
              style={{ width: "100%", boxSizing: "border-box", background: sectionBg, border: borderStyle, borderRadius: 8, color: textMain, fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none" }}
              placeholder="Comment tu te sens ? Observations..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
          </div>

          {/* Poids */}
          <div style={{ marginBottom: 22 }}>
            <span style={sLabel}>Poids</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="number" step="0.1" min="20" max="300" placeholder="—"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                style={{ background: sectionBg, border: borderStyle, borderRadius: 8, color: textMain, fontSize: 22, fontFamily: "inherit", fontWeight: 700, padding: "6px 12px", outline: "none", width: 100, textAlign: "center" }}
              />
              <span style={{ fontSize: 14, color: textMuted }}>kg</span>
            </div>
          </div>

          {/* Créatine */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ ...sLabel, marginBottom: 0 }}>Créatine</span>
              {isInCreatineCycle && !hasCreatine && (
                <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 600 }}>⚠ cycle actif — non prise</span>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={hasCreatine} onChange={() => onToggleCreatine(dateISO)}
                style={{ cursor: "pointer", width: 16, height: 16, accentColor: accentGreen }} />
              <span style={{ fontSize: 14, color: textMain }}>
                Créatine prise
                {hasCreatine && <span style={{ marginLeft: 8, fontSize: 11, color: accentGreen }}>▲</span>}
              </span>
            </label>
          </div>

          {/* Hooper */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ ...sLabel, marginBottom: 0 }}>Indice Hooper</span>
              {existingH && (
                <span style={{ fontSize: 11, color: hooperColor(existingH.total, isDark) }}>
                  {existingH.total} — {hooperLabel(existingH.total)}
                </span>
              )}
            </div>
            {HCRIT.map(({ key, label, sub }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 100, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: textMain }}>{label}</div>
                  <div style={{ fontSize: 9, color: textMuted }}>{sub}</div>
                </div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5, 6, 7].map(v => {
                    const active = hForm[key] === v;
                    const btnBg = active ? (v <= 2 ? accentGreen : v <= 4 ? "#f97316" : "#f87171") : sectionBg;
                    return (
                      <button key={v} onClick={() => setHForm(f => ({ ...f, [key]: v }))}
                        style={{ ...btnNum, background: btnBg, color: active ? "#fff" : textMain, fontWeight: active ? 600 : 400 }}>
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {hTotal !== null && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(hTotal, isDark) }}>
                Indice : {hTotal} — {hooperLabel(hTotal)}
              </div>
            )}
          </div>

        </div>

        {/* ── Sticky save button ── */}
        <div style={{ position: "sticky", bottom: 0, background: bg, borderTop: `1px solid ${border}`, padding: "14px 18px" }}>
          <button
            onClick={handleSaveAll}
            disabled={!anyDirty || savedAnim}
            style={{
              width: "100%",
              background: savedAnim ? (isDark ? "#166534" : "#15803d") : anyDirty ? accentGreen : sectionBg,
              border: "none", borderRadius: 8,
              color: savedAnim ? "#86efac" : anyDirty ? "#fff" : textMuted,
              padding: "12px 20px",
              cursor: anyDirty && !savedAnim ? "pointer" : "default",
              fontSize: savedAnim ? 14 : 13, fontFamily: "inherit", fontWeight: 700,
              opacity: anyDirty || savedAnim ? 1 : 0.45,
              boxShadow: savedAnim ? `0 0 0 2px ${accentGreen}88` : anyDirty ? `0 2px 12px ${accentGreen}44` : "inset 0 1px 3px rgba(0,0,0,0.25)",
              transform: savedAnim ? "scale(1.02)" : anyDirty ? "none" : "translateY(1px)",
              transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
              letterSpacing: savedAnim ? "0.04em" : "0",
            }}
          >
            {savedAnim ? "Enregistré ✓" : "Enregistrer"}
          </button>
        </div>

      </div>
    </div>
  );
}

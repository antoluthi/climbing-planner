import { useState, useEffect, useMemo, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { addDays, localDateStr } from "../lib/helpers.js";
import { isDateInCustomCycle } from "../lib/constants.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";
import { Z } from "../theme/makeStyles.js";
import { toast } from "../lib/toast.js";

// ─── DAYLOG MODAL — refonte cards intelligentes ──────────────────────────────
// Header avec progress bar, sections en cards, Hooper en grid 2×2,
// onboarding inline via icône ?, auto-save debounce.

const HCRIT = [
  { key: "fatigue",  label: "Fatigue",     sub: "épuisement général" },
  { key: "stress",   label: "Stress",      sub: "mental / émotionnel" },
  { key: "soreness", label: "Courbatures", sub: "douleurs musculaires" },
  { key: "sleep",    label: "Sommeil ↓",   sub: "1 = excellent · 7 = très mauvais" },
];

const HOOPER_HELP = "Le score Hooper évalue ta forme du jour sur 4 dimensions (sommeil, fatigue, stress, courbatures). Suivi sur la durée, il aide à détecter le surentraînement.";

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

  // ── Note state ──
  const [noteText, setNoteText] = useState(data.notes?.[dateISO] || "");
  const [noteSaved, setNoteSaved] = useState(data.notes?.[dateISO] || "");
  useEffect(() => {
    setNoteText(data.notes?.[dateISO] || "");
    setNoteSaved(data.notes?.[dateISO] || "");
  }, [dateISO]);
  const noteDirty = noteText !== noteSaved;

  // ── Weight ──
  const [weightInput, setWeightInput] = useState(
    data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : ""
  );
  useEffect(() => {
    setWeightInput(data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "");
  }, [dateISO]);
  const weightSavedStr = data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "";
  const weightDirty = weightInput.trim() !== weightSavedStr;

  // ── Creatine ──
  const hasCreatine = !!data.creatine?.[dateISO];
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));

  // ── Hooper ──
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

  const [helpOpen, setHelpOpen] = useState(false);
  const [savedAnim, setSavedAnim] = useState(false);
  const [microToast, setMicroToast] = useState("");
  const microToastTimer = useRef(null);

  // Progress segments: notes, weight, creatine (if cycle active OR taken), hooper
  const progress = useMemo(() => {
    const segs = [];
    segs.push({ key: "notes",    on: !!noteSaved.trim() || !!noteText.trim() });
    segs.push({ key: "weight",   on: !!weightSavedStr.trim() });
    segs.push({ key: "creatine", on: hasCreatine || !isInCreatineCycle });
    segs.push({ key: "hooper",   on: !!existingH });
    return segs;
  }, [noteSaved, noteText, weightSavedStr, hasCreatine, isInCreatineCycle, existingH]);
  const filledCount = progress.filter(s => s.on).length;

  // ── Auto-save on blur (debounced via blur events) ──
  const showMicroToast = (msg) => {
    setMicroToast(msg);
    clearTimeout(microToastTimer.current);
    microToastTimer.current = setTimeout(() => setMicroToast(""), 1600);
  };

  const flushNote = () => {
    if (noteDirty) {
      onSaveNote(dateISO, noteText);
      setNoteSaved(noteText);
      showMicroToast("Notes enregistrées");
    }
  };
  const flushWeight = () => {
    if (!weightDirty) return;
    const val = parseFloat(weightInput.replace(",", "."));
    if (!isNaN(val) && val > 0) {
      onSaveWeight(dateISO, Math.round(val * 10) / 10);
      showMicroToast("Poids enregistré");
    } else if (weightInput.trim() === "") {
      onSaveWeight(dateISO, null);
    }
  };

  // Unified save: flush all
  const anyDirty = noteDirty || weightDirty || hCanSave;
  const handleSaveAll = () => {
    if (!anyDirty) return;
    const saved = [];
    if (noteDirty) { onSaveNote(dateISO, noteText); setNoteSaved(noteText); saved.push("note"); }
    if (weightDirty) {
      const val = parseFloat(weightInput.replace(",", "."));
      if (!isNaN(val) && val > 0) { onSaveWeight(dateISO, Math.round(val * 10) / 10); saved.push("poids"); }
      else if (weightInput.trim() === "") onSaveWeight(dateISO, null);
    }
    if (hCanSave) {
      onAddHooper({ date: dateISO, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), ...hForm, total: hTotal });
      saved.push("Hooper");
    }
    setSavedAnim(true);
    toast.success(`Journal enregistré${saved.length ? ` · ${saved.join(", ")}` : ""}`);
    setTimeout(() => onClose(), 700);
  };

  // ── Tokens ──
  const paper        = isDark ? "#1f2421" : "#fcf8ef";
  const paperDim     = isDark ? "#1a1f1c" : "#f7f1e2";
  const surfaceCard  = isDark ? "#1f2421" : "#ffffff";
  const surfaceMuted = isDark ? "#222a23" : "#f0ebde";
  const border       = isDark ? "#2a302a" : "#e6dfd1";
  const borderStrong = isDark ? "#3a4035" : "#d8d0bf";
  const text         = isDark ? "#e8e4de" : "#2a2218";
  const textMid      = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight    = isDark ? "#7a7570" : "#8a7f70";
  const accent       = isDark ? "#c8906a" : "#8b4c20";
  const inkPrimary   = isDark ? "#c8c0b4" : "#2a2218";

  const dateFull = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const weekN = (() => {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  })();

  const cardLabel = {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 13,
    fontWeight: 500,
    color: text,
    letterSpacing: "0.02em",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.daylog, padding: "20px 12px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: paper,
          border: `1px solid ${borderStrong}`,
          borderRadius: 18,
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Header ────────────────────────────── */}
        <div style={{
          padding: "16px 18px 14px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {dateFull} · S{String(weekN).padStart(2, "0")}
              </div>
              <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 500, color: text, marginTop: 2 }}>
                Journal du jour
                {isFutureDay && <span style={{ fontSize: 11, color: textLight, marginLeft: 8, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>(à venir)</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), -1).toISOString().slice(0, 10))}
                style={navBtnStyle({ border, textLight })}
                aria-label="Jour précédent"
              >‹</button>
              <button
                onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), 1).toISOString().slice(0, 10))}
                style={navBtnStyle({ border, textLight })}
                aria-label="Jour suivant"
              >›</button>
              <button
                onClick={onClose}
                aria-label="Fermer"
                style={{ background: "none", border: "none", color: textLight, cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1, fontFamily: "inherit", marginLeft: 4 }}
              >✕</button>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 4, marginTop: 14 }} aria-label={`${filledCount} sur ${progress.length} sections complétées`}>
            {progress.map(seg => (
              <div
                key={seg.key}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: seg.on ? accent : border,
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: textLight, marginTop: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {filledCount}/{progress.length} complété{filledCount > 1 ? "s" : ""}
          </div>
        </div>

        {/* ── Body scrollable ─────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 8px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Card 1 : Notes "Comment ça va ?" */}
          <div style={cardStyle({ surfaceCard, border })}>
            <div style={{ ...cardLabel, marginBottom: 10 }}>Comment ça va ?</div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onBlur={flushNote}
              placeholder="3 lignes, 30 secondes — comment se sent ton corps, ta tête, ta motivation ?"
              style={{
                width: "100%", boxSizing: "border-box",
                background: paperDim, border: `1px solid ${border}`,
                borderRadius: 8, padding: "8px 10px",
                fontSize: 13, fontFamily: "inherit", color: text,
                lineHeight: 1.5, minHeight: 80, resize: "vertical", outline: "none",
              }}
            />
          </div>

          {/* Row poids + créatine */}
          <div style={{ display: "flex", gap: 8 }}>
            {/* Poids stepper */}
            <div style={{ ...cardStyle({ surfaceCard, border }), padding: "10px 12px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: textLight, flex: 1 }}>Poids</span>
                <button
                  onClick={() => {
                    const cur = parseFloat(weightInput.replace(",", ".")) || 0;
                    const next = Math.max(0, Math.round((cur - 0.1) * 10) / 10);
                    setWeightInput(String(next));
                  }}
                  style={stepperBtn({ surfaceMuted, accent })}
                  aria-label="Diminuer"
                >−</button>
                <input
                  type="text" inputMode="decimal"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onBlur={flushWeight}
                  placeholder="—"
                  style={{
                    width: 50, textAlign: "center",
                    background: "transparent", border: "none",
                    fontSize: 14, fontWeight: 600, color: text,
                    fontFamily: "inherit", outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    const cur = parseFloat(weightInput.replace(",", ".")) || 0;
                    const next = Math.round((cur + 0.1) * 10) / 10;
                    setWeightInput(String(next));
                  }}
                  style={stepperBtn({ surfaceMuted, accent })}
                  aria-label="Augmenter"
                >+</button>
              </div>
            </div>

            {/* Créatine */}
            <button
              onClick={() => onToggleCreatine(dateISO)}
              style={{
                ...cardStyle({ surfaceCard, border }),
                padding: "10px 14px", flex: 1,
                background: hasCreatine ? (isDark ? "#1c2d20" : "#e3f0e5") : surfaceCard,
                border: hasCreatine ? `1px solid ${isDark ? "#3a5a3a" : "#a8d0a8"}` : `1px solid ${border}`,
                display: "flex", alignItems: "center", gap: 8,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                width: "auto",
              }}
            >
              <span style={{ fontSize: 11, color: hasCreatine ? (isDark ? "#7ab890" : "#2e6b3f") : textLight, flex: 1 }}>
                Créatine
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: hasCreatine ? (isDark ? "#7ab890" : "#2e6b3f") : (isInCreatineCycle ? "#ef4444" : textLight),
              }}>
                {hasCreatine ? "✓ Prise" : (isInCreatineCycle ? "⚠ —" : "—")}
              </span>
            </button>
          </div>

          {/* Card Hooper */}
          <div style={cardStyle({ surfaceCard, border })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={cardLabel}>Hooper</span>
                <button
                  onClick={() => setHelpOpen(v => !v)}
                  aria-label="À quoi sert le Hooper ?"
                  style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: accent + "22", color: accent,
                    fontSize: 10, fontWeight: 700, border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "inherit",
                  }}
                >?</button>
              </div>
              <span style={{
                fontFamily: "'Newsreader', Georgia, serif", fontSize: 16, fontWeight: 700,
                color: hTotal ? hooperColor(hTotal, isDark) : textLight,
              }}>
                {hTotal ? `${hTotal} / 28` : "—"}
              </span>
            </div>
            {helpOpen && (
              <div style={{
                background: accent + "12", border: `1px solid ${accent}33`,
                borderRadius: 6, padding: "8px 10px", marginBottom: 10,
                fontSize: 11, color: textMid, lineHeight: 1.5,
              }}>
                {HOOPER_HELP}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {HCRIT.map(({ key, label, sub }) => {
                const val = hForm[key];
                // Code couleur : sleep est inversé (1 = bon, 7 = mauvais)
                // mais standard Hooper : tous les indicateurs vont dans le même sens (1 = bon, 7 = mauvais)
                const colorForVal = (v) => {
                  if (!v) return null;
                  if (v <= 3) return "#7ab890";
                  if (v <= 5) return "#d4a843";
                  return "#b83030";
                };
                const valColor = colorForVal(val);
                return (
                  <div key={key} style={{ background: paperDim, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: textMid, fontWeight: 500 }}>{label}</span>
                      <span style={{
                        fontFamily: "'Newsreader', Georgia, serif",
                        fontSize: 13, fontWeight: 700,
                        color: valColor || textLight,
                      }}>
                        {val ?? "—"}
                      </span>
                    </div>
                    {/* 7 dots */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {[1, 2, 3, 4, 5, 6, 7].map(v => {
                        const on = val != null && v <= val;
                        const isWarn = on && v >= 6;
                        return (
                          <button
                            key={v}
                            onClick={() => setHForm(f => ({ ...f, [key]: v }))}
                            aria-label={`${label} ${v}`}
                            style={{
                              flex: 1, height: 6, borderRadius: 3,
                              background: on
                                ? (isWarn ? "#b83030" : (v >= 4 ? "#d4a843" : "#7ab890"))
                                : border,
                              border: "none", cursor: "pointer", padding: 0,
                              transition: "background 0.1s",
                            }}
                          />
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 9, color: textLight, marginTop: 4, letterSpacing: "0.02em" }}>{sub}</div>
                  </div>
                );
              })}
            </div>
            {hTotal !== null && (
              <div style={{ fontSize: 11, color: textLight, marginTop: 10 }}>
                <span style={{ color: hooperColor(hTotal, isDark), fontWeight: 600 }}>{hooperLabel(hTotal)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer sticky ─────────────────────────── */}
        <div style={{
          padding: "14px 18px",
          background: paperDim,
          borderTop: `1px solid ${border}`,
          flexShrink: 0,
          position: "relative",
        }}>
          {microToast && (
            <div style={{
              position: "absolute", top: -38, right: 16,
              background: inkPrimary, color: isDark ? paper : "#fff",
              fontSize: 11, padding: "6px 10px", borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              fontFamily: "inherit",
            }}>
              {microToast}
            </div>
          )}
          <button
            onClick={handleSaveAll}
            disabled={!anyDirty && !savedAnim}
            style={{
              width: "100%",
              background: savedAnim ? "#2e6b3f" : inkPrimary,
              color: savedAnim ? "#fff" : (isDark ? paper : "#fff"),
              border: "none", borderRadius: 10,
              padding: "12px 16px",
              fontSize: 14, fontWeight: 600,
              fontFamily: "inherit",
              opacity: anyDirty || savedAnim ? 1 : 0.45,
              cursor: anyDirty && !savedAnim ? "pointer" : "default",
              transition: "all 0.25s",
              transform: savedAnim ? "scale(1.01)" : "none",
            }}
          >
            {savedAnim ? "Enregistré ✓" : "Enregistrer la journée"}
          </button>
        </div>
      </div>
    </div>
  );
}

function cardStyle({ surfaceCard, border }) {
  return {
    background: surfaceCard,
    border: `1px solid ${border}`,
    borderRadius: 12,
    padding: 14,
  };
}

function navBtnStyle({ border, textLight }) {
  return {
    background: "none", border: `1px solid ${border}`, borderRadius: 6,
    color: textLight, cursor: "pointer", fontSize: 16, fontFamily: "inherit",
    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
  };
}

function stepperBtn({ surfaceMuted, accent }) {
  return {
    width: 24, height: 24, borderRadius: "50%",
    background: surfaceMuted, color: accent,
    border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit",
  };
}

import { useState, useEffect, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { localDateStr, getLastKnownWeight } from "../lib/helpers.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";
import { Z, RADIUS } from "../theme/makeStyles.js";
import { pushLayer, lockBodyScroll } from "../lib/native.js";
import { colors } from "../theme/palette.js";
import { PrimaryButton, SecondaryButton, RoundIconButton, SANS, MONO } from "./ui/Ascent.jsx";

// ─── JOURNAL DU JOUR — assistant en trois étapes ──────────────────────────────
// Hooper → Poids → Notes, avec une barre de progression en haut et une
// navigation Précédent / Suivant en bas. Chaque étape enregistre en la quittant,
// donc abandonner en cours de route ne perd que l'étape courante.
//
// Les rappels ne sont plus ici : leur place est l'écran Cycles.

// Les quatre dimensions du score Hooper, chacune notée de 1 à 7.
// L'échelle et le calcul ne changent pas : total = somme des quatre (4-28),
// interprété par hooperLabel() / hooperColor().
const HCRIT = [
  { key: "sleep",    label: "Sommeil",     low: "excellent",  high: "très mauvais" },
  { key: "fatigue",  label: "Fatigue",     low: "en forme",   high: "épuisé" },
  { key: "stress",   label: "Stress",      low: "serein",     high: "sous pression" },
  { key: "soreness", label: "Courbatures", low: "aucune",     high: "très douloureux" },
];

const STEPS = ["Ressenti", "Poids", "Notes"];

export function DayLogModal({ initialDate, data, onClose, onSaveNote, onSaveWeight, onAddHooper }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const dateISO = initialDate || localDateStr(new Date());
  const dateObj = new Date(dateISO + "T12:00:00");

  const [step, setStep] = useState(0);

  // ── Hooper ──
  const existingH = (data.hooper || []).find(h => h.date === dateISO);
  const [hForm, setHForm] = useState(
    existingH
      ? { sleep: existingH.sleep, fatigue: existingH.fatigue, stress: existingH.stress, soreness: existingH.soreness }
      : { sleep: 4, fatigue: 4, stress: 4, soreness: 4 }
  );
  const hTotal = HCRIT.reduce((sum, cr) => sum + (hForm[cr.key] || 0), 0);

  // ── Poids ──
  const [weightStr, setWeightStr] = useState(() => {
    const w = data.weight?.[dateISO];
    if (w != null) return String(w);
    const last = getLastKnownWeight(data, dateISO);
    return last != null ? String(last) : "";
  });

  // ── Notes ──
  const [noteText, setNoteText] = useState(data.notes?.[dateISO] || "");

  // ── Pile de calques : Échap et bouton retour Android ──
  const requestCloseRef = useRef(null);
  useEffect(() => {
    const layer = pushLayer(() => requestCloseRef.current?.());
    const unlock = lockBodyScroll();
    const onKey = (e) => { if (e.key === "Escape" && layer.isTop()) requestCloseRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); layer.remove(); unlock(); };
  }, []);

  // Enregistre l'étape que l'on quitte — rien n'est perdu si on ferme en route.
  const persistStep = (i) => {
    if (i === 0) {
      onAddHooper?.({
        date: dateISO,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        ...hForm,
        total: hTotal,
      });
    } else if (i === 1) {
      const v = parseFloat(weightStr.replace(",", "."));
      if (!isNaN(v) && v > 0) onSaveWeight?.(dateISO, Math.round(v * 10) / 10);
      else if (weightStr.trim() === "") onSaveWeight?.(dateISO, null);
    } else if (i === 2) {
      onSaveNote?.(dateISO, noteText);
    }
  };

  const close = () => { persistStep(step); onClose(); };
  // Le calque ne connaît qu'une référence : on la garde à jour hors rendu.
  useEffect(() => { requestCloseRef.current = close; });

  const goTo = (next) => {
    persistStep(step);
    if (next < 0 || next >= STEPS.length) { onClose(); return; }
    setStep(next);
  };

  const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: Z.daylog,
        background: c.overlayBg, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.modalBg, border: `1px solid ${c.border}`,
          borderRadius: RADIUS.cardLg, width: "min(420px, 100%)",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden", fontFamily: SANS,
        }}
      >
        {/* ── Progression ── */}
        <div style={{ height: 4, background: c.control, flexShrink: 0 }}>
          <div style={{
            height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`,
            background: c.accent, transition: "width 0.25s ease",
          }} />
        </div>

        {/* ── En-tête ── */}
        <div style={{
          padding: "16px 18px 12px", display: "flex", alignItems: "center",
          gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "1px",
              textTransform: "uppercase", color: c.textDim,
            }}>
              {STEPS[step]} · {step + 1}/{STEPS.length}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: c.text, marginTop: 3, textTransform: "capitalize" }}>
              {dateLabel}
            </div>
          </div>
          <RoundIconButton isDark={isDark} size={32} label="Fermer" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </RoundIconButton>
        </div>

        {/* ── Corps ── */}
        <div style={{ padding: "4px 18px 18px", overflowY: "auto", flex: 1 }}>
          {step === 0 && (
            <>
              {HCRIT.map(cr => (
                <HooperSlider
                  key={cr.key}
                  isDark={isDark}
                  crit={cr}
                  value={hForm[cr.key]}
                  onChange={v => setHForm(f => ({ ...f, [cr.key]: v }))}
                />
              ))}
              <div style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${c.border}`,
              }}>
                <span style={{ fontSize: 13, color: c.textMuted }}>Score du jour</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ font: `700 22px ${MONO}`, color: hooperColor(hTotal, isDark) }}>{hTotal}</span>
                  <span style={{ fontSize: 12, color: c.textMuted }}>{hooperLabel(hTotal)}</span>
                </span>
              </div>
            </>
          )}

          {step === 1 && (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 14 }}>
                Pré-rempli avec ta dernière valeur connue — ajuste si besoin.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
                <RoundIconButton isDark={isDark} size={40} label="Moins"
                  onClick={() => setWeightStr(w => {
                    const v = parseFloat(w.replace(",", ".")) || 0;
                    return v > 0.1 ? String(Math.round((v - 0.1) * 10) / 10) : w;
                  })}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>−</span>
                </RoundIconButton>
                <input
                  type="number" step="0.1" inputMode="decimal"
                  value={weightStr}
                  placeholder="—"
                  onChange={e => setWeightStr(e.target.value)}
                  style={{
                    font: `700 30px ${MONO}`, color: c.text, background: "transparent",
                    border: "none", outline: "none", width: 130, textAlign: "center",
                  }}
                />
                <RoundIconButton isDark={isDark} size={40} label="Plus"
                  onClick={() => setWeightStr(w => {
                    const v = parseFloat(w.replace(",", "."));
                    return String(Math.round(((isNaN(v) ? 0 : v) + 0.1) * 10) / 10);
                  })}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
                </RoundIconButton>
              </div>
              <div style={{ textAlign: "center", fontSize: 12, color: c.textDim, marginTop: 6 }}>kg</div>
            </div>
          )}

          {step === 2 && (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }}>
                Sensations, contexte, ce que tu veux retenir de la journée.
              </div>
              <textarea
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Note du jour…"
                rows={7}
                style={{
                  width: "100%", background: c.control, border: "none",
                  borderRadius: RADIUS.control, padding: 14, color: c.text,
                  fontSize: 14, fontFamily: SANS, lineHeight: 1.5,
                  outline: "none", resize: "vertical",
                }}
              />
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <div style={{
          display: "flex", gap: 10, padding: "12px 18px 18px",
          borderTop: `0.5px solid ${c.border}`, flexShrink: 0,
        }}>
          {step > 0 && (
            <SecondaryButton isDark={isDark} height={46} style={{ flex: 1 }} onClick={() => goTo(step - 1)}>
              Précédent
            </SecondaryButton>
          )}
          <PrimaryButton isDark={isDark} height={46} style={{ flex: 2 }} onClick={() => goTo(step + 1)}>
            {step === STEPS.length - 1 ? "Terminer" : "Suivant"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ── Curseur d'une dimension Hooper (1-7) ─────────────────────────────────────
function HooperSlider({ isDark, crit, value, onChange }) {
  const c = colors(isDark);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{crit.label}</span>
        <span style={{ font: `700 15px ${MONO}`, color: c.accent }}>{value}</span>
      </div>
      <input
        type="range"
        min="1" max="7" step="1"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={crit.label}
        style={{ width: "100%", accentColor: c.accent, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 11, color: c.textDim }}>1 · {crit.low}</span>
        <span style={{ fontSize: 11, color: c.textDim }}>7 · {crit.high}</span>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Modal } from "../ui/Modal.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { PrimaryButton, RoundIconButton, Chip, SANS, MONO } from "../ui/Ascent.jsx";
import { calcEndTime } from "../../lib/helpers.js";

// ─── QUAND & OÙ ───────────────────────────────────────────────────────────────
// Seconde étape de l'ajout : l'heure de départ et le lieu, ce qui place la
// séance dans le calendrier. La flèche en haut à gauche revient au formulaire,
// avec ce qui y avait été saisi.

function defaultTimeFor(dayDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(dayDate);
  dd.setHours(0, 0, 0, 0);
  if (dd.getTime() === today.getTime()) {
    const now = new Date();
    const next30 = new Date(now);
    next30.setMinutes(now.getMinutes() < 30 ? 30 : 60);
    next30.setSeconds(0);
    return `${String(next30.getHours()).padStart(2, "0")}:${String(next30.getMinutes()).padStart(2, "0")}`;
  }
  return "18:00";
}

export function SessionScheduleModal({
  sessionName,
  dayLabel,
  dayDate,
  defaultStartTime,
  defaultLocation,
  estimatedTime,
  recentLocations = [],
  onConfirm,
  onSkip,
  onBack,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const [startTime, setStartTime] = useState(defaultStartTime || defaultTimeFor(dayDate || new Date()));
  const [location, setLocation] = useState(defaultLocation || "");
  const locationRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => locationRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const canConfirm = startTime.trim().length >= 4;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      startTime: startTime.trim(),
      endTime: estimatedTime ? calcEndTime(startTime.trim(), estimatedTime) : null,
      location: location.trim(),
    });
  };

  const confirmRef = useRef(handleConfirm);
  useEffect(() => { confirmRef.current = handleConfirm; });
  useEffect(() => {
    const h = e => { if (e.key === "Enter") confirmRef.current?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const suggestions = useMemo(() => {
    const q = location.trim().toLowerCase();
    const uniques = Array.from(new Set(recentLocations.filter(Boolean)));
    if (!q) return uniques.slice(0, 4);
    return uniques.filter(l => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 4);
  }, [recentLocations, location]);

  const label = (txt) => (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
      color: c.textDim, marginBottom: 8,
    }}>{txt}</div>
  );

  return (
    <Modal onClose={onSkip} maxWidth={440} zIndex={Z.modal} ariaLabel="Quand et où">
      {/* ── En-tête : retour, titre ── */}
      <div style={{
        padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: `0.5px solid ${c.border}`, flexShrink: 0, fontFamily: SANS,
      }}>
        {onBack && (
          <RoundIconButton isDark={isDark} size={34} label="Revenir au formulaire" onClick={onBack}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </RoundIconButton>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px", color: c.text }}>
            Quand & où
          </div>
          {(sessionName || dayLabel) && (
            <div style={{
              fontSize: 12, color: c.textDim, marginTop: 2, textTransform: "capitalize",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {[sessionName, dayLabel].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <RoundIconButton isDark={isDark} size={34} label="Fermer" onClick={onSkip}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </RoundIconButton>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", fontFamily: SANS }}>
        {label("Heure de départ")}
        <input
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
          style={{
            width: "100%", background: c.control, border: "none", outline: "none",
            borderRadius: RADIUS.control, padding: "12px 16px", color: c.text,
            font: `700 18px ${MONO}`,
          }}
        />

        <div style={{ marginTop: 20 }}>
          {label("Lieu")}
          <input
            ref={locationRef}
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Arkose, Buoux, la maison…"
            style={{
              width: "100%", background: c.control, border: "none", outline: "none",
              borderRadius: RADIUS.control, padding: "12px 16px", color: c.text,
              fontSize: 15, fontFamily: SANS,
            }}
          />
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {suggestions.map(s => (
                <Chip key={s} isDark={isDark} size="sm" label={s} onClick={() => setLocation(s)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: "12px 18px 16px", borderTop: `0.5px solid ${c.border}`, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 12, fontFamily: SANS,
      }}>
        <button
          onClick={onSkip}
          style={{
            background: "none", border: "none", cursor: "pointer", color: c.textMuted,
            fontSize: 13, fontFamily: SANS, padding: "8px 4px",
          }}
        >
          Plus tard
        </button>
        <PrimaryButton
          isDark={isDark} height={46} onClick={handleConfirm}
          style={{ width: "auto", padding: "0 24px", marginLeft: "auto", opacity: canConfirm ? 1 : 0.45 }}
        >
          Terminer
        </PrimaryButton>
      </div>
    </Modal>
  );
}

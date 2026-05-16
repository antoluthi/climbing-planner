import { useState, useEffect, useMemo, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";
import { Button } from "./ui/Button.jsx";
import { calcEndTime } from "../lib/helpers.js";

// ─── SESSION SCHEDULE MODAL ───────────────────────────────────────────────────
// S'ouvre après l'ajout d'une séance pour demander heure + lieu (calendrier).
// L'utilisateur peut "Plus tard" pour différer.

function defaultTimeFor(dayDate) {
  // Heuristique : si c'est aujourd'hui, propose l'heure courante arrondie à
  // la prochaine demi-heure. Sinon, propose 18:00 (créneau soir typique).
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
  dayDate,                // Date object du jour cible (pour heure par défaut)
  defaultStartTime,       // pré-remplissage (depuis la session)
  defaultLocation,        // pré-remplissage (depuis la session)
  estimatedTime,          // pour calculer endTime
  recentLocations = [],   // suggestions
  onConfirm,              // ({ startTime, endTime, location })
  onSkip,                 // utilisé aussi comme fermeture overlay/escape
}) {
  const { isDark } = useThemeCtx();
  const [startTime, setStartTime] = useState(defaultStartTime || defaultTimeFor(dayDate || new Date()));
  const [location, setLocation] = useState(defaultLocation || "");
  const timeRef = useRef(null);
  const locationRef = useRef(null);

  // Focus du premier champ vide au montage
  useEffect(() => {
    const t = setTimeout(() => {
      if (!defaultStartTime) timeRef.current?.focus();
      else locationRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [defaultStartTime]);

  const canConfirm = startTime.trim().length >= 4 && location.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      startTime: startTime.trim(),
      endTime: estimatedTime ? calcEndTime(startTime.trim(), estimatedTime) : null,
      location: location.trim(),
    });
  };

  // Esc → skip (différer), Enter → confirmer si valide. Ref pour rester
  // synchronisé avec la dernière version de handleConfirm sans warning hooks.
  const handleConfirmRef = useRef(handleConfirm);
  useEffect(() => { handleConfirmRef.current = handleConfirm; });
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onSkip();
      if (e.key === "Enter") handleConfirmRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Suggestions filtrées
  const suggestions = useMemo(() => {
    const q = location.trim().toLowerCase();
    const uniques = Array.from(new Set(recentLocations.filter(Boolean)));
    if (!q) return uniques.slice(0, 4);
    return uniques.filter(l => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 4);
  }, [recentLocations, location]);

  // Tokens
  const paper        = isDark ? "#241b13" : "#fcf8ef";
  const paperDim     = isDark ? "#15100b" : "#f7f1e2";
  const surfaceCard  = isDark ? "#241b13" : "#ffffff";
  const border       = isDark ? "#3a2e22" : "#e6dfd1";
  const borderStrong = isDark ? "#3a2e22" : "#d8d0bf";
  const text         = isDark ? "#f0e6d0" : "#2a2218";
  const textMid      = isDark ? "#c4b69c" : "#5a4d3c";
  const textLight    = isDark ? "#a89a82" : "#8a7f70";
  const accent       = isDark ? "#e0a875" : "#8b4c20";

  const labelStyle = {
    display: "block",
    fontSize: 11,
    color: textLight,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    fontWeight: 600,
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: surfaceCard,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    color: text,
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Programmer la séance"
      onClick={e => { if (e.target === e.currentTarget) onSkip(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        zIndex: Z.nested,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: paper,
          border: `1px solid ${borderStrong}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 420,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 56px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            background: isDark
              ? `linear-gradient(180deg, ${paper}, ${paperDim})`
              : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
            borderBottom: `1px solid ${border}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: accent,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {dayLabel || "Programmer"}
          </div>
          <div
            style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 22,
              fontWeight: 500,
              color: text,
              lineHeight: 1.2,
            }}
          >
            Quand & où ?
          </div>
          {sessionName && (
            <div
              style={{
                fontSize: 12,
                color: textMid,
                marginTop: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ fontStyle: "italic" }}>{sessionName}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 12, color: textLight, lineHeight: 1.5, margin: 0 }}>
            Renseigne l'heure et le lieu pour synchroniser la séance avec ton calendrier.
          </p>

          {/* Heure */}
          <div>
            <label htmlFor="schedule-time" style={labelStyle}>Heure de départ</label>
            <input
              ref={timeRef}
              id="schedule-time"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
              onBlur={e => (e.currentTarget.style.borderColor = border)}
              style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }}
            />
          </div>

          {/* Lieu */}
          <div>
            <label htmlFor="schedule-location" style={labelStyle}>Lieu</label>
            <input
              ref={locationRef}
              id="schedule-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Ex : Arkose Nation, Buoux, Bloc'Up…"
              onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
              onBlur={e => (e.currentTarget.style.borderColor = border)}
              style={inputStyle}
            />
            {suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => setLocation(s)}
                    type="button"
                    style={{
                      background: accent + "16",
                      border: `1px solid ${accent}33`,
                      color: accent,
                      borderRadius: 12,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: paperDim,
            borderTop: `1px solid ${border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Button variant="ghost" size="md" onClick={onSkip}>Plus tard</Button>
          <Button variant="primary" size="md" disabled={!canConfirm} onClick={handleConfirm}>
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  );
}

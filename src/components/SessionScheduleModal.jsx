import { useState, useEffect, useMemo, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Button } from "./ui/Button.jsx";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { Field, TextInput } from "./ui/Field.jsx";
import { calcEndTime } from "../lib/helpers.js";

// ─── SESSION SCHEDULE MODAL ───────────────────────────────────────────────────
// S'ouvre après l'ajout d'une séance pour demander heure + lieu (calendrier).
// L'utilisateur peut "Plus tard" pour différer.

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
}) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  // Fermer (backdrop / Échap / ✕ / retour Android) = "Plus tard", mais si
  // l'utilisateur a déjà modifié heure ou lieu, on confirme avant de jeter.
  const { requestClose, markDirty, confirmOpen, confirmProps } = useConfirmClose(onSkip, {
    title: "Programmer plus tard ?",
    sub: "L'heure et le lieu saisis ne seront pas conservés.",
    confirmLabel: "Plus tard",
    cancelLabel: "Continuer",
  });
  const [startTime, _setStartTime] = useState(defaultStartTime || defaultTimeFor(dayDate || new Date()));
  const setStartTime = v => { markDirty(); _setStartTime(v); };
  const [location, _setLocation] = useState(defaultLocation || "");
  const setLocation = v => { markDirty(); _setLocation(v); };
  const timeRef = useRef(null);
  const locationRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!defaultStartTime) timeRef.current?.focus();
      else locationRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [defaultStartTime]);

  const canConfirm = startTime.trim().length >= 4;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      startTime: startTime.trim(),
      endTime: estimatedTime ? calcEndTime(startTime.trim(), estimatedTime) : null,
      location: location.trim(),
    });
  };

  // Enter → confirmer (Esc géré par le Modal via onSkip).
  const handleConfirmRef = useRef(handleConfirm);
  useEffect(() => { handleConfirmRef.current = handleConfirm; });
  useEffect(() => {
    const h = e => { if (e.key === "Enter") handleConfirmRef.current?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const suggestions = useMemo(() => {
    const q = location.trim().toLowerCase();
    const uniques = Array.from(new Set(recentLocations.filter(Boolean)));
    if (!q) return uniques.slice(0, 4);
    return uniques.filter(l => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 4);
  }, [recentLocations, location]);

  return (
    <Modal onClose={requestClose} maxWidth={420} ariaLabel="Programmer la séance">
      <ModalHeader eyebrow={dayLabel || "Programmer"} title="Quand & où ?" onClose={requestClose} />
      <ModalBody>
        {sessionName && (
          <p style={{ fontSize: 13, color: T.textMid, margin: 0, fontStyle: "italic" }}>{sessionName}</p>
        )}
        <p style={{ fontSize: 12, color: T.textLight, lineHeight: 1.5, margin: 0 }}>
          Renseigne l'heure et le lieu pour synchroniser la séance avec ton calendrier.
        </p>

        <Field label="Heure de départ">
          <TextInput
            ref={timeRef}
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
        </Field>

        <Field label="Lieu">
          <TextInput
            ref={locationRef}
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Ex : Arkose Nation, Buoux, Bloc'Up…"
          />
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setLocation(s)}
                  type="button"
                  style={{
                    background: T.accent + "16", border: `1px solid ${T.accent}33`, color: T.accent,
                    borderRadius: 12, padding: "4px 10px", fontSize: 11, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >{s}</button>
              ))}
            </div>
          )}
        </Field>
      </ModalBody>
      <ModalFooter align="between">
        <Button variant="ghost" size="md" onClick={onSkip}>Plus tard</Button>
        <Button variant="primary" size="md" disabled={!canConfirm} onClick={handleConfirm}>Confirmer</Button>
      </ModalFooter>

      {confirmOpen && <ConfirmModal {...confirmProps} danger={false} />}
    </Modal>
  );
}

import { useState, useEffect, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Field, TextInput, ColorSwatches, SegmentedControl } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";
import {
  REMINDER_COLORS,
  WEEKDAY_PRESETS,
  DAY_NAMES_TWO,
  newReminderId,
  formatRecurrence,
} from "../lib/reminders.js";

// ─── REMINDER MODAL ──────────────────────────────────────────────────────────
// Création / édition d'un rappel journalier.

export function ReminderModal({ reminder, onSave, onDelete, onClose }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const isEditing = !!reminder?.id;
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);
  const wrap = setter => v => { markDirty(); setter(v); };

  const [name, _setName] = useState(reminder?.name || "");
  const setName = wrap(_setName);
  const [color, _setColor] = useState(reminder?.color || REMINDER_COLORS[0]);
  const setColor = wrap(_setColor);

  const [recKind, _setRecKind] = useState(reminder?.recurrence?.kind || "daily");
  const setRecKind = wrap(_setRecKind);
  const [recDays, _setRecDays] = useState(reminder?.recurrence?.days || [1, 2, 3, 4, 5]);
  const setRecDays = wrap(_setRecDays);
  const toggleDay = (d) => setRecDays(recDays.includes(d) ? recDays.filter(x => x !== d) : [...recDays, d].sort());
  const applyPreset = (days) => setRecDays(days.slice());

  const [startDate, _setStartDate] = useState(reminder?.startDate || "");
  const setStartDate = wrap(_setStartDate);
  const [endDate, _setEndDate] = useState(reminder?.endDate || "");
  const setEndDate = wrap(_setEndDate);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef = useRef(null);
  useEffect(() => {
    if (!isEditing) {
      const t = setTimeout(() => titleRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

  const canSave = name.trim().length > 0
    && (recKind === "daily" || (Array.isArray(recDays) && recDays.length > 0));

  const handleSave = () => {
    if (!canSave) return;
    markPristine();
    const recurrence = recKind === "daily"
      ? { kind: "daily" }
      : { kind: "weekdays", days: recDays.slice().sort((a, b) => a - b) };
    onSave({
      id: reminder?.id || newReminderId(),
      name: name.trim(),
      color,
      recurrence,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      createdAt: reminder?.createdAt || new Date().toISOString(),
    });
  };

  // Cmd/Ctrl+Enter pour enregistrer (Esc géré par le Modal via requestClose).
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useEffect(() => {
    const h = e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveRef.current?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <Modal onClose={requestClose} maxWidth={440} ariaLabel={isEditing ? "Modifier le rappel" : "Nouveau rappel"}>
      <ModalHeader title={isEditing ? "Modifier le rappel" : "Nouveau rappel"} onClose={requestClose} />
      <ModalBody>
        <Field label="Nom">
          <TextInput
            ref={titleRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex : Étirements épaules, Vitamine D…"
          />
        </Field>

        <Field label="Couleur">
          <ColorSwatches colors={REMINDER_COLORS} value={color} onChange={setColor} />
        </Field>

        <Field label="Récurrence">
          <SegmentedControl
            options={[{ value: "daily", label: "Tous les jours" }, { value: "weekdays", label: "Jours choisis" }]}
            value={recKind}
            onChange={setRecKind}
            accent={color}
          />
          {recKind === "weekdays" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 0].map(d => {
                  const active = recDays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      style={{
                        padding: "8px 0",
                        background: active ? color : T.surface,
                        border: `1px solid ${active ? color : T.border}`,
                        borderRadius: 8, color: active ? "#1a1f1c" : T.textMid,
                        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >{DAY_NAMES_TWO[d]}</button>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {WEEKDAY_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days)}
                    style={{
                      background: "transparent", border: `1px dashed ${T.border}`,
                      borderRadius: 12, padding: "4px 10px", fontSize: 11, color: T.textMid,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >{p.label}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textLight, marginTop: 8 }}>
            {formatRecurrence({ kind: recKind, days: recDays })}
          </div>
        </Field>

        <Field label="Plage" hint="optionnel, laisser vide pour un rappel sans fin">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Du…</div>
              <TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Au…</div>
              <TextInput type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </Field>
      </ModalBody>

      <ModalFooter align="between">
        {isEditing && onDelete ? (
          <Button variant="ghost" size="md" onClick={() => setConfirmDelete(true)} style={{ color: T.danger }}>Supprimer</Button>
        ) : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
          <Button variant="primary" size="md" disabled={!canSave} onClick={handleSave}>
            {isEditing ? "Enregistrer" : "Créer"}
          </Button>
        </div>
      </ModalFooter>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ce rappel ?"
          sub="L'historique des coches sera également supprimé."
          confirmLabel="Supprimer"
          onConfirm={() => { markPristine(); onDelete?.(reminder.id); onClose(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </Modal>
  );
}

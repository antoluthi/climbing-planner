import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { CUSTOM_CYCLE_COLORS } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Field, TextInput, Textarea, ColorSwatches, Toggle } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { colors } from "../theme/palette.js";

// ─── CUSTOM CYCLE MODAL ───────────────────────────────────────────────────────

export function CustomCycleModal({ initial, onSave, onClose }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const { requestClose, markDirty, confirmOpen, confirmProps } = useConfirmClose(onClose);
  const [name, _setName] = useState(initial?.name || "");
  const setName = v => { markDirty(); _setName(v); };
  const [color, _setColor] = useState(initial?.color || CUSTOM_CYCLE_COLORS[0]);
  const setColor = v => { markDirty(); _setColor(v); };
  const [startDate, _setStartDate] = useState(initial?.startDate || "");
  const setStartDate = v => { markDirty(); _setStartDate(v); };
  const [endDate, _setEndDate] = useState(initial?.endDate || "");
  const setEndDate = v => { markDirty(); _setEndDate(v); };
  const [description, _setDescription] = useState(initial?.description || "");
  const setDescription = v => { markDirty(); _setDescription(v); };
  const [isRepetitive, _setIsRepetitive] = useState(initial?.isRepetitive || false);
  const setIsRepetitive = v => { markDirty(); _setIsRepetitive(v); };
  const [onWeeks, _setOnWeeks] = useState(initial?.onWeeks || 8);
  const setOnWeeks = v => { markDirty(); _setOnWeeks(v); };
  const [offWeeks, _setOffWeeks] = useState(initial?.offWeeks || 4);
  const setOffWeeks = v => { markDirty(); _setOffWeeks(v); };

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

  return (
    <Modal onClose={requestClose} maxWidth={420} ariaLabel={initial ? "Modifier le cycle" : "Nouveau cycle"}>
      <ModalHeader title={initial ? "Modifier le cycle" : "Nouveau cycle"} onClose={requestClose} />
      <ModalBody>
        <Field label="Nom du cycle">
          <TextInput placeholder="Ex : Créatine, Décharge…" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </Field>

        <Field label="Couleur">
          <ColorSwatches colors={CUSTOM_CYCLE_COLORS} value={color} onChange={setColor} />
        </Field>

        <Toggle
          checked={isRepetitive}
          onChange={setIsRepetitive}
          label="Cycle répétitif (alterne ON / OFF)"
          color={color}
        />

        {!isRepetitive ? (
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Début" style={{ flex: 1 }}>
              <TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="Fin" style={{ flex: 1 }}>
              <TextInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Début" style={{ flex: "2 1 140px" }}>
              <TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="ON (sem.)" style={{ flex: "1 1 80px" }}>
              <TextInput type="number" min="1" max="52" value={onWeeks} onChange={e => setOnWeeks(e.target.value)} />
            </Field>
            <Field label="OFF (sem.)" style={{ flex: "1 1 80px" }}>
              <TextInput type="number" min="1" max="52" value={offWeeks} onChange={e => setOffWeeks(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="Notes" hint="optionnel">
          <Textarea placeholder="Notes…" value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
        <Button variant="primary" size="md" disabled={!canSave} onClick={handleSave} style={canSave ? { background: color, color: colors(isDark).onColor } : undefined}>
          {initial ? "Enregistrer" : "Créer"}
        </Button>
      </ModalFooter>

      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </Modal>
  );
}

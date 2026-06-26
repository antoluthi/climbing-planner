import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { CUSTOM_CYCLE_COLORS } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Field, TextInput, Textarea, ColorSwatches, Toggle } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";

// ─── CUSTOM CYCLE MODAL ───────────────────────────────────────────────────────

export function CustomCycleModal({ initial, onSave, onClose }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
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

  return (
    <Modal onClose={onClose} maxWidth={420} ariaLabel={initial ? "Modifier le cycle" : "Nouveau cycle"}>
      <ModalHeader title={initial ? "Modifier le cycle" : "Nouveau cycle"} onClose={onClose} />
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
        <Button variant="secondary" size="md" onClick={onClose}>Annuler</Button>
        <Button variant="primary" size="md" disabled={!canSave} onClick={handleSave} style={canSave ? { background: color, color: "#fff" } : undefined}>
          {initial ? "Enregistrer" : "Créer"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

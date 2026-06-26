import { useState } from "react";
import { generateId } from "../lib/storage.js";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal.jsx";
import { Field, TextInput, Textarea, Select, ColorSwatches, SegmentedControl } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";

// ─── DEADLINE MODAL ───────────────────────────────────────────────────────────

const DEADLINE_TYPES = ["competition", "sortie", "objectif"];
const DEADLINE_TYPE_LABELS = { competition: "Compétition", sortie: "Sortie", objectif: "Objectif" };

const DEADLINE_COLORS = [
  "#f0805a", "#f0a060", "#f59e0b", "#22d3ee",
  "#a78bfa", "#7da7f0", "#82c894", "#e879f9",
  "#e0a875", "#94a3b8", "#f0a060", "#f0c46a",
];

export function DeadlineModal({ initial, onSave, onClose }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [type, setType] = useState(initial?.type || "competition");
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [color, setColor] = useState(initial?.color || DEADLINE_COLORS[0]);
  const [priority, setPriority] = useState(initial?.priority || "A");
  const [note, setNote] = useState(initial?.note || "");

  const canSave = label.trim() && startDate;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id || generateId(),
      label: label.trim(),
      type,
      startDate,
      endDate: endDate || null,
      color,
      priority,
      note: note.trim(),
    });
  };

  return (
    <Modal onClose={onClose} maxWidth={420} ariaLabel={initial ? "Modifier l'échéance" : "Nouvelle échéance"}>
      <ModalHeader title={initial ? "Modifier l'échéance" : "Nouvelle échéance"} onClose={onClose} />
      <ModalBody>
        <Field label="Nom de l'échéance">
          <TextInput placeholder="Ex : Coupe régionale" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Type" style={{ flex: 1 }}>
            <Select value={type} onChange={e => setType(e.target.value)}>
              {DEADLINE_TYPES.map(t => <option key={t} value={t}>{DEADLINE_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="Priorité" style={{ flex: "0 0 140px" }}>
            <SegmentedControl
              options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]}
              value={priority}
              onChange={setPriority}
              accent={color}
            />
          </Field>
        </div>

        <Field label="Couleur">
          <ColorSwatches colors={DEADLINE_COLORS} value={color} onChange={setColor} />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Début" style={{ flex: 1 }}>
            <TextInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="Fin" hint="optionnel" style={{ flex: 1 }}>
            <TextInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Note" hint="optionnel">
          <Textarea placeholder="Note…" value={note} onChange={e => setNote(e.target.value)} />
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

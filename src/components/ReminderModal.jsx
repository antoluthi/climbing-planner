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
  newPeriodId,
  formatRecurrence,
  formatPeriod,
  reminderPeriods,
  reminderStatus,
  openPeriod,
  periodHasElapsed,
  periodCompletion,
  withNewPeriod,
  withUpdatedPeriod,
  toISODate,
  shiftISO,
} from "../lib/reminders.js";
import { colors } from "../theme/palette.js";

// ─── REMINDER MODAL ──────────────────────────────────────────────────────────
// Création / édition d'un rappel journalier.
//
// **Ce que cet écran fait respecter**, et c'est sa raison d'être : on ne
// retouche pas un bloc dont des jours sont écoulés. Modifier la plage d'un
// rappel terminé réécrivait son historique (voir `lib/reminders.js`) ; ici,
// « Reprendre » ouvre un **nouveau bloc** et l'ancien devient une ligne
// d'historique, en lecture seule.
//
// Nom et couleur restent modifiables à tout moment : ils ne décident jamais de
// ce qui était dû un jour donné.

export function ReminderModal({ reminder, reminderState, onSave, onDelete, onClose }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const c = colors(isDark);
  const isEditing = !!reminder?.id;
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);
  const wrap = setter => v => { markDirty(); setter(v); };

  const today = toISODate(new Date());
  const periods = reminderPeriods(reminder);
  const status = isEditing ? reminderStatus(reminder) : "running";
  const open = isEditing ? openPeriod(reminder) : null;
  // Un bloc ouvert dont des jours sont écoulés ne se corrige plus : c'est
  // `draft === null` plus bas qui le traduit, en n'offrant que « Nouveau bloc ».
  const ended = isEditing && status === "ended";
  // Les blocs qu'on n'a plus le droit de toucher — donc l'historique.
  const past = periods.filter(p => p !== open);

  const [name, _setName] = useState(reminder?.name || "");
  const setName = wrap(_setName);
  const [color, _setColor] = useState(reminder?.color || REMINDER_COLORS[0]);
  const setColor = wrap(_setColor);

  // `editing` = le bloc que le formulaire du bas est en train de décrire.
  // null quand on regarde un bloc verrouillé sans avoir demandé à en ouvrir un.
  const [draft, _setDraft] = useState(() => {
    if (!isEditing) return { mode: "new", startDate: "", endDate: "", rec: { kind: "daily" }, days: [1, 2, 3, 4, 5] };
    if (open && !periodHasElapsed(open)) {
      return {
        mode: "edit", periodId: open.id,
        startDate: open.startDate || "", endDate: open.endDate || "",
        rec: open.recurrence || { kind: "daily" },
        days: open.recurrence?.days || [1, 2, 3, 4, 5],
      };
    }
    return null;                       // bloc verrouillé ou rappel terminé
  });
  const setDraft = wrap(_setDraft);
  const patch = (o) => setDraft({ ...draft, ...o });

  // Un nouveau bloc ne peut pas commencer avant la fin du dernier : deux blocs
  // qui se chevauchent rendraient « quel bloc couvrait ce jour ? » arbitraire.
  const lastEnd = periods.reduce((acc, p) => (p.endDate && p.endDate > acc ? p.endDate : acc), "");
  const minStart = [lastEnd ? shiftISO(lastEnd, 1) : "", today].sort().pop();

  const beginNewBlock = () => {
    const prev = open || periods[periods.length - 1];
    setDraft({
      mode: "new",
      startDate: minStart,
      endDate: "",
      rec: prev?.recurrence || { kind: "daily" },
      days: prev?.recurrence?.days || [1, 2, 3, 4, 5],
    });
  };

  const recKind = draft?.rec?.kind === "weekdays" ? "weekdays" : "daily";
  const recDays = draft?.days || [];
  const toggleDay = (d) => patch({ days: recDays.includes(d) ? recDays.filter(x => x !== d) : [...recDays, d].sort() });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const recurrenceOf = () => recKind === "daily"
    ? { kind: "daily" }
    : { kind: "weekdays", days: recDays.slice().sort((a, b) => a - b) };

  const canSave = name.trim().length > 0
    && (!draft || recKind === "daily" || recDays.length > 0)
    && (!draft || draft.mode !== "new" || !draft.startDate || !minStart || draft.startDate >= minStart);

  const handleSave = () => {
    if (!canSave) return;
    markPristine();
    const base = {
      id: reminder?.id || newReminderId(),
      name: name.trim(),
      color,
      createdAt: reminder?.createdAt || new Date().toISOString(),
      periods,
    };
    if (!draft) return onSave(base);              // nom / couleur seulement

    const block = {
      startDate: draft.startDate || undefined,
      endDate: draft.endDate || undefined,
      recurrence: recurrenceOf(),
    };
    if (draft.mode === "edit") {
      return onSave(withUpdatedPeriod(base, draft.periodId, block));
    }
    if (!isEditing) {
      return onSave({ ...base, periods: [{ id: newPeriodId(), ...block }] });
    }
    return onSave(withNewPeriod(base, { id: newPeriodId(), ...block }, block.startDate || today));
  };

  // Cmd/Ctrl+Enter pour enregistrer (Esc géré par le Modal via requestClose).
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useEffect(() => {
    const h = e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveRef.current?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const title = isEditing ? "Modifier le rappel" : "Nouveau rappel";

  return (
    <Modal onClose={requestClose} maxWidth={440} ariaLabel={title}>
      <ModalHeader title={title} onClose={requestClose} />
      <ModalBody>
        <Field label="Nom">
          <TextInput
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex : Étirements épaules, Vitamine D…"
          />
        </Field>

        <Field label="Couleur">
          <ColorSwatches colors={REMINDER_COLORS} value={color} onChange={setColor} />
        </Field>

        {past.length > 0 && (
          <Field label="Blocs précédents" hint="terminés — l'historique ne se modifie plus">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {past.map(p => {
                const { done, total } = periodCompletion(reminder, p, reminderState);
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 8,
                    background: T.surface, border: `1px solid ${T.border}`,
                  }}>
                    <span style={{ width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.textMid }}>
                      {formatPeriod(p)}
                      <span style={{ color: T.textLight }}> · {formatRecurrence(p.recurrence)}</span>
                    </span>
                    {total > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: done === total ? c.success : T.textMid }}>
                        {done}/{total}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        {!draft ? (
          <Field label={ended ? "Ce rappel est terminé" : "Bloc en cours"}>
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              background: T.surface, border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 12, color: T.textMid }}>
                {open ? <>{formatPeriod(open)} · {formatRecurrence(open.recurrence)}</> : "Aucun bloc ouvert."}
              </div>
              <div style={{ fontSize: 11, color: T.textLight, marginTop: 6, lineHeight: 1.45 }}>
                {ended
                  ? "Reprendre ouvre un nouveau bloc : les jours déjà notés restent tels quels."
                  : "Ce bloc a commencé. Changer sa récurrence ou ses dates réécrirait les jours écoulés — on en ouvre donc un nouveau."}
              </div>
              <Button variant="secondary" size="sm" onClick={beginNewBlock} style={{ marginTop: 10 }}>
                {ended ? "Reprendre" : "Nouveau bloc"}
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <Field label="Récurrence">
              <SegmentedControl
                options={[{ value: "daily", label: "Tous les jours" }, { value: "weekdays", label: "Jours choisis" }]}
                value={recKind}
                onChange={k => patch({ rec: { kind: k } })}
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
                            borderRadius: 8, color: active ? c.textOnAccent : T.textMid,
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
                        onClick={() => patch({ days: p.days.slice() })}
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
                {formatRecurrence(recurrenceOf())}
              </div>
            </Field>

            <Field
              label={draft.mode === "new" && isEditing ? "Nouveau bloc" : "Plage"}
              hint="optionnel, laisser vide pour un rappel sans fin"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Du…</div>
                  <TextInput
                    type="date"
                    value={draft.startDate}
                    min={draft.mode === "new" && isEditing ? minStart : undefined}
                    onChange={e => patch({ startDate: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Au…</div>
                  <TextInput
                    type="date"
                    value={draft.endDate}
                    min={draft.startDate || undefined}
                    onChange={e => patch({ endDate: e.target.value })}
                  />
                </div>
              </div>
              {draft.mode === "new" && isEditing && minStart && (
                <div style={{ fontSize: 10.5, color: T.textLight, marginTop: 6, lineHeight: 1.4 }}>
                  Commence au plus tôt le {minStart} — un bloc ne recouvre jamais le précédent.
                </div>
              )}
            </Field>
          </>
        )}
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
          sub="Tous ses blocs et l'historique des coches seront également supprimés."
          confirmLabel="Supprimer"
          onConfirm={() => { markPristine(); onDelete?.(reminder.id); onClose(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </Modal>
  );
}

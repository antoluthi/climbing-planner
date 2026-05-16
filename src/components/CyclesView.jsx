import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { addDays } from "../lib/helpers.js";
import { CyclesTimeline } from "./CyclesTimeline.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { CustomCycleModal } from "./CustomCycleModal.jsx";
import { ReminderModal } from "./ReminderModal.jsx";
import {
  getReminderCompletionRate,
  formatRecurrence,
  DAY_NAMES_SHORT,
} from "../lib/reminders.js";

export function CyclesView({
  mesocycles, onAddMeso, onUpdateMeso, onDeleteMeso,
  onAddMicro, onUpdateMicro, onDeleteMicro,
  customCycles, onAddCustomCycle, onUpdateCustomCycle, onDeleteCustomCycle,
  locked, onSetLocked, canEdit, objectives,
  reminders = [], reminderState = {},
  onAddReminder, onUpdateReminder, onDeleteReminder,
}) {
  const { styles, isDark } = useThemeCtx();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null); // null | {} | reminder
  const [showCustomCycleForm, setShowCustomCycleForm] = useState(false);
  const [editingCustomCycle, setEditingCustomCycle] = useState(null);

  // ── Timeline mode (locked, or athlete who can't edit) ──
  if (locked || canEdit === false) {
    return (
      <CyclesTimeline
        mesocycles={mesocycles}
        customCycles={customCycles || []}
        objectives={objectives}
        onEdit={canEdit === false ? null : () => onSetLocked(false)}
      />
    );
  }

  return (
    <div style={styles.cyclesView}>
      <div style={styles.cyclesHeader}>
        <span style={styles.cyclesTitle}>Cycles d'entraînement</span>
        <button style={styles.cycleAddMesoBtn} onClick={onAddMeso}>＋ Nouveau mésocycle</button>
      </div>

      {mesocycles.length === 0 && (
        <div style={{ color: styles.dashText, fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
          Aucun mésocycle défini. Créez-en un pour commencer.
        </div>
      )}

      {mesocycles.map(meso => {
        const mesoStart = meso.startDate ? new Date(meso.startDate) : null;
        const mesoEnd = mesoStart ? addDays(mesoStart, meso.durationWeeks * 7) : null;

        // Compute microcycle start dates
        let microStarts = [];
        if (mesoStart) {
          let cursor = new Date(mesoStart);
          for (const micro of (meso.microcycles || [])) {
            microStarts.push(new Date(cursor));
            cursor = addDays(cursor, micro.durationWeeks * 7);
          }
        }

        return (
          <div key={meso.id} style={styles.cycleCard}>
            {/* Meso row */}
            <div style={styles.cycleMesoRow}>
              <input
                type="color"
                style={styles.cycleColorInput}
                value={meso.color}
                onChange={e => onUpdateMeso(meso.id, { color: e.target.value })}
                title="Couleur"
              />
              <input
                style={styles.cycleLabelInput}
                value={meso.label}
                onChange={e => onUpdateMeso(meso.id, { label: e.target.value })}
                placeholder="Nom du mésocycle…"
              />
              <input
                style={styles.cycleDateInput}
                type="date"
                value={meso.startDate || ""}
                onChange={e => onUpdateMeso(meso.id, { startDate: e.target.value })}
                title="Date de début"
              />
              {mesoEnd && (
                <span style={styles.cycleDateEnd}>→ {mesoEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}</span>
              )}
              <input
                style={styles.cycleDurInput}
                type="number"
                min="1"
                max="24"
                value={meso.durationWeeks}
                onChange={e => onUpdateMeso(meso.id, { durationWeeks: +e.target.value })}
                title="Durée (semaines)"
              />
              <span style={styles.cycleDurLabel}>sem.</span>
              <input
                style={styles.cycleDescInput}
                value={meso.description}
                onChange={e => onUpdateMeso(meso.id, { description: e.target.value })}
                placeholder="Description / objectif du bloc…"
              />
              <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "meso", id: meso.id, label: meso.label })} title="Supprimer">✕</button>
            </div>

            {/* Microcycles */}
            <div style={styles.cycleMicroList}>
              <div style={{ fontSize: 10, color: styles.dashText, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Microcycles ({meso.microcycles.length})
              </div>
              {meso.microcycles.map((micro, mi) => (
                <div key={micro.id} style={styles.cycleMicroRow}>
                  <div style={{ ...styles.cycleMicroDot, background: meso.color }} />
                  <input
                    style={styles.cycleMicroLabelInput}
                    value={micro.label}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { label: e.target.value })}
                    placeholder="Nom du microcycle…"
                  />
                  {microStarts[mi] && (
                    <span style={styles.cycleMicroDate}>
                      {microStarts[mi].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <input
                    style={styles.cycleMicroDurInput}
                    type="number"
                    min="1"
                    max="8"
                    value={micro.durationWeeks}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { durationWeeks: +e.target.value })}
                    title="Durée (semaines)"
                  />
                  <span style={styles.cycleDurLabel}>sem.</span>
                  <input
                    style={{ ...styles.cycleDescInput, flex: "1 1 120px" }}
                    value={micro.description || ""}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { description: e.target.value })}
                    placeholder="Contenu…"
                  />
                  <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "micro", mesoId: meso.id, microId: micro.id, label: micro.label })} title="Supprimer">✕</button>
                </div>
              ))}
              <button style={styles.cycleAddMicroBtn} onClick={() => onAddMicro(meso.id)}>
                ＋ Microcycle
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Cycles personnalisés ── */}
      <div style={styles.customCyclesSection}>
        <div style={styles.customCyclesSectionHeader}>
          <span style={styles.customCyclesSectionTitle}>Cycles personnalisés</span>
          <button style={styles.cycleAddMesoBtn} onClick={() => { setShowCustomCycleForm(true); setEditingCustomCycle(null); }}>
            ＋ Nouveau cycle
          </button>
        </div>

        {(customCycles || []).length === 0 && (
          <div style={{ color: isDark ? "#5a6060" : "#9a9890", fontSize: 12, fontStyle: "italic", textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            Aucun cycle personnalisé. Ex : créatine, décharge, compétition…
          </div>
        )}

        {(customCycles || []).map(cc => {
          const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
          const dateInfo = cc.isRepetitive
            ? `Rép. ${cc.onWeeks}s ON / ${cc.offWeeks}s OFF · depuis le ${fmtDate(cc.startDate)}`
            : `${fmtDate(cc.startDate)} → ${fmtDate(cc.endDate)}`;
          return (
            <div key={cc.id} style={styles.customCycleRow}>
              <div style={{ ...styles.customCycleColorSwatch, background: cc.color }} />
              <div style={styles.customCycleInfo}>
                <span style={styles.customCycleName}>{cc.name}</span>
                <span style={styles.customCycleDate}>{dateInfo}</span>
                {cc.description && <span style={{ ...styles.customCycleDate, fontStyle: "italic", marginTop: 1 }}>{cc.description}</span>}
              </div>
              <button style={styles.cycleDeleteBtn} onClick={() => { setEditingCustomCycle(cc); setShowCustomCycleForm(false); }} title="Modifier">Mod.</button>
              <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "customCycle", id: cc.id, label: cc.name })} title="Supprimer">✕</button>
            </div>
          );
        })}
      </div>

      {/* ── Rappels journaliers ── */}
      <div style={styles.customCyclesSection}>
        <div style={styles.customCyclesSectionHeader}>
          <div>
            <div style={styles.customCyclesSectionTitle}>Rappels journaliers</div>
            <div style={{ fontSize: 11, color: isDark ? "#8a9090" : "#8a7f70", marginTop: 2, fontStyle: "italic" }}>
              Affichés dans le journal du jour quand applicables.
            </div>
          </div>
          {canEdit && (
            <button
              style={styles.cycleAddMesoBtn}
              onClick={() => setEditingReminder({})}
            >＋ Nouveau rappel</button>
          )}
        </div>

        {reminders.length === 0 && (
          <div style={{ color: isDark ? "#5a6060" : "#9a9890", fontSize: 12, fontStyle: "italic", textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            Aucun rappel. Ex : créatine, étirements, vitamine D…
          </div>
        )}

        {reminders.map(rem => (
          <ReminderCard
            key={rem.id}
            reminder={rem}
            completionRate={getReminderCompletionRate(rem, reminderState, new Date())}
            isDark={isDark}
            styles={styles}
            disabled={!canEdit}
            onClick={() => canEdit && setEditingReminder(rem)}
          />
        ))}
      </div>

      {editingReminder && (
        <ReminderModal
          reminder={editingReminder.id ? editingReminder : null}
          onSave={(r) => {
            if (editingReminder.id) onUpdateReminder?.(r);
            else onAddReminder?.(r);
            setEditingReminder(null);
          }}
          onDelete={onDeleteReminder ? (id) => { onDeleteReminder(id); setEditingReminder(null); } : undefined}
          onClose={() => setEditingReminder(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={
            pendingDelete.type === "meso" ? "Supprimer ce mésocycle ?" :
            pendingDelete.type === "micro" ? "Supprimer ce microcycle ?" :
            "Supprimer ce cycle personnalisé ?"
          }
          sub={pendingDelete.label}
          onConfirm={() => {
            if (pendingDelete.type === "meso") onDeleteMeso(pendingDelete.id);
            else if (pendingDelete.type === "micro") onDeleteMicro(pendingDelete.mesoId, pendingDelete.microId);
            else onDeleteCustomCycle(pendingDelete.id);
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {(showCustomCycleForm || editingCustomCycle) && (
        <CustomCycleModal
          initial={editingCustomCycle}
          onSave={cc => {
            if (editingCustomCycle) onUpdateCustomCycle(cc.id, cc);
            else onAddCustomCycle(cc);
            setShowCustomCycleForm(false);
            setEditingCustomCycle(null);
          }}
          onClose={() => { setShowCustomCycleForm(false); setEditingCustomCycle(null); }}
        />
      )}

      {/* Save button */}
      {mesocycles.length > 0 && (
        <button style={styles.timelineSaveBtn} onClick={() => onSetLocked(true)}>
          ✓ Enregistrer la planification
        </button>
      )}
    </div>
  );
}

// ─── ReminderCard ────────────────────────────────────────────────────────────
function ReminderCard({ reminder, completionRate, isDark, styles, disabled, onClick }) {
  const text     = isDark ? "#e8e4de" : "#2a2218";
  const textMid  = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight= isDark ? "#7a7570" : "#8a7f70";
  const border   = isDark ? "#2a302a" : "#e6dfd1";
  const accent   = isDark ? "#c8906a" : "#8b4c20";
  const surface  = isDark ? "#1f2421" : "#ffffff";
  const surface2 = isDark ? "#222a23" : "#f0ebde";

  const isDaily = reminder.recurrence?.kind !== "weekdays";
  const activeDays = isDaily ? [0, 1, 2, 3, 4, 5, 6] : (reminder.recurrence?.days || []);
  const pct = Math.round((completionRate || 0) * 100);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        textAlign: "left", width: "100%",
        transition: "border-color 0.12s, transform 0.12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = accent + "88"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; }}
    >
      <div style={{ width: 6, height: 44, borderRadius: 3, background: reminder.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: text, lineHeight: 1.2 }}>
          {reminder.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => {
              const active = activeDays.includes(d);
              return (
                <span
                  key={d}
                  style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: active ? reminder.color + (isDark ? "" : "cc") : surface2,
                    color: active ? (isDark ? "#1a1f1c" : "#fff") : textLight,
                    fontSize: 8, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >{DAY_NAMES_SHORT[d]}</span>
              );
            })}
          </div>
          <span style={{ fontSize: 11, color: textMid }}>{formatRecurrence(reminder.recurrence)}</span>
        </div>
        {(reminder.startDate || reminder.endDate) && (
          <div style={{ fontSize: 10, color: textLight, marginTop: 3 }}>
            {reminder.startDate ? `Du ${reminder.startDate}` : "Sans début"}
            {reminder.endDate   ? ` au ${reminder.endDate}` : reminder.startDate ? " · sans fin" : ""}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
        <span style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 17, fontWeight: 700, color: reminder.color,
          lineHeight: 1,
        }}>
          {pct}%
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, color: textLight,
          letterSpacing: "0.06em", textTransform: "uppercase",
          marginTop: 4,
        }}>
          30 derniers j.
        </span>
      </div>
    </button>
  );
}

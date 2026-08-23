import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import { SANS, MONO, RoundCheck } from "./ui/Ascent.jsx";
import { getActiveRemindersForDate, isReminderCheckedOn } from "../lib/reminders.js";

// ─── JOURNAL D'UNE JOURNÉE ───────────────────────────────────────────────────
// Le journal et les rappels n'existaient qu'au présent, sur l'accueil : un
// rappel oublié la veille était oublié pour de bon, et le ressenti d'avant-hier
// invisible. Ce bloc les rend à n'importe quelle date — il se pose en tête du
// jour sélectionné dans le calendrier.
//
// Les rappels affichés sont ceux qui étaient **actifs ce jour-là** (récurrence
// et plage de dates), pas ceux d'aujourd'hui : cocher après coup n'a de sens
// que si la case existait à cette date.

export function DayJournalBlock({ isDark, data, dateStr, onOpenLog, onToggleReminder }) {
  const c = colors(isDark);
  const dateObj = new Date(dateStr + "T12:00:00");

  const hooper = (data.hooper || []).find(h => h.date === dateStr) || null;
  const weight = data.weight?.[dateStr] ?? null;
  const note = data.notes?.[dateStr] || "";
  const meals = data.nutrition?.[dateStr] || [];
  const filled = hooper != null || weight != null || !!note.trim() || meals.length > 0;

  const reminders = getActiveRemindersForDate(data.reminders || [], dateObj);
  const checked = reminders.filter(r => isReminderCheckedOn(data.reminderState, r.id, dateStr)).length;

  const bits = [
    hooper?.total != null ? `${hooper.total} bien-être` : null,
    weight != null ? `${weight} kg` : null,
    meals.length ? `${meals.reduce((s, m) => s + (m.calories || 0), 0)} kcal` : null,
    note.trim() ? "note" : null,
  ].filter(Boolean);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: c.surface, borderRadius: RADIUS.control, padding: "10px 12px",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: SANS }}>
            Journal
          </div>
          <div style={{
            fontSize: 11, color: filled ? c.textMuted : c.textDim,
            fontFamily: SANS, marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {filled ? bits.join(" · ") : "Rien de noté ce jour-là"}
          </div>
        </div>
        {reminders.length > 0 && (
          <div style={{ font: `700 11px ${MONO}`, color: checked === reminders.length ? c.accent : c.textDim }}>
            {checked}/{reminders.length}
          </div>
        )}
        <button
          onClick={() => onOpenLog?.(dateStr)}
          style={{
            flexShrink: 0, background: c.control, border: "none", borderRadius: RADIUS.pill,
            color: c.text, fontSize: 12, fontWeight: 700, fontFamily: SANS,
            padding: "7px 13px", cursor: "pointer",
          }}
        >
          {filled ? "Modifier" : "Remplir"}
        </button>
      </div>

      {reminders.length > 0 && (
        <div style={{ padding: "2px 4px 0" }}>
          {reminders.map(r => (
            <RoundCheck
              key={r.id}
              isDark={isDark}
              checked={isReminderCheckedOn(data.reminderState, r.id, dateStr)}
              onChange={() => onToggleReminder?.(r.id, dateStr)}
              label={r.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

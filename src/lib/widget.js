import { localDateStr } from "./helpers.js";
import { getActiveRemindersForDate, isReminderCheckedOn } from "./reminders.js";

// ─── WIDGET D'ÉCRAN D'ACCUEIL ────────────────────────────────────────────────
// Un widget Android ne peut pas lire le localStorage de la WebView. Le pont est
// `@capacitor/preferences`, qui écrit dans les SharedPreferences du système
// (fichier « CapacitorStorage ») — que du code natif sait relire.
//
// Deux clés, un sens chacune :
//   · `widget_today`   l'app écrit ce qu'il faut afficher (JS → widget) ;
//   · `widget_pending` le widget empile les cases cochées, l'app les applique
//                      à son prochain réveil et vide la file (widget → JS).
//
// Le widget ne touche donc jamais au planning : il ne fait que déposer une
// intention. L'app reste seule à écrire dans `data`, et la synchronisation n'a
// rien de nouveau à départager.

export const SNAPSHOT_KEY = "widget_today";
export const PENDING_KEY  = "widget_pending";

const MAX_ROWS = 4;   // ce que la hauteur d'un widget 4×2 laisse tenir

// La date est mise en forme ici : le Java n'a pas à connaître le français.
function dayLabel(date) {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

export function buildWidgetSnapshot(data, now = new Date()) {
  const dateStr = localDateStr(now);
  const reminders = getActiveRemindersForDate(data?.reminders || [], now)
    .slice(0, MAX_ROWS)
    .map(r => ({
      id: r.id,
      name: r.name || "Rappel",
      done: isReminderCheckedOn(data?.reminderState || {}, r.id, dateStr),
    }));

  const hooper = (data?.hooper || []).find(h => h.date === dateStr);
  const weight = data?.weight?.[dateStr];
  const note = data?.notes?.[dateStr];
  const bits = [
    hooper?.total != null ? `${hooper.total} bien-être` : null,
    weight != null ? `${weight} kg` : null,
    note?.trim() ? "note" : null,
  ].filter(Boolean);

  return {
    date: dateStr,
    label: dayLabel(now),
    reminders,
    journal: bits.length ? bits.join(" · ") : "Rien de noté",
    journalDone: bits.length > 0,
  };
}

// ── Pont natif ───────────────────────────────────────────────────────────────
// `native.js` et le plugin ne sont chargés qu'ici : tout ce qui précède reste
// importable sous Node (banc de test).
async function prefs() {
  try {
    const { isNative } = await import("./native.js");
    if (!isNative) return null;
    const m = await import("@capacitor/preferences");
    return m.Preferences;
  } catch {
    return null;
  }
}

// Renvoie ce qui s'est passé plutôt qu'un simple booléen : sur un téléphone,
// « ça n'a pas marché » sans le message ne mène nulle part.
export async function writeWidgetSnapshot(data, now = new Date()) {
  const P = await prefs();
  if (!P) return { ok: false, reason: "web" };
  try {
    const snap = buildWidgetSnapshot(data, now);
    await P.set({ key: SNAPSHOT_KEY, value: JSON.stringify(snap) });
    return { ok: true, reminders: snap.reminders.length };
  } catch (e) {
    return { ok: false, reason: (e?.message || String(e)).slice(0, 120) };
  }
}

// Applique les coches faites depuis le widget. Pure sur `data`, pour rester
// testable : la lecture et le vidage de la file sont autour.
export function applyPendingToggles(data, pending) {
  if (!Array.isArray(pending) || pending.length === 0) return data;
  const state = { ...(data.reminderState || {}) };
  let changed = false;
  for (const t of pending) {
    if (!t?.id || !t?.date) continue;
    const forId = { ...(state[t.id] || {}) };
    const next = !!t.done;
    if (forId[t.date] === next) continue;
    if (next) forId[t.date] = true;
    else delete forId[t.date];
    state[t.id] = forId;
    changed = true;
  }
  return changed ? { ...data, reminderState: state } : data;
}

export async function drainWidgetToggles() {
  const P = await prefs();
  if (!P) return [];
  try {
    const { value } = await P.get({ key: PENDING_KEY });
    if (!value) return [];
    await P.remove({ key: PENDING_KEY });
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

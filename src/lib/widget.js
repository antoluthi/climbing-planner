import { addDays, localDateStr } from "./helpers.js";
import { getActiveRemindersForDate, isReminderCheckedOn } from "./reminders.js";
import { withTimeout } from "./promise-timeout.js";

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

// Ce que la plus grande taille du widget laisse tenir. Le widget est
// redimensionnable : c'est lui qui décide combien de ces lignes il affiche
// vraiment (TodayWidget.fit), en fonction de la hauteur qu'on lui donne. Ici on
// se contente de ne pas lui en envoyer plus qu'il ne pourra jamais montrer.
const MAX_ROWS = 8;

// ── Passer minuit sans l'app ─────────────────────────────────────────────────
// Le widget ne sait pas lire le planning : il ne sait que relire ce que l'app a
// déposé. Un cliché d'un seul jour l'obligeait donc à attendre une ouverture de
// l'app pour changer de date — au réveil il montrait les rappels de la veille,
// cases déjà cochées, et les cocher aurait écrit dans la journée d'hier.
//
// On dépose donc **une semaine d'avance**, un jour par clé. À minuit le widget
// n'a plus qu'à prendre l'entrée du jour : pas de calcul de récurrence côté
// natif, pas d'app à ouvrir. Au-delà de l'horizon il le dit, plutôt que
// d'afficher du périmé.
export const HORIZON_DAYS = 7;

// La date est mise en forme ici : le Java n'a pas à connaître le français.
function dayLabel(date) {
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

// Ce qu'il y a à afficher pour une journée donnée.
export function buildDaySnapshot(data, date) {
  const dateStr = localDateStr(date);
  const active = getActiveRemindersForDate(data?.reminders || [], date);
  const reminders = active
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
    label: dayLabel(date),
    reminders,
    // Le nombre réel du jour, pas celui de la liste tronquée : un widget réduit
    // en affiche moins et doit pouvoir dire combien il en cache.
    total: active.length,
    journal: bits.length ? bits.join(" · ") : "Rien de noté",
    journalDone: bits.length > 0,
  };
}

export function buildWidgetSnapshot(data, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = {};
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = addDays(start, i);
    days[localDateStr(d)] = buildDaySnapshot(data, d);
  }
  // `v` dit au Java quelle forme il lit : un widget mis à jour trouve encore le
  // cliché d'un seul jour laissé par la version d'avant, tant que l'app n'a pas
  // réécrit par-dessus.
  return { v: 2, from: localDateStr(start), days };
}

// ── Pont natif ───────────────────────────────────────────────────────────────
// `native.js` et le plugin ne sont chargés qu'ici : tout ce qui précède reste
// importable sous Node (banc de test).
// Comme pour les notifications : rien ne doit pouvoir rester en suspens.
const CALL_MS = 4000;
const call = (p, label) => withTimeout(p, CALL_MS, label);

// ⚠ PIÈGE : ne JAMAIS renvoyer un plugin Capacitor depuis une fonction `async`.
// La valeur de retour d'une fonction async est résolue comme un « thenable » :
// le moteur lit `.then` dessus. Or un plugin Capacitor est un proxy qui répond
// à *n'importe quel* accès de propriété par un appel au pont natif — il part
// donc chercher une méthode native « then », qui n'existe pas. Sur le web elle
// rejette (« not implemented ») ; **dans l'APK elle ne répond jamais**, et la
// promesse ne se termine pas : bascule figée, widget jamais écrit, diagnostic
// bloqué sur « … ». On enveloppe donc le plugin dans un objet ordinaire.
async function prefs() {
  try {
    const { isNative } = await import("./native.js");
    if (!isNative) return null;
    const m = await call(import("@capacitor/preferences"), "import préférences");
    return { P: m.Preferences };
  } catch {
    return null;
  }
}

// Renvoie ce qui s'est passé plutôt qu'un simple booléen : sur un téléphone,
// « ça n'a pas marché » sans le message ne mène nulle part.
export async function writeWidgetSnapshot(data, now = new Date()) {
  const p = await prefs();
  if (!p) return { ok: false, reason: "web" };
  const P = p.P;
  try {
    const snap = buildWidgetSnapshot(data, now);
    await call(P.set({ key: SNAPSHOT_KEY, value: JSON.stringify(snap) }), "écriture widget");
    const today = snap.days[snap.from];
    return { ok: true, reminders: today?.reminders.length ?? 0, days: HORIZON_DAYS };
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
  const p = await prefs();
  if (!p) return [];
  const P = p.P;
  try {
    const { value } = await call(P.get({ key: PENDING_KEY }), "lecture file");
    if (!value) return [];
    await call(P.remove({ key: PENDING_KEY }), "vidage file");
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

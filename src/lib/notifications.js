import { getMondayOf, addDays, localDateStr, weekKey, getDaySessions, isEventItem } from "./helpers.js";

// ─── NOTIFICATIONS DE SÉANCE ─────────────────────────────────────────────────
// Une séance planifiée donne **une seule notification, qui change de nature en
// route** : avant l'heure c'est un rappel, après c'est une invitation à noter
// son ressenti. Les deux portent le même identifiant, si bien que la seconde
// remplace la première dans le tiroir plutôt que de s'empiler à côté.
//
// Tout le calcul est ici, pur et testable ; le plugin n'entre en jeu que dans
// `syncSessionNotifications`, et seulement dans l'APK.

const LEAD_MIN = 60;          // rappel une heure avant le départ
const DEFAULT_LEN_MIN = 90;   // séance sans durée : on demande le ressenti après 1 h 30
const MAX = 60;               // Android n'accepte pas une file infinie
const HORIZON_DAYS = 7;       // fenêtre glissante, replanifiée à chaque réveil

// Identifiant stable et entier, dérivé de celui de la séance : c'est lui qui
// fait que le rappel et la demande de ressenti sont *la même* notification, et
// qu'une replanification remplace au lieu de dupliquer.
export function notificationId(sessionId) {
  let h = 0;
  for (let i = 0; i < String(sessionId).length; i++) {
    h = (h * 31 + String(sessionId).charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647;
}

// Une séance déjà notée n'a plus rien à rappeler ni à demander.
function isSettled(s) {
  const f = s?.feedback;
  return !!f && (f.done != null || f.status != null);
}

function startOf(date, hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

const fmtTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function planSessionNotifications(data, now = new Date(), days = HORIZON_DAYS) {
  const out = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const dateISO = localDateStr(date);
    for (const s of getDaySessions(data, date)) {
      if (isEventItem(s) || !s.startTime || isSettled(s)) continue;
      const start = startOf(date, s.startTime);
      const end = new Date(start.getTime() + (Number(s.estimatedTime) || DEFAULT_LEN_MIN) * 60000);
      const id = notificationId(s.id || `${dateISO}-${s.name}`);
      const extra = { sessionId: s.id ?? null, dateISO };
      const name = s.name || "Séance";

      const remindAt = new Date(start.getTime() - LEAD_MIN * 60000);
      if (remindAt > now) {
        out.push({
          id, at: remindAt, extra: { ...extra, kind: "reminder" },
          title: name,
          body: [`Départ à ${fmtTime(start)}`, s.location?.trim()].filter(Boolean).join(" · "),
        });
      }
      if (end > now) {
        out.push({
          id, at: end, extra: { ...extra, kind: "feedback" },
          title: name,
          body: "Séance terminée ? Note ton ressenti.",
        });
      }
    }
  }

  return out.sort((a, b) => a.at - b.at).slice(0, MAX);
}

// Retrouve une séance à partir de ce que porte la notification touchée.
export function locateSession(data, { sessionId, dateISO }) {
  if (!dateISO) return null;
  const date = new Date(dateISO + "T12:00:00");
  const wKey = weekKey(getMondayOf(date));
  const week = data?.weeks?.[wKey];
  if (!week) return null;
  const dayIndex = (date.getDay() + 6) % 7;
  const list = week[dayIndex] || [];
  const sessionIndex = list.findIndex(s => s?.id === sessionId);
  if (sessionIndex < 0) return null;
  return { weekKey: wKey, dayIndex, sessionIndex };
}

// ── Côté plugin (APK uniquement) ─────────────────────────────────────────────
// `native.js` n'est chargé qu'ici, à l'appel : tout ce qui précède reste
// importable hors navigateur (le banc de test tourne sous Node).
async function plugin() {
  try {
    const { isNative } = await import("./native.js");
    if (!isNative) return null;
    const m = await import("@capacitor/local-notifications");
    return m.LocalNotifications;
  } catch {
    return null;
  }
}

export async function notificationsPermission() {
  const LN = await plugin();
  if (!LN) return "unsupported";
  const { display } = await LN.checkPermissions();
  return display;
}

export async function requestNotificationsPermission() {
  const LN = await plugin();
  if (!LN) return "unsupported";
  const { display } = await LN.requestPermissions();
  return display;
}

// Toucher une notification ouvre la séance qu'elle concerne.
export async function onNotificationTap(handler) {
  const LN = await plugin();
  if (!LN) return null;
  return LN.addListener("localNotificationActionPerformed", (event) => {
    const extra = event?.notification?.extra;
    if (extra) handler(extra);
  });
}

// Replanifie tout : on annule ce qui était posé puis on repose la fenêtre.
// C'est le geste le plus simple qui reste juste quand une séance est déplacée,
// supprimée ou notée entre deux réveils.
export async function syncSessionNotifications(data, enabled) {
  const LN = await plugin();
  if (!LN) return { skipped: "web" };
  try {
    const pending = await LN.getPending();
    if (pending?.notifications?.length) await LN.cancel(pending);
    if (!enabled) return { scheduled: 0, cancelled: pending?.notifications?.length || 0 };
    if ((await LN.checkPermissions()).display !== "granted") return { skipped: "permission" };

    const plan = planSessionNotifications(data, new Date());
    if (plan.length) {
      await LN.schedule({
        notifications: plan.map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          extra: n.extra,
          smallIcon: "ic_stat_charge",
          schedule: { at: n.at, allowWhileIdle: true },
        })),
      });
    }
    return { scheduled: plan.length };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

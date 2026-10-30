// ─── GARMIN CONNECT, CÔTÉ APP ────────────────────────────────────────────────
// La clé vit sur le serveur (`api/garmin`, table `garmin_links`) ; l'app ne
// fait que demander des plages et ranger ce qui revient : les nuits dans
// `data.sleep`, les journées (FC au repos, VFC, Body Battery, stress) dans
// `data.recovery`, et les activités sur les séances (`linkActivities`). La
// synchro du planning emmène le tout sur les autres appareils (et chez le
// coach, comme le Hooper). Une nuit :
//   { date, total, deep, light, rem, awake, score, start, end, need, source }
// durées en minutes, `date` celle du réveil, `source: "garmin"`.
//
// Le calcul (quelles plages demander, comment fusionner, quand relancer) est
// pur et testé sous Node (`npm run test:garmin`). L'appel réseau importe
// Supabase et `native.js` à la demande, sans quoi le module ne se chargerait
// pas hors navigateur.

import { getMondayOf, weekKey, isEventItem } from "./helpers.js";
import { getDiscipline } from "./disciplines.js";

export const GARMIN_KEY_URL = "https://connect.garmin.com/app/settings/personalApiToken";

// À la première liaison, on remonte un an : c'est ce que couvrent la heatmap
// et les plages les plus longues qu'on regarde vraiment. Garmin rend 31 nuits
// au plus par appel, d'où une douzaine d'appels, une seule fois.
export const BACKFILL_DAYS = 365;
export const WINDOW_DAYS = 31;
// Garmin affine une nuit après coup (le score se finalise, une nuit arrive
// avec la synchro suivante de la montre) : on relit les deux dernières.
const OVERLAP_DAYS = 2;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (day, n) => {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};

// La dernière nuit venue de Garmin (les nuits importées à la main, du temps du
// CSV, ne comptent pas : elles ne disent rien de ce que Garmin a déjà donné).
export function lastGarminNight(sleep) {
  let last = null;
  for (const n of Array.isArray(sleep) ? sleep : []) {
    if (n?.source === "garmin" && typeof n.date === "string" && (!last || n.date > last)) last = n.date;
  }
  return last;
}

// Les plages de 31 jours qui couvrent un intervalle, la plus récente d'abord.
function windowsBetween(from, to) {
  const out = [];
  for (let end = to; end >= from; end = shift(end, -WINDOW_DAYS)) {
    const start = shift(end, -(WINDOW_DAYS - 1));
    out.push({ start: start < from ? from : start, end });
  }
  return out;
}

// Les plages à demander, la plus récente d'abord : les dernières nuits
// s'affichent tout de suite, l'historique arrive derrière.
export function syncWindows(lastNight, todayISO, { backfillDays = BACKFILL_DAYS } = {}) {
  const floor = shift(todayISO, -(backfillDays - 1));
  let from = lastNight ? shift(lastNight, -OVERLAP_DAYS) : floor;
  if (from < floor) from = floor;
  if (from > todayISO) from = todayISO;
  return windowsBetween(from, todayISO);
}

// Une passe : les jours récents, puis ce qui reste de l'historique.
//
// L'import d'un an se fait en une douzaine de plages, et Garmin peut caler en
// route (limite de débit, panne passagère). Sans mémoire de l'endroit où il
// s'est arrêté, la passe suivante recommencerait par le plus récent et
// buterait au même endroit : l'historique ne se remplirait jamais. D'où deux
// repères dans `profile.garmin`, partagés par les appareils :
//   - `through` : le jour le plus récent lu (aujourd'hui, après une passe) ;
//   - `backfill` : le dernier jour de l'historique qui reste à lire, absent
//     quand tout est là.
export function planSync({ through, backfill, lastNight } = {}, todayISO) {
  const recent = syncWindows(through || lastNight, todayISO);
  if (!backfill) return recent;
  const floor = shift(todayISO, -(BACKFILL_DAYS - 1));
  // Jamais plus haut que les plages récentes : pas de jour lu deux fois.
  const lowest = shift(recent.at(-1).start, -1);
  const to = backfill < lowest ? backfill : lowest;
  return to >= floor ? [...recent, ...windowsBetween(floor, to)] : recent;
}

// Les repères après une passe. `failedAt` : l'index de la première plage qui
// n'est pas passée (`null` si toutes l'ont été). Les plages d'avant sont lues,
// et elles se suivent jusqu'à aujourd'hui ; tout ce qui est plus ancien que
// la plage ratée reste à lire.
export function syncCursor(windows, failedAt, todayISO, prev = {}) {
  if (failedAt == null) return { through: todayISO, backfill: null };
  if (failedAt === 0) return { through: prev.through || null, backfill: prev.backfill || null };
  return { through: todayISO, backfill: windows[failedAt].end };
}

// Une lecture refusée pour de bon (une route que la montre ne connaît pas)
// ne se retente pas ; une panne passagère, si.
const TRANSIENT = new Set(["rate_limited", "garmin_down", "garmin_timeout", "garmin_unreachable"]);
export const isTransient = (code) => TRANSIENT.has(code);

const NIGHT_KEYS = ["date", "total", "deep", "light", "rem", "awake", "score", "start", "end", "need", "source"];
const sameNight = (a, b) => NIGHT_KEYS.every(k => (a?.[k] ?? null) === (b?.[k] ?? null));

// Range les nuits reçues dans `data.sleep` : une par date, Garmin l'emporte
// sur ce qui était là. Rien de neuf → **la liste d'origine**, pour que le
// planning ne se marque pas « modifié » (la synchro le repousserait pour rien).
export function mergeNights(existing, incoming) {
  const list = Array.isArray(existing) ? existing : [];
  const byDate = new Map(list.filter(n => n && typeof n.date === "string").map(n => [n.date, n]));
  let changed = false;
  for (const n of Array.isArray(incoming) ? incoming : []) {
    if (!n || typeof n.date !== "string") continue;
    if (sameNight(byDate.get(n.date), n)) continue;
    byDate.set(n.date, n);
    changed = true;
  }
  if (!changed) return existing;
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Faut-il relancer tout seul ? La nuit dernière manque : la montre se
// synchronise au réveil, on regarde toutes les demi-heures. Sinon, une fois
// toutes les six heures suffit. `lastAttemptMs` compte les tentatives, ratées
// comprises : un Garmin en panne ne doit pas être réinterrogé à chaque retour
// dans l'app.
export function autoSyncDue(lastNight, todayISO, nowMs, lastAttemptMs) {
  if (!lastAttemptMs) return true;
  const waiting = !lastNight || lastNight < todayISO;
  return nowMs - lastAttemptMs > (waiting ? 30 * 60 * 1000 : 6 * 3600 * 1000);
}

// La dernière tentative, propre à l'appareil (hors synchro du planning).
const ATTEMPT_KEY = "climbing_garmin_sync_at";
export function readLastAttempt() {
  try { return Number(localStorage.getItem(ATTEMPT_KEY)) || 0; } catch { return 0; }
}
export function writeLastAttempt(ms) {
  try { localStorage.setItem(ATTEMPT_KEY, String(ms)); } catch { /* stockage indisponible : on relancera plus tôt, rien de grave */ }
}

// ── Les journées de récupération ─────────────────────────────────────────────
// `data.recovery` : { "2026-10-29": { rhr, hrv, hrvStatus, bbMax, stress… } },
// une entrée par jour, remplacée en entier quand Garmin la renvoie. Rien de
// neuf → l'objet d'origine (même raison que pour les nuits).
export function mergeRecovery(existing, days) {
  const base = existing && typeof existing === "object" ? existing : {};
  let out = null;
  for (const d of Array.isArray(days) ? days : []) {
    if (!d || typeof d.date !== "string") continue;
    const { date, ...fields } = d;
    const old = base[date];
    if (old && Object.keys(fields).length === Object.keys(old).length && Object.keys(fields).every(k => old[k] === fields[k])) continue;
    out = out || { ...base };
    out[date] = fields;
  }
  return out || existing;
}

// ── Activités → séances ──────────────────────────────────────────────────────
//
// Le lien se fait sur trois choses, dans cet ordre :
//   1. **le jour** : celui du départ de l'activité, à l'heure locale ;
//   2. **la discipline** : une course à pied va avec une séance de course ou de
//      trail, une grimpe avec une séance d'escalade, etc. (`COMPATIBLE`) ;
//   3. **l'heure**, pour départager : quand deux séances du même jour peuvent
//      convenir, la plus proche de l'heure de départ l'emporte. Une séance sans
//      heure (« Plus tard ») passe après une séance à moins de 6 h.
// Un lien est **un pour un** : une activité ne coche qu'une séance, une séance
// ne reçoit qu'une activité. Les paires se forment de la plus proche à la plus
// lointaine (tri global, pas séance après séance), si bien qu'une activité ne
// vole pas la séance d'une autre qui lui allait mieux.
//
// L'heure départage mais n'interdit rien : un footing prévu à midi et couru à
// 7 h reste le même footing. L'exiger proche aurait créé une seconde séance,
// le doublon qu'on veut justement éviter.

// Les clés Garmin (`running`, `trail_running`, `indoor_climbing`,
// `bouldering`, `strength_training`, `yoga`…) vers les disciplines de l'app.
export function disciplineOf(typeKey) {
  const k = String(typeKey || "").toLowerCase();
  if (/climb|boulder/.test(k)) return "climbing";
  if (/trail/.test(k)) return "trail";
  if (/run/.test(k)) return "running";
  if (/cycl|bik|ride|spin/.test(k)) return "cycling";
  if (/strength|hiit|crossfit|weight|bootcamp/.test(k)) return "strength";
  if (/yoga|pilates|stretch|mobility|breath/.test(k)) return "mobility";
  return "custom";
}

const COMPATIBLE = {
  running: ["running", "trail"],
  trail: ["trail", "running"],
  cycling: ["cycling"],
  climbing: ["climbing"],
  strength: ["strength"],
  mobility: ["mobility"],
  custom: ["custom"],
};

// Ajoutées d'office, les activités sans séance prévue doivent être récentes
// (la liaison remonte un an : on ne remplit pas le calendrier de toute une
// année d'un coup) et durer un peu (une marche de dix minutes n'est pas une
// séance).
export const AUTO_ADD_DAYS = 14;
export const AUTO_ADD_MIN_MINUTES = 15;
// Le registre des activités déjà traitées ne garde que ce qui peut encore
// revenir dans une synchro.
const SEEN_KEEP_DAYS = 60;
const NO_TIME_COST = 6 * 60;

const clockMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const isMissed = (fb) => !!fb && (fb.status === "not_done" || (fb.status == null && fb.done === false));
// Un statut posé à la main n'est jamais réécrit : on ne coche que ce qui n'a
// rien (pas de ressenti, ou un ressenti neutre).
const hasStatus = (fb) => !!fb && (fb.status != null || fb.done != null);

// Ce que la séance garde de l'activité : de quoi l'afficher et compter le réel.
function trace(a) {
  const keep = ["start", "durationMin", "distanceKm", "elevation", "avgHr", "maxHr", "calories", "load", "aerobic", "type", "name"];
  return { activityId: a.id, ...Object.fromEntries(keep.filter(k => a[k] != null).map(k => [k, a[k]])) };
}
const doneFeedback = (fb) => (hasStatus(fb) ? fb : { ...(fb || {}), status: "done", done: true, auto: "garmin" });

// Rend { data, linked, added } ; `data` est l'objet d'origine si rien ne
// change. `autoAdd` : ajouter les activités sans séance prévue ; `sports` :
// les disciplines pratiquées (le profil), `null` pour toutes. Une séance liée
// porte `checked` quand c'est la montre qui l'a cochée (elle n'avait pas de
// statut) : les autres étaient déjà notées, l'activité ne fait que s'y joindre.
export function linkActivities(data, activities, { todayISO, autoAdd = true, sports = null } = {}) {
  const list = Array.isArray(activities) ? activities : [];
  if (!list.length || !data) return { data, linked: [], added: [] };
  const weeks = data.weeks || {};
  const seen = data.garminSeen && typeof data.garminSeen === "object" ? data.garminSeen : {};
  const known = new Set(Object.keys(seen));
  for (const days of Object.values(weeks)) {
    for (const day of days || []) for (const s of day || []) if (s?.garmin?.activityId) known.add(String(s.garmin.activityId));
  }

  const byDate = new Map();
  for (const a of list) {
    if (!a?.id || !a.date || known.has(String(a.id))) continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  if (!byDate.size) return { data, linked: [], added: [] };

  const nextWeeks = { ...weeks };
  const nextSeen = { ...seen };
  const linked = [], added = [];
  const addFloor = todayISO ? shift(todayISO, -(AUTO_ADD_DAYS - 1)) : null;
  const practiced = Array.isArray(sports) && sports.length ? new Set(sports) : null;

  for (const [date, acts] of byDate) {
    const monday = getMondayOf(new Date(date + "T12:00:00"));
    const wk = weekKey(monday);
    // Midi moins le lundi minuit : n jours et demi, à une heure près (heure d'été).
    const di = Math.floor((new Date(date + "T12:00:00") - monday) / 86400000);
    const day = [...(nextWeeks[wk]?.[di] || [])];

    // Toutes les paires possibles, puis les plus proches d'abord.
    const pairs = [];
    acts.forEach((a, ai) => {
      const disc = disciplineOf(a.type);
      day.forEach((s, si) => {
        if (!s || isEventItem(s) || s.garmin?.activityId || isMissed(s.feedback)) return;
        if (!COMPATIBLE[disc].includes(s.discipline || "climbing")) return;
        const at = clockMin(a.start), st = clockMin(s.startTime);
        pairs.push({ ai, si, cost: at != null && st != null ? Math.abs(at - st) : NO_TIME_COST });
      });
    });
    pairs.sort((x, y) => x.cost - y.cost || x.si - y.si || x.ai - y.ai);
    const usedA = new Set(), usedS = new Set();
    for (const p of pairs) {
      if (usedA.has(p.ai) || usedS.has(p.si)) continue;
      usedA.add(p.ai); usedS.add(p.si);
      const a = acts[p.ai], s = day[p.si];
      day[p.si] = { ...s, garmin: trace(a), feedback: doneFeedback(s.feedback) };
      nextSeen[a.id] = date;
      linked.push({ activityId: a.id, sessionId: s.id || null, date, checked: !hasStatus(s.feedback) });
    }

    // Les activités restées seules : une séance faite, si elles en valent une.
    acts.forEach((a, ai) => {
      if (usedA.has(ai)) return;
      const disc = disciplineOf(a.type);
      const eligible = autoAdd && addFloor && date >= addFloor && date <= todayISO
        && a.durationMin >= AUTO_ADD_MIN_MINUTES && disc !== "custom"
        && (!practiced || practiced.has(disc));
      if (!eligible) return;
      const trio = ["running", "trail", "cycling"].includes(disc);
      day.push({
        // Un identifiant tiré de l'activité : deux appareils qui l'ajoutent en
        // même temps créent la **même** séance, que la synchro fusionne.
        id: `garmin-${a.id}`,
        name: a.name || getDiscipline(disc).label,
        discipline: disc,
        startTime: a.start || null,
        estimatedTime: a.durationMin,
        ...(trio && a.distanceKm ? { metrics: { distanceKm: a.distanceKm, ...(a.elevation ? { elevationM: a.elevation } : {}) } } : {}),
        garmin: trace(a),
        feedback: doneFeedback(null),
        source: "garmin",
      });
      nextSeen[a.id] = date;
      added.push({ activityId: a.id, sessionId: `garmin-${a.id}`, date });
    });

    if (linked.some(l => l.date === date) || added.some(x => x.date === date)) {
      const days = [...(nextWeeks[wk] || Array.from({ length: 7 }, () => []))];
      while (days.length < 7) days.push([]);
      days[di] = day;
      nextWeeks[wk] = days;
    }
  }

  if (!linked.length && !added.length) return { data, linked, added };
  // Le registre oublie ce qui ne reviendra plus.
  if (todayISO) {
    const floor = shift(todayISO, -SEEN_KEEP_DAYS);
    for (const [id, d] of Object.entries(nextSeen)) if (d < floor) delete nextSeen[id];
  }
  return { data: { ...data, weeks: nextWeeks, garminSeen: nextSeen }, linked, added };
}

export function garminMessage(code) {
  switch (code) {
    case "not_signed_in": return "Connecte-toi à ton compte pour relier Garmin.";
    case "missing_key": return "Colle la clé avant de valider.";
    case "key_rejected": return "Garmin refuse cette clé. Vérifie qu'elle est complète et qu'elle n'a pas expiré, ou crée-en une nouvelle.";
    case "garmin_forbidden": return "Garmin refuse l'accès à tes données avec cette clé.";
    case "rate_limited": return "Garmin demande de ralentir. Réessaie dans quelques minutes.";
    case "garmin_timeout": return "Garmin met trop de temps à répondre. Réessaie plus tard.";
    case "garmin_down":
    case "garmin_unreachable":
    case "garmin_error": return "Garmin ne répond pas pour l'instant. Réessaie plus tard.";
    case "no_key": return "Aucune clé n'est enregistrée.";
    case "not_installed": return "Le serveur n'est pas prêt : la table garmin_links manque dans Supabase.";
    case "server_misconfigured": return "Le serveur n'est pas configuré : la clé Supabase du serveur manque.";
    case "no_api": return "Le serveur ne répond pas à cette adresse : la fonction Garmin n'est pas déployée.";
    case "network": return "Pas de connexion au serveur.";
    default: return "Quelque chose s'est mal passé. Réessaie plus tard.";
  }
}

// ── Réseau ───────────────────────────────────────────────────────────────────
// Rend toujours { ok, data } ou { ok: false, error } : jamais d'exception.
export async function garminCall(action, { method = "GET", query, body } = {}) {
  const [{ default: supabase }, { appOrigin }] = await Promise.all([import("./supabase.js"), import("./native.js")]);
  if (!supabase) return { ok: false, error: "not_signed_in" };
  const { data: auth } = await supabase.auth.getSession();
  const token = auth?.session?.access_token;
  if (!token) return { ok: false, error: "not_signed_in" };

  let res;
  try {
    res = await fetch(`${appOrigin}/api/garmin/${action}${query ? "?" + new URLSearchParams(query) : ""}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "network" };
  }
  let json = null;
  try { json = await res.json(); } catch { /* corps vide ou page HTML */ }
  if (!res.ok) return { ok: false, status: res.status, error: json?.error || (res.status === 404 ? "no_api" : "server_error") };
  // Une page HTML servie à la place de la fonction (serveur de développement,
  // réécriture) : la réponse est « bonne » mais ce n'est pas notre API.
  if (!json || typeof json !== "object") return { ok: false, error: "no_api" };
  return { ok: true, data: json };
}

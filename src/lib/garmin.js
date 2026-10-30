// ─── GARMIN CONNECT, CÔTÉ APP ────────────────────────────────────────────────
// La clé vit sur le serveur (`api/garmin`, table `garmin_links`) ; l'app ne
// fait que demander des nuits et les ranger dans `data.sleep`, où la synchro
// du planning les emmène sur les autres appareils (et chez le coach, comme le
// Hooper). Une nuit :
//   { date, total, deep, light, rem, awake, score, start, end, need, source }
// durées en minutes, `date` celle du réveil, `source: "garmin"`.
//
// Le calcul (quelles plages demander, comment fusionner, quand relancer) est
// pur et testé sous Node (`npm run test:garmin`). L'appel réseau importe
// Supabase et `native.js` à la demande, sans quoi le module ne se chargerait
// pas hors navigateur.

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

// Les plages à demander, la plus récente d'abord : les dernières nuits
// s'affichent tout de suite, l'historique arrive derrière.
export function syncWindows(lastNight, todayISO, { backfillDays = BACKFILL_DAYS } = {}) {
  const floor = shift(todayISO, -(backfillDays - 1));
  let from = lastNight ? shift(lastNight, -OVERLAP_DAYS) : floor;
  if (from < floor) from = floor;
  if (from > todayISO) from = todayISO;
  const out = [];
  for (let end = todayISO; end >= from; end = shift(end, -WINDOW_DAYS)) {
    const start = shift(end, -(WINDOW_DAYS - 1));
    out.push({ start: start < from ? from : start, end });
  }
  return out;
}

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

export function garminMessage(code) {
  switch (code) {
    case "not_signed_in": return "Connecte-toi à ton compte pour relier Garmin.";
    case "missing_key": return "Colle la clé avant de valider.";
    case "key_rejected": return "Garmin refuse cette clé. Vérifie qu'elle est complète et qu'elle n'a pas expiré, ou crée-en une nouvelle.";
    case "garmin_forbidden": return "Garmin refuse l'accès au sommeil avec cette clé.";
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

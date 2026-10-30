// Garmin Connect — API personnelle (clé générée par l'utilisateur sur Garmin
// Connect, https://connect.garmin.com/app/settings/personalApiToken).
//
// Tout ce qui ne touche ni au réseau ni à Supabase vit ici, pour se tester sous
// Node (`npm run test:garmin`) : validation des entrées, lecture des jetons,
// et surtout la mise en forme des nuits.
//
// Le protocole, tel que le décrit le client Python officiel de Garmin
// (`garmin-connect-personal-api-python`, constants.py, auth.py, client.py) :
//   1. la clé ne sert jamais directement. Elle s'échange contre un jeton :
//      POST {BASE}{TOKEN_PATH}, en-tête `Authorization: ApiKey <clé>`, et le
//      corps de la réponse **est** le jeton (un JWT, valable 24 h) ;
//   2. les données se lisent en GET avec `Authorization: Bearer <jeton>`.
// Le sommeil se lit par plages de 31 nuits au plus.

export const GARMIN_BASE = "https://personal.connectapi.garmin.com";
export const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
export const SLEEP_PATH = "/sleep-service/sleep/dailySleepSummariesByDate";
export const MAX_RANGE_DAYS = 31;

// Un jeton à moins d'une heure de sa fin est renouvelé avant usage, comme le
// fait le client officiel : un appel ne doit pas partir avec un jeton qui
// expire en route.
export const TOKEN_MARGIN_MS = 60 * 60 * 1000;
// Un jeton sans date lisible est tenu pour valable 23 h (Garmin annonce 24).
export const TOKEN_FALLBACK_MS = 23 * 60 * 60 * 1000;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ── Clé et jeton ─────────────────────────────────────────────────────────────

// Ce qu'on a collé : la clé seule, débarrassée des espaces, des retours à la
// ligne, des guillemets et d'un éventuel « ApiKey » recopié avec elle.
export function cleanKey(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^["']|["']$/g, "").replace(/^ApiKey\s+/i, "").replace(/\s+/g, "");
}

// Les quatre derniers caractères, pour reconnaître sa clé sans l'afficher.
export function keyHint(key) {
  const k = cleanKey(key);
  return k.length >= 8 ? k.slice(-4) : "";
}

// La date d'expiration d'un JWT, en millisecondes, sans vérifier sa signature
// (ce n'est pas à nous de le faire : on ne fait que savoir quand le renouveler).
export function jwtExpiry(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const exp = Number(JSON.parse(json).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function tokenUsable(expiresAtMs, nowMs) {
  return Number.isFinite(expiresAtMs) && expiresAtMs - nowMs > TOKEN_MARGIN_MS;
}

// ── Entrées ──────────────────────────────────────────────────────────────────

const dayNumber = (iso) => Math.round(Date.parse(iso + "T12:00:00Z") / 86400000);

function validDay(s) {
  if (typeof s !== "string" || !ISO_DAY.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// `?start=2026-10-01&end=2026-10-30` : deux vraies dates, dans l'ordre, et pas
// plus de 31 nuits (la limite de Garmin pour le sommeil).
export function parseRange(query) {
  const start = query?.start, end = query?.end;
  if (!validDay(start) || !validDay(end)) return { error: "bad_dates" };
  if (start > end) return { error: "bad_dates" };
  if (dayNumber(end) - dayNumber(start) + 1 > MAX_RANGE_DAYS) return { error: "range_too_long" };
  return { start, end };
}

// Le code d'erreur qu'on renvoie au client pour une réponse de Garmin.
export function garminErrorCode(status) {
  if (status === 401 || status === 403) return "key_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "garmin_down";
  return "garmin_error";
}

// ── Nuits ────────────────────────────────────────────────────────────────────
//
// Ce que l'app garde d'une nuit (`data.sleep`, la forme qu'avait l'ancien
// import CSV, plus quelques champs) :
//   { date, total, deep, light, rem, awake, score, start, end, need, source }
// Les durées en **minutes**, `date` celle du réveil (le `calendarDate` de
// Garmin), `start` / `end` à l'heure locale (« 23:12 »), `need` le besoin de
// sommeil que Garmin calcule pour cette nuit.

const num = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const minutes = (secs) => {
  const n = num(secs);
  return n != null && n > 0 ? Math.round(n / 60) : 0;
};

// Les horodatages « Local » de Garmin sont des millisecondes déjà décalées sur
// le fuseau de l'utilisateur : leur heure UTC **est** l'heure locale. Certains
// services renvoient plutôt une date ISO sans fuseau ; les deux se lisent.
export function localClock(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(11, 16);
  const ms = num(value);
  if (ms == null || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(11, 16);
}

function overallScore(scores) {
  if (!scores || typeof scores !== "object") return null;
  const key = Object.keys(scores).find(k => k.toLowerCase() === "overall");
  const v = num(key ? scores[key]?.value : null);
  return v != null && v > 0 && v <= 100 ? Math.round(v) : null;
}

// Le besoin de sommeil est en minutes (480 = 8 h). Hors de 3 h à 15 h, on ne
// sait pas ce qu'on lit : mieux vaut rien qu'une valeur fausse.
function sleepNeed(need) {
  const v = num(need?.actual);
  return v != null && v >= 180 && v <= 900 ? Math.round(v) : null;
}

export function normalizeNight(raw) {
  // Le service « wellness » de Garmin range la nuit sous `dailySleepDTO` ;
  // l'API personnelle la rend à plat. Les deux se lisent.
  const dto = raw?.dailySleepDTO && typeof raw.dailySleepDTO === "object" ? raw.dailySleepDTO : raw;
  if (!dto || typeof dto !== "object") return null;
  const date = dto.calendarDate;
  if (!validDay(date)) return null;
  if (dto.sleepWindowConfirmationType === "off_wrist") return null;

  const total = minutes(dto.sleepTimeSeconds);
  if (!total) return null;
  const deep = minutes(dto.deepSleepSeconds);
  const light = minutes(dto.lightSleepSeconds);
  const rem = minutes(dto.remSleepSeconds);
  const awake = minutes(dto.awakeSleepSeconds);
  const score = overallScore(dto.sleepScores);
  // Ni phase ni score : un fragment (une heure captée au réveil, montre
  // reposée tard), pas une nuit. Le compter ferait plonger les moyennes.
  if (!deep && !light && !rem && score == null) return null;

  return {
    date, total, deep, light, rem, awake, score,
    start: localClock(dto.sleepStartTimestampLocal),
    end: localClock(dto.sleepEndTimestampLocal),
    need: sleepNeed(dto.sleepNeed),
    source: "garmin",
  };
}

// La réponse de Garmin : une liste de nuits (plage), ou une seule nuit. Une
// date ne sort qu'une fois, et la liste sort dans l'ordre des dates.
export function normalizeSleep(payload) {
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const byDate = new Map();
  for (const raw of list) {
    const night = normalizeNight(raw);
    if (night) byDate.set(night.date, night);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

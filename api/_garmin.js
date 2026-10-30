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
// La FAQ de Garmin le confirme, et la spécification OpenAPI de l'API
// (https://developer.garmin.com/gc-developer-program/personal/swagger-docs/,
// embarquée dans la page) donne les routes et les champs lus ici.
//
// Une passe de synchronisation lit, pour une plage de 31 jours au plus (la
// limite du sommeil, la plus courte des quatre) :
//   · les nuits             dailySleepSummariesByDate → DailySleepDTO[]
//   · les résumés du jour   v2/dailysummaries          → { data: UserDailySummaryV2DTO[] }
//     (FC au repos, stress, Body Battery)
//   · la VFC de la nuit     hrv/daily/{du}/{au}        → { hrvSummaries: HrvSummaryDTO[] }
//   · les activités         activities/search          → SummarizedActivityDTO[]

export const GARMIN_BASE = "https://personal.connectapi.garmin.com";
export const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
export const SLEEP_PATH = "/sleep-service/sleep/dailySleepSummariesByDate";
export const DAILY_PATH = "/usersummary-service/v2/dailysummaries";
export const HRV_PATH = "/hrv-service/hrv/daily";
export const ACTIVITIES_PATH = "/activitylist-service/activities/search/activities";
export const MAX_RANGE_DAYS = 31;
// 99 activités par page (le maximum par défaut de Garmin) ; quatre pages
// couvrent largement 31 jours, même à trois séances par jour.
export const ACTIVITIES_PAGE = 99;
export const ACTIVITIES_MAX_PAGES = 4;

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

// ── Récupération ─────────────────────────────────────────────────────────────
//
// Une journée : { date, rhr, stress, bbMax, bbMin, bbCharged, bbDrained, hrv,
// hrvWeek, hrvStatus, hrvLow, hrvHigh }, chaque champ absent quand Garmin n'a
// rien. Les bornes écartent les valeurs « sans mesure » de Garmin (un stress à
// -1 ou -2, une FC à 0 pour une montre au tiroir) : mieux vaut un trou qu'une
// fausse moyenne.

const within = (v, lo, hi) => {
  const n = num(v);
  return n != null && n >= lo && n <= hi ? Math.round(n) : null;
};
export const HRV_STATUSES = ["BALANCED", "UNBALANCED", "LOW", "POOR"];

export function normalizeDays(summaries, hrv) {
  const days = new Map();
  const put = (date, fields) => {
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
    if (!Object.keys(clean).length) return;
    days.set(date, { ...(days.get(date) || { date }), ...clean });
  };
  const rows = Array.isArray(summaries?.data) ? summaries.data : Array.isArray(summaries) ? summaries : [];
  for (const r of rows) {
    if (!validDay(r?.calendarDate)) continue;
    put(r.calendarDate, {
      rhr: within(r.heartRate?.restingValue, 25, 130),
      stress: within(r.stress?.avgLevel, 0, 100),
      bbMax: within(r.bodyBattery?.maxValue, 0, 100),
      bbMin: within(r.bodyBattery?.minValue, 0, 100),
      // Sur une journée, la charge peut dépasser 100 (recharge, dépense,
      // recharge) : on ne la borne qu'à ce qui reste plausible.
      bbCharged: within(r.bodyBattery?.chargedValue, 0, 200),
      bbDrained: within(r.bodyBattery?.drainedValue, 0, 200),
    });
  }
  const nights = Array.isArray(hrv?.hrvSummaries) ? hrv.hrvSummaries : [];
  for (const h of nights) {
    if (!validDay(h?.calendarDate)) continue;
    const value = within(h.lastNightAvg, 5, 300);
    if (value == null) continue;
    put(h.calendarDate, {
      hrv: value,
      hrvWeek: within(h.weeklyAvg, 5, 300),
      // NONE et INVALID : Garmin n'a pas encore de référence (les premières
      // semaines) ou la nuit n'est pas exploitable.
      hrvStatus: HRV_STATUSES.includes(h.status) ? h.status : null,
      hrvLow: within(h.baseline?.balancedLow, 5, 300),
      hrvHigh: within(h.baseline?.balancedUpper, 5, 300),
    });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── Activités ────────────────────────────────────────────────────────────────
//
// Une activité : { id, date, start, type, name, durationMin, distanceKm,
// elevation, avgHr, maxHr, calories, load, aerobic }. `date` et `start` sont
// ceux de l'heure locale de départ (« yyyy-MM-dd HH:mm:ss », sans fuseau) :
// c'est le jour du calendrier de l'utilisateur, pas celui de Greenwich. `type`
// est la clé Garmin (`running`, `trail_running`, `indoor_climbing`…) ; c'est
// l'app qui la traduit en discipline. L'identifiant devient une chaîne : il
// sert de clé.

export function normalizeActivity(a) {
  const id = num(a?.activityId);
  if (!id || id <= 0) return null;
  const m = typeof a.startTimeLocal === "string" ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(a.startTimeLocal) : null;
  if (!m || !validDay(m[1])) return null;
  const durationMin = minutes(a.duration ?? a.movingDuration ?? a.elapsedDuration);
  if (!durationMin) return null;
  const meters = num(a.distance);
  const te = num(a.aerobicTrainingEffect);
  const out = {
    id: String(Math.round(id)),
    date: m[1],
    start: `${m[2]}:${m[3]}`,
    type: typeof a.activityType?.typeKey === "string" ? a.activityType.typeKey : null,
    name: typeof a.activityName === "string" && a.activityName.trim() ? a.activityName.trim().slice(0, 80) : null,
    durationMin,
    distanceKm: meters != null && meters >= 10 ? Math.round(meters / 10) / 100 : null,
    elevation: within(a.elevationGain, 1, 10000),
    avgHr: within(a.averageHR, 30, 230),
    maxHr: within(a.maxHR, 30, 240),
    calories: within(a.calories, 1, 20000),
    load: within(a.activityTrainingLoad, 1, 2000),
    aerobic: te != null && te > 0 && te <= 5 ? Math.round(te * 10) / 10 : null,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null));
}

export function normalizeActivities(list) {
  const byId = new Map();
  for (const a of Array.isArray(list) ? list : []) {
    const n = normalizeActivity(a);
    if (n) byId.set(n.id, n);
  }
  return [...byId.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

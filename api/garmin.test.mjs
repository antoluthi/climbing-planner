// Garmin Connect, côté serveur — `npm run test:garmin` (aucune dépendance).
//
// Deux couches : la partie pure (`_garmin.js` : clé, jeton, dates, nuits) et
// le gestionnaire (`handleGarmin`), qu'on fait tourner contre un faux Garmin
// et une fausse table. Rien ne part sur le réseau.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanKey, keyHint, jwtExpiry, tokenUsable, parseRange, localClock,
  normalizeNight, normalizeSleep, GARMIN_BASE, TOKEN_PATH, SLEEP_PATH,
} from "./_garmin.js";
import { handleGarmin } from "./_garmin-handler.js";

// ─── Doublures ────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-10-30T08:00:00Z");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (expSeconds) => `${b64({ alg: "RS256" })}.${b64({ sub: "u", exp: expSeconds })}.sig`;
const TOKEN_A = jwt(NOW / 1000 + 24 * 3600);
const TOKEN_B = jwt(NOW / 1000 + 24 * 3600 + 60);

// Une nuit telle que la décrit la documentation de l'API (DailySleepDTO).
const NIGHT = {
  calendarDate: "2026-10-29",
  sleepTimeSeconds: 27120,          // 7 h 32
  deepSleepSeconds: 4860,           // 1 h 21
  lightSleepSeconds: 15060,         // 4 h 11
  remSleepSeconds: 7200,            // 2 h
  awakeSleepSeconds: 1320,          // 22 min
  sleepStartTimestampLocal: Date.parse("2026-10-28T23:14:00Z"),
  sleepEndTimestampLocal: Date.parse("2026-10-29T07:08:00Z"),
  sleepWindowConfirmationType: "enhanced_confirmed_final",
  sleepScores: { overall: { value: 82, qualifierKey: "GOOD" }, totalDuration: { value: 90 } },
  sleepNeed: { baseline: 480, actual: 495 },
};

function fakeGarmin(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", auth: init.headers?.Authorization });
    for (const [match, reply] of routes) {
      if (url.includes(match)) {
        const r = typeof reply === "function" ? reply(url, init, calls) : reply;
        if (r instanceof Error) throw r;
        const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? null);
        return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => body };
      }
    }
    return { ok: false, status: 404, text: async () => "" };
  };
  return { fetch, calls };
}

function fakeStore(initial) {
  const rows = new Map(initial ? [["u1", { ...initial }]] : []);
  return {
    rows,
    get: async (id) => (rows.has(id) ? { ...rows.get(id) } : null),
    save: async (id, row) => { rows.set(id, { ...(rows.get(id) || {}), ...row }); },
    patch: async (id, fields) => { if (rows.has(id)) rows.set(id, { ...rows.get(id), ...fields }); },
    remove: async (id) => { rows.delete(id); },
  };
}

function deps({ store, garmin }) {
  return { verifyUser: async (t) => (t === "good-jwt" ? "u1" : null), store, fetch: garmin.fetch, now: () => NOW };
}
const call = (req, d) => handleGarmin({ method: "GET", authorization: "Bearer good-jwt", query: {}, body: {}, ...req }, d);

// ─── Clé, jeton, dates ────────────────────────────────────────────────────────

test("la clé collée est nettoyée, et seule sa fin se montre", () => {
  assert.equal(cleanKey("  abcd-1234-efgh-5678 \n"), "abcd-1234-efgh-5678");
  assert.equal(cleanKey('"abcd-1234-efgh-5678"'), "abcd-1234-efgh-5678");
  assert.equal(cleanKey("ApiKey abcd-1234-efgh-5678"), "abcd-1234-efgh-5678");
  assert.equal(cleanKey(undefined), "");
  assert.equal(keyHint("abcd-1234-efgh-5678"), "5678");
  assert.equal(keyHint("court"), "");
});

test("la date d'un jeton se lit dans son exp", () => {
  assert.equal(jwtExpiry(TOKEN_A), NOW + 24 * 3600 * 1000);
  assert.equal(jwtExpiry("pas-un-jwt"), null);
  assert.equal(jwtExpiry(`${b64({})}.${b64({ sub: "u" })}.x`), null);
  // Moins d'une heure de reste : on le renouvelle avant de s'en servir.
  assert.ok(tokenUsable(NOW + 2 * 3600 * 1000, NOW));
  assert.ok(!tokenUsable(NOW + 30 * 60 * 1000, NOW));
  assert.ok(!tokenUsable(NaN, NOW));
});

test("une plage : deux vraies dates, dans l'ordre, 31 nuits au plus", () => {
  assert.deepEqual(parseRange({ start: "2026-10-01", end: "2026-10-31" }), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(parseRange({ start: "2026-10-01", end: "2026-11-01" }), { error: "range_too_long" });
  assert.deepEqual(parseRange({ start: "2026-10-30", end: "2026-10-01" }), { error: "bad_dates" });
  assert.deepEqual(parseRange({ start: "2026-02-30", end: "2026-03-02" }), { error: "bad_dates" });
  assert.deepEqual(parseRange({ start: "2026-10-01" }), { error: "bad_dates" });
});

// ─── Nuits ────────────────────────────────────────────────────────────────────

test("une nuit Garmin devient une nuit de l'app, en minutes", () => {
  assert.deepEqual(normalizeNight(NIGHT), {
    date: "2026-10-29", total: 452, deep: 81, light: 251, rem: 120, awake: 22,
    score: 82, start: "23:14", end: "07:08", need: 495, source: "garmin",
  });
});

test("la même nuit, rangée sous dailySleepDTO, se lit pareil", () => {
  assert.deepEqual(normalizeNight({ dailySleepDTO: NIGHT, restingHeartRate: 48 }), normalizeNight(NIGHT));
});

test("montre au tiroir, fragment, nuit vide : rien n'est gardé", () => {
  assert.equal(normalizeNight({ ...NIGHT, sleepWindowConfirmationType: "off_wrist" }), null);
  assert.equal(normalizeNight({ ...NIGHT, sleepTimeSeconds: 0 }), null);
  assert.equal(normalizeNight({ ...NIGHT, calendarDate: "hier" }), null);
  // Une heure captée sans phase ni score : un fragment, pas une nuit.
  assert.equal(normalizeNight({ calendarDate: "2026-10-29", sleepTimeSeconds: 3600 }), null);
  // Sans score (montre ancienne) mais avec ses phases : c'est une nuit.
  const noScore = normalizeNight({ ...NIGHT, sleepScores: undefined });
  assert.equal(noScore.score, null);
  assert.equal(noScore.total, 452);
});

test("un score ou un besoin illisible vaut mieux absent que faux", () => {
  assert.equal(normalizeNight({ ...NIGHT, sleepScores: { overall: { value: 0, qualifierKey: "INVALID" } } }).score, null);
  assert.equal(normalizeNight({ ...NIGHT, sleepScores: { overall: { value: 140 } } }).score, null);
  // 29 700 ressemble à des secondes : hors de 3 h à 15 h en minutes, on l'écarte.
  assert.equal(normalizeNight({ ...NIGHT, sleepNeed: { actual: 29700 } }).need, null);
  assert.equal(normalizeNight({ ...NIGHT, sleepNeed: null }).need, null);
});

test("les heures locales : millisecondes, chaîne de chiffres ou date ISO", () => {
  assert.equal(localClock(Date.parse("2026-10-28T23:14:00Z")), "23:14");
  assert.equal(localClock(String(Date.parse("2026-10-29T00:41:00Z"))), "00:41");
  assert.equal(localClock("2026-10-29T06:55:00.0"), "06:55");
  assert.equal(localClock(null), null);
  assert.equal(localClock(""), null);
});

test("une réponse de plage : une nuit par date, dans l'ordre des dates", () => {
  const out = normalizeSleep([
    { ...NIGHT, calendarDate: "2026-10-29", sleepTimeSeconds: 25200 },
    { ...NIGHT, calendarDate: "2026-10-27" },
    { calendarDate: "2026-10-28", sleepTimeSeconds: 3000 },               // fragment
    { ...NIGHT, calendarDate: "2026-10-29" },                             // la dernière l'emporte
  ]);
  assert.deepEqual(out.map(n => [n.date, n.total]), [["2026-10-27", 452], ["2026-10-29", 452]]);
  assert.deepEqual(normalizeSleep(NIGHT).map(n => n.date), ["2026-10-29"]);
  assert.deepEqual(normalizeSleep(null), []);
  assert.deepEqual(normalizeSleep("rien"), []);
});

// ─── Le gestionnaire ─────────────────────────────────────────────────────────

test("sans compte, rien ne se fait", async () => {
  const d = deps({ store: fakeStore(), garmin: fakeGarmin([]) });
  assert.deepEqual(await call({ authorization: "" }, d), { status: 401, body: { error: "not_signed_in" } });
  assert.deepEqual(await call({ authorization: "Bearer mauvais" }, d), { status: 401, body: { error: "not_signed_in" } });
});

test("une clé est vérifiée auprès de Garmin avant d'être enregistrée, et ne ressort jamais", async () => {
  const garmin = fakeGarmin([[TOKEN_PATH, { status: 200, body: TOKEN_A + "\n" }]]);
  const store = fakeStore();
  const out = await call({ method: "POST", action: "key", body: { apiKey: " ma-cle-personnelle-1234 " } }, deps({ store, garmin }));

  assert.equal(out.status, 200);
  assert.equal(out.body.linked, true);
  assert.equal(out.body.hint, "1234");
  assert.ok(!JSON.stringify(out.body).includes("ma-cle-personnelle"), "la clé ne revient pas au client");
  assert.ok(!JSON.stringify(out.body).includes(TOKEN_A), "le jeton non plus");

  assert.deepEqual(garmin.calls, [{ url: GARMIN_BASE + TOKEN_PATH, method: "POST", auth: "ApiKey ma-cle-personnelle-1234" }]);
  const row = store.rows.get("u1");
  assert.equal(row.api_key, "ma-cle-personnelle-1234");
  assert.equal(row.access_token, TOKEN_A);
  assert.equal(row.token_expires_at, new Date(NOW + 24 * 3600 * 1000).toISOString());
});

test("une clé refusée par Garmin n'est pas enregistrée", async () => {
  const store = fakeStore();
  const garmin = fakeGarmin([[TOKEN_PATH, { status: 401, body: "" }]]);
  const out = await call({ method: "POST", action: "key", body: { apiKey: "mauvaise-cle-0000" } }, deps({ store, garmin }));
  assert.deepEqual(out, { status: 422, body: { error: "key_rejected" } });
  assert.equal(store.rows.size, 0);
  assert.deepEqual(await call({ method: "POST", action: "key", body: { apiKey: "  " } }, deps({ store, garmin })), { status: 400, body: { error: "missing_key" } });
});

test("l'état dit si une clé est là, sans jamais la montrer", async () => {
  const store = fakeStore({ api_key: "secret-cle-9876", key_hint: "9876", access_token: TOKEN_A, updated_at: "2026-10-30T07:00:00.000Z", last_sync_at: null, last_error: null });
  const garmin = fakeGarmin([]);
  const out = await call({ action: "status" }, deps({ store, garmin }));
  assert.deepEqual(out.body, { linked: true, hint: "9876", savedAt: "2026-10-30T07:00:00.000Z", lastSyncAt: null, lastError: null });
  assert.ok(!JSON.stringify(out.body).includes("secret"));
  assert.deepEqual((await call({ action: "status" }, deps({ store: fakeStore(), garmin }))).body, { linked: false });
});

test("le sommeil se lit avec le jeton gardé, sans repasser par la clé", async () => {
  const store = fakeStore({ api_key: "cle-1234-abcd", access_token: TOKEN_A, token_expires_at: new Date(NOW + 20 * 3600 * 1000).toISOString() });
  const garmin = fakeGarmin([[SLEEP_PATH, { status: 200, body: [NIGHT] }]]);
  const out = await call({ action: "sleep", query: { start: "2026-10-01", end: "2026-10-30" } }, deps({ store, garmin }));

  assert.equal(out.status, 200);
  assert.deepEqual(out.body.nights.map(n => n.date), ["2026-10-29"]);
  assert.equal(garmin.calls.length, 1);
  assert.equal(garmin.calls[0].auth, `Bearer ${TOKEN_A}`);
  assert.ok(garmin.calls[0].url.endsWith(`${SLEEP_PATH}?startDate=2026-10-01&endDate=2026-10-30`));
  assert.equal(store.rows.get("u1").last_sync_at, new Date(NOW).toISOString());
});

test("un jeton près de sa fin est renouvelé, et le nouveau est gardé", async () => {
  const store = fakeStore({ api_key: "cle-1234-abcd", access_token: TOKEN_A, token_expires_at: new Date(NOW + 10 * 60 * 1000).toISOString() });
  const garmin = fakeGarmin([[TOKEN_PATH, { status: 200, body: TOKEN_B }], [SLEEP_PATH, { status: 200, body: [] }]]);
  const out = await call({ action: "sleep", query: { start: "2026-10-29", end: "2026-10-30" } }, deps({ store, garmin }));
  assert.equal(out.status, 200);
  assert.deepEqual(garmin.calls.map(c => c.method), ["POST", "GET"]);
  assert.equal(garmin.calls[1].auth, `Bearer ${TOKEN_B}`);
  assert.equal(store.rows.get("u1").access_token, TOKEN_B);
});

test("un jeton révoqué avant l'heure : un nouveau, et une seule autre tentative", async () => {
  const store = fakeStore({ api_key: "cle-1234-abcd", access_token: TOKEN_A, token_expires_at: new Date(NOW + 20 * 3600 * 1000).toISOString() });
  const garmin = fakeGarmin([
    [TOKEN_PATH, { status: 200, body: TOKEN_B }],
    [SLEEP_PATH, (url, init) => (init.headers.Authorization === `Bearer ${TOKEN_A}` ? { status: 401, body: "" } : { status: 200, body: [NIGHT] })],
  ]);
  const out = await call({ action: "sleep", query: { start: "2026-10-29", end: "2026-10-30" } }, deps({ store, garmin }));
  assert.equal(out.status, 200);
  assert.equal(out.body.nights.length, 1);
  assert.deepEqual(garmin.calls.map(c => c.method), ["GET", "POST", "GET"]);
});

test("une clé expirée chez Garmin se dit, et se note", async () => {
  const store = fakeStore({ api_key: "cle-1234-abcd", access_token: null, token_expires_at: null });
  const garmin = fakeGarmin([[TOKEN_PATH, { status: 401, body: "" }]]);
  const out = await call({ action: "sleep", query: { start: "2026-10-29", end: "2026-10-30" } }, deps({ store, garmin }));
  assert.deepEqual(out, { status: 422, body: { error: "key_rejected" } });
  assert.equal(store.rows.get("u1").last_error, "key_rejected");

  // Jeton tout neuf et pourtant refusé : inutile d'insister.
  const store2 = fakeStore({ api_key: "cle-1234-abcd" });
  const garmin2 = fakeGarmin([[TOKEN_PATH, { status: 200, body: TOKEN_B }], [SLEEP_PATH, { status: 401, body: "" }]]);
  const out2 = await call({ action: "sleep", query: { start: "2026-10-29", end: "2026-10-30" } }, deps({ store: store2, garmin: garmin2 }));
  assert.deepEqual(out2, { status: 422, body: { error: "key_rejected" } });
  assert.deepEqual(garmin2.calls.map(c => c.method), ["POST", "GET"]);
});

test("sans clé, ou avec une plage trop longue, Garmin n'est pas appelé", async () => {
  const garmin = fakeGarmin([]);
  assert.deepEqual(await call({ action: "sleep", query: { start: "2026-10-01", end: "2026-10-30" } }, deps({ store: fakeStore(), garmin })), { status: 404, body: { error: "no_key" } });
  const store = fakeStore({ api_key: "cle-1234-abcd" });
  assert.deepEqual(await call({ action: "sleep", query: { start: "2026-09-01", end: "2026-10-30" } }, deps({ store, garmin })), { status: 400, body: { error: "range_too_long" } });
  assert.equal(garmin.calls.length, 0);
});

test("Garmin lent, saturé ou en panne : chaque cas a son code", async () => {
  const store = () => fakeStore({ api_key: "cle-1234-abcd", access_token: TOKEN_A, token_expires_at: new Date(NOW + 20 * 3600 * 1000).toISOString() });
  const q = { action: "sleep", query: { start: "2026-10-29", end: "2026-10-30" } };
  const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  assert.deepEqual((await call(q, deps({ store: store(), garmin: fakeGarmin([[SLEEP_PATH, timeout]]) }))).body, { error: "garmin_timeout" });
  assert.deepEqual((await call(q, deps({ store: store(), garmin: fakeGarmin([[SLEEP_PATH, { status: 429, body: "" }]]) }))).status, 429);
  assert.deepEqual((await call(q, deps({ store: store(), garmin: fakeGarmin([[SLEEP_PATH, { status: 503, body: "" }]]) }))).body, { error: "garmin_down" });
  assert.deepEqual((await call(q, deps({ store: store(), garmin: fakeGarmin([[SLEEP_PATH, { status: 200, body: "<html>" }]]) }))).body, { error: "garmin_error" });
});

test("oublier la clé, et une base sans la table", async () => {
  const store = fakeStore({ api_key: "cle-1234-abcd" });
  assert.deepEqual(await call({ method: "DELETE", action: "key" }, deps({ store, garmin: fakeGarmin([]) })), { status: 200, body: { linked: false } });
  assert.equal(store.rows.size, 0);

  const broken = { ...fakeStore(), get: async () => { throw Object.assign(new Error("missing"), { code: "PGRST205" }); } };
  assert.deepEqual(await call({ action: "status" }, deps({ store: broken, garmin: fakeGarmin([]) })), { status: 503, body: { error: "not_installed" } });
  assert.deepEqual(await call({ action: "nope" }, deps({ store, garmin: fakeGarmin([]) })), { status: 404, body: { error: "not_found" } });
  assert.deepEqual(await call({ method: "PUT", action: "key" }, deps({ store, garmin: fakeGarmin([]) })), { status: 405, body: { error: "method_not_allowed" } });
});

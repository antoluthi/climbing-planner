// Garmin Connect, côté app : `npm run test:garmin`.
// Ce qui se décide sans réseau : quelles plages demander, où reprendre un
// import interrompu, comment ranger ce qui revient, comment une activité
// trouve sa séance, quand relancer tout seul.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lastGarminNight, syncWindows, planSync, syncCursor, isTransient, mergeNights, autoSyncDue, garminMessage,
  disciplineOf, linkActivities, mergeRecovery,
  WINDOW_DAYS, BACKFILL_DAYS,
} from "./garmin.js";

const TODAY = "2026-10-30";
const night = (date, total = 450, extra = {}) => ({
  date, total, deep: 80, light: 250, rem: 100, awake: 20, score: 80, start: "23:10", end: "07:00", need: 480, source: "garmin", ...extra,
});
const days = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000) + 1;

test("la dernière nuit venue de Garmin, sans compter l'ancien import CSV", () => {
  assert.equal(lastGarminNight([night("2026-10-20"), { date: "2026-10-28", total: 400 }, night("2026-10-25")]), "2026-10-25");
  assert.equal(lastGarminNight([{ date: "2026-10-28", total: 400 }]), null);
  assert.equal(lastGarminNight(undefined), null);
});

test("première liaison : un an, par plages de 31 nuits, la plus récente d'abord", () => {
  const w = syncWindows(null, TODAY);
  assert.equal(w.length, Math.ceil(BACKFILL_DAYS / WINDOW_DAYS));
  assert.equal(w[0].end, TODAY);
  assert.equal(w.at(-1).start, "2025-10-31");                     // 365 nuits, aujourd'hui compris
  assert.ok(w.every(x => days(x.start, x.end) <= WINDOW_DAYS && x.start <= x.end));
  // Contiguës : ni trou ni recouvrement entre deux plages.
  for (let i = 1; i < w.length; i++) assert.equal(days(w[i].end, w[i - 1].start), 2);
  assert.equal(w.reduce((s, x) => s + days(x.start, x.end), 0), BACKFILL_DAYS);
});

test("ensuite : seulement depuis les deux dernières nuits", () => {
  assert.deepEqual(syncWindows("2026-10-29", TODAY), [{ start: "2026-10-27", end: TODAY }]);
  // Plusieurs semaines sans ouvrir l'app : ce qui manque, pas plus.
  assert.deepEqual(syncWindows("2026-09-10", TODAY), [{ start: "2026-09-30", end: TODAY }, { start: "2026-09-08", end: "2026-09-29" }]);
  // Une dernière nuit vieille de deux ans : on s'arrête à l'année.
  assert.equal(syncWindows("2024-10-01", TODAY).at(-1).start, "2025-10-31");
  // Une horloge en avance ne fait pas demander l'avenir.
  assert.deepEqual(syncWindows("2026-11-05", TODAY), [{ start: TODAY, end: TODAY }]);
});

test("un import arrêté en route reprend là où il s'est arrêté, pas au début", () => {
  // Premier import : Garmin cale à la 6e plage (limite de débit).
  const first = planSync({}, TODAY);
  assert.equal(first.length, 12);
  const cur = syncCursor(first, 5, TODAY, {});
  assert.deepEqual(cur, { through: TODAY, backfill: first[5].end });
  // Le lendemain : les deux derniers jours, puis ce qui reste de l'année, et
  // rien de ce qui est déjà là.
  const next = planSync({ ...cur, lastNight: TODAY }, "2026-10-31");
  assert.deepEqual(next[0], { start: "2026-10-28", end: "2026-10-31" });
  assert.equal(next[1].end, first[5].end);
  assert.equal(next.at(-1).start, "2025-11-01");
  assert.equal(next.length, 1 + 7);
  // Tout est passé : plus rien en attente.
  assert.deepEqual(syncCursor(next, null, "2026-10-31", cur), { through: "2026-10-31", backfill: null });
});

test("une passe qui cale d'emblée ne touche pas aux repères", () => {
  const prev = { through: "2026-10-29", backfill: "2026-05-01" };
  const w = planSync(prev, TODAY);
  assert.deepEqual(syncCursor(w, 0, TODAY, prev), prev);
  assert.deepEqual(syncCursor(w, 0, TODAY, {}), { through: null, backfill: null });
  // L'historique en attente ne remonte jamais au-dessus des jours récents.
  const odd = planSync({ through: "2026-10-29", backfill: "2026-10-29" }, TODAY);
  assert.deepEqual(odd.map(x => x.end), [TODAY, "2026-10-26", "2026-09-25", ...odd.slice(3).map(x => x.end)]);
  assert.ok(odd.every((x, i) => i === 0 || x.end < odd[i - 1].start));
});

test("seule une panne passagère fait relire une plage", () => {
  for (const c of ["rate_limited", "garmin_down", "garmin_timeout", "garmin_unreachable"]) assert.ok(isTransient(c), c);
  for (const c of ["garmin_error", "key_rejected", "garmin_forbidden", undefined]) assert.ok(!isTransient(c), c);
});

test("les nuits reçues se rangent par date, et rien de neuf ne change rien", () => {
  const before = [night("2026-10-27"), night("2026-10-28")];
  // Les mêmes nuits : la liste d'origine, à l'identique (le planning ne se
  // marque pas « modifié »).
  assert.equal(mergeNights(before, [night("2026-10-28")]), before);
  assert.equal(mergeNights(before, []), before);
  assert.equal(mergeNights(undefined, []), undefined);

  const after = mergeNights(before, [night("2026-10-29"), night("2026-10-28", 480)]);
  assert.notEqual(after, before);
  assert.deepEqual(after.map(n => [n.date, n.total]), [["2026-10-27", 450], ["2026-10-28", 480], ["2026-10-29", 450]]);
  assert.equal(before[1].total, 450, "la liste d'origine n'est pas touchée");

  // Garmin remplace une nuit de l'ancien import CSV.
  const csv = [{ date: "2026-10-28", total: 400, deep: 60, rem: 90, light: 230, awake: 20, score: 70 }];
  assert.equal(mergeNights(csv, [night("2026-10-28")])[0].source, "garmin");
  assert.deepEqual(mergeNights(undefined, [night("2026-10-28")]).map(n => n.date), ["2026-10-28"]);
});

test("relancer tout seul : souvent tant que la nuit manque, sinon rarement", () => {
  const now = Date.parse("2026-10-30T07:30:00Z");
  const ago = (min) => now - min * 60 * 1000;
  assert.ok(autoSyncDue("2026-10-29", TODAY, now, 0));
  assert.ok(!autoSyncDue("2026-10-29", TODAY, now, ago(20)));
  assert.ok(autoSyncDue("2026-10-29", TODAY, now, ago(40)));
  assert.ok(!autoSyncDue(TODAY, TODAY, now, ago(120)));
  assert.ok(autoSyncDue(TODAY, TODAY, now, ago(7 * 60)));
});

test("chaque erreur du serveur a sa phrase", () => {
  const codes = ["not_signed_in", "missing_key", "key_rejected", "garmin_forbidden", "rate_limited", "garmin_timeout",
    "garmin_down", "garmin_unreachable", "garmin_error", "no_key", "not_installed", "server_misconfigured", "no_api", "network"];
  const fallback = garminMessage("???");
  for (const c of codes) {
    const m = garminMessage(c);
    assert.notEqual(m, fallback, c);
    assert.ok(!/—|!/.test(m), `ni tiret long ni point d'exclamation : ${c}`);
  }
});

// ─── Activités → séances ─────────────────────────────────────────────────────

// Semaine du lundi 26 octobre 2026 ; le mercredi 28 est l'indice 2.
const MON = "2026-10-26";
const plan = (byDay) => ({ weeks: { [MON]: Array.from({ length: 7 }, (_, i) => byDay[i] || []) }, profile: {} });
const S = (props) => ({ id: props.id, name: props.name || "Séance", discipline: "climbing", chargePlanned: 6, ...props });
const A = (props) => ({ id: "a1", date: "2026-10-28", start: "18:20", type: "indoor_climbing", durationMin: 95, ...props });
const day = (data, i) => data.weeks[MON][i];

test("les clés de Garmin deviennent les disciplines de l'app", () => {
  assert.equal(disciplineOf("trail_running"), "trail");
  assert.equal(disciplineOf("treadmill_running"), "running");
  assert.equal(disciplineOf("bouldering"), "climbing");
  assert.equal(disciplineOf("indoor_climbing"), "climbing");
  assert.equal(disciplineOf("mountain_biking"), "cycling");
  assert.equal(disciplineOf("strength_training"), "strength");
  assert.equal(disciplineOf("yoga"), "mobility");
  assert.equal(disciplineOf("walking"), "custom");
  assert.equal(disciplineOf(undefined), "custom");
});

test("une activité coche la séance du même jour et de la même discipline", () => {
  const data = plan({ 2: [S({ id: "s1", name: "Footing", discipline: "running", startTime: "12:15" })] });
  const out = linkActivities(data, [A({ id: "77", type: "running", start: "07:05", durationMin: 46, distanceKm: 8.4, avgHr: 148 })], { todayISO: "2026-10-30" });
  const s = day(out.data, 2)[0];
  // Couru à 7 h au lieu de midi : c'est le même footing, l'heure ne fait que départager.
  assert.deepEqual(s.feedback, { status: "done", done: true, auto: "garmin" });
  assert.deepEqual(s.garmin, { activityId: "77", start: "07:05", durationMin: 46, distanceKm: 8.4, avgHr: 148, type: "running" });
  assert.equal(s.chargePlanned, 6, "ce qui était prévu ne bouge pas");
  assert.deepEqual(out.linked, [{ activityId: "77", sessionId: "s1", date: "2026-10-28", checked: true }]);
  assert.deepEqual(out.data.garminSeen, { 77: "2026-10-28" });
  assert.equal(data.weeks[MON][2][0].garmin, undefined, "le planning d'origine n'est pas touché");
});

test("deux séances, deux activités : chacune la plus proche, choisies ensemble", () => {
  const data = plan({ 2: [S({ id: "matin", startTime: "09:00" }), S({ id: "midi", startTime: "12:00" })] });
  // 11 h irait mieux à midi (1 h) qu'au matin (2 h), mais 12 h 05 va encore
  // mieux à midi (5 min) : choisir séance après séance donnerait midi à 11 h.
  const out = linkActivities(data, [A({ id: "x", start: "11:00" }), A({ id: "y", start: "12:05" })], { todayISO: "2026-10-30" });
  assert.deepEqual(day(out.data, 2).map(s => [s.id, s.garmin.activityId]), [["matin", "x"], ["midi", "y"]]);
});

test("une séance sans heure passe après une séance proche, avant une lointaine", () => {
  const data = plan({ 2: [S({ id: "plus-tard" }), S({ id: "soir", startTime: "19:00" })] });
  const near = linkActivities(data, [A({ start: "18:30" })], { todayISO: "2026-10-30" });
  assert.deepEqual(day(near.data, 2).map(s => s.garmin?.activityId ?? null), [null, "a1"]);
  const far = linkActivities(data, [A({ start: "06:30" })], { todayISO: "2026-10-30" });
  assert.deepEqual(day(far.data, 2).map(s => s.garmin?.activityId ?? null), ["a1", null]);
});

test("un statut posé à la main n'est jamais réécrit, une séance manquée n'est pas liée", () => {
  const adapted = { status: "adapted", done: true, rpe: 7 };
  const data = plan({ 2: [S({ id: "s1", feedback: adapted })], 3: [S({ id: "s2", feedback: { status: "not_done", done: false } })] });
  const out = linkActivities(data, [A({ id: "a1" }), A({ id: "a2", date: "2026-10-29", durationMin: 10 })], { todayISO: "2026-10-30" });
  assert.deepEqual(day(out.data, 2)[0].feedback, adapted);
  assert.equal(day(out.data, 2)[0].garmin.activityId, "a1", "le réel s'ajoute quand même");
  assert.equal(out.linked[0].checked, false, "liée, mais pas cochée par la montre");
  assert.equal(day(out.data, 3)[0].garmin, undefined);
  assert.equal(day(out.data, 3).length, 1, "10 min : trop court pour devenir une séance");
});

test("ni une échéance ni une autre discipline ne reçoivent l'activité", () => {
  const data = plan({ 2: [{ id: "e", mode: "event", name: "Compét" }, S({ id: "velo", discipline: "cycling" })] });
  const out = linkActivities(data, [A({ type: "running", durationMin: 10 })], { todayISO: "2026-10-30" });
  assert.equal(out.data, data);
  assert.deepEqual(out.linked, []);
});

test("une activité sans séance prévue devient une séance faite, si elle est récente et en vaut une", () => {
  const data = plan({});
  const run = A({ id: "91", date: "2026-10-29", type: "trail_running", name: "Trail du soir", start: "18:42", durationMin: 48, distanceKm: 9.23, elevation: 413 });
  const out = linkActivities(data, [run], { todayISO: "2026-10-30" });
  assert.deepEqual(day(out.data, 3), [{
    id: "garmin-91", name: "Trail du soir", discipline: "trail", startTime: "18:42", estimatedTime: 48,
    metrics: { distanceKm: 9.23, elevationM: 413 },
    garmin: { activityId: "91", start: "18:42", durationMin: 48, distanceKm: 9.23, elevation: 413, type: "trail_running", name: "Trail du soir" },
    feedback: { status: "done", done: true, auto: "garmin" },
    source: "garmin",
  }]);
  assert.deepEqual(out.added, [{ activityId: "91", sessionId: "garmin-91", date: "2026-10-29" }]);

  const none = (acts, opts = {}) => linkActivities(data, acts, { todayISO: "2026-10-30", ...opts }).added.length;
  assert.equal(none([A({ date: "2026-10-01" })]), 0, "trop ancienne : la liaison remonte un an");
  assert.equal(none([A({ durationMin: 12 })]), 0, "trop courte");
  assert.equal(none([A({ type: "walking" })]), 0, "une marche n'est pas une séance");
  assert.equal(none([A({ type: "cycling" })], { sports: ["climbing", "running"] }), 0, "pas un sport pratiqué");
  assert.equal(none([A({})], { autoAdd: false }), 0, "réglage coupé");
});

test("déjà traitée, une activité ne revient pas : ni deux fois liée, ni recréée après suppression", () => {
  const data = plan({ 2: [S({ id: "s1" })] });
  const once = linkActivities(data, [A({})], { todayISO: "2026-10-30" });
  const twice = linkActivities(once.data, [A({})], { todayISO: "2026-10-30" });
  assert.equal(twice.data, once.data);
  // La séance supprimée à la main : le registre empêche de la recréer.
  const deleted = { ...once.data, weeks: { [MON]: once.data.weeks[MON].map((d, i) => (i === 2 ? [] : d)) } };
  assert.equal(linkActivities(deleted, [A({})], { todayISO: "2026-10-30" }).data, deleted);
});

test("deux appareils qui lient en même temps écrivent la même chose", () => {
  const data = plan({ 2: [S({ id: "s1" })] });
  const acts = [A({}), A({ id: "b", date: "2026-10-29", type: "running", durationMin: 40 })];
  const phone = linkActivities(data, acts, { todayISO: "2026-10-30" }).data;
  const pc = linkActivities(data, acts, { todayISO: "2026-10-30" }).data;
  assert.deepEqual(phone, pc);
  assert.equal(day(phone, 3)[0].id, "garmin-b");
});

test("le registre oublie ce qui ne reviendra plus", () => {
  const data = { ...plan({ 2: [S({ id: "s1" })] }), garminSeen: { vieux: "2026-07-01", recent: "2026-10-20" } };
  const out = linkActivities(data, [A({})], { todayISO: "2026-10-30" });
  assert.deepEqual(out.data.garminSeen, { recent: "2026-10-20", a1: "2026-10-28" });
});

test("les journées de récupération se rangent par date, et rien de neuf ne change rien", () => {
  const before = { "2026-10-28": { rhr: 48, hrv: 60 } };
  assert.equal(mergeRecovery(before, [{ date: "2026-10-28", rhr: 48, hrv: 60 }]), before);
  assert.equal(mergeRecovery(before, []), before);
  const after = mergeRecovery(before, [{ date: "2026-10-28", rhr: 47, hrv: 60 }, { date: "2026-10-29", bbMax: 80 }]);
  assert.deepEqual(after, { "2026-10-28": { rhr: 47, hrv: 60 }, "2026-10-29": { bbMax: 80 } });
  assert.deepEqual(before, { "2026-10-28": { rhr: 48, hrv: 60 } });
  assert.deepEqual(mergeRecovery(undefined, [{ date: "2026-10-29", rhr: 50 }]), { "2026-10-29": { rhr: 50 } });
});

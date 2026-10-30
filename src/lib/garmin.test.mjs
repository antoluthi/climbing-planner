// Garmin Connect, côté app — `npm run test:garmin`.
// Ce qui se décide sans réseau : quelles plages demander, comment ranger les
// nuits reçues, quand relancer tout seul.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lastGarminNight, syncWindows, mergeNights, autoSyncDue, garminMessage,
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

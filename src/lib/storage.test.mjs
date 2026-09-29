import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateData } from "./storage.js";

// ─── MIGRATION v8 : les blocs d'un rappel redeviennent une plage ─────────────
// Une migration s'exécute une fois, sur les données réelles de quelqu'un, et
// ce qu'elle abîme ne se retrouve pas. Ce qui est vérifié ici n'est donc pas
// « la forme est jolie » mais : **rien de ce qui a été coché ne bouge**, et
// aucun rappel ne se rallume ni ne s'éteint en silence.

const rem = (over) => ({ id: "r", name: "Suspension", createdAt: "2026-08-01T10:00:00Z", ...over });
const run = (reminders, reminderState = {}) =>
  migrateData({ schemaVersion: 7, reminders, reminderState });

test("deux blocs à la suite → du début du premier à la fin du dernier", () => {
  const [r] = run([rem({
    periods: [
      { id: "p0", startDate: "2026-08-25", endDate: "2026-09-24", recurrence: { kind: "daily" } },
      { id: "p1", startDate: "2026-09-28", endDate: "2026-10-31", recurrence: { kind: "weekdays", days: [1, 3, 5] } },
    ],
  })]).reminders;
  assert.equal(r.startDate, "2026-08-25");
  assert.equal(r.endDate, "2026-10-31");
  // La récurrence du dernier bloc est la plus récemment voulue.
  assert.deepEqual(r.recurrence, { kind: "weekdays", days: [1, 3, 5] });
  assert.equal(r.periods, undefined);
});

test("un dernier bloc encore ouvert veut dire « sans fin »", () => {
  const [r] = run([rem({
    periods: [
      { id: "p0", startDate: "2026-08-25", endDate: "2026-09-24", recurrence: { kind: "daily" } },
      { id: "p1", startDate: "2026-09-28", recurrence: { kind: "daily" } },
    ],
  })]).reminders;
  assert.equal(r.startDate, "2026-08-25");
  assert.equal(r.endDate, undefined);
});

test("les blocs sont lus dans l'ordre des dates, pas dans celui du tableau", () => {
  const [r] = run([rem({
    periods: [
      { id: "p1", startDate: "2026-09-28", endDate: "2026-10-31", recurrence: { kind: "weekdays", days: [2] } },
      { id: "p0", startDate: "2026-08-25", endDate: "2026-09-24", recurrence: { kind: "daily" } },
    ],
  })]).reminders;
  assert.equal(r.startDate, "2026-08-25");
  assert.equal(r.endDate, "2026-10-31");
  assert.deepEqual(r.recurrence, { kind: "weekdays", days: [2] });
});

test("un bloc sans date de début commence « depuis toujours »", () => {
  const [r] = run([rem({
    periods: [{ id: "p0", recurrence: { kind: "daily" } }],
  })]).reminders;
  assert.equal(r.startDate, undefined);
  assert.equal(r.endDate, undefined);
});

test("archivedAt devient deletedAt — même sens, même date", () => {
  const [r] = run([rem({
    archivedAt: "2026-09-10",
    periods: [{ id: "p0", startDate: "2026-01-01", endDate: "2026-09-09", recurrence: { kind: "daily" } }],
  })]).reminders;
  assert.equal(r.deletedAt, "2026-09-10");
  assert.equal(r.archivedAt, undefined);
});

test("aucun bloc = ne réclamait plus rien : on ne le rallume pas", () => {
  const [r] = run([rem({ periods: [] })]).reminders;
  // Supprimé à sa naissance : il ne demande rien, et ses coches restent.
  assert.equal(r.deletedAt, "2026-08-01");
  assert.equal(r.recurrence, undefined);
});

test("la forme d'avant la v7 traverse intacte", () => {
  const [r] = run([rem({ startDate: "2026-02-01", recurrence: { kind: "daily" } })]).reminders;
  assert.equal(r.startDate, "2026-02-01");
  assert.deepEqual(r.recurrence, { kind: "daily" });
});

test("aucune coche n'est touchée", () => {
  const state = { r: { "2026-08-26": true, "2026-08-27": true } };
  const out = run([rem({
    periods: [{ id: "p0", startDate: "2026-08-25", endDate: "2026-09-24", recurrence: { kind: "daily" } }],
  })], state);
  assert.deepEqual(out.reminderState, state);
});

test("migrer deux fois ne change rien de plus (v8 est un point fixe)", () => {
  const once = run([rem({
    periods: [
      { id: "p0", startDate: "2026-08-25", endDate: "2026-09-24", recurrence: { kind: "daily" } },
      { id: "p1", startDate: "2026-09-28", recurrence: { kind: "daily" } },
    ],
  })]);
  const twice = migrateData({ ...once, schemaVersion: 7 });
  assert.deepEqual(twice.reminders, once.reminders);
});

test("une donnée déjà en v8 est rendue telle quelle", () => {
  const data = { schemaVersion: 8, reminders: [rem({ startDate: "2026-02-01" })] };
  assert.equal(migrateData(data), data);
});

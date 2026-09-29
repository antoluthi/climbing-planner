import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePlans, merge3, deepEqual } from "./merge-plan.js";

// ─── FUSION À TROIS VOIES ────────────────────────────────────────────────────
// Chaque test dit ce que deux appareils ont fait depuis leur dernier accord
// (la base), et ce que doit devenir le planning. Le premier est le bug : un
// planning vidé sous les yeux de son utilisateur.

const W = "2026-09-21";
const s = (id, name, extra = {}) => ({ id, name, discipline: "climbing", ...extra });
const fb = (quality) => ({ status: "done", done: true, rpe: 5, quality, notes: "" });
const week = (days) => Array.from({ length: 7 }, (_, i) => days[i] || []);
const plan = (weeks, extra = {}) => ({ weeks, notes: {}, reminderState: {}, hooper: [], mesocycles: [], ...extra });
const names = (p) => Object.entries(p.weeks).flatMap(([wk, days]) =>
  days.flatMap((day, di) => day.map(x => `${x.name}@${wk.slice(5)}/${di}${x.feedback?.done ? " ✓" + x.feedback.quality : ""}`))).sort();

const base = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B")], 6: [s("C", "C")] }) });

test("le bug : la copie périmée du téléphone ne gagne plus sur ce qu'il n'a pas touché", () => {
  // Le PC a noté A et B ; le téléphone, resté sur l'ancien état, a noté C.
  const pc    = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(4) })], 5: [s("B", "B", { feedback: fb(5) })], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B")], 6: [s("C", "C", { feedback: fb(3) })] }) });
  assert.deepEqual(names(mergePlans(phone, pc, base)), ["A@09-21/4 ✓4", "B@09-21/5 ✓5", "C@09-21/6 ✓3"]);
});

test("sans base, on retombe sur l'ancienne règle (le local gagne)", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(4) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  assert.deepEqual(names(mergePlans(phone, pc)), ["A@09-21/4", "B@09-21/5", "C@09-21/6"]);
});

test("une suppression faite ailleurs passe au lieu de revenir", () => {
  const pc = plan({ [W]: week({ 4: [s("A", "A")], 6: [s("C", "C")] }) });           // B supprimée
  assert.deepEqual(names(mergePlans(base, pc, base)), ["A@09-21/4", "C@09-21/6"]);
});

test("supprimée d'un côté, modifiée de l'autre : on la garde", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A")], 6: [s("C", "C")] }) });         // B supprimée
  const phone = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B", { feedback: fb(2) })], 6: [s("C", "C")] }) });
  assert.deepEqual(names(mergePlans(phone, pc, base)), ["A@09-21/4", "B@09-21/5 ✓2", "C@09-21/6"]);
});

test("déplacée sur le PC, notée sur le téléphone : une seule séance, au nouveau jour, avec son ressenti", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A")], 2: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B", { feedback: fb(4) })], 6: [s("C", "C")] }) });
  assert.deepEqual(names(mergePlans(phone, pc, base)), ["A@09-21/4", "B@09-21/2 ✓4", "C@09-21/6"]);
});

test("deux champs différents d'une même séance : les deux changements restent", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A — rallongée")], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(5) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  assert.deepEqual(names(mergePlans(phone, pc, base)), ["A — rallongée@09-21/4 ✓5", "B@09-21/5", "C@09-21/6"]);
});

test("le même champ changé des deux côtés : l'appareil en main gagne", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(4) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(2) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  assert.deepEqual(names(mergePlans(phone, pc, base)), ["A@09-21/4 ✓2", "B@09-21/5", "C@09-21/6"]);
});

test("une séance ajoutée de chaque côté le même jour : les deux, la locale d'abord", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A"), s("P", "P")], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A"), s("T", "T")], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const day = mergePlans(phone, pc, base).weeks[W][4].map(x => x.name);
  assert.deepEqual(day, ["A", "T", "P"]);
});

test("une nouvelle semaine d'un côté arrive entière", () => {
  const next = "2026-09-28";
  const pc = { ...base, weeks: { ...base.weeks, [next]: week({ 0: [s("N", "N")] }) } };
  assert.deepEqual(mergePlans(base, pc, base).weeks[next][0].map(x => x.name), ["N"]);
});

test("un même id sur deux séances (planifiées depuis un modèle) : aucune ne disparaît", () => {
  const b2 = plan({ [W]: week({ 1: [s("M", "Modèle")], 3: [s("M", "Modèle")] }) });
  const pc = plan({ [W]: week({ 1: [s("M", "Modèle", { feedback: fb(4) })], 3: [s("M", "Modèle")] }) });
  const phone = plan({ [W]: week({ 1: [s("M", "Modèle")], 3: [s("M", "Modèle", { feedback: fb(3) })] }) });
  assert.deepEqual(names(mergePlans(phone, pc, b2)), ["Modèle@09-21/1 ✓4", "Modèle@09-21/3 ✓3"]);
});

test("des séances sans id (anciennes données) ne se dédoublent pas", () => {
  const legacy = { name: "Vieille", discipline: "climbing" };
  const b2 = plan({ [W]: week({ 2: [legacy] }) });
  const pc = plan({ [W]: week({ 2: [legacy], 3: [s("N", "N")] }) });
  assert.deepEqual(names(mergePlans(b2, pc, b2)), ["N@09-21/3", "Vieille@09-21/2"]);
});

test("les journaux se réunissent par date, une case décochée reste décochée", () => {
  const b2 = plan({}, {
    notes: { "2026-09-20": "ancienne" },
    reminderState: { r1: { "2026-09-20": true, "2026-09-21": true } },
    hooper: [{ date: "2026-09-20", total: 12 }],
  });
  const pc = { ...b2,
    notes: { ...b2.notes, "2026-09-22": "PC" },
    reminderState: { r1: { ...b2.reminderState.r1, "2026-09-22": true } },
    hooper: [...b2.hooper, { date: "2026-09-22", total: 10 }] };
  const phone = { ...b2,
    notes: { ...b2.notes, "2026-09-23": "tél" },
    reminderState: { r1: { "2026-09-20": true } },                 // décoche le 21
    hooper: [...b2.hooper, { date: "2026-09-23", total: 9 }] };
  const m = mergePlans(phone, pc, b2);
  assert.deepEqual(Object.keys(m.notes).sort(), ["2026-09-20", "2026-09-22", "2026-09-23"]);
  assert.deepEqual(m.reminderState.r1, { "2026-09-20": true, "2026-09-22": true });
  assert.deepEqual(m.hooper.map(h => h.date).sort(), ["2026-09-20", "2026-09-22", "2026-09-23"]);
});

test("des mésocycles réordonnés sur le PC restent dans son ordre", () => {
  const m = (id) => ({ id, label: id, durationWeeks: 4 });
  const b2 = plan({}, { mesocycles: [m("x"), m("y"), m("z")] });
  const pc = { ...b2, mesocycles: [m("z"), m("x"), m("y")] };
  const phone = { ...b2, mesocycles: [m("x"), m("y"), { ...m("z"), label: "z renommé" }] };
  assert.deepEqual(mergePlans(phone, pc, b2).mesocycles.map(x => x.label), ["z renommé", "x", "y"]);
});

test("rien n'a changé d'un côté : l'autre passe tel quel", () => {
  const pc = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(4) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  assert.deepEqual(mergePlans(base, pc, base), pc);
  assert.deepEqual(mergePlans(pc, base, base), pc);
});

test("fusionner deux fois donne la même chose (idempotent)", () => {
  const pc    = plan({ [W]: week({ 4: [s("A", "A", { feedback: fb(4) })], 5: [s("B", "B")], 6: [s("C", "C")] }) });
  const phone = plan({ [W]: week({ 4: [s("A", "A")], 5: [s("B", "B")], 6: [s("C", "C", { feedback: fb(3) })] }) });
  const once = mergePlans(phone, pc, base);
  assert.ok(deepEqual(mergePlans(once, pc, base), once));
  assert.ok(deepEqual(mergePlans(once, once, pc), once));
});

test("merge3 : l'ordre des clés d'un objet ne compte pas comme une modification", () => {
  assert.deepEqual(merge3({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 3 }), { a: 1, b: 3 });
});

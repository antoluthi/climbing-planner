import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_SPECS, splitField, parseField, formatField, normalizeField,
  applySegmentInput, applySegmentKey, seedTrio, updateTrio,
  readDuration, writeDuration, convertTrio,
} from "./pace.js";

const D = FIELD_SPECS.duration, P = FIELD_SPECS.pace, K = FIELD_SPECS.distance, S = FIELD_SPECS.speed;

// ─── Les champs à séparateurs fixes ──────────────────────────────────────────

test("lire : une case vide vaut zéro, un champ vide ne vaut rien", () => {
  assert.equal(parseField(D, "1:45:30"), 105.5);
  assert.equal(parseField(D, ":45:"), 45);
  assert.equal(parseField(D, "::"), null);
  assert.equal(parseField(D, ""), null);
  assert.equal(parseField(P, "5:30"), 5.5);
  assert.equal(parseField(K, "8.5"), 8.5);
  assert.equal(parseField(K, "8.05"), 8.05);
  assert.equal(parseField(K, ".5"), 0.5);
  assert.equal(parseField(S, "26.5"), 26.5);
});

test("écrire : heures vides sous l'heure, secondes toujours sur deux chiffres", () => {
  assert.equal(formatField(D, 45), ":45:00");
  assert.equal(formatField(D, 105.5), "1:45:30");
  assert.equal(formatField(D, 5), ":05:00");
  assert.equal(formatField(P, 5.5), "5:30");
  assert.equal(formatField(P, 4 + 59.6 / 60), "5:00");          // l'arrondi passe la minute
  assert.equal(formatField(K, 9), "9.00");
  assert.equal(formatField(K, 11.111), "11.11");
  assert.equal(formatField(S, 26.54), "26.5");
});

test("aller-retour : écrire puis relire rend la même valeur", () => {
  for (const v of [0.5, 5, 45, 59.5, 60, 105.5, 600]) assert.equal(parseField(D, formatField(D, v)), v);
  for (const v of [3.5, 4.75, 5, 12]) assert.equal(parseField(P, formatField(P, v)), v);
  for (const v of [0.5, 8.18, 21.1, 100]) assert.equal(parseField(K, formatField(K, v)), v);
});

test("sortie du champ : secondes complétées au début, décimales à la fin", () => {
  assert.equal(normalizeField(P, "5:7"), "5:07");               // 7 secondes
  assert.equal(normalizeField(K, "8.5"), "8.50");               // ,5 km = 500 m
  assert.equal(normalizeField(D, "1::"), "1:00:00");
  assert.equal(normalizeField(D, ":45:"), ":45:00");            // les heures restent vides
  assert.equal(normalizeField(D, "::"), "::");                  // un champ vide reste vide
});

// ─── La frappe ───────────────────────────────────────────────────────────────

test("le « : » ne s'efface pas : retour arrière saute par-dessus", () => {
  // « 50:00 », curseur au début des secondes. Avant, ce retour arrière
  // effaçait le « : » et le champ devenait « 5000 » — cinq mille minutes.
  const res = applySegmentKey(D, ["", "50", "00"], 2, "Backspace", 0, 0);
  assert.deepEqual(res.segs, ["", "5", "00"]);
  assert.deepEqual(res.focus, { i: 1, where: "end" });
  assert.equal(parseField(D, res.segs.join(":")), 5);
});

test("taper le séparateur passe à la case suivante, sans rien écrire", () => {
  assert.deepEqual(applySegmentInput(P, ["5", ""], 0, "5.", 2),
    { segs: ["5", ""], focus: { i: 1, where: "all" } });
  // Clavier d'Android : la virgule arrive comme du texte, pas comme une touche.
  assert.deepEqual(applySegmentInput(K, ["12", "30"], 0, "12,", 3),
    { segs: ["12", "30"], focus: { i: 1, where: "all" } });
  assert.deepEqual(applySegmentKey(P, ["5", ""], 0, ":", 1, 1).focus, { i: 1, where: "all" });
});

test("un « 1:45:30 » collé se répartit dans les trois cases", () => {
  const res = applySegmentInput(D, ["", "", ""], 0, "1:45:30", 7);
  assert.deepEqual(res.segs, ["1", "45", "30"]);
});

test("case pleine : la frappe repart de zéro au lieu d'être refusée", () => {
  assert.deepEqual(applySegmentInput(D, ["", "45", "00"], 1, "455", 3).segs, ["", "5", "00"]);
  assert.deepEqual(applySegmentInput(D, ["", "45", "00"], 1, "745", 1).segs, ["", "7", "00"]);
});

test("case remplie en tapant à sa fin : on passe à la suivante", () => {
  assert.deepEqual(applySegmentInput(D, ["", "4", ""], 1, "45", 2).focus, { i: 2, where: "all" });
  // pas depuis le milieu de la case, ni depuis la dernière
  assert.equal(applySegmentInput(D, ["", "4", ""], 1, "54", 1).focus, null);
  assert.equal(applySegmentInput(P, ["5", "3"], 1, "30", 2).focus, null);
  // des kilomètres sur trois chiffres : « 10 » peut encore devenir « 100 »
  assert.equal(applySegmentInput(K, ["1", ""], 0, "10", 2).focus, null);
});

test("jamais plus de 59 secondes", () => {
  assert.deepEqual(applySegmentInput(P, ["5", "7"], 1, "70", 2).segs, ["5", "59"]);
});

test("les flèches franchissent le séparateur aux bords, pas ailleurs", () => {
  assert.deepEqual(applySegmentKey(P, ["5", "30"], 1, "ArrowLeft", 0, 0).focus, { i: 0, where: "end" });
  assert.deepEqual(applySegmentKey(P, ["5", "30"], 0, "ArrowRight", 1, 1).focus, { i: 1, where: "start" });
  assert.equal(applySegmentKey(P, ["5", "30"], 1, "ArrowLeft", 1, 1), null);
  assert.equal(applySegmentKey(P, ["5", "30"], 1, "Backspace", 1, 1), null);
  // une sélection se remplace normalement, même au bord
  assert.equal(applySegmentKey(P, ["5", "30"], 1, "Backspace", 0, 2), null);
});

// ─── Le trio : les deux derniers saisis font foi ─────────────────────────────

test("le bug : une séance rouverte recalcule dès la première modification", () => {
  let t = seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace");
  assert.equal(t.computed, "rate");
  t = updateTrio(t, "duration", ":54:00", "pace");
  assert.equal(t.values.rate, "6:00");
});

test("modifier un des deux champs saisis : le troisième suit, à chaque frappe", () => {
  let t = { values: { duration: "", distance: "", rate: "" }, sources: [], computed: null };
  t = updateTrio(t, "duration", ":45:00", "pace");
  t = updateTrio(t, "distance", "9.", "pace");
  assert.equal(t.values.rate, "5:00");
  assert.equal(t.computed, "rate");
  t = updateTrio(t, "duration", ":50:00", "pace");
  assert.equal(t.values.rate, "5:33");
  t = updateTrio(t, "distance", "10.", "pace");
  assert.equal(t.values.rate, "5:00");
});

test("taper dans le champ calculé : c'est le plus ancien des deux autres qui bouge", () => {
  let t = { values: { duration: "", distance: "", rate: "" }, sources: [], computed: null };
  t = updateTrio(t, "distance", "9.", "pace");
  t = updateTrio(t, "duration", ":50:00", "pace");              // temps saisi en dernier
  t = updateTrio(t, "rate", "4:30", "pace");                   // l'allure était calculée
  assert.equal(t.computed, "distance");
  assert.equal(t.values.distance, "11.11");
  assert.equal(t.values.duration, ":50:00");
});

test("une source vidée : le champ calculé est vidé, pas laissé périmé", () => {
  let t = seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace");
  t = updateTrio(t, "distance", ".", "pace");
  assert.equal(t.values.rate, "");
  assert.equal(t.computed, null);
  t = updateTrio(t, "distance", "10.", "pace");                 // et il revient
  assert.equal(t.values.rate, "4:30");
});

test("vider le champ calculé ne le voit pas se remplir aussitôt", () => {
  let t = seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace");
  t = updateTrio(t, "rate", ":", "pace");
  assert.equal(t.values.rate, ":");
});

test("une source à zéro : rien à calculer, le champ calculé se vide", () => {
  let t = seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace");
  t = updateTrio(t, "distance", "0.", "pace");
  assert.equal(t.values.rate, "");
  assert.equal(t.computed, "rate");
});

test("deux champs sur trois à l'ouverture : le troisième est calculé d'emblée", () => {
  const t = seedTrio({ duration: "1:00:00", distance: "", rate: "5:30" }, "pace");
  assert.equal(t.computed, "distance");
  assert.equal(t.values.distance, "10.91");
});

test("vélo : la vitesse en km/h", () => {
  let t = { values: { duration: "", distance: "", rate: "" }, sources: [], computed: null };
  t = updateTrio(t, "duration", "2:00:00", "speed");
  t = updateTrio(t, "distance", "60.", "speed");
  assert.equal(t.values.rate, "30.0");
});

test("le temps change de forme avec la discipline, sans changer de valeur", () => {
  assert.equal(writeDuration(readDuration("90", false), true), "1:30:00");
  assert.equal(writeDuration(readDuration("1:30:00", true), false), "90");
  assert.equal(writeDuration(readDuration(":45:30", true), false), "45:30");
});

test("Course → Vélo : l'allure devient une vitesse, les sources restent", () => {
  const t = convertTrio(seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace"), "pace", "speed");
  assert.equal(t.values.rate, "12.0");
  assert.equal(t.computed, "rate");
});

test("Course → Escalade → Vélo : l'allure n'est pas lue comme 500 km/h", () => {
  let t = seedTrio({ duration: ":45:00", distance: "9.00", rate: "5:00" }, "pace");
  t = convertTrio(t, "pace", null);
  assert.equal(t.values.duration, "45");
  t = convertTrio(t, null, "speed");
  assert.equal(t.values.duration, ":45:00");
  assert.equal(t.values.rate, "12.0");
});

test("Escalade → Course : 90 minutes deviennent 1:30:00, pas 90 heures", () => {
  const t = convertTrio({ values: { duration: "90", distance: "", rate: "" }, sources: [], computed: null }, null, "pace");
  assert.equal(t.values.duration, "1:30:00");
  assert.deepEqual(t.sources, ["duration"]);
});

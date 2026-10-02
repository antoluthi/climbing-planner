import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MIN, DEFAULT_SESSION_MIN, parseClock, clockLabel, sessionSpan, layoutDay, cascadeOffset,
  weekColumns, layoutAllDay, hiddenPerColumn, slotAt, firstVisibleHour,
  HOUR_PX, clampHourPx, hoursAt, scrollToKeep, slotStep,
} from "./time-grid.js";

// ─── Heures ──────────────────────────────────────────────────────────────────

test("lire une heure : les formes rencontrées dans les données", () => {
  assert.equal(parseClock("18:30"), 18 * 60 + 30);
  assert.equal(parseClock("07:05"), 7 * 60 + 5);
  assert.equal(parseClock("7:05"), 7 * 60 + 5);
  assert.equal(parseClock("18h30"), 18 * 60 + 30);
  assert.equal(parseClock("18h"), 18 * 60);
  assert.equal(parseClock("18:30:00"), 18 * 60 + 30);
  assert.equal(parseClock("00:00"), 0);
});

test("une séance sans heure n'a pas de place dans la grille", () => {
  for (const v of [null, undefined, "", "  ", "plus tard", "24:00", "18:75"]) {
    assert.equal(parseClock(v), null, String(v));
  }
  assert.equal(sessionSpan({ name: "x" }), null);
  assert.equal(sessionSpan({ startTime: "" }), null);
});

test("écrire une heure : toujours sur deux chiffres, comme le champ heure", () => {
  assert.equal(clockLabel(870), "14:30");
  assert.equal(clockLabel(65), "01:05");
  assert.equal(clockLabel(0), "00:00");
  assert.equal(clockLabel(DAY_MIN), "23:59");
});

test("durée : celle de la séance, sinon 1 h 30 ; coupée à minuit", () => {
  assert.deepEqual(sessionSpan({ startTime: "18:00", estimatedTime: 60 }), { start: 1080, end: 1140 });
  assert.deepEqual(sessionSpan({ startTime: "18:00", estimatedTime: "45" }), { start: 1080, end: 1125 });
  assert.deepEqual(sessionSpan({ startTime: "18:00" }), { start: 1080, end: 1080 + DEFAULT_SESSION_MIN });
  assert.deepEqual(sessionSpan({ startTime: "18:00", estimatedTime: 0 }), { start: 1080, end: 1080 + DEFAULT_SESSION_MIN });
  assert.deepEqual(sessionSpan({ startTime: "23:00", estimatedTime: 120 }), { start: 1380, end: DAY_MIN });
});

// ─── Chevauchements ──────────────────────────────────────────────────────────

const span = (a, b) => ({ start: a * 60, end: b * 60 });

test("sans chevauchement, chaque séance est seule dans sa grappe", () => {
  assert.deepEqual(layoutDay([span(9, 10), span(10, 11), span(14, 16)]), [
    { col: 0, cols: 1 }, { col: 0, cols: 1 }, { col: 0, cols: 1 },
  ]);
});

test("deux séances qui se recouvrent prennent deux rangs", () => {
  assert.deepEqual(layoutDay([span(9, 11), span(10, 12)]), [
    { col: 0, cols: 2 }, { col: 1, cols: 2 },
  ]);
});

test("l'ordre d'entrée n'influe pas sur le rang, la réponse le suit", () => {
  // La plus tardive donnée en premier : elle reste au second rang.
  assert.deepEqual(layoutDay([span(10, 12), span(9, 11)]), [
    { col: 1, cols: 2 }, { col: 0, cols: 2 },
  ]);
});

test("un rang libéré se réutilise dans la même grappe", () => {
  // A 9-12 | B 9-10 puis C 10-11 au rang de B : deux rangs, pas trois.
  const out = layoutDay([span(9, 12), span(9, 10), span(10, 11)]);
  assert.deepEqual(out, [{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 1, cols: 2 }]);
});

test("trois séances qui se chevauchent : trois rangs", () => {
  // Voie 18-20, renfo 19-19:45, étirements 19:30-20 — le cas de la grille.
  const out = layoutDay([span(18, 20), { start: 19 * 60, end: 19 * 60 + 45 }, { start: 19 * 60 + 30, end: 20 * 60 }]);
  assert.deepEqual(out, [{ col: 0, cols: 3 }, { col: 1, cols: 3 }, { col: 2, cols: 3 }]);
});

test("deux grappes séparées ne se gênent pas", () => {
  const out = layoutDay([span(9, 11), span(10, 12), span(14, 15)]);
  assert.deepEqual(out[2], { col: 0, cols: 1 });
});

test("deux séances très courtes collées se décalent quand même", () => {
  // 10 min chacune, mais dessinées sur 30 min au moins : à l'écran elles se
  // recouvriraient si on ne les décalait pas.
  const out = layoutDay([{ start: 600, end: 610 }, { start: 610, end: 620 }]);
  assert.deepEqual(out.map(o => o.cols), [2, 2]);
});

test("cascade : le dernier rang garde toujours la moitié de la colonne", () => {
  assert.equal(cascadeOffset(0, 1), 0);
  assert.equal(cascadeOffset(0, 3), 0);
  assert.equal(cascadeOffset(1, 2), 0.25);
  for (const cols of [2, 3, 5, 9]) {
    assert.ok(cascadeOffset(cols - 1, cols) < 0.5, `cols=${cols}`);
  }
});

// ─── Rangée du haut ──────────────────────────────────────────────────────────

test("colonnes d'une plage de dates dans la semaine", () => {
  const mon = "2026-09-28";
  assert.deepEqual(weekColumns("2026-09-30", null, mon), { from: 2, to: 2, before: false, after: false });
  assert.deepEqual(weekColumns("2026-09-30", "2026-10-02", mon), { from: 2, to: 4, before: false, after: false });
  // Commence la semaine d'avant, finit après : coupée des deux côtés.
  assert.deepEqual(weekColumns("2026-09-20", "2026-10-10", mon), { from: 0, to: 6, before: true, after: true });
  assert.equal(weekColumns("2026-10-05", null, mon), null);
  assert.equal(weekColumns("2026-09-20", "2026-09-27", mon), null);
  // Une fin avant le début vaut un seul jour.
  assert.deepEqual(weekColumns("2026-10-01", "2026-09-29", mon), { from: 3, to: 3, before: false, after: false });
});

test("le changement d'heure ne décale pas les colonnes", () => {
  // 25 octobre 2026 : passage à l'heure d'hiver en France, le dimanche.
  assert.deepEqual(weekColumns("2026-10-25", null, "2026-10-19"), { from: 6, to: 6, before: false, after: false });
  assert.deepEqual(weekColumns("2026-10-26", null, "2026-10-26"), { from: 0, to: 0, before: false, after: false });
});

test("rangées : le plus tôt d'abord, un bandeau enjambe sans recouvrir", () => {
  const items = [
    { from: 3, to: 3 },   // séance sans heure jeudi
    { from: 1, to: 4 },   // échéance mardi → vendredi
    { from: 0, to: 0 },   // lundi
  ];
  const { lanes, lane } = layoutAllDay(items);
  assert.equal(lanes, 2);
  assert.deepEqual(lane, [1, 0, 0]);
});

test("ce qui dépasse quand la rangée est repliée", () => {
  const items = [{ from: 0, to: 0 }, { from: 0, to: 0 }, { from: 0, to: 2 }, { from: 2, to: 2 }];
  const { lane } = layoutAllDay(items);
  // Lundi porte trois éléments, mercredi deux. Le bandeau lundi → mercredi,
  // posé le premier, tient la rangée du haut. Repliée sur deux rangées, seule
  // la troisième séance du lundi reste cachée ; sur une rangée, les deux
  // séances du lundi et celle du mercredi.
  assert.deepEqual(hiddenPerColumn(items, lane, 2), [1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(hiddenPerColumn(items, lane, 1), [2, 0, 1, 0, 0, 0, 0]);
});

// ─── Toucher une case vide ───────────────────────────────────────────────────

test("une touche tombe sur la demi-heure qui la contient", () => {
  assert.equal(slotAt(14 * 60 + 40), 14 * 60 + 30);
  assert.equal(slotAt(14 * 60 + 29), 14 * 60);
  assert.equal(slotAt(-12), 0);
  assert.equal(slotAt(DAY_MIN + 20), DAY_MIN - 30);
  assert.equal(slotAt(14 * 60 + 40, 60), 14 * 60);
});

test("la grille s'ouvre sur le matin, plus tôt si une séance l'exige", () => {
  assert.equal(firstVisibleHour([]), 7);
  assert.equal(firstVisibleHour([span(18, 19), null]), 7);
  assert.equal(firstVisibleHour([span(18, 19), { start: 5 * 60 + 45, end: 7 * 60 }]), 5);
});

// ─── Zoom ────────────────────────────────────────────────────────────────────

test("zoom borné, et une préférence illisible revient à l'échelle de départ", () => {
  assert.equal(clampHourPx(60), 60);
  assert.equal(clampHourPx("60"), 60);
  assert.equal(clampHourPx(4), HOUR_PX.min);
  assert.equal(clampHourPx(500), HOUR_PX.max);
  for (const v of [null, undefined, "", "abc", NaN]) assert.equal(clampHourPx(v), HOUR_PX.default, String(v));
  // Au plus serré, la journée entière tient sur un téléphone.
  assert.ok(24 * HOUR_PX.min <= 450);
});

test("le zoom garde sous les doigts l'heure qui s'y trouvait", () => {
  const top = 130;                       // en-tête + marge
  for (const [scroll, y, from, to] of [[310, 200, 44, 90], [600, 50, 44, 16], [0, 400, 120, 30]]) {
    const hours = hoursAt(y, scroll, top, from);
    const next = scrollToKeep(hours, y, top, to);
    assert.ok(Math.abs(hoursAt(y, next, top, to) - hours) < 1e-9, `${from}→${to}`);
  }
  // Exemple lu : 14 h sous les doigts à 44 px, toujours 14 h à 88 px.
  const s0 = scrollToKeep(14, 200, top, 44);
  assert.equal(hoursAt(200, s0, top, 44), 14);
  assert.equal(hoursAt(200, scrollToKeep(14, 200, top, 88), top, 88), 14);
});

test("pas du créneau selon le zoom", () => {
  assert.equal(slotStep(HOUR_PX.default), 30);
  assert.equal(slotStep(100), 15);
  assert.equal(slotStep(HOUR_PX.min), 60);
  assert.equal(slotAt(14 * 60 + 50, slotStep(100)), 14 * 60 + 45);
  assert.equal(slotAt(14 * 60 + 50, slotStep(HOUR_PX.min)), 14 * 60);
});

// node --test src/lib/reminders.test.mjs
//
// Le cœur de ces tests n'est pas « la récurrence marche » mais **une propriété**
// : ce qui est écoulé ne bouge plus. C'est la seule chose qui distingue le
// modèle en blocs de celui d'avant, et c'est invisible à l'œil — il faut la
// vérifier, sinon la régression reviendra sans bruit.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reminderPeriods, periodCovering, isReminderActiveOn, getActiveRemindersForDate,
  openPeriod, reminderStatus, periodHasElapsed, withNewPeriod, withUpdatedPeriod,
  periodCompletion, shiftISO, toISODate, countMissedRemindersOn,
} from "./reminders.js";

const D = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const daily = { kind: "daily" };
const mwf = { kind: "weekdays", days: [1, 3, 5] };

// Un mois de suspension quotidienne, terminé.
const suspension = {
  id: "r1", name: "Suspension", createdAt: "2026-08-25T08:00:00Z",
  periods: [{ id: "p1", startDate: "2026-09-01", endDate: "2026-09-30", recurrence: daily }],
};

test("un rappel d'avant la refonte se lit comme un bloc unique", () => {
  const legacy = { id: "r0", name: "Créatine", recurrence: daily, startDate: "2026-09-01" };
  const ps = reminderPeriods(legacy);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].startDate, "2026-09-01");
  assert.equal(isReminderActiveOn(legacy, D("2026-09-15")), true);
  assert.equal(isReminderActiveOn(legacy, D("2026-08-31")), false, "avant le début");
});

test("un rappel sans aucune date reste actif tous les jours", () => {
  const sansFin = { id: "r0", recurrence: daily };
  assert.equal(isReminderActiveOn(sansFin, D("2030-01-01")), true);
});

test("un rappel legacy sans aucun champ reste quotidien, il ne s'éteint pas", () => {
  // Rendre [] ici couperait un rappel existant sans que personne le voie.
  const nu = { id: "r", name: "Vieux rappel" };
  assert.equal(reminderPeriods(nu).length, 1);
  assert.equal(isReminderActiveOn(nu, D("2026-09-15")), true);
});

test("un rappel sans aucun bloc ne réclame rien", () => {
  assert.equal(isReminderActiveOn({ id: "x", periods: [] }, D("2026-09-15")), false);
});

test("la récurrence ne s'applique que dans son bloc", () => {
  const r = { id: "r", periods: [{ id: "p", startDate: "2026-09-01", endDate: "2026-09-30", recurrence: mwf }] };
  assert.equal(isReminderActiveOn(r, D("2026-09-02")), true,  "mercredi dans le bloc");
  assert.equal(isReminderActiveOn(r, D("2026-09-03")), false, "jeudi dans le bloc");
  assert.equal(isReminderActiveOn(r, D("2026-10-07")), false, "mercredi hors du bloc");
});

test("PROPRIÉTÉ — reprendre un rappel ne touche à aucun jour écoulé", () => {
  // On relit tout septembre avant, puis après avoir ouvert un bloc en novembre.
  const septembre = [];
  for (let iso = "2026-09-01"; iso <= "2026-09-30"; iso = shiftISO(iso, 1)) {
    septembre.push([iso, isReminderActiveOn(suspension, D(iso))]);
  }
  const repris = withNewPeriod(
    suspension,
    { id: "p2", startDate: "2026-11-01", endDate: "2026-11-30", recurrence: mwf },
    "2026-11-01",
  );
  for (const [iso, avant] of septembre) {
    assert.equal(isReminderActiveOn(repris, D(iso)), avant, `le ${iso} a changé`);
  }
  assert.equal(isReminderActiveOn(repris, D("2026-11-02")), true, "le nouveau bloc vit");
  assert.equal(isReminderActiveOn(repris, D("2026-10-15")), false, "l'intervalle ne réclame rien");
});

test("PROPRIÉTÉ — changer la récurrence en cours n'invente pas de passé", () => {
  // Bloc ouvert depuis le 1er, on passe en lun/mer/ven à partir du 15.
  const enCours = { id: "r", createdAt: "2026-08-30T00:00:00Z",
                    periods: [{ id: "p1", startDate: "2026-09-01", recurrence: daily }] };
  const avant = [];
  for (let iso = "2026-09-01"; iso < "2026-09-15"; iso = shiftISO(iso, 1)) {
    avant.push([iso, isReminderActiveOn(enCours, D(iso))]);
  }
  const change = withNewPeriod(enCours, { id: "p2", startDate: "2026-09-15", recurrence: mwf }, "2026-09-15");
  for (const [iso, était] of avant) {
    assert.equal(isReminderActiveOn(change, D(iso)), était, `le ${iso} a changé`);
  }
  // Le 14 était dû (daily), le 17 (jeudi) ne l'est plus.
  assert.equal(isReminderActiveOn(change, D("2026-09-14")), true);
  assert.equal(isReminderActiveOn(change, D("2026-09-17")), false);
  assert.equal(reminderPeriods(change)[0].endDate, "2026-09-14", "l'ancien bloc est clos la veille");
});

test("withNewPeriod remplace un bloc qui n'avait pas commencé au lieu de le clore", () => {
  const pasCommence = { id: "r", periods: [{ id: "p1", startDate: "2026-12-01", recurrence: daily }] };
  const out = withNewPeriod(pasCommence, { id: "p2", startDate: "2026-11-01", recurrence: mwf }, "2026-11-01");
  assert.equal(reminderPeriods(out).length, 1, "pas de bloc fantôme à plage vide");
  assert.equal(reminderPeriods(out)[0].id, "p2");
});

test("les blocs ne se chevauchent pas : periodCovering est sans ambiguïté", () => {
  const deux = withNewPeriod(suspension, { id: "p2", startDate: "2026-11-01", recurrence: daily }, "2026-11-01");
  assert.equal(periodCovering(deux, "2026-09-15").id, "p1");
  assert.equal(periodCovering(deux, "2026-11-15").id, "p2");
  assert.equal(periodCovering(deux, "2026-10-15"), null);
});

test("statut et bloc ouvert", () => {
  assert.equal(reminderStatus(suspension, D("2026-10-15")), "ended");
  assert.equal(reminderStatus(suspension, D("2026-09-15")), "running");
  const futur = { id: "r", periods: [{ id: "p", startDate: "2026-12-01", recurrence: daily }] };
  assert.equal(reminderStatus(futur, D("2026-11-01")), "upcoming");
  assert.equal(openPeriod(suspension, D("2026-10-15")), null, "rien d'ouvert une fois terminé");
  assert.equal(openPeriod(futur, D("2026-11-01")).id, "p");
});

test("periodHasElapsed décide de ce qu'on a le droit de retoucher", () => {
  const p = { startDate: "2026-09-01", recurrence: daily };
  assert.equal(periodHasElapsed(p, D("2026-09-01")), false, "le jour même : rien d'écoulé");
  assert.equal(periodHasElapsed(p, D("2026-09-02")), true);
  assert.equal(periodHasElapsed({ recurrence: daily }, D("2026-09-02")), true, "sans début = depuis toujours");
});

test("withUpdatedPeriod ne touche qu'au bloc visé", () => {
  const deux = withNewPeriod(suspension, { id: "p2", startDate: "2026-11-01", recurrence: daily }, "2026-11-01");
  const out = withUpdatedPeriod(deux, "p2", { recurrence: mwf });
  assert.deepEqual(reminderPeriods(out)[0], reminderPeriods(deux)[0], "le bloc écoulé est intact");
  assert.equal(reminderPeriods(out)[1].recurrence.kind, "weekdays");
});

test("periodCompletion compte les jours dus du bloc, jamais le futur", () => {
  const state = { r1: { "2026-09-01": true, "2026-09-02": true, "2026-09-03": true } };
  const p = reminderPeriods(suspension)[0];
  const done = periodCompletion(suspension, p, state, D("2026-12-01"));
  assert.equal(done.total, 30, "septembre entier, quotidien");
  assert.equal(done.done, 3);
  // Au 3 septembre, le bloc n'a que 3 jours derrière lui.
  const enCours = periodCompletion(suspension, p, state, D("2026-09-03"));
  assert.equal(enCours.total, 3, "on ne compte pas les jours à venir comme manqués");
  assert.equal(enCours.done, 3);
});

test("countMissedRemindersOn ignore les jours hors bloc", () => {
  const rs = { r1: {} };
  assert.equal(countMissedRemindersOn([suspension], rs, D("2026-09-15")), 1, "dû et non coché");
  assert.equal(countMissedRemindersOn([suspension], rs, D("2026-10-15")), 0, "hors bloc : rien à rater");
});

test("getActiveRemindersForDate ne rend que ce qui est dû ce jour-là", () => {
  const autre = { id: "r2", createdAt: "2026-01-01T00:00:00Z",
                  periods: [{ id: "q", startDate: "2026-09-10", recurrence: daily }] };
  assert.deepEqual(getActiveRemindersForDate([suspension, autre], D("2026-09-05")).map(r => r.id), ["r1"]);
  assert.deepEqual(getActiveRemindersForDate([suspension, autre], D("2026-09-15")).map(r => r.id), ["r2", "r1"]);
  assert.deepEqual(getActiveRemindersForDate([suspension, autre], D("2026-10-15")).map(r => r.id), ["r2"]);
});

test("shiftISO reste en heure locale et passe les mois", () => {
  assert.equal(shiftISO("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftISO("2026-01-01", -1), "2025-12-31");
  assert.equal(toISODate(D("2026-03-09")), "2026-03-09");
});

test("un enabled:false traînant n'efface plus le passé", () => {
  // Drapeau mort d'une version précédente : personne ne l'écrit, mais une
  // vieille ligne cloud peut encore le porter. Il ne doit plus rien masquer.
  const avecDrapeau = { ...suspension, enabled: false };
  assert.equal(isReminderActiveOn(avecDrapeau, D("2026-09-15")), true);
});

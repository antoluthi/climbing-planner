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

// ─── SUPPRIMER SANS PERDRE, ET UN TAUX QUI NE MENT PAS ───────────────────────

import {
  archiveReminder, isArchived, liveReminders, reminderProgress, daysBetween, formatPeriod,
} from "./reminders.js";

const T = D("2026-10-15");                       // « aujourd'hui » de référence

test("PROPRIÉTÉ — supprimer un rappel laisse son passé intact", () => {
  // Un bloc en cours depuis le 1er octobre, supprimé le 15.
  const r = { id: "r", createdAt: "2026-09-01T00:00:00Z",
              periods: [{ id: "p", startDate: "2026-10-01", recurrence: daily }] };
  const avant = [];
  for (let iso = "2026-10-01"; iso < "2026-10-15"; iso = shiftISO(iso, 1)) {
    avant.push([iso, isReminderActiveOn(r, D(iso))]);
  }
  const arch = archiveReminder(r, T);
  for (const [iso, était] of avant) {
    assert.equal(isReminderActiveOn(arch, D(iso)), était, `le ${iso} a changé`);
  }
  assert.equal(isReminderActiveOn(arch, T), false, "plus rien à faire aujourd'hui");
  assert.equal(isReminderActiveOn(arch, D("2026-10-20")), false, "ni demain");
  assert.equal(isArchived(arch), true);
});

test("un rappel supprimé reste compté dans l'historique", () => {
  const r = archiveReminder(
    { id: "r", periods: [{ id: "p", startDate: "2026-10-01", recurrence: daily }] }, T);
  const rs = { r: { "2026-10-02": true } };
  assert.equal(countMissedRemindersOn([r], rs, D("2026-10-03")), 1, "un jour non coché du passé");
  assert.equal(countMissedRemindersOn([r], rs, D("2026-10-02")), 0, "un jour coché");
  assert.equal(countMissedRemindersOn([r], rs, T), 0, "plus rien aujourd'hui");
  assert.deepEqual(getActiveRemindersForDate([r], D("2026-10-05")).map(x => x.id), ["r"],
    "le journal d'un jour passé le voit encore");
});

test("supprimer un rappel qui n'avait pas commencé ne laisse pas de bloc vide", () => {
  const futur = { id: "r", periods: [{ id: "p", startDate: "2026-12-01", recurrence: daily }] };
  assert.deepEqual(reminderPeriods(archiveReminder(futur, T)), []);
  const aujourdhui = { id: "r", periods: [{ id: "p", startDate: "2026-10-15", recurrence: daily }] };
  assert.deepEqual(reminderPeriods(archiveReminder(aujourdhui, T)), [],
    "un bloc commencé aujourd'hui ne devient pas une plage inversée");
});

test("liveReminders sépare la liste de l'historique", () => {
  const vivant = { id: "a", periods: [{ id: "p", recurrence: daily }] };
  const supprime = archiveReminder({ id: "b", periods: [{ id: "q", startDate: "2026-10-01", recurrence: daily }] }, T);
  assert.deepEqual(liveReminders([vivant, supprime]).map(r => r.id), ["a"]);
});

test("le taux ne s'affiche pas pour un rappel qui n'a pas commencé", () => {
  const futur = { id: "r", periods: [{ id: "p", startDate: "2026-10-18", recurrence: daily }] };
  const p = reminderProgress(futur, {}, T);
  assert.equal(p.kind, "upcoming");
  assert.equal(p.rate, null, "aucun pourcentage : on n'a rien pu rater");
  assert.equal(p.label, "commence dans 3 jours");
  assert.equal(reminderProgress(
    { id: "r", periods: [{ id: "p", startDate: "2026-10-16", recurrence: daily }] }, {}, T).label,
    "commence demain");
});

test("un rappel jeune est mesuré depuis son début, pas sur 30 jours", () => {
  // Commencé il y a 2 jours (13, 14, 15), un seul coché.
  const r = { id: "r", periods: [{ id: "p", startDate: "2026-10-13", recurrence: daily }] };
  const p = reminderProgress(r, { r: { "2026-10-13": true } }, T);
  assert.equal(p.kind, "sinceStart");
  assert.equal(p.total, 3, "trois jours écoulés, pas trente");
  assert.equal(p.done, 1);
  assert.ok(p.label.startsWith("depuis le"), p.label);
});

test("passé 30 jours, la fenêtre glisse et le dit", () => {
  const r = { id: "r", periods: [{ id: "p", startDate: "2026-01-01", recurrence: daily }] };
  const p = reminderProgress(r, {}, T);
  assert.equal(p.kind, "window");
  assert.equal(p.total, 30);
  assert.equal(p.label, "30 derniers jours");
});

test("la fenêtre ne remonte jamais avant le bloc en cours", () => {
  // Un vieux bloc, puis une reprise il y a 4 jours : le taux ne doit pas
  // additionner les deux, sinon « reprendre » ferait plonger le pourcentage.
  const r = { id: "r", periods: [
    { id: "p1", startDate: "2026-08-01", endDate: "2026-08-31", recurrence: daily },
    { id: "p2", startDate: "2026-10-12", recurrence: daily },
  ] };
  const p = reminderProgress(r, {}, T);
  assert.equal(p.total, 4, "du 12 au 15, et rien du bloc d'août");
});

test("un rappel terminé rend le bilan de son dernier bloc", () => {
  const r = { id: "r", periods: [{ id: "p", startDate: "2026-10-01", endDate: "2026-10-10", recurrence: daily }] };
  const p = reminderProgress(r, { r: { "2026-10-01": true, "2026-10-02": true } }, T);
  assert.equal(p.kind, "ended");
  assert.equal(p.total, 10);
  assert.equal(p.done, 2);
  assert.equal(p.label, "sur le dernier bloc");
});

test("pas de pourcentage tant qu'aucune échéance n'est tombée", () => {
  // Bloc lun/mer/ven commencé un mardi : rien n'était encore dû.
  const mardi = "2026-10-13";
  const r = { id: "r", periods: [{ id: "p", startDate: mardi, recurrence: { kind: "weekdays", days: [1] } }] };
  const p = reminderProgress(r, {}, D(mardi));
  assert.equal(p.total, 0);
  assert.equal(p.rate, null);
  assert.equal(p.label, "aucune échéance encore");
});

test("daysBetween compte les jours, bornes comprises ou non", () => {
  assert.equal(daysBetween("2026-10-01", "2026-10-15"), 14);
  assert.equal(daysBetween("2026-10-15", "2026-10-15"), 0);
  assert.equal(daysBetween("2026-10-15", "2026-10-01"), -14);
});

test("formatPeriod accorde le temps du verbe à la date du jour", () => {
  // « depuis le 29 sept. » sur un bloc à venir se lit comme s'il courait déjà.
  const futur = { startDate: "2026-10-20" };
  assert.equal(formatPeriod(futur, T), "à partir du 20 oct.");
  assert.equal(formatPeriod({ startDate: "2026-10-01" }, T), "depuis le 1 oct.");
  assert.equal(formatPeriod({ startDate: "2026-10-01", endDate: "2026-10-10" }, T), "du 1 oct. au 10 oct.");
  assert.equal(formatPeriod({ endDate: "2026-10-30" }, T), "jusqu'au 30 oct.");
  assert.equal(formatPeriod({}, T), "sans fin");
});

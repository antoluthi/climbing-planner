// node --test src/lib/reminders.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReminderActiveOn, getActiveRemindersForDate, countMissedRemindersOn,
  softDeleteReminder, isDeleted, liveReminders, reminderStatus, formatRange,
  completionBetween, reminderProgress, daysBetween, shiftISO, toISODate,
} from "./reminders.js";

const D = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const daily = { kind: "daily" };
const mwf = { kind: "weekdays", days: [1, 3, 5] };
const T = D("2026-10-15");

test("fenêtre de dates et récurrence", () => {
  const r = { id: "r", recurrence: mwf, startDate: "2026-10-01", endDate: "2026-10-31" };
  assert.equal(isReminderActiveOn(r, D("2026-10-07")), true,  "un mercredi dedans");
  assert.equal(isReminderActiveOn(r, D("2026-10-08")), false, "un jeudi dedans");
  assert.equal(isReminderActiveOn(r, D("2026-09-30")), false, "avant le début");
  assert.equal(isReminderActiveOn(r, D("2026-11-04")), false, "après la fin");
  assert.equal(isReminderActiveOn({ id: "x" }, D("2030-01-01")), true, "sans date ni récurrence : tous les jours");
});

test("PROPRIÉTÉ — supprimer coupe à partir du jour dit, et pas avant", () => {
  const r = { id: "r", recurrence: daily, startDate: "2026-10-01" };
  const avant = [];
  for (let iso = "2026-10-01"; iso < "2026-10-15"; iso = shiftISO(iso, 1)) {
    avant.push([iso, isReminderActiveOn(r, D(iso))]);
  }
  const [supprime] = softDeleteReminder([r], "r", T);
  for (const [iso, était] of avant) {
    assert.equal(isReminderActiveOn(supprime, D(iso)), était, `le ${iso} a changé`);
  }
  assert.equal(isReminderActiveOn(supprime, T), false, "plus rien le jour de la suppression");
  assert.equal(isReminderActiveOn(supprime, D("2026-10-20")), false, "ni après");
  assert.equal(isDeleted(supprime), true);
});

test("un rappel supprimé reste dans l'historique et les stats", () => {
  const [r] = softDeleteReminder([{ id: "r", recurrence: daily, startDate: "2026-10-01" }], "r", T);
  const rs = { r: { "2026-10-02": true } };
  assert.equal(countMissedRemindersOn([r], rs, D("2026-10-03")), 1, "un jour passé non coché");
  assert.equal(countMissedRemindersOn([r], rs, D("2026-10-02")), 0, "un jour passé coché");
  assert.equal(countMissedRemindersOn([r], rs, T), 0, "plus rien aujourd'hui");
  assert.deepEqual(getActiveRemindersForDate([r], D("2026-10-05")).map(x => x.id), ["r"],
    "le journal d'un jour passé le voit encore, donc on peut le cocher");
});

test("liveReminders sépare la liste de l'historique", () => {
  const vif = { id: "a", recurrence: daily };
  const [mort] = softDeleteReminder([{ id: "b", recurrence: daily }], "b", T);
  assert.deepEqual(liveReminders([vif, mort]).map(r => r.id), ["a"]);
});

test("un rappel peut démarrer dans le passé — un oubli se rattrape", () => {
  // Créé aujourd'hui, mais démarré hier pour pouvoir cocher la veille.
  const r = { id: "r", recurrence: daily, startDate: shiftISO(toISODate(T), -1),
              createdAt: "2026-10-15T09:00:00Z" };
  assert.equal(isReminderActiveOn(r, D("2026-10-14")), true, "hier est cochable");
  assert.equal(reminderStatus(r, T), "running");
});

test("statut", () => {
  assert.equal(reminderStatus({ startDate: "2026-12-01" }, T), "upcoming");
  assert.equal(reminderStatus({ startDate: "2026-10-01" }, T), "running");
  assert.equal(reminderStatus({ endDate: "2026-10-10" }, T), "ended");
  assert.equal(reminderStatus({ deletedAt: "2026-10-15" }, T), "ended", "supprimé aujourd'hui");
});

test("formatRange accorde le temps du verbe à la date du jour", () => {
  assert.equal(formatRange({ startDate: "2026-10-20" }, T), "à partir du 20 oct.");
  assert.equal(formatRange({ startDate: "2026-10-01" }, T), "depuis le 1 oct.");
  assert.equal(formatRange({ startDate: "2026-10-01", endDate: "2026-10-10" }, T), "du 1 oct. au 10 oct.");
  assert.equal(formatRange({ endDate: "2026-10-30" }, T), "jusqu'au 30 oct.");
  assert.equal(formatRange({}, T), "sans fin");
});

test("completionBetween ne compte que les jours dus", () => {
  const r = { id: "r", recurrence: mwf, startDate: "2026-10-01" };
  const rs = { r: { "2026-10-05": true } };                    // un lundi
  const { done, total } = completionBetween(r, rs, "2026-10-05", "2026-10-11");
  assert.equal(total, 3, "lun/mer/ven dans la semaine");
  assert.equal(done, 1);
});

test("le taux ne s'affiche pas pour un rappel qui n'a pas commencé", () => {
  const p = reminderProgress({ id: "r", recurrence: daily, startDate: "2026-10-18" }, {}, T);
  assert.equal(p.rate, null, "aucun pourcentage : on n'a rien pu rater");
  assert.equal(p.label, "commence dans 3 jours");
  assert.equal(reminderProgress({ id: "r", recurrence: daily, startDate: "2026-10-16" }, {}, T).label,
    "commence demain");
});

test("un rappel jeune est mesuré depuis son début, pas sur 30 jours", () => {
  const r = { id: "r", recurrence: daily, startDate: "2026-10-13" };
  const p = reminderProgress(r, { r: { "2026-10-13": true } }, T);
  assert.equal(p.total, 3, "trois jours écoulés, pas trente");
  assert.equal(p.done, 1);
  assert.ok(p.label.startsWith("depuis le"), p.label);
});

test("passé 30 jours, la fenêtre glisse et le dit", () => {
  const p = reminderProgress({ id: "r", recurrence: daily, startDate: "2026-01-01" }, {}, T);
  assert.equal(p.total, 30);
  assert.equal(p.label, "30 derniers jours");
});

test("un rappel terminé s'arrête à sa fin, pas à aujourd'hui", () => {
  const r = { id: "r", recurrence: daily, startDate: "2026-10-01", endDate: "2026-10-10" };
  const p = reminderProgress(r, { r: { "2026-10-01": true, "2026-10-02": true } }, T);
  assert.equal(p.total, 10, "les jours d'après la fin ne sont pas des échecs");
  assert.equal(p.done, 2);
  assert.equal(p.label, "sur toute sa durée");
});

test("un rappel supprimé s'arrête la veille de sa suppression", () => {
  const [r] = softDeleteReminder(
    [{ id: "r", recurrence: daily, startDate: "2026-10-11" }], "r", T);
  const p = reminderProgress(r, {}, T);
  assert.equal(p.total, 4, "du 11 au 14 — le 15 ne compte pas");
});

test("pas de pourcentage tant qu'aucune échéance n'est tombée", () => {
  const mardi = "2026-10-13";
  const r = { id: "r", recurrence: { kind: "weekdays", days: [1] }, startDate: mardi };
  const p = reminderProgress(r, {}, D(mardi));
  assert.equal(p.total, 0);
  assert.equal(p.rate, null);
  assert.equal(p.label, "aucune échéance encore");
});

test("helpers de date", () => {
  assert.equal(shiftISO("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftISO("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetween("2026-10-01", "2026-10-15"), 14);
  assert.equal(toISODate(D("2026-03-09")), "2026-03-09");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodOf, stepRef, isCurrentPeriod, periodLabel, comparisonWindows,
  buildDayIndex, sessionState, summarize, delta, chargeSeries, stackKeys, averageDone,
  sportBreakdown, feelStats, deviationVerdict, hooperStats, weightStats, nutritionStats,
  runStats, habitStats, fmtNum, fmtSigned, fmtDuration, shiftISO, itemsBetween,
  windowOf, autoGrain, pointsFor, grainAllowed, resolveGrain, bucketsFor, stepSelection,
  selectionIsCurrent, rangeLabel, selectionCaption, previousPhrase, comparisonFor,
  quickRanges, cycleRanges, rangeError, tickInterval, MAX_POINTS,
  sleepStats, averageClock, sleepScoreLabel,
} from "./stats.js";

// Mardi 20 octobre 2026 : un milieu de semaine, un milieu de mois.
const TODAY = "2026-10-20";
const REF = new Date(TODAY + "T12:00:00");

// Une semaine de planning à partir de son lundi : { "2026-10-19": [[…], …] }.
const week = (monday, days) => ({ [monday]: Array.from({ length: 7 }, (_, i) => days[i] || []) });
const S = (props) => ({ name: "Séance", discipline: "climbing", chargePlanned: 5, ...props });
const done = (props) => S({ ...props, feedback: { status: "done", done: true, rpe: props?.rpe ?? null, quality: props?.quality ?? null } });
const missed = (props) => S({ ...props, feedback: { status: "not_done", done: false } });

// ─── Périodes ────────────────────────────────────────────────────────────────

test("4 semaines : la semaine en cours et les trois d'avant, du lundi au dimanche", () => {
  const p = periodOf("4sem", REF);
  assert.equal(p.start, "2026-09-28");
  assert.equal(p.end, "2026-10-25");
  assert.deepEqual(p.buckets.map(b => b.start), ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.ok(p.buckets.every(b => b.kind === "week" && b.full));
  // Reculer d'un cran donne les quatre semaines juste avant, sans trou.
  assert.equal(periodOf("4sem", stepRef("4sem", REF, -1)).end, "2026-09-27");
});

test("mois : les semaines du bord s'arrêtent au mois", () => {
  const p = periodOf("mois", REF);
  assert.equal(p.start, "2026-10-01");
  assert.equal(p.end, "2026-10-31");
  assert.deepEqual(p.buckets[0], { kind: "week", label: "1/10", start: "2026-10-01", end: "2026-10-04", monday: "2026-09-28", full: false });
  assert.equal(p.buckets.at(-1).end, "2026-10-31");
  assert.equal(p.buckets.at(-1).full, false);
  assert.ok(p.buckets.slice(1, -1).every(b => b.full));
});

test("semaine et année : sept jours, douze mois", () => {
  assert.deepEqual(periodOf("sem", REF).buckets.map(b => b.label), ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]);
  const an = periodOf("an", REF);
  assert.equal(an.buckets.length, 12);
  assert.equal(an.buckets[1].end, "2026-02-28");
});

test("libellés : ceux du calendrier, et la période en cours se reconnaît", () => {
  assert.equal(periodLabel("sem", REF), "19 oct. – 25 oct.");
  assert.equal(periodLabel("mois", REF), "Octobre 2026");
  assert.equal(periodLabel("an", REF), "2026");
  assert.ok(isCurrentPeriod("4sem", REF, TODAY));
  assert.ok(!isCurrentPeriod("sem", stepRef("sem", REF, -1), TODAY));
});

test("comparaison à date : autant de jours de la période d'avant qu'il s'en est écoulé", () => {
  // Mardi : lundi-mardi contre lundi-mardi de la semaine d'avant.
  assert.deepEqual(comparisonWindows("sem", REF, TODAY), {
    cur: { start: "2026-10-19", end: "2026-10-20" },
    prev: { start: "2026-10-12", end: "2026-10-13" },
    partial: true,
  });
  // Le 20 octobre : du 1er au 20 septembre.
  assert.deepEqual(comparisonWindows("mois", REF, TODAY).prev, { start: "2026-09-01", end: "2026-09-20" });
  // Une période passée se compare en entier.
  const past = comparisonWindows("sem", stepRef("sem", REF, -2), TODAY);
  assert.equal(past.partial, false);
  assert.deepEqual(past.prev, { start: "2026-09-28", end: "2026-10-04" });
  // Une période à venir n'a rien à comparer.
  assert.equal(comparisonWindows("sem", stepRef("sem", REF, 1), TODAY), null);
  // Le 31 mars se compare au 28 février, pas au 3 mars.
  assert.deepEqual(comparisonWindows("mois", new Date("2027-03-31T12:00:00"), "2027-03-31").prev,
    { start: "2027-02-01", end: "2027-02-28" });
});

// ─── Séances ─────────────────────────────────────────────────────────────────

test("état d'une séance : fait, manqué, non noté, à venir", () => {
  assert.equal(sessionState(done(), "2026-10-19", TODAY), "done");
  assert.equal(sessionState(S({ feedback: { status: "adapted", done: true } }), "2026-10-19", TODAY), "done");
  assert.equal(sessionState(missed(), "2026-10-19", TODAY), "missed");
  assert.equal(sessionState(S({ feedback: { done: false } }), "2026-10-19", TODAY), "missed");   // ancien format
  assert.equal(sessionState(S(), "2026-10-19", TODAY), "unrated");
  assert.equal(sessionState(S(), TODAY, TODAY), "planned");
  // Un ressenti neutre (statut retiré, notes gardées) n'est pas une séance manquée.
  assert.equal(sessionState(S({ feedback: { status: null, done: null, notes: "x" } }), "2026-10-19", TODAY), "unrated");
});

test("une échéance de plusieurs jours compte sur chacun, et sort quand un sport est isolé", () => {
  const data = { weeks: {}, quickSessions: [{ id: "e", mode: "event", startDate: "2026-10-17", endDate: "2026-10-18", chargePlanned: 6 }] };
  const idx = buildDayIndex(data);
  assert.equal(idx.get("2026-10-17").events.length, 1);
  assert.equal(idx.get("2026-10-18").events.length, 1);
  assert.equal(buildDayIndex(data, { includeEvents: false }).size, 0);
});

test("résumé : ce qui est fait compte, le reste se dit à part", () => {
  const data = {
    weeks: week("2026-10-19", {
      0: [done({ estimatedTime: 90, rpe: 6 }), missed(), S()],                 // lundi : fait, manqué, non noté
      1: [S({ discipline: "running", metrics: { distanceKm: 8, durationMin: 45 } })],   // aujourd'hui, pas encore fait
      3: [S()],                                                                // jeudi : à venir
    }),
    quickSessions: [{ id: "e", mode: "event", startDate: "2026-10-19", chargePlanned: 4 }],
  };
  const sum = summarize(buildDayIndex(data), "2026-10-19", "2026-10-25", TODAY);
  assert.equal(sum.done, 1);
  assert.equal(sum.missed, 1);
  assert.equal(sum.unrated, 1);
  assert.equal(sum.planned, 2);
  assert.equal(sum.due, 3);
  assert.equal(sum.minutes, 90);
  assert.equal(sum.charge, 6 + 4);      // le ressenti de la séance faite, plus l'échéance passée
  assert.equal(sum.km, 0);              // la sortie du jour n'est pas encore courue
});

test("variation : en pourcentage, jamais depuis zéro", () => {
  assert.deepEqual(delta(120, 100), { pct: 20, diff: 20 });
  assert.deepEqual(delta(0, 0), { pct: 0, diff: 0 });
  assert.deepEqual(delta(5, 0), { pct: null, diff: 5 });
  assert.equal(delta(5, null), null);
});

// ─── Charge ──────────────────────────────────────────────────────────────────

test("charge : fait en plein, prévu ou non noté en clair, manqué à zéro", () => {
  const data = {
    weeks: week("2026-10-19", {
      0: [done({ rpe: 7 }), missed({ chargePlanned: 9 }), S({ discipline: "running", chargePlanned: 4 })],
      2: [S({ chargePlanned: 6 })],
    }),
  };
  const rows = chargeSeries(buildDayIndex(data), periodOf("sem", REF).buckets, TODAY);
  assert.deepEqual(
    { d: rows[0].d_climbing, o: rows[0].o_running, done: rows[0].done, open: rows[0].open },
    { d: 7, o: 4, done: 7, open: 4 });
  assert.equal(rows[2].o_climbing, 6);
  assert.deepEqual(stackKeys(rows), ["climbing", "running"]);
  assert.equal(averageDone(rows), 1);   // 7 sur 7 jours
  assert.equal(averageDone([{ done: 0 }, { done: 0 }]), null);
});

test("détail d'une tranche : chaque séance avec son jour et son état", () => {
  const data = {
    weeks: week("2026-10-19", { 0: [done({ name: "Bloc", rpe: 6 })], 3: [S({ name: "Voie", chargePlanned: 5 })] }),
    quickSessions: [{ id: "e", mode: "event", name: "Compétition", startDate: "2026-10-24", chargePlanned: 8 }],
  };
  const items = itemsBetween(buildDayIndex(data), "2026-10-19", "2026-10-25", TODAY);
  assert.deepEqual(items.map(i => [i.date, i.name, i.state, i.charge]), [
    ["2026-10-19", "Bloc", "done", 6],
    ["2026-10-22", "Voie", "planned", 5],
    ["2026-10-24", "Compétition", "planned", 8],
  ]);
});

test("répartition : par le temps, sinon par le nombre de séances", () => {
  const data = {
    weeks: week("2026-10-12", {
      0: [done({ estimatedTime: 120 })],
      1: [done({ discipline: "running", estimatedTime: 60 })],
      2: [done({ estimatedTime: 120 })],
    }),
  };
  const r = sportBreakdown(buildDayIndex(data), "2026-10-12", "2026-10-18", TODAY);
  assert.deepEqual(r.rows.map(x => [x.sport, x.count, Math.round(x.share * 100)]), [["climbing", 2, 80], ["running", 1, 20]]);
  assert.equal(r.byTime, true);
  const noTime = sportBreakdown(buildDayIndex({ weeks: week("2026-10-12", { 0: [done()], 1: [done({ discipline: "running" })] }) }), "2026-10-12", "2026-10-18", TODAY);
  assert.equal(noTime.byTime, false);
  assert.equal(noTime.rows[0].share, 0.5);
});

// ─── Ressenti ────────────────────────────────────────────────────────────────

test("écart : pondéré par les séances, pas une moyenne de moyennes", () => {
  // Semaine 1 : une séance à +3. Semaine 2 : trois séances à 0.
  const data = {
    weeks: {
      ...week("2026-09-28", { 0: [done({ chargePlanned: 5, rpe: 8, quality: 2 })] }),
      ...week("2026-10-05", { 0: [done({ rpe: 5 })], 1: [done({ rpe: 5, quality: 4 })], 2: [done({ discipline: "running", chargePlanned: 4, rpe: 4 })] }),
    },
  };
  const p = periodOf("4sem", REF);
  const f = feelStats(buildDayIndex(data), p.start, TODAY, p.buckets, TODAY);
  assert.equal(f.dev, 0.8);           // (3 + 0 + 0 + 0) / 4, et non (3 + 0) / 2
  assert.equal(f.nDev, 4);
  assert.equal(f.quality, 3);
  assert.deepEqual(f.perBucket.map(b => b.dev), [3, 0, null, null]);
  assert.deepEqual(f.perSport.map(s => [s.sport, s.dev, s.nDev]), [["climbing", 1, 3], ["running", 0, 1]]);
  assert.equal(deviationVerdict(0.3), "bien estimées");
  assert.equal(deviationVerdict(0.8), "plus dures que prévu");
  assert.equal(deviationVerdict(-1), "plus faciles que prévu");
});

// ─── Corps ───────────────────────────────────────────────────────────────────

test("Hooper : l'échelle du journal, et le critère qui pèse le plus", () => {
  const data = {
    hooper: [
      { date: "2026-10-13", sleep: 3, fatigue: 4, stress: 2, soreness: 5, total: 14 },
      { date: "2026-10-14", sleep: 3, fatigue: 4, stress: 2, soreness: 5 },       // sans total : recalculé
      { date: "2026-10-20", sleep: 5, fatigue: 5, stress: 3, soreness: 6, total: 19 },
    ],
  };
  const p = periodOf("4sem", REF);
  const h = hooperStats(data, p.start, p.end, p.buckets);
  assert.equal(h.n, 3);
  assert.equal(h.avg, 15.7);
  assert.equal(h.label, "Modérément fatigué");          // lib/hooper.js : 16 → modérément fatigué
  assert.equal(h.dominant.key, "soreness");
  assert.deepEqual(h.perBucket.map(b => b.total), [null, null, 14, 19]);
  // 14 se lit comme dans le journal : bien récupéré.
  assert.equal(hooperStats({ hooper: [{ date: TODAY, sleep: 3, fatigue: 4, stress: 3, soreness: 4, total: 14 }] }, TODAY, TODAY, []).label, "Bien récupéré");
});

test("poids : graduations au demi-kilo, variation sur la période", () => {
  const data = { weight: { "2026-10-02": 70.62, "2026-10-09": 70.48, "2026-10-16": 70.3, "2026-08-01": 75 } };
  const p = periodOf("mois", REF);
  const w = weightStats(data, p.start, p.end, p.buckets);
  assert.equal(w.n, 3);
  assert.equal(w.delta, -0.3);
  assert.deepEqual(w.domain, [70, 71]);
  assert.deepEqual(w.ticks, [70, 70.5, 71]);
  assert.ok(w.ticks.every(t => Math.round(t * 10) === t * 10), "pas de graduation à trois décimales");
  assert.deepEqual(weightStats({}, p.start, p.end, p.buckets).ticks, []);
});

test("repas : moyenne sur les jours notés, pas sur tous les jours", () => {
  const data = { nutrition: {
    "2026-10-19": [{ calories: 800, proteins: 30 }, { calories: 1000, proteins: 40 }],
    "2026-10-20": [{ calories: 2000, proteins: 90 }],
    "2026-10-21": [],
  } };
  const p = periodOf("sem", REF);
  const n = nutritionStats(data, p.start, p.end, p.buckets);
  assert.deepEqual({ days: n.days, cal: n.cal, prot: n.prot }, { days: 2, cal: 1900, prot: 80 });
  assert.equal(n.perBucket[2].cal, null);
});

// ─── Course ──────────────────────────────────────────────────────────────────

test("course : faits et prévus, objectif sur les semaines entières seulement", () => {
  const run = (km, extra) => S({ discipline: "running", metrics: { distanceKm: km }, ...extra });
  const data = {
    profile: { kmGoal: true },
    runBlocks: [{ id: "b", startDate: "2026-09-28", durationWeeks: 8, baseKm: 20, increasePct: 0 }],
    weeks: {
      ...week("2026-09-28", { 1: [run(10, { feedback: { status: "done", done: true } })], 4: [run(12, { feedback: { status: "done", done: true } })] }),
      ...week("2026-10-05", { 1: [run(10, { feedback: { status: "not_done", done: false } })] }),
      ...week("2026-10-19", { 3: [run(15)] }),
    },
  };
  const p = periodOf("4sem", REF);
  const r = runStats(buildDayIndex(data), p.buckets, data, TODAY);
  assert.deepEqual(r.rows.map(x => [x.done, x.open, x.goal]), [[22, 0, 20], [0, 0, 20], [0, 0, 20], [0, 15, 20]]);
  assert.equal(r.done, 22);
  assert.equal(r.goalWeeks, 3);        // la semaine en cours n'est pas encore jugée
  assert.equal(r.goalHit, 1);
  // En vue Mois, la semaine coupée par le début du mois ne porte pas d'objectif.
  const m = runStats(buildDayIndex(data), periodOf("mois", REF).buckets, data, TODAY);
  assert.equal(m.rows[0].goal, null);
  // En vue Semaine, l'objectif est celui de la semaine affichée.
  assert.equal(runStats(buildDayIndex(data), periodOf("sem", REF).buckets, data, TODAY).weekGoal, 20);
  // Sans la bascule « objectif km », aucun objectif.
  assert.equal(runStats(buildDayIndex(data), p.buckets, { ...data, profile: {} }, TODAY).rows[0].goal, null);
});

// ─── Habitudes ───────────────────────────────────────────────────────────────

test("rappels : la journée en cours ne compte que si elle est cochée", () => {
  const data = {
    reminders: [
      { id: "r1", name: "Suspensions", recurrence: { kind: "daily" }, startDate: "2026-10-18" },
      { id: "r2", name: "Gainage", recurrence: { kind: "daily" }, startDate: "2026-10-01", deletedAt: "2026-10-19" },
    ],
    reminderState: { r1: { "2026-10-18": true }, r2: { "2026-10-17": true } },
  };
  const h = habitStats(data, "2026-10-12", "2026-10-25", TODAY);
  const r1 = h.reminders.find(r => r.id === "r1");
  assert.deepEqual([r1.checked, r1.due], [1, 2]);          // 18 coché, 19 manqué, 20 pas encore
  const r2 = h.reminders.find(r => r.id === "r2");
  // Supprimé le 19 : dû du 12 au 18, soit 7 jours. Le 19 et après ne comptent plus.
  assert.deepEqual([r2.checked, r2.due, r2.deleted], [1, 7, true]);
});

test("journal : un jour compte quand le Hooper est complet", () => {
  const full = (date) => ({ date, sleep: 3, fatigue: 3, stress: 3, soreness: 3, total: 12 });
  const data = { hooper: [full("2026-10-18"), full("2026-10-19"), { date: "2026-10-17", sleep: 3 }] };
  // Compté depuis le premier jour noté (le 17), pas depuis le début de la période.
  assert.deepEqual(habitStats(data, "2026-10-14", "2026-10-25", TODAY).journal, { filled: 2, total: 3 });
  assert.deepEqual(habitStats({ hooper: [] }, "2026-10-14", "2026-10-25", TODAY).journal, { filled: 0, total: 0 });
});

// ─── Écriture ────────────────────────────────────────────────────────────────

test("nombres à la française", () => {
  assert.equal(fmtNum(70.45), "70,5");
  assert.equal(fmtNum(-0.6), "−0,6");
  assert.equal(fmtNum(-0.04), "0");
  assert.equal(fmtSigned(0.5), "+0,5");
  assert.equal(fmtSigned(0), "0");
  assert.equal(fmtNum(1850, 0).replace(/\s/g, " "), "1 850");
  assert.equal(fmtDuration(45), "45 min");
  assert.equal(fmtDuration(150), "2 h 30");
  assert.equal(fmtDuration(120), "2 h");
  assert.equal(shiftISO("2026-10-25", 1), "2026-10-26");   // changement d'heure
});

// ─── Plages libres et découpage ──────────────────────────────────────────────

test("découpage automatique : par jour, par semaine, par mois selon la longueur", () => {
  assert.equal(autoGrain("2026-10-07", "2026-10-20"), "day");      // 14 jours
  assert.equal(autoGrain("2026-10-06", "2026-10-20"), "week");     // 15 jours
  assert.equal(autoGrain("2026-08-12", "2026-10-20"), "week");     // 70 jours
  assert.equal(autoGrain("2026-01-01", "2026-12-31"), "month");
  // Les raccourcis retrouvent leur découpage d'avant.
  for (const [range, grain] of [["sem", "day"], ["4sem", "week"], ["mois", "week"], ["an", "month"]]) {
    const w = windowOf({ range, ref: REF });
    assert.equal(autoGrain(w.start, w.end), grain, range);
  }
});

test("au-delà de 100 points, un découpage n'est plus proposé", () => {
  assert.equal(pointsFor("2026-01-01", "2026-12-31", "day"), 365);
  assert.equal(pointsFor("2026-01-01", "2026-12-31", "week"), 53);
  assert.equal(pointsFor("2026-01-01", "2026-12-31", "month"), 12);
  assert.ok(!grainAllowed("2026-01-01", "2026-12-31", "day"));
  assert.ok(grainAllowed("2026-08-12", "2026-10-20", "day"));      // 70 jours
  // Trois mois par jour restent possibles, quel que soit le jour où on les prend.
  for (const today of [TODAY, "2026-09-30", "2026-12-31", "2027-05-31"]) {
    const q = quickRanges(today).find(r => r.key === "3m");
    assert.ok(grainAllowed(q.start, q.end, "day"), today);
  }
  // Demandé mais trop fin : on retombe sur le découpage qui va de soi.
  assert.equal(resolveGrain({ range: "an", ref: REF }, "day"), "month");
  assert.equal(resolveGrain({ range: "an", ref: REF }, "week"), "week");
  assert.equal(resolveGrain({ range: "custom", start: "2026-08-12", end: "2026-10-20" }, null), "week");
  // Le nombre annoncé est celui qu'on construit.
  for (const g of ["day", "week", "month"]) {
    assert.equal(bucketsFor("2025-11-18", "2026-02-03", g).length, pointsFor("2025-11-18", "2026-02-03", g), g);
  }
  assert.ok(MAX_POINTS >= 92);
});

test("tranches d'une plage libre : bornées aux deux bouts", () => {
  const w = bucketsFor("2026-08-12", "2026-10-20", "week");
  assert.deepEqual([w[0].start, w[0].end, w[0].full, w[0].label], ["2026-08-12", "2026-08-16", false, "12/8"]);
  assert.deepEqual([w.at(-1).start, w.at(-1).end, w.at(-1).full], ["2026-10-19", "2026-10-20", false]);
  assert.ok(w.slice(1, -1).every(b => b.full));
  const m = bucketsFor("2026-08-12", "2026-10-20", "month");
  assert.deepEqual(m.map(b => [b.start, b.end, b.full]), [
    ["2026-08-12", "2026-08-31", false], ["2026-09-01", "2026-09-30", true], ["2026-10-01", "2026-10-20", false],
  ]);
  // Par jour : nommés jusqu'à une semaine, datés au-delà.
  assert.deepEqual(bucketsFor("2026-10-21", "2026-10-23", "day").map(b => b.label), ["Mer", "Jeu", "Ven"]);
  assert.equal(bucketsFor("2026-10-01", "2026-10-20", "day")[0].label, "1/10");
});

test("sur deux années, janvier porte son année", () => {
  const m = bucketsFor("2025-11-01", "2026-02-28", "month");
  assert.deepEqual(m.map(b => b.label), ["nov 25", "déc", "janv 26", "févr"]);
  assert.deepEqual(bucketsFor("2026-01-01", "2026-03-31", "month").map(b => b.label), ["janv", "févr", "mars"]);
});

test("les flèches décalent une plage libre de sa longueur", () => {
  const sel = { range: "custom", start: "2026-08-12", end: "2026-10-20", label: "Force" };
  assert.deepEqual(stepSelection(sel, -1), { range: "custom", start: "2026-06-03", end: "2026-08-11" });
  assert.deepEqual(stepSelection(sel, 1), { range: "custom", start: "2026-10-21", end: "2026-12-29" });
  // Un raccourci, lui, passe au précédent.
  assert.equal(windowOf(stepSelection({ range: "4sem", ref: REF }, -1)).end, "2026-09-27");
  assert.ok(selectionIsCurrent(sel, TODAY));
  assert.ok(!selectionIsCurrent(stepSelection(sel, -1), TODAY));
});

test("comparaison d'une plage libre : la même longueur juste avant, à date", () => {
  // 70 jours, dont 70 écoulés : les 70 jours d'avant, entiers.
  assert.deepEqual(comparisonFor({ range: "custom", start: "2026-08-12", end: "2026-10-20" }, TODAY), {
    cur: { start: "2026-08-12", end: "2026-10-20" },
    prev: { start: "2026-06-03", end: "2026-08-11" },
    partial: false,
  });
  // Un cycle en cours (29 sept. → 26 oct.) : 22 jours écoulés contre les 22
  // premiers jours des 28 d'avant.
  assert.deepEqual(comparisonFor({ range: "custom", start: "2026-09-29", end: "2026-10-26" }, TODAY), {
    cur: { start: "2026-09-29", end: "2026-10-20" },
    prev: { start: "2026-09-01", end: "2026-09-22" },
    partial: true,
  });
  assert.equal(comparisonFor({ range: "custom", start: "2026-11-02", end: "2026-11-29" }, TODAY), null);
  assert.equal(previousPhrase({ range: "custom", start: "2026-08-12", end: "2026-10-20" }), "aux 70 jours d'avant");
  assert.equal(previousPhrase({ range: "mois", ref: REF }), "au mois d'avant");
});

test("libellés d'une plage libre : l'année quand ce n'est pas celle d'aujourd'hui", () => {
  assert.equal(rangeLabel("2026-08-12", "2026-10-20", TODAY), "12 août – 20 oct.");
  assert.equal(rangeLabel("2025-03-03", "2025-04-12", TODAY), "3 mars – 12 avr. 2025");
  assert.equal(rangeLabel("2025-11-18", "2026-02-03", TODAY), "18 nov. 2025 – 3 févr. 2026");
  assert.equal(selectionCaption({ range: "custom", start: "2026-09-29", end: "2026-10-26", label: "Force" }), "Force · 28 jours");
  assert.equal(selectionCaption({ range: "custom", start: TODAY, end: TODAY }), "1 jour");
});

test("raccourcis : tous finissent aujourd'hui", () => {
  const q = Object.fromEntries(quickRanges(TODAY).map(r => [r.key, r]));
  assert.deepEqual([q["30d"].start, q["30d"].end], ["2026-09-21", TODAY]);
  assert.equal(q["3m"].start, "2026-07-21");
  assert.equal(q["12m"].start, "2025-10-21");
  assert.equal(q.ytd.start, "2026-01-01");
  // Le 31 mai, trois mois avant tomberait le 31 février : on part du 1er mars.
  assert.equal(quickRanges("2027-05-31").find(r => r.key === "3m").start, "2027-03-01");
});

test("les cycles du plan comme plages, le plus récent d'abord", () => {
  const mesos = [
    { id: "a", label: "Reprise", color: "#a78bff", startDate: "2026-08-03", durationWeeks: 4, anchor: true },
    { id: "b", label: "Continuité", color: "#5fe0c0", durationWeeks: 4 },
    { id: "c", label: "Force", color: "#ff4500", durationWeeks: 4 },
    { id: "d", label: "Pic", durationWeeks: 2 },
  ];
  const r = cycleRanges(mesos, TODAY);
  assert.deepEqual(r.map(x => [x.label, x.start, x.end, x.status]), [
    ["Pic", "2026-10-26", "2026-11-08", "future"],
    ["Force", "2026-09-28", "2026-10-25", "current"],
    ["Continuité", "2026-08-31", "2026-09-27", "past"],
    ["Reprise", "2026-08-03", "2026-08-30", "past"],
  ]);
  assert.deepEqual(cycleRanges([{ id: "x", label: "Sans date", durationWeeks: 3 }], TODAY), []);
});

test("dates saisies à la main : ce qui ne va pas se dit", () => {
  assert.equal(rangeError("", "2026-10-20"), "Choisis une date de début et une date de fin.");
  assert.equal(rangeError("2026-10-20", "2026-10-01"), "La fin est avant le début.");
  assert.equal(rangeError("2019-01-01", "2026-10-20"), "Cinq ans au plus.");
  assert.equal(rangeError("2026-10-01", "2026-10-20"), null);
});

test("étiquettes de l'axe : toutes jusqu'à 12, puis une huitaine", () => {
  assert.equal(tickInterval(7), 0);
  assert.equal(tickInterval(12), 0);
  assert.equal(tickInterval(70), 8);       // une étiquette tous les 9 jours
  assert.ok(70 / (tickInterval(70) + 1) <= 8);
});

test("course jour par jour : l'objectif de la semaine seulement sur une vraie semaine", () => {
  const data = { profile: { kmGoal: true }, runBlocks: [{ id: "b", startDate: "2026-09-28", durationWeeks: 8, baseKm: 20, increasePct: 0 }], weeks: {} };
  const idx = buildDayIndex(data);
  assert.equal(runStats(idx, bucketsFor("2026-10-19", "2026-10-25", "day"), data, TODAY).weekGoal, 20);
  assert.equal(runStats(idx, bucketsFor("2026-10-01", "2026-10-30", "day"), data, TODAY).weekGoal, null);
  assert.equal(runStats(idx, bucketsFor("2026-10-21", "2026-10-27", "day"), data, TODAY).weekGoal, null);
});

// ─── Sommeil ─────────────────────────────────────────────────────────────────

const night = (date, props = {}) => ({ date, total: 450, deep: 90, light: 240, rem: 120, awake: 20, score: 80, start: "23:10", end: "07:00", need: 480, source: "garmin", ...props });

test("sommeil : moyennes par nuit, et les phases font le total", () => {
  const data = { sleep: [
    night("2026-10-12", { total: 420, deep: 60, light: 240, rem: 120, score: 70 }),
    night("2026-10-13", { total: 480, deep: 120, light: 240, rem: 120, score: 90 }),
    // L'ancien import CSV : un total sans phases ni score.
    { date: "2026-10-14", total: 400 },
    night("2026-09-01"),                                   // hors période
  ] };
  const p = periodOf("sem", new Date("2026-10-14T12:00:00"));
  const st = sleepStats(data, new Map(), p.start, p.end, p.buckets);
  assert.equal(st.n, 3);
  assert.equal(st.total, 433);                             // (420 + 480 + 400) / 3
  assert.equal(st.score, 80);                              // la nuit sans score ne compte pas
  assert.equal(st.scoreLabel, "Bon");
  // Profond + léger + paradoxal + non classé = le total, nuit par nuit.
  const ph = st.phases;
  assert.equal(ph.other, 133);                             // 400 de la nuit sans phases, / 3
  assert.ok(Math.abs(ph.deep + ph.light + ph.rem + ph.other - st.total) <= 1);
  // Mercredi : une seule nuit, sans phases ; dimanche : aucune.
  const wed = st.perBucket[2];
  assert.deepEqual([wed.n, wed.total, wed.deep, wed.other, wed.score], [1, 400, 0, 400, null]);
  assert.deepEqual([st.perBucket[6].n, st.perBucket[6].total], [0, null]);
});

test("sommeil : coucher et lever moyens, minuit compris", () => {
  assert.equal(averageClock(["23:30", "00:30"], { night: true }), "00:00");
  assert.equal(averageClock(["22:50", "23:10", "23:40"], { night: true }), "23:15");
  assert.equal(averageClock(["06:55", "07:20"]), "07:10");
  assert.equal(averageClock([null, "pas une heure"]), null);
  const data = { sleep: [night("2026-10-19", { start: "23:50" }), night("2026-10-20", { start: "00:20", end: "07:30" })] };
  const st = sleepStats(data, new Map(), "2026-10-19", "2026-10-20", bucketsFor("2026-10-19", "2026-10-20", "day"));
  assert.equal(st.bedtime, "00:05");
  assert.equal(st.wake, "07:15");
  assert.equal(st.need, 480);
});

test("sommeil : les paliers du score de Garmin", () => {
  assert.equal(sleepScoreLabel(95), "Excellent");
  assert.equal(sleepScoreLabel(80), "Bon");
  assert.equal(sleepScoreLabel(79), "Passable");
  assert.equal(sleepScoreLabel(42), "Mauvais");
  assert.equal(sleepScoreLabel(null), null);
});

test("sommeil : les nuits qui suivent une grosse journée, à part", () => {
  // Grosses journées (charge faite >= 7) les lundis, mardis et mercredis de
  // deux semaines ; la nuit datée du lendemain les suit.
  const big = [done({ chargePlanned: 8 })];
  const data = {
    weeks: {
      ...week("2026-10-05", [big, big, big, [done({ chargePlanned: 3 })]]),
      ...week("2026-10-12", [big, [missed({ chargePlanned: 9 })]]),
    },
    sleep: [
      night("2026-10-06", { total: 400 }), night("2026-10-07", { total: 390 }), night("2026-10-08", { total: 410 }),
      night("2026-10-13", { total: 400 }),
      night("2026-10-09", { total: 470 }), night("2026-10-10", { total: 460 }), night("2026-10-11", { total: 480 }),
      night("2026-10-14", { total: 470 }),                 // après une séance manquée : pas une grosse journée
    ],
  };
  const index = buildDayIndex(data);
  const st = sleepStats(data, index, "2026-10-01", "2026-10-31", bucketsFor("2026-10-01", "2026-10-31", "week"));
  assert.deepEqual(st.afterHard, { hardN: 4, hard: 400, otherN: 4, other: 470 });
  // Moins de trois nuits d'un côté : rien à conclure.
  const few = { ...data, sleep: data.sleep.slice(0, 5) };
  assert.equal(sleepStats(few, index, "2026-10-01", "2026-10-31", []).afterHard, null);
});

test("sommeil : aucune nuit sur la période", () => {
  const st = sleepStats({ sleep: [night("2026-01-01")] }, new Map(), "2026-10-19", "2026-10-25", bucketsFor("2026-10-19", "2026-10-25", "day"));
  assert.equal(st.n, 0);
  assert.equal(st.perBucket.length, 7);
  assert.equal(st.afterHard, null);
});

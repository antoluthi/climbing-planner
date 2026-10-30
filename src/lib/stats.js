// ─── STATS ───────────────────────────────────────────────────────────────────
// Tout ce que la page Stats calcule, sans rien dessiner : les périodes et leur
// découpage, la comparaison avec la période d'avant, ce qui est fait, manqué ou
// encore à venir, et les lectures de chaque section (charge par sport,
// répartition, ressenti, Hooper, poids, repas, course, habitudes).
//
// Pur et testé sous Node (`npm run test:stats`) : les dates sont des chaînes
// ISO, « aujourd'hui » est un paramètre, et rien ne lit l'horloge.

import { getMondayOf, addDays, localDateStr, isEventItem } from "./helpers.js";
import { getSessionCharge, normalizeCharge10 } from "./charge.js";
import { hooperLabel, isHooperFilled } from "./hooper.js";
import { isReminderActiveOn, isReminderCheckedOn } from "./reminders.js";
import { RUN_DISCIPLINES, goalForWeek } from "./run-goals.js";
import { disciplineList } from "./disciplines.js";
import { recomputeMesoDates, mesoLastDay } from "./cycles.js";

// ── Dates ────────────────────────────────────────────────────────────────────
// Midi plutôt que minuit : un changement d'heure ne fait alors jamais basculer
// une date sur la veille.
const parse = (iso) => new Date(iso + "T12:00:00");
const iso = (d) => localDateStr(d);
export const shiftISO = (s, n) => iso(addDays(parse(s), n));
const minISO = (a, b) => (a < b ? a : b);
const maxISO = (a, b) => (a > b ? a : b);
const daysIn = (start, end) => Math.round((parse(end) - parse(start)) / 86400000) + 1;

function* eachDay(start, end) {
  for (let d = start; d <= end; d = shiftISO(d, 1)) yield d;
}

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const dm = (s) => { const d = parse(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
const shortDate = (s) => parse(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

// ── Périodes ─────────────────────────────────────────────────────────────────
// Deux réglages indépendants : **quelle période** on regarde, et **comment on
// la découpe** (par jour, par semaine, par mois).
//
// La période est une « sélection » : un raccourci et sa date de référence, ou
// une plage libre (deux dates, choisies à la main ou prises sur un cycle).
//   { range: "4sem" | "sem" | "mois" | "an", ref: Date }
//   { range: "custom", start: "2026-08-12", end: "2026-10-20", label? }
//
// Les quatre dernières semaines s'ouvrent par défaut : la semaine en cours
// seule est presque vide un lundi. Ce sont des semaines du calendrier (lundi →
// dimanche), parce que le plan se construit en semaines : la semaine en cours
// y figure, avec ce qui reste à faire.
export const RANGES = [
  { value: "4sem", label: "4 sem." },
  { value: "sem", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "an", label: "Année" },
  { value: "custom", label: "Dates" },
];
export const DEFAULT_RANGE = "4sem";

export const GRAINS = [
  { value: "day", label: "jour" },
  { value: "week", label: "semaine" },
  { value: "month", label: "mois" },
];
// Au-delà de 100 points, un découpage est trop fin pour un téléphone (un an par
// jour, c'est 365 traits) : il n'est plus proposé. Trois mois par jour passent
// encore (92 au plus). Au-delà de 35, les graphes passent en vue simplifiée.
// Une plage libre fait cinq ans au plus.
export const MAX_POINTS = 100;
export const DENSE_POINTS = 35;
export const MAX_RANGE_DAYS = 1830;

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const rangeDays = (start, end) => daysIn(start, end);

function presetWindow(range, ref) {
  const r = new Date(ref); r.setHours(12, 0, 0, 0);
  if (range === "sem") {
    const monday = iso(getMondayOf(r));
    return { start: monday, end: shiftISO(monday, 6) };
  }
  if (range === "mois") {
    return { start: iso(new Date(r.getFullYear(), r.getMonth(), 1, 12)), end: iso(new Date(r.getFullYear(), r.getMonth() + 1, 0, 12)) };
  }
  if (range === "an") {
    return { start: `${r.getFullYear()}-01-01`, end: `${r.getFullYear()}-12-31` };
  }
  // "4sem" : la semaine de la date de référence et les trois d'avant.
  const lastMonday = iso(getMondayOf(r));
  return { start: shiftISO(lastMonday, -21), end: shiftISO(lastMonday, 6) };
}

export function windowOf(sel) {
  if (sel?.range === "custom") return { start: sel.start, end: sel.end };
  return presetWindow(sel?.range, sel?.ref);
}

// Le découpage qui va de soi pour une longueur donnée : par jour jusqu'à deux
// semaines, par semaine jusqu'à environ quatre mois, par mois au-delà. Les
// raccourcis y retrouvent leur découpage d'avant (semaine par jour, quatre
// semaines et mois par semaine, année par mois).
export function autoGrain(start, end) {
  const n = daysIn(start, end);
  return n <= 14 ? "day" : n <= 120 ? "week" : "month";
}

// Combien de tranches un découpage donnerait, sans les construire.
export function pointsFor(start, end, grain) {
  if (grain === "day") return daysIn(start, end);
  if (grain === "week") {
    const a = parse(iso(getMondayOf(parse(start))));
    const b = parse(iso(getMondayOf(parse(end))));
    return Math.round((b - a) / (7 * 86400000)) + 1;
  }
  const a = parse(start), b = parse(end);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

export const grainAllowed = (start, end, grain) => pointsFor(start, end, grain) <= MAX_POINTS;

// Le découpage effectif : celui qu'on a demandé s'il tient, sinon celui qui va
// de soi. Une plage allongée ne garde donc pas un « par jour » devenu illisible.
export function resolveGrain(sel, wanted) {
  const { start, end } = windowOf(sel);
  return wanted && grainAllowed(start, end, wanted) ? wanted : autoGrain(start, end);
}

// Les tranches d'une plage. Chacune porte son genre (`day`, `week`, `month`)
// et dit si elle est entière : les tranches du bord s'arrêtent à la plage (le
// 29 septembre ne compte pas dans octobre), et un objectif de kilomètres
// hebdomadaire n'a de sens que sur une semaine complète.
export function bucketsFor(start, end, grain) {
  if (grain === "day") {
    // Jusqu'à une semaine, les jours se nomment ; au-delà, ils se datent.
    const named = daysIn(start, end) <= 7;
    return [...eachDay(start, end)].map(d => ({
      kind: "day", label: named ? DAY_NAMES[(parse(d).getDay() + 6) % 7] : dm(d), start: d, end: d, full: true,
    }));
  }
  if (grain === "week") {
    const out = [];
    for (let monday = iso(getMondayOf(parse(start))); monday <= end; monday = shiftISO(monday, 7)) {
      const s = maxISO(monday, start);
      const e = minISO(shiftISO(monday, 6), end);
      out.push({ kind: "week", label: dm(s), start: s, end: e, monday, full: s === monday && e === shiftISO(monday, 6) });
    }
    return out;
  }
  const out = [];
  const a = parse(start), b = parse(end);
  // Sur plusieurs années, janvier (et le premier mois) porte son année :
  // deux « janv » côte à côte ne se distinguent pas.
  const multiYear = a.getFullYear() !== b.getFullYear();
  let y = a.getFullYear(), m = a.getMonth();
  while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
    const first = iso(new Date(y, m, 1, 12));
    const last = iso(new Date(y, m + 1, 0, 12));
    const s = maxISO(first, start);
    const e = minISO(last, end);
    let label = new Date(y, m, 1, 12).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    if (multiYear && (m === 0 || out.length === 0)) label += ` ${String(y).slice(2)}`;
    out.push({ kind: "month", label, start: s, end: e, full: s === first && e === last });
    if (m === 11) { y++; m = 0; } else m++;
  }
  return out;
}

// La fenêtre d'un raccourci et son découpage habituel.
export function periodOf(range, ref) {
  const { start, end } = presetWindow(range, ref);
  return { range, start, end, buckets: bucketsFor(start, end, autoGrain(start, end)) };
}

// Période d'avant ou d'après, depuis une date de référence.
export function stepRef(range, ref, dir) {
  const r = new Date(ref); r.setHours(12, 0, 0, 0);
  if (range === "sem") return addDays(r, 7 * dir);
  if (range === "mois") return new Date(r.getFullYear(), r.getMonth() + dir, 1, 12);
  if (range === "an") return new Date(r.getFullYear() + dir, 0, 1, 12);
  return addDays(r, 28 * dir);
}

// Les flèches : un raccourci passe au précédent ; une plage libre recule de sa
// propre longueur (70 jours en arrière pour une plage de 70 jours). Elle cesse
// alors d'être « un cycle » : son nom ne la suit pas.
export function stepSelection(sel, dir) {
  if (sel?.range !== "custom") return { ...sel, ref: stepRef(sel.range, sel.ref, dir) };
  const n = daysIn(sel.start, sel.end);
  return { range: "custom", start: shiftISO(sel.start, n * dir), end: shiftISO(sel.end, n * dir) };
}

export function isCurrentPeriod(range, ref, todayISO) {
  const p = presetWindow(range, ref);
  return p.start <= todayISO && todayISO <= p.end;
}

export function selectionIsCurrent(sel, todayISO) {
  const { start, end } = windowOf(sel);
  return start <= todayISO && todayISO <= end;
}

// Le libellé de la période, sous la même forme que le calendrier.
export function periodLabel(range, ref) {
  const p = presetWindow(range, ref);
  if (range === "mois") {
    const s = parse(p.start).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (range === "an") return String(parse(p.start).getFullYear());
  return `${shortDate(p.start)} – ${shortDate(p.end)}`;
}

// Une plage libre dit son année quand ce n'est pas celle d'aujourd'hui, et
// les deux quand elle en chevauche deux.
export function rangeLabel(start, end, todayISO) {
  const ya = parse(start).getFullYear(), yb = parse(end).getFullYear();
  const yt = parse(todayISO).getFullYear();
  const f = (d, withYear) => parse(d).toLocaleDateString("fr-FR",
    withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  if (start === end) return f(start, ya !== yt);
  if (ya !== yb) return `${f(start, true)} – ${f(end, true)}`;
  return `${f(start, false)} – ${f(end, ya !== yt)}`;
}

export function selectionLabel(sel, todayISO) {
  return sel?.range === "custom" ? rangeLabel(sel.start, sel.end, todayISO) : periodLabel(sel.range, sel.ref);
}

export function currentPeriodLabel(range) {
  return { "4sem": "4 dernières semaines", sem: "Semaine en cours", mois: "Mois en cours", an: "Année en cours" }[range] || "";
}

// Sous le libellé d'une plage libre : sa longueur, et son nom si elle vient
// d'un cycle (« Force · 28 jours »).
export function selectionCaption(sel) {
  if (sel?.range !== "custom") return "";
  const n = daysIn(sel.start, sel.end);
  const len = `${n} ${n > 1 ? "jours" : "jour"}`;
  return sel.label ? `${sel.label} · ${len}` : len;
}

// Ce à quoi on se compare, pour la phrase sous le résumé.
export function previousPeriodPhrase(range) {
  return { "4sem": "aux 4 semaines d'avant", sem: "à la semaine d'avant", mois: "au mois d'avant", an: "à l'année d'avant" }[range] || "";
}

export function previousPhrase(sel) {
  if (sel?.range !== "custom") return previousPeriodPhrase(sel?.range);
  const n = daysIn(sel.start, sel.end);
  return n === 1 ? "à la veille" : `aux ${n} jours d'avant`;
}

// La comparaison se fait **à date** : un mardi, la semaine en cours n'a que
// deux jours, et la comparer à toute la semaine d'avant la donnerait toujours
// en baisse. On prend donc autant de jours de la période d'avant qu'il s'en est
// écoulé dans celle-ci. Une période entièrement à venir n'a rien à comparer.
export function comparisonWindows(range, ref, todayISO) {
  const p = presetWindow(range, ref);
  if (p.start > todayISO) return null;
  const curEnd = minISO(p.end, todayISO);
  const elapsed = daysIn(p.start, curEnd);
  const prev = presetWindow(range, stepRef(range, ref, -1));
  const prevEnd = minISO(shiftISO(prev.start, elapsed - 1), prev.end);
  return {
    cur: { start: p.start, end: curEnd },
    prev: { start: prev.start, end: prevEnd },
    partial: curEnd < p.end,
  };
}

// Pour une plage libre, la période d'avant est la même longueur juste avant
// elle, comparée à date elle aussi (un cycle en cours contre le début de la
// plage d'avant).
export function comparisonFor(sel, todayISO) {
  if (sel?.range !== "custom") return comparisonWindows(sel?.range, sel?.ref, todayISO);
  const { start, end } = sel;
  if (start > todayISO) return null;
  const curEnd = minISO(end, todayISO);
  const prevStart = shiftISO(start, -daysIn(start, end));
  return {
    cur: { start, end: curEnd },
    prev: { start: prevStart, end: shiftISO(prevStart, daysIn(start, curEnd) - 1) },
    partial: curEnd < end,
  };
}

// ── Choisir une plage ────────────────────────────────────────────────────────
// Les raccourcis de la feuille « Période à analyser », tous terminés
// aujourd'hui. « 3 derniers mois » le 20 octobre part du 21 juillet : trois
// mois pile, aujourd'hui compris.
export function quickRanges(todayISO) {
  const t = parse(todayISO);
  const monthsBack = (n) => {
    const d = new Date(t.getFullYear(), t.getMonth() - n, 1, 12);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
    d.setDate(Math.min(t.getDate(), lastDay));
    return shiftISO(iso(d), 1);
  };
  return [
    { key: "30d", label: "30 derniers jours", start: shiftISO(todayISO, -29), end: todayISO },
    { key: "3m", label: "3 derniers mois", start: monthsBack(3), end: todayISO },
    { key: "6m", label: "6 derniers mois", start: monthsBack(6), end: todayISO },
    { key: "12m", label: "12 derniers mois", start: monthsBack(12), end: todayISO },
    { key: "ytd", label: "Depuis le 1er janvier", start: `${t.getFullYear()}-01-01`, end: todayISO },
  ];
}

// Les mésocycles du plan comme plages : analyser un bloc entier d'une touche.
// Mêmes dates que l'éditeur et le calendrier (`recomputeMesoDates`), le plus
// récent d'abord.
export function cycleRanges(mesocycles, todayISO) {
  return recomputeMesoDates(mesocycles || [])
    .filter(m => m?.startDate)
    .map(m => {
      const start = m.startDate;
      const end = iso(mesoLastDay(m));
      return {
        id: m.id, label: m.label || "Cycle", color: m.color || null, start, end,
        status: todayISO < start ? "future" : todayISO > end ? "past" : "current",
      };
    })
    .sort((a, b) => b.start.localeCompare(a.start));
}

// Ce qui ne va pas dans deux dates saisies à la main, ou null.
export function rangeError(start, end) {
  if (!start || !end) return "Choisis une date de début et une date de fin.";
  if (end < start) return "La fin est avant le début.";
  if (daysIn(start, end) > MAX_RANGE_DAYS) return "Cinq ans au plus.";
  return null;
}

// Une étiquette sur combien : toutes jusqu'à 12 tranches, puis une huitaine
// réparties sur l'axe.
export const tickInterval = (n) => (n <= 12 ? 0 : Math.ceil(n / 8) - 1);

// ── Les séances d'un jour ────────────────────────────────────────────────────
// Un index par date, construit une fois : chaque lecture de la page ne
// parcourt ensuite que les jours qu'elle couvre. Une échéance de plusieurs
// jours figure sur chacun d'eux, comme dans le calendrier (`getDaySessions`).
// Quand un sport est isolé, les échéances sortent : elles n'ont pas de sport.
export function buildDayIndex(data, { includeEvents = true } = {}) {
  const map = new Map();
  const slot = (d) => {
    let e = map.get(d);
    if (!e) { e = { sessions: [], events: [] }; map.set(d, e); }
    return e;
  };
  for (const [key, days] of Object.entries(data?.weeks || {})) {
    const monday = parse(key);
    if (Number.isNaN(monday.getTime())) continue;
    (days || []).forEach((list, i) => {
      const d = iso(addDays(monday, i));
      for (const s of list || []) {
        if (!s) continue;
        if (isEventItem(s)) { if (includeEvents) slot(d).events.push(s); }
        else slot(d).sessions.push(s);
      }
    });
  }
  if (includeEvents) {
    for (const e of data?.quickSessions || []) {
      if (!e?.startDate) continue;
      const end = e.endDate && e.endDate > e.startDate ? e.endDate : e.startDate;
      let n = 0;
      for (const d of eachDay(e.startDate, end)) {
        slot(d).events.push(e);
        if (++n >= 366) break;   // une date de fin aberrante ne doit pas tout figer
      }
    }
  }
  return map;
}

// Où en est une séance. « Manquée » suit exactement `getSessionCharge` : une
// séance qui y vaut 0 ne doit pas se compter ailleurs comme à faire. Un
// ressenti neutre (statut retiré, notes gardées) n'est ni fait ni manqué.
export function sessionState(s, dateISO, todayISO) {
  const fb = s?.feedback;
  if (fb?.done === true) return "done";
  if (fb && (fb.status === "not_done" || (fb.status == null && fb.done === false))) return "missed";
  return dateISO < todayISO ? "unrated" : "planned";
}

export const sportOf = (s) => s?.discipline || "climbing";

// Une séance liée à une activité Garmin (`s.garmin`) compte ce qui a été fait,
// pas ce qui était prévu : la durée et les kilomètres enregistrés par la montre.
export function sessionMinutes(s) {
  const m = Number(s?.garmin?.durationMin ?? s?.metrics?.durationMin ?? s?.estimatedTime);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

export function runKm(s) {
  if (!RUN_DISCIPLINES.includes(s?.discipline)) return 0;
  const km = Number(s?.garmin?.distanceKm ?? s?.metrics?.distanceKm);
  return Number.isFinite(km) && km > 0 ? km : 0;
}

// Les jours d'une plage qui ont quelque chose.
function* entries(index, start, end) {
  for (const d of eachDay(start, end)) {
    const e = index.get(d);
    if (e) yield [d, e];
  }
}

// ── Résumé ───────────────────────────────────────────────────────────────────
// « Fait » veut dire noté fait (ou adapté). Une séance passée qui n'a pas été
// notée n'est comptée ni comme faite ni comme manquée : elle est « non notée »,
// et le résumé le dit. Une échéance passée a eu lieu : sa charge compte, mais
// ce n'est pas une séance (ni dans le nombre, ni dans le temps).
export function summarize(index, start, end, todayISO) {
  const out = { done: 0, missed: 0, unrated: 0, planned: 0, minutes: 0, charge: 0, km: 0 };
  if (!start || !end || start > end) return { ...out, due: 0 };
  for (const [d, e] of entries(index, start, end)) {
    for (const s of e.sessions) {
      const st = sessionState(s, d, todayISO);
      out[st]++;
      if (st === "done") {
        out.minutes += sessionMinutes(s);
        out.charge += getSessionCharge(s);
        out.km += runKm(s);
      }
    }
    if (d <= todayISO) for (const ev of e.events) out.charge += getSessionCharge(ev);
  }
  out.charge = round1(out.charge);
  out.km = round1(out.km);
  return { ...out, due: out.done + out.missed + out.unrated };
}

// Variation d'une période à l'autre. Pas de pourcentage depuis zéro : « +∞ % »
// ne dit rien, et « nouveau » se lit mieux dans la carte.
export function delta(cur, prev) {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? { pct: 0, diff: 0 } : { pct: null, diff: cur };
  return { pct: Math.round(((cur - prev) / prev) * 100), diff: round1(cur - prev) };
}

// ── Charge, tranche par tranche ──────────────────────────────────────────────
// Deux couches par sport : ce qui est fait (plein) et ce qui reste (prévu, ou
// passé sans être noté). Le total d'une barre est donc celui du calendrier, et
// la partie pleine ce qui est confirmé. Une séance manquée vaut 0.
export const EVENT_KEY = "event";

export function chargeSeries(index, buckets, todayISO) {
  return buckets.map(b => {
    const row = { label: b.label, start: b.start, end: b.end, kind: b.kind, done: 0, open: 0 };
    const add = (key, value, done) => {
      if (!value) return;
      const k = (done ? "d_" : "o_") + key;
      row[k] = round1((row[k] || 0) + value);
      if (done) row.done = round1(row.done + value);
      else row.open = round1(row.open + value);
    };
    for (const [d, e] of entries(index, b.start, b.end)) {
      for (const s of e.sessions) {
        const st = sessionState(s, d, todayISO);
        if (st === "missed") continue;
        add(sportOf(s), getSessionCharge(s), st === "done");
      }
      for (const ev of e.events) add(EVENT_KEY, getSessionCharge(ev), d <= todayISO);
    }
    return row;
  });
}

// Les séries à empiler, dans l'ordre des disciplines de l'app, l'échéance en
// dernier. Seules celles qui ont une valeur quelque part dans la période.
export function stackKeys(rows) {
  const present = new Set();
  for (const r of rows) for (const k of Object.keys(r)) {
    if (k.startsWith("d_") || k.startsWith("o_")) present.add(k.slice(2));
  }
  const order = [...disciplineList().map(d => d.id), EVENT_KEY];
  return order.filter(k => present.has(k));
}

// Le repère : la charge faite moyenne par tranche sur la période d'avant.
// Rien à dire si elle était vide.
export function averageDone(rows) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.done, 0);
  return total > 0 ? round1(total / rows.length) : null;
}

// Le détail d'une tranche touchée sur le graphe : chaque séance (et échéance)
// avec son jour, son sport, son état et sa charge, dans l'ordre des jours.
export function itemsBetween(index, start, end, todayISO) {
  const out = [];
  for (const [d, e] of entries(index, start, end)) {
    for (const s of e.sessions) {
      out.push({ date: d, name: s.name || s.title || "Séance", sport: sportOf(s), state: sessionState(s, d, todayISO), charge: getSessionCharge(s) });
    }
    for (const ev of e.events) {
      out.push({ date: d, name: ev.name || ev.title || "Échéance", sport: EVENT_KEY, state: d <= todayISO ? "done" : "planned", charge: getSessionCharge(ev), event: true });
    }
  }
  return out;
}

// ── Répartition par sport ────────────────────────────────────────────────────
// Sur ce qui est fait : temps, nombre de séances, charge. La part se lit sur le
// temps, sinon (aucune durée saisie) sur le nombre de séances.
export function sportBreakdown(index, start, end, todayISO) {
  const per = new Map();
  if (start <= end) {
    for (const [d, e] of entries(index, start, end)) {
      for (const s of e.sessions) {
        if (sessionState(s, d, todayISO) !== "done") continue;
        const k = sportOf(s);
        const p = per.get(k) || { sport: k, minutes: 0, count: 0, charge: 0 };
        p.minutes += sessionMinutes(s);
        p.count += 1;
        p.charge += getSessionCharge(s);
        per.set(k, p);
      }
    }
  }
  const rows = [...per.values()];
  const totalMin = rows.reduce((s, r) => s + r.minutes, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const byTime = totalMin > 0;
  for (const r of rows) {
    r.charge = round1(r.charge);
    r.share = byTime ? r.minutes / totalMin : (totalCount ? r.count / totalCount : 0);
  }
  rows.sort((a, b) => b.share - a.share || b.count - a.count);
  return { rows, byTime, totalMin, totalCount };
}

// ── Ressenti face au plan ────────────────────────────────────────────────────
// L'écart d'une séance : ressenti − prévu. Les moyennes sont pondérées par les
// séances : une semaine d'une seule séance ne pèse pas autant qu'une semaine
// de cinq.
function plannedOf(s) {
  const p = s?.chargePlanned ?? s?.charge;
  return p == null ? null : normalizeCharge10(p);
}

export function feelStats(index, start, end, buckets, todayISO) {
  const all = { dev: [], q: [] };
  const per = new Map();
  const perBucket = buckets.map(b => ({ label: b.label, start: b.start, end: b.end, devs: [] }));
  if (start <= end) {
    for (const [d, e] of entries(index, start, end)) {
      for (const s of e.sessions) {
        if (sessionState(s, d, todayISO) !== "done") continue;
        const k = sportOf(s);
        const p = per.get(k) || { sport: k, dev: [], q: [] };
        const planned = plannedOf(s);
        if (s.feedback?.rpe != null && planned != null) {
          const dev = normalizeCharge10(s.feedback.rpe) - planned;
          all.dev.push(dev); p.dev.push(dev);
          const b = perBucket.find(x => x.start <= d && d <= x.end);
          if (b) b.devs.push(dev);
        }
        const q = Number(s.feedback?.quality);
        if (Number.isFinite(q) && q > 0) { all.q.push(q); p.q.push(q); }
        per.set(k, p);
      }
    }
  }
  const pack = (devs, qs) => ({
    dev: devs.length ? round1(avg(devs)) : null, nDev: devs.length,
    quality: qs.length ? round1(avg(qs)) : null, nQuality: qs.length,
  });
  const perSport = [...per.values()]
    .map(p => ({ sport: p.sport, ...pack(p.dev, p.q) }))
    .filter(p => p.nDev || p.nQuality)
    .sort((a, b) => (b.nDev + b.nQuality) - (a.nDev + a.nQuality));
  return {
    ...pack(all.dev, all.q),
    perSport,
    perBucket: perBucket.map(b => ({ label: b.label, dev: b.devs.length ? round1(avg(b.devs)) : null, n: b.devs.length })),
  };
}

// Ce que l'écart veut dire, en mots. Moins d'un demi-point : bien estimé.
export function deviationVerdict(dev) {
  if (dev == null) return null;
  if (Math.abs(dev) < 0.5) return "bien estimées";
  return dev > 0 ? "plus dures que prévu" : "plus faciles que prévu";
}

// ── Hooper ───────────────────────────────────────────────────────────────────
// La même échelle que le journal (`lib/hooper.js`) : 14 se lit « Bien
// récupéré » ici comme là-bas. Et ce qui pèse le plus : le critère dont la
// moyenne est la plus haute (1 = le meilleur, 7 = le pire).
export const HOOPER_CRITERIA = [
  { key: "sleep", label: "Sommeil" },
  { key: "fatigue", label: "Fatigue" },
  { key: "stress", label: "Stress" },
  { key: "soreness", label: "Courbatures" },
];

function hooperTotal(h) {
  if (h?.total != null && Number.isFinite(Number(h.total))) return Number(h.total);
  const vals = HOOPER_CRITERIA.map(c => Number(h?.[c.key]));
  return vals.every(Number.isFinite) ? vals.reduce((a, b) => a + b, 0) : null;
}

export function hooperStats(data, start, end, buckets) {
  const rows = (data?.hooper || []).filter(h => h?.date && h.date >= start && h.date <= end);
  const totals = rows.map(h => ({ date: h.date, total: hooperTotal(h) })).filter(x => x.total != null);
  const criteria = HOOPER_CRITERIA.map(c => {
    const vals = rows.map(h => Number(h[c.key])).filter(Number.isFinite);
    return { ...c, avg: vals.length ? round1(avg(vals)) : null };
  });
  const ranked = criteria.filter(c => c.avg != null).sort((a, b) => b.avg - a.avg);
  const mean = totals.length ? round1(avg(totals.map(x => x.total))) : null;
  return {
    n: totals.length,
    avg: mean,
    label: mean == null ? null : hooperLabel(Math.round(mean)),
    criteria,
    dominant: ranked[0] || null,
    perBucket: buckets.map(b => {
      const vals = totals.filter(x => x.date >= b.start && x.date <= b.end).map(x => x.total);
      const m = avg(vals);
      return { label: b.label, start: b.start, end: b.end, total: m == null ? null : Math.round(m), n: vals.length };
    }),
  };
}

// ── Sommeil ──────────────────────────────────────────────────────────────────
// Les nuits de `data.sleep` (Garmin, ou l'ancien import CSV), datées du jour
// du réveil, durées en minutes. Chaque nuit se décompose en profond, léger,
// paradoxal et « non classé » (ce que la montre n'a pas su ranger, ou une nuit
// sans phases), dont la somme fait le sommeil total ; l'éveil s'y ajoute. Les
// moyennes se font par nuit enregistrée : une semaine de trois nuits n'est pas
// une semaine de sept nuits courtes.
export const SLEEP_PHASES = ["deep", "light", "rem", "other", "awake"];
// Une « grosse journée » : charge faite d'au moins 7 sur l'échelle 0-10, le
// seuil de « soutenu » (`getChargeColor`).
export const HARD_DAY_CHARGE = 7;

const nightMinutes = (n) => {
  const v = (k) => { const x = Number(n?.[k]); return Number.isFinite(x) && x > 0 ? x : 0; };
  const total = v("total");
  const deep = v("deep"), light = v("light"), rem = v("rem");
  return { total, deep, light, rem, other: Math.max(0, total - deep - light - rem), awake: v("awake") };
};

// Moyenne des heures « 23:14 » / « 00:41 » : une heure du matin compte comme
// la suite de la veille, sinon 23 h et 1 h donneraient midi. Arrondie à 5 min,
// on dit « vers 23 h 10 ».
export function averageClock(times, { night = false } = {}) {
  const mins = times
    .map(t => (typeof t === "string" ? /^(\d{1,2}):(\d{2})$/.exec(t) : null))
    .filter(Boolean)
    .map(m => {
      const v = Number(m[1]) * 60 + Number(m[2]);
      return night && v < 12 * 60 ? v + 24 * 60 : v;
    });
  if (!mins.length) return null;
  const v = (Math.round(avg(mins) / 5) * 5) % (24 * 60);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

// Le score de Garmin en toutes lettres, avec ses paliers.
export function sleepScoreLabel(score) {
  if (score == null) return null;
  return score >= 90 ? "Excellent" : score >= 80 ? "Bon" : score >= 60 ? "Passable" : "Mauvais";
}

// La charge faite d'un jour : séances notées faites, et échéances (une
// échéance passée a eu lieu, comme dans le résumé).
function doneCharge(index, dateISO) {
  const e = index?.get(dateISO);
  if (!e) return 0;
  let sum = 0;
  for (const s of e.sessions) if (s?.feedback?.done === true) sum += getSessionCharge(s);
  for (const ev of e.events) sum += getSessionCharge(ev);
  return sum;
}

export function sleepStats(data, index, start, end, buckets) {
  const nights = (data?.sleep || [])
    .filter(n => n?.date && n.date >= start && n.date <= end && Number(n.total) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const mean = (list, k) => (list.length ? Math.round(avg(list.map(x => x[k]))) : null);
  const decomposed = nights.map(nightMinutes);
  const scoreOf = (list) => {
    const v = list.map(n => Number(n.score)).filter(x => Number.isFinite(x) && x > 0);
    return v.length ? Math.round(avg(v)) : null;
  };

  const perBucket = buckets.map(b => {
    const inB = nights.filter(n => n.date >= b.start && n.date <= b.end);
    const parts = inB.map(nightMinutes);
    const row = { label: b.label, start: b.start, end: b.end, kind: b.kind, full: b.full, n: inB.length, score: scoreOf(inB) };
    row.total = mean(parts, "total");
    for (const k of SLEEP_PHASES) row[k] = mean(parts, k);
    return row;
  });
  if (!nights.length) return { n: 0, perBucket, afterHard: null };

  const phases = {};
  for (const k of SLEEP_PHASES) phases[k] = mean(decomposed, k);
  const needs = nights.map(n => Number(n.need)).filter(x => Number.isFinite(x) && x > 0);
  const score = scoreOf(nights);

  // La nuit datée du 12 suit la journée du 11.
  const after = { hard: [], other: [] };
  nights.forEach((n, i) => {
    const day = iso(addDays(parse(n.date), -1));
    (doneCharge(index, day) >= HARD_DAY_CHARGE ? after.hard : after.other).push(decomposed[i].total);
  });
  const afterHard = after.hard.length >= 3 && after.other.length >= 3
    ? { hardN: after.hard.length, hard: Math.round(avg(after.hard)), otherN: after.other.length, other: Math.round(avg(after.other)) }
    : null;

  return {
    n: nights.length,
    total: mean(decomposed, "total"),
    phases,
    score,
    scoreLabel: sleepScoreLabel(score),
    need: needs.length ? Math.round(avg(needs)) : null,
    bedtime: averageClock(nights.map(n => n.start), { night: true }),
    wake: averageClock(nights.map(n => n.end)),
    afterHard,
    perBucket,
  };
}

// ── Récupération mesurée (Garmin) ────────────────────────────────────────────
// `data.recovery` : une journée par date (FC au repos, VFC de la nuit et sa
// zone habituelle, Body Battery, stress). Le Hooper dit ce qu'on ressent, ces
// valeurs ce que le corps mesure : les deux se lisent côte à côte.
export const RECOVERY_METRICS = ["hrv", "rhr", "bbMax", "stress"];
export const HRV_STATUS_LABEL = { BALANCED: "équilibrée", UNBALANCED: "déséquilibrée", LOW: "basse", POOR: "faible" };

// Les paliers du stress de Garmin (0 à 100).
export function stressLabel(v) {
  if (v == null) return null;
  return v <= 25 ? "repos" : v <= 50 ? "faible" : v <= 75 ? "moyen" : "élevé";
}

export function recoveryStats(data, start, end, buckets) {
  const rows = Object.entries(data?.recovery || {})
    .filter(([d, v]) => d >= start && d <= end && v && typeof v === "object")
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const avgOf = (list, k) => {
    const v = list.map(r => r[k]).filter(x => typeof x === "number" && Number.isFinite(x));
    return v.length ? Math.round(avg(v)) : null;
  };
  const metrics = Object.fromEntries(RECOVERY_METRICS.map(k => [k, avgOf(rows, k)]));
  const perBucket = buckets.map(b => {
    const inB = rows.filter(r => r.date >= b.start && r.date <= b.end);
    const row = { label: b.label, start: b.start, end: b.end, kind: b.kind, full: b.full, n: inB.length };
    for (const k of RECOVERY_METRICS) row[k] = avgOf(inB, k);
    return row;
  });

  // La VFC se lit contre la zone habituelle que Garmin calcule nuit après
  // nuit : la plus récente sert de repère au graphe, et chaque nuit se compare
  // à la sienne.
  const banded = rows.filter(r => r.hrv != null && r.hrvLow != null && r.hrvHigh != null);
  const last = banded.at(-1);
  // Les nuits sous la zone, d'affilée, jusqu'à la dernière mesurée.
  let lowStreak = 0;
  for (let i = banded.length - 1; i >= 0 && banded[i].hrv < banded[i].hrvLow; i--) lowStreak++;

  return {
    n: rows.length,
    metrics,
    perBucket,
    band: last ? { low: last.hrvLow, high: last.hrvHigh } : null,
    hrvNights: banded.length,
    inZone: banded.filter(r => r.hrv >= r.hrvLow && r.hrv <= r.hrvHigh).length,
    lowStreak,
    lastHrvDate: last?.date || null,
    lastStatus: [...rows].reverse().find(r => r.hrvStatus)?.hrvStatus || null,
  };
}

// ── Poids ────────────────────────────────────────────────────────────────────
// Un point par tranche (la moyenne des pesées), la dernière pesée et la
// variation depuis la première de la période. L'axe se gradue au demi-kilo :
// des graduations comme « 70,635 » ne se lisent pas.
export function weightStats(data, start, end, buckets) {
  const measures = Object.entries(data?.weight || {})
    .map(([date, v]) => ({ date, kg: Number(v) }))
    .filter(m => m.date >= start && m.date <= end && Number.isFinite(m.kg) && m.kg > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const perBucket = buckets.map(b => {
    const vals = measures.filter(m => m.date >= b.start && m.date <= b.end).map(m => m.kg);
    return { label: b.label, kg: vals.length ? round1(avg(vals)) : null };
  });
  if (!measures.length) return { n: 0, perBucket, last: null, first: null, delta: null, domain: null, ticks: [] };
  const kgs = measures.map(m => m.kg);
  const lo = Math.floor((Math.min(...kgs) - 0.3) * 2) / 2;
  const hi = Math.ceil((Math.max(...kgs) + 0.3) * 2) / 2;
  const span = hi - lo;
  const step = span <= 2 ? 0.5 : span <= 5 ? 1 : span <= 10 ? 2 : 5;
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(round1(t));
  const first = measures[0];
  const last = measures[measures.length - 1];
  return {
    n: measures.length, perBucket, first, last,
    delta: measures.length > 1 ? round1(last.kg - first.kg) : null,
    domain: [lo, hi], ticks,
  };
}

// ── Repas ────────────────────────────────────────────────────────────────────
// Moyennes par jour renseigné : un jour sans repas noté n'est pas un jour à
// zéro calorie.
export function nutritionStats(data, start, end, buckets) {
  const days = Object.entries(data?.nutrition || {})
    .filter(([date, meals]) => date >= start && date <= end && Array.isArray(meals) && meals.length)
    .map(([date, meals]) => ({
      date,
      cal: meals.reduce((a, m) => a + (Number(m?.calories) || 0), 0),
      prot: meals.reduce((a, m) => a + (Number(m?.proteins) || 0), 0),
    }));
  const mean = (list, key) => (list.length ? Math.round(avg(list.map(x => x[key]))) : null);
  return {
    days: days.length,
    cal: mean(days, "cal"),
    prot: mean(days, "prot"),
    perBucket: buckets.map(b => {
      const inB = days.filter(x => x.date >= b.start && x.date <= b.end);
      return { label: b.label, cal: mean(inB, "cal"), prot: mean(inB, "prot"), days: inB.length };
    }),
  };
}

// ── Course ───────────────────────────────────────────────────────────────────
// Les kilomètres courus (course et trail, comme l'objectif), faits et encore
// prévus. L'objectif de la semaine s'affiche sur les tranches qui sont des
// semaines entières ; sur la vue d'une semaine, c'est celui de cette semaine.
export function runStats(index, buckets, data, todayISO) {
  const goalsOn = !!data?.profile?.kmGoal;
  const blocks = data?.runBlocks || [];
  const goalOf = (mondayISO) => (goalsOn ? goalForWeek(blocks, parse(mondayISO))?.km ?? null : null);
  const rows = buckets.map(b => {
    let done = 0, open = 0;
    for (const [d, e] of entries(index, b.start, b.end)) {
      for (const s of e.sessions) {
        const km = runKm(s);
        if (!km) continue;
        const st = sessionState(s, d, todayISO);
        if (st === "done") done += km;
        else if (st !== "missed") open += km;
      }
    }
    const goal = b.kind === "week" && b.full ? goalOf(b.monday || b.start) : null;
    return { label: b.label, start: b.start, end: b.end, done: round1(done), open: round1(open), goal: goal == null ? null : round1(goal) };
  });
  // Objectifs tenus : sur les semaines terminées seulement.
  const judged = rows.filter(r => r.goal != null && r.end < todayISO);
  // L'objectif d'une semaine affichée jour par jour : seulement si la plage
  // est cette semaine-là, du lundi au dimanche. Sur trente jours par jour, il
  // n'y a pas « une » semaine à qui le rapporter.
  const oneWeek = buckets.length === 7 && buckets[0]?.kind === "day" && parse(buckets[0].start).getDay() === 1;
  const weekGoal = oneWeek ? goalOf(buckets[0].start) : null;
  return {
    rows,
    done: round1(rows.reduce((s, r) => s + r.done, 0)),
    open: round1(rows.reduce((s, r) => s + r.open, 0)),
    goalWeeks: judged.length,
    goalHit: judged.filter(r => r.done >= r.goal).length,
    weekGoal: weekGoal == null ? null : round1(weekGoal),
    goalsOn,
  };
}

// ── Habitudes ────────────────────────────────────────────────────────────────
// Pour chaque rappel, les jours où il était dû et ceux où il a été coché. La
// journée en cours ne compte que si c'est déjà fait : ce qui n'est pas encore
// coché n'est pas manqué (même règle que la heatmap). Un rappel supprimé reste
// compté jusqu'à sa suppression.
export function habitStats(data, start, end, todayISO) {
  const last = minISO(end, todayISO);
  const state = data?.reminderState || {};
  const reminders = [];
  if (start <= last) {
    for (const r of data?.reminders || []) {
      let due = 0, checked = 0;
      for (const d of eachDay(start, last)) {
        if (!isReminderActiveOn(r, parse(d))) continue;
        const ok = isReminderCheckedOn(state, r.id, d);
        if (d === todayISO && !ok) continue;
        due++;
        if (ok) checked++;
      }
      if (due) reminders.push({ id: r.id, name: r.name, color: r.color, deleted: !!r.deletedAt, due, checked, ratio: checked / due });
    }
  }
  // Le journal : un jour est noté quand le Hooper l'est. Une seule définition
  // pour toute l'app, celle de `isHooperFilled`. On compte à partir du premier
  // jour jamais noté : les mois d'avant l'app ne sont pas des oublis.
  const firstLog = (data?.hooper || []).reduce((m, h) => (h?.date && (!m || h.date < m) ? h.date : m), null);
  const from = firstLog ? maxISO(start, firstLog) : null;
  let filled = 0, total = 0;
  if (from && from <= last) {
    for (const d of eachDay(from, last)) {
      const ok = isHooperFilled(data, d);
      if (d === todayISO && !ok) continue;
      total++;
      if (ok) filled++;
    }
  }
  return { reminders, journal: { filled, total } };
}

// ── Écriture des nombres ─────────────────────────────────────────────────────
// À la française : virgule décimale, espace fine pour les milliers, vrai signe
// moins.
export function fmtNum(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const v = Number(n);
  const s = Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: digits });
  return v < 0 && s !== "0" ? "−" + s : s;
}

export function fmtSigned(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const s = fmtNum(n, digits);
  return Number(n) > 0 ? "+" + s : s;
}

export function fmtDuration(minutes) {
  const m = Math.round(Number(minutes) || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

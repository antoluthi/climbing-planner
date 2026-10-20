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
// Quatre lectures. Les quatre dernières semaines s'ouvrent par défaut : la
// semaine en cours seule est presque vide un lundi. Ce sont des semaines du
// calendrier (lundi → dimanche), parce que le plan se construit en semaines :
// la semaine en cours y figure, avec ce qui reste à faire.
export const RANGES = [
  { value: "4sem", label: "4 sem." },
  { value: "sem", label: "Semaine" },
  { value: "mois", label: "Mois" },
  { value: "an", label: "Année" },
];
export const DEFAULT_RANGE = "4sem";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// La fenêtre affichée et son découpage. Chaque tranche porte son genre
// (`day`, `week`, `month`) et, pour une semaine, si elle est entière : un
// objectif de kilomètres hebdomadaire n'a de sens que sur une semaine complète.
export function periodOf(range, ref) {
  const r = new Date(ref); r.setHours(12, 0, 0, 0);
  if (range === "sem") {
    const monday = getMondayOf(r);
    const buckets = DAY_NAMES.map((label, i) => {
      const d = iso(addDays(monday, i));
      return { kind: "day", label, start: d, end: d, full: true };
    });
    return { range, start: buckets[0].start, end: buckets[6].end, buckets };
  }
  if (range === "mois") {
    const first = iso(new Date(r.getFullYear(), r.getMonth(), 1, 12));
    const last = iso(new Date(r.getFullYear(), r.getMonth() + 1, 0, 12));
    const buckets = [];
    for (let monday = iso(getMondayOf(parse(first))); monday <= last; monday = shiftISO(monday, 7)) {
      // Les semaines du bord s'arrêtent au mois : le 29 septembre ne compte
      // pas dans octobre.
      const start = maxISO(monday, first);
      const end = minISO(shiftISO(monday, 6), last);
      buckets.push({ kind: "week", label: dm(start), start, end, monday, full: start === monday && end === shiftISO(monday, 6) });
    }
    return { range, start: first, end: last, buckets };
  }
  if (range === "an") {
    const y = r.getFullYear();
    const buckets = Array.from({ length: 12 }, (_, m) => {
      const first = new Date(y, m, 1, 12);
      return {
        kind: "month",
        label: first.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
        start: iso(first),
        end: iso(new Date(y, m + 1, 0, 12)),
        full: true,
      };
    });
    return { range, start: buckets[0].start, end: buckets[11].end, buckets };
  }
  // "4sem" : la semaine de la date de référence et les trois d'avant.
  const lastMonday = iso(getMondayOf(r));
  const buckets = [3, 2, 1, 0].map(k => {
    const monday = shiftISO(lastMonday, -7 * k);
    return { kind: "week", label: dm(monday), start: monday, end: shiftISO(monday, 6), monday, full: true };
  });
  return { range: "4sem", start: buckets[0].start, end: buckets[3].end, buckets };
}

// Période d'avant ou d'après, depuis une date de référence.
export function stepRef(range, ref, dir) {
  const r = new Date(ref); r.setHours(12, 0, 0, 0);
  if (range === "sem") return addDays(r, 7 * dir);
  if (range === "mois") return new Date(r.getFullYear(), r.getMonth() + dir, 1, 12);
  if (range === "an") return new Date(r.getFullYear() + dir, 0, 1, 12);
  return addDays(r, 28 * dir);
}

export function isCurrentPeriod(range, ref, todayISO) {
  const p = periodOf(range, ref);
  return p.start <= todayISO && todayISO <= p.end;
}

// Le libellé de la période, sous la même forme que le calendrier.
export function periodLabel(range, ref) {
  const p = periodOf(range, ref);
  if (range === "mois") {
    const s = parse(p.start).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (range === "an") return String(parse(p.start).getFullYear());
  return `${shortDate(p.start)} – ${shortDate(p.end)}`;
}

export function currentPeriodLabel(range) {
  return { "4sem": "4 dernières semaines", sem: "Semaine en cours", mois: "Mois en cours", an: "Année en cours" }[range] || "";
}

// Ce à quoi on se compare, pour la phrase sous le résumé.
export function previousPeriodPhrase(range) {
  return { "4sem": "aux 4 semaines d'avant", sem: "à la semaine d'avant", mois: "au mois d'avant", an: "à l'année d'avant" }[range] || "";
}

// La comparaison se fait **à date** : un mardi, la semaine en cours n'a que
// deux jours, et la comparer à toute la semaine d'avant la donnerait toujours
// en baisse. On prend donc autant de jours de la période d'avant qu'il s'en est
// écoulé dans celle-ci. Une période entièrement à venir n'a rien à comparer.
export function comparisonWindows(range, ref, todayISO) {
  const p = periodOf(range, ref);
  if (p.start > todayISO) return null;
  const curEnd = minISO(p.end, todayISO);
  const elapsed = daysIn(p.start, curEnd);
  const prev = periodOf(range, stepRef(range, ref, -1));
  const prevEnd = minISO(shiftISO(prev.start, elapsed - 1), prev.end);
  return {
    cur: { start: p.start, end: curEnd },
    prev: { start: prev.start, end: prevEnd },
    partial: curEnd < p.end,
  };
}

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

export function sessionMinutes(s) {
  const m = Number(s?.metrics?.durationMin ?? s?.estimatedTime);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

export function runKm(s) {
  if (!RUN_DISCIPLINES.includes(s?.discipline)) return 0;
  const km = Number(s?.metrics?.distanceKm);
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
  const weekGoal = buckets[0]?.kind === "day" ? goalOf(iso(getMondayOf(parse(buckets[0].start)))) : null;
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

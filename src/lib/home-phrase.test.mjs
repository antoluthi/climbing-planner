import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getMondayOf, weekKey, localDateStr, addDays } from "./helpers.js";
import { getGreeting, isRealTraining, buildPhraseContext, getContextualPhrase } from "./home-phrase.js";

// ─── Outils ──────────────────────────────────────────────────────────────────

let uid = 0;
const S = (name, discipline, charge, extra = {}) =>
  ({ id: `s${++uid}`, name, discipline, chargePlanned: charge, mode: "simple", ...extra });

// { "2026-09-30": [séances] } → un planning.
function plan(byDate, more = {}) {
  const weeks = {};
  for (const [iso, sessions] of Object.entries(byDate)) {
    const d = new Date(`${iso}T12:00:00`);
    const wk = weekKey(getMondayOf(d));
    weeks[wk] ??= Array.from({ length: 7 }, () => []);
    weeks[wk][(d.getDay() + 6) % 7] = sessions;
  }
  return { weeks, quickSessions: [], hooper: [], sleep: [], weight: {}, nutrition: {}, ...more };
}

const day = (iso) => new Date(`${iso}T12:00:00`);
const at = (iso, h, m = 0) => new Date(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
const ctxOf = (data, iso, h = 9, m = 0, mesoCtx = null) =>
  buildPhraseContext({ data, todayObj: day(iso), now: at(iso, h, m), mesoCtx });
const phraseOf = (...args) => getContextualPhrase(ctxOf(...args));

const REPRISE = /reprise|jours de repos|sans entraînement/i;

// ─── Le bug : « Reprise après deux jours off » au lendemain d'une grimpe ─────

test("grimpé hier : pas de reprise annoncée", () => {
  // Jeudi 1er octobre. Bloc la veille, à 5 de charge : la version d'avant
  // exigeait plus de 5 et comptait donc ce jour comme un jour off.
  const data = plan({
    "2026-09-28": [S("Voie", "climbing", 6)],
    "2026-09-30": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Voie", "climbing", 6, { startTime: "18:00" })],
  });
  const ctx = ctxOf(data, "2026-10-01");
  assert.equal(ctx.restDaysBefore, 0);
  assert.doesNotMatch(getContextualPhrase(ctx), REPRISE);
});

test("deux vrais jours sans séance : la reprise est annoncée", () => {
  const data = plan({
    "2026-09-28": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Voie", "climbing", 6, { startTime: "18:00" })],
  });
  const ctx = ctxOf(data, "2026-10-01");
  assert.equal(ctx.restDaysBefore, 2);
  assert.match(getContextualPhrase(ctx), /deux jours/i);
});

test("étirements seuls et séance manquée ne sont pas des entraînements", () => {
  const data = plan({
    "2026-09-27": [S("Bloc", "climbing", 5)],
    "2026-09-28": [S("Bloc", "climbing", 5, { feedback: { status: "not_done", done: false } })],
    "2026-09-29": [S("Étirements", "mobility", 2)],
    "2026-09-30": [S("Récup active", "climbing", 2)],
    "2026-10-01": [S("Voie", "climbing", 6)],
  });
  assert.equal(ctxOf(data, "2026-10-01").restDaysBefore, 3);
});

test("un footing compte, une séance faite aussi", () => {
  assert.equal(isRealTraining([S("Footing", "running", 3)]), true);
  assert.equal(isRealTraining([S("Bloc", "climbing", 4, { feedback: { status: "done", done: true, rpe: 4 } })]), true);
  assert.equal(isRealTraining([S("Yoga", "custom", 2)]), false);
  assert.equal(isRealTraining([]), false);
});

test("une compétition en échéance compte, une échéance quelconque non", () => {
  const ev = (name) => ({ id: "q", mode: "event", name, startDate: "2026-09-30", endDate: "2026-09-30", charge: 8 });
  const today = { "2026-10-01": [S("Voie", "climbing", 6)] };
  const comp = plan(today, { quickSessions: [ev("Compét régionale")] });
  assert.equal(ctxOf(comp, "2026-10-01").restDaysBefore, 0);
  const deadline = plan({ ...today, "2026-09-26": [S("Bloc", "climbing", 5)] }, { quickSessions: [ev("Rendu du dossier")] });
  assert.equal(ctxOf(deadline, "2026-10-01").restDaysBefore, 4);
});

test("sans rien de noté depuis deux semaines, on ne parle pas de reprise", () => {
  const data = plan({ "2026-10-01": [S("Voie", "climbing", 6)] });
  const ctx = ctxOf(data, "2026-10-01");
  assert.equal(ctx.restDaysBefore, null);
  assert.doesNotMatch(getContextualPhrase(ctx), REPRISE);
});

// ─── Ce qu'une séance est, d'après son nom ───────────────────────────────────

test("« Bloc » n'est pas de la force, « Lead » n'est pas une compétition", () => {
  const data = plan({
    "2026-09-30": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Bloc libre", "climbing", 5), S("Lead endurance", "climbing", 6)],
  });
  const ctx = ctxOf(data, "2026-10-01");
  assert.equal(ctx.hasForce, false);
  assert.equal(ctx.hasComp, false);
  assert.equal(ctx.hasGrimpe, true);
});

// ─── Le moment de la journée ─────────────────────────────────────────────────

test("après minuit, les séances du jour sont devant, pas derrière", () => {
  const data = plan({
    "2026-09-30": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Voie", "climbing", 6, { startTime: "18:00" })],
  });
  const p = phraseOf(data, "2026-10-01", 1);
  assert.match(p, /aujourd'hui/);
  assert.match(p, /dormir/);
  assert.doesNotMatch(p, /passée/);
});

test("une séance passée et pas notée appelle à la noter, pas un conseil", () => {
  const data = plan({
    "2026-09-30": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Footing", "running", 3, { startTime: "07:00", estimatedTime: 60 })],
  });
  assert.equal(phraseOf(data, "2026-10-01", 10), "Ta séance est passée. Pense à la noter.");
  // Commencée à 9 h 30 pour 1 h 30 : elle est encore en cours à 10 h.
  const running = plan({
    "2026-09-30": [S("Bloc", "climbing", 5)],
    "2026-10-01": [S("Footing", "running", 3, { startTime: "09:30", estimatedTime: 90 })],
  });
  assert.doesNotMatch(phraseOf(running, "2026-10-01", 10), /passée/);
  // Un jour sans séance n'a rien à noter : une liste vide n'est pas « finie ».
  const rest = plan({ "2026-09-30": [S("Bloc", "climbing", 5)] });
  assert.doesNotMatch(phraseOf(rest, "2026-10-01", 20), /noter/);
});

test("le dimanche, demain est la semaine suivante", () => {
  const data = plan({
    "2026-10-03": [S("Bloc", "climbing", 5)],
    "2026-10-04": [S("Voie", "climbing", 5)],
    "2026-10-05": [S("Force max", "climbing", 9)],
  });
  const ctx = ctxOf(data, "2026-10-04");
  assert.equal(ctx.tomorrowIsRest, false);
  assert.equal(ctx.tomorrowIsHeavy, true);
});

test("salutation selon l'heure", () => {
  assert.equal(getGreeting(2, "Anto"), "Il est tard, Anto");
  assert.equal(getGreeting(6, "Anto"), "Debout de bonne heure, Anto");
  assert.equal(getGreeting(9, "Anto"), "Bonjour, Anto");
  assert.equal(getGreeting(15, "Anto"), "Bonjour, Anto");
  assert.equal(getGreeting(19, "Anto"), "Bonsoir, Anto");
  assert.equal(getGreeting(23, "Anto"), "Il se fait tard, Anto");
  assert.equal(getGreeting(9, ""), "Bonjour");
});

// ─── La forme de toutes les phrases ──────────────────────────────────────────
// Des milliers de journées tirées au hasard (graine fixe : le tirage est le même
// à chaque exécution), et pour chacune les règles d'écriture de l'accueil.

const RULES = [
  [/[—–―]/, "tiret long"],
  [/!/, "point d'exclamation"],
  [/["“”]/, "guillemets"],
  [/\b(vous|votre|vos)\b/i, "vouvoiement"],
  [/\b(vraiment|exactement|parfaitement|absolument|crucial|optimale?s?|idéale?s?)\b/i, "insistance"],
  [/undefined|null|NaN|\[object/, "valeur manquante"],
  [/ {2}| [.,]|\.\./, "espace ou ponctuation en trop"],
];

function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

const TEMPLATES = [
  ["Bloc", "climbing", 5], ["Bloc libre", "climbing", 6], ["Voie continuité", "climbing", 7],
  ["Force max", "climbing", 9], ["Poutre force", "climbing", 8], ["Suspensions", "climbing", 6],
  ["Technique dalle", "climbing", 4], ["Endurance", "climbing", 6], ["Compét régionale", "climbing", 9],
  ["Footing", "running", 3], ["Sortie longue", "trail", 7], ["Vélo", "cycling", 5],
  ["Renfo gainage", "strength", 4], ["Étirements", "mobility", 2], ["Récup active", "climbing", 2],
  ["Mobilité hanches", "mobility", 1], ["Séance", "custom", 5],
];

function randomDay(r, iso) {
  const n = r() < 0.3 ? 0 : r() < 0.7 ? 1 : r() < 0.9 ? 2 : 3;
  return Array.from({ length: n }, () => {
    const [name, discipline, charge] = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
    const extra = {};
    if (r() < 0.8) extra.startTime = `${String(5 + Math.floor(r() * 17)).padStart(2, "0")}:${r() < 0.5 ? "00" : "30"}`;
    if (r() < 0.8) extra.estimatedTime = [20, 30, 45, 60, 90, 120, 180][Math.floor(r() * 7)];
    const f = r();
    if (f < 0.25) extra.feedback = { status: "done", done: true, rpe: Math.max(1, Math.min(10, charge + Math.round(r() * 4 - 2))) };
    else if (f < 0.35) extra.feedback = { status: "not_done", done: false };
    else if (f < 0.4) extra.feedback = { status: null, done: null, notes: "note" };
    if (r() < 0.2) extra.location = ["Arkose", "Buoux", "la salle"][Math.floor(r() * 3)];
    return S(name, discipline, charge, extra);
  }).map(s => ({ ...s, _iso: iso }));
}

test("toutes les phrases suivent les règles d'écriture", () => {
  const r = rng(20261002);
  const seen = new Set();
  for (let k = 0; k < 6000; k++) {
    const today = addDays(day("2026-09-07"), Math.floor(r() * 70));
    const iso = localDateStr(today);
    const byDate = {};
    for (let i = -8; i <= 1; i++) {
      const d = localDateStr(addDays(today, i));
      byDate[d] = randomDay(r, d);
    }
    const hooper = r() < 0.6 ? [{
      date: iso, fatigue: 1 + Math.floor(r() * 7), stress: 1 + Math.floor(r() * 7),
      soreness: 1 + Math.floor(r() * 7), sleep: 1 + Math.floor(r() * 7),
    }] : [];
    const sleep = r() < 0.4 ? [{ date: iso, duration: 5 + Math.round(r() * 9) / 2 }] : [];
    const weight = {};
    if (r() < 0.3) for (let i = 1; i <= 6; i++) weight[localDateStr(addDays(today, -i))] = 70 + (r() < 0.5 ? i * 0.3 : -i * 0.3);
    const quickSessions = r() < 0.15
      ? [{ id: "q1", mode: "event", name: r() < 0.5 ? "Compét régionale" : "Stage", startDate: iso, endDate: iso, charge: 7 }] : [];
    const mesoCtx = r() < 0.5 ? {
      meso: { label: "Force", startDate: localDateStr(addDays(today, -Math.floor(r() * 28))), durationWeeks: 4 },
      micro: { label: ["S1", "Décharge", "Intensité", "Volume"][Math.floor(r() * 4)] },
    } : null;
    const data = plan(byDate, { hooper, sleep, weight, quickSessions });
    const ctx = buildPhraseContext({ data, todayObj: today, now: at(iso, Math.floor(r() * 24), Math.floor(r() * 60)), mesoCtx });
    const phrase = getContextualPhrase(ctx);

    const where = `${iso} ${JSON.stringify(phrase)}`;
    assert.equal(typeof phrase, "string", where);
    assert.ok(phrase.length >= 8 && phrase.length <= 140, `longueur : ${where}`);
    assert.match(phrase, /^[A-ZÀ-Ý0-9]/, `majuscule : ${where}`);
    assert.match(phrase, /\.$/, `point final : ${where}`);
    for (const [re, what] of RULES) assert.doesNotMatch(phrase, re, `${what} : ${where}`);
    seen.add(phrase);
  }
  // Le tirage doit balayer large, sinon ces vérifications ne prouvent rien.
  assert.ok(seen.size >= 120, `seulement ${seen.size} phrases différentes`);
});

test("aucun tiret long dans le module, commentaires compris", () => {
  const src = readFileSync(new URL("./home-phrase.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /[—–]/);
});

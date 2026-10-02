import { addDays, localDateStr, weekKey, getMondayOf, getDaySessions, isEventItem } from "./helpers.js";
import { getSessionCharge } from "./charge.js";

// ─── LA PHRASE D'ACCUEIL ─────────────────────────────────────────────────────
// Sous la salutation, une phrase dit où l'on en est : la séance du jour, la
// fatigue, le repos, ce qui arrive demain. Elle doit se lire comme le message
// de quelqu'un qui suit ton entraînement, pas comme un slogan. D'où quelques
// règles, que le test vérifie sur des milliers de journées tirées au hasard
// (`npm run test:phrase`) :
//   - tutoiement, une ou deux phrases courtes : un fait, et un conseil au plus ;
//   - ni tiret long, ni point d'exclamation, ni guillemets autour d'un nom ;
//   - pas de formules toutes faites ni d'adverbes d'insistance.
//
// Tout est pur : `buildPhraseContext` lit le planning, `getContextualPhrase`
// choisit la phrase. L'heure est un paramètre, pas une lecture de l'horloge,
// pour que les tests puissent la fixer.

// ── Salutation ───────────────────────────────────────────────────────────────

export function getGreeting(hour, firstName) {
  const n = firstName ? `, ${firstName}` : "";
  if (hour < 5) return `Il est tard${n}`;
  if (hour < 7) return `Debout de bonne heure${n}`;
  if (hour < 18) return `Bonjour${n}`;
  if (hour < 22) return `Bonsoir${n}`;
  return `Il se fait tard${n}`;
}

// ── Petits outils d'écriture ─────────────────────────────────────────────────

const WORDS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept",
               "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze"];
const inWords = (n) => WORDS[n] ?? String(n);
// « séance » est féminin : une séance, pas un séance.
const inWordsF = (n) => (n === 1 ? "une" : inWords(n));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const s_ = (n) => (n > 1 ? "s" : "");
const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);

// 45 → « 45 min », 75 → « 1 h 15 », 120 → « 2 h ».
function duration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
const hoursOfSleep = (h) => duration(h * 60);

const nameOf = (s) => (s?.title || s?.name || "").trim();
const lower = (s) => nameOf(s).toLowerCase();

const COMP = /compét|compet|contest|qualif|championnat/;
const SUSPENSION = /suspen|poutre|hangboard/;
const LIGHT = /étir|etir|stretch|mobil|yoga|souplesse|récup|recup|retour au calme/;

function isMissed(s) {
  const fb = s?.feedback;
  return !!fb && (fb.status === "not_done" || (fb.status == null && fb.done === false));
}
const isDone = (s) => !isMissed(s) && s?.feedback?.done === true;

// ── Un jour d'entraînement ───────────────────────────────────────────────────
// Un jour compte comme entraîné s'il porte au moins une vraie séance : pas
// manquée, et pas seulement de la mobilité ou des étirements. Une échéance
// n'est pas une séance, sauf une compétition.
//
// ⚠️ La version d'avant exigeait une charge du jour **supérieure à 5**, un seuil
// pensé pour l'ancienne échelle (une séance y valait 20 à 40). Sur l'échelle
// 0-10, une séance de bloc à 5 n'était donc pas un entraînement, et l'accueil
// annonçait « Reprise après deux jours off » au lendemain d'une grimpe.
export function isRealTraining(sessions) {
  return (sessions || []).some(s => {
    if (!s) return false;
    if (isEventItem(s)) return COMP.test(lower(s));
    if (isMissed(s)) return false;
    if (s.discipline === "mobility") return false;
    if (LIGHT.test(lower(s)) && getSessionCharge(s) <= 3) return false;
    return true;
  });
}

// ── Le contexte d'une journée ────────────────────────────────────────────────

export function buildPhraseContext({ data, todayObj, mesoCtx = null, now = new Date() }) {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dow = todayObj.getDay();
  const today = localDateStr(todayObj);
  const wi = dow === 0 ? 6 : dow - 1;
  const weekArr = data.weeks?.[weekKey(getMondayOf(todayObj))] || Array.from({ length: 7 }, () => []);
  const todaySessions = (weekArr[wi] || []).filter(Boolean);
  const sessionsOn = (date) => getDaySessions(data, date);
  const chargeOf = (list) => list.reduce((sum, s) => sum + getSessionCharge(s), 0);

  // ── Moment de la journée ──
  const isMorning   = hour >= 5 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening   = hour >= 17 && hour < 22;
  const isNight     = hour >= 22 || hour < 5;

  // ── Séances du jour ──
  const sessionCount = todaySessions.length;
  const todayEvents = sessionsOn(todayObj).filter(isEventItem);
  const isRestDay = sessionCount === 0;
  const totalCharge = chargeOf(todaySessions);
  const chargeLevel = totalCharge === 0 ? "none"
    : totalCharge <= 3 ? "light"
    : totalCharge <= 6 ? "moderate"
    : totalCharge <= 9 ? "heavy"
    : "brutal";

  // Le type d'une séance se lit dans son nom, et dans sa discipline quand il y
  // en a une. « Bloc » n'est pas de la force, « Lead » n'est pas une compétition.
  const names = todaySessions.map(lower).join(" ");
  const hasSuspension = SUSPENSION.test(names);
  const hasForce    = /force|maximal|campus|dynami|puissan/.test(names);
  const hasEndur    = /endur|volume|vol\b|conti|capac|ae\b|fond\b/.test(names);
  const hasRecup    = /récup|recup|calme/.test(names);
  const hasTech     = /techni|dalle|travers|dégrav|mouv|précis/.test(names);
  const hasMobility = todaySessions.some(s => s.discipline === "mobility")
    || /mobil|étir|etir|yoga|stretch|souplesse/.test(names);
  const hasComp     = COMP.test(names) || todayEvents.some(e => COMP.test(lower(e)));
  const hasGrimpe   = /grimpe|bloc|voie|falaise|salle|escalade/.test(names)
    || todaySessions.some(s => s.discipline === "climbing" && !SUSPENSION.test(lower(s)));
  const isOnlyLight = !isRestDay && totalCharge <= 2 && (hasMobility || hasRecup)
    && !hasForce && !hasEndur && !hasComp;
  const isStretchingOnly = !isRestDay && hasMobility
    && !hasForce && !hasEndur && !hasGrimpe && !hasSuspension && !hasComp;

  // ── Horaires ──
  const sessionTimes = todaySessions
    .map(s => {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(s.startTime || ""));
      if (!m) return null;
      const h = Number(m[1]), mi = Number(m[2]);
      return { session: s, hour: h, totalMin: h * 60 + mi };
    })
    .filter(Boolean)
    .sort((a, b) => a.totalMin - b.totalMin);
  const firstSessionTime = sessionTimes[0] || null;
  const lastSessionTime = sessionTimes[sessionTimes.length - 1] || null;
  const hasEarlySession = !!firstSessionTime && firstSessionTime.hour < 8;
  const hasLateSession  = !!lastSessionTime && lastSessionTime.hour >= 20;
  const hasMorningSession   = sessionTimes.some(t => t.hour >= 6 && t.hour < 12);
  const hasAfternoonSession = sessionTimes.some(t => t.hour >= 12 && t.hour < 17);
  const hasEveningSession   = sessionTimes.some(t => t.hour >= 17);
  const hasSplitDay = hasMorningSession && (hasAfternoonSession || hasEveningSession) && sessionCount >= 2;

  const nowMin = hour * 60 + minute;
  const nextSession = sessionTimes.find(t => t.totalMin > nowMin) || null;
  const minutesToNext = nextSession ? nextSession.totalMin - nowMin : null;
  const nextSessionSoon     = minutesToNext !== null && minutesToNext <= 90;
  const nextSessionVerySoon = minutesToNext !== null && minutesToNext <= 30;
  const allSessionsPassed = sessionTimes.length > 0 && sessionTimes.every(t => t.totalMin < nowMin);
  // Terminées pour de bon : départ plus durée, 1 h 30 sans durée (la même règle
  // que la cloche). Une séance sans heure n'est jamais réputée finie.
  // ⚠️ Pas de séance, pas de séance finie : sans `sessionCount > 0`, un jour de
  // repos passait le test (toutes les séances d'une liste vide sont finies).
  const allSessionsOver = sessionCount > 0 && sessionTimes.length === sessionCount && sessionTimes.every(t =>
    t.totalMin + (parseInt(t.session.estimatedTime) || 90) <= nowMin);

  // ── Ce qui est noté ──
  const doneSessions    = todaySessions.filter(isDone);
  const missedSessions  = todaySessions.filter(isMissed);
  const pendingSessions = todaySessions.filter(s => !isDone(s) && !isMissed(s));
  const allDone   = sessionCount > 0 && doneSessions.length === sessionCount;
  const someDone  = doneSessions.length > 0 && doneSessions.length < sessionCount;
  const allMissed = sessionCount > 0 && missedSessions.length === sessionCount;
  const doneCharge = chargeOf(doneSessions);

  // ── Hooper du jour ──
  const hooperEntry = (data.hooper || []).find(h => h.date === today);
  const hComplete = !!hooperEntry
    && [hooperEntry.fatigue, hooperEntry.stress, hooperEntry.soreness, hooperEntry.sleep].every(v => v != null);
  const hTotal = hComplete
    ? hooperEntry.fatigue + hooperEntry.stress + hooperEntry.soreness + hooperEntry.sleep : null;
  const hFatigue  = hooperEntry?.fatigue ?? null;
  const hStress   = hooperEntry?.stress ?? null;
  const hSoreness = hooperEntry?.soreness ?? null;
  const hSleep    = hooperEntry?.sleep ?? null;
  const isWellRested   = hTotal !== null && hTotal <= 12;
  const isGoodShape    = hTotal !== null && hTotal <= 14;
  const isModFatigued  = hTotal !== null && hTotal > 14 && hTotal <= 17;
  const isVeryFatigued = hTotal !== null && hTotal > 17 && hTotal <= 20;
  const isOverreached  = hTotal !== null && hTotal > 20;
  const hasHighSoreness = hSoreness !== null && hSoreness >= 5;
  const hasHighStress   = hStress !== null && hStress >= 5;
  const hasPoorSleep    = hSleep !== null && hSleep >= 5;
  const isPhysicallyFine = hFatigue !== null && hSoreness !== null && hFatigue <= 3 && hSoreness <= 3;
  const isMentallyTired  = hasHighStress && isPhysicallyFine;
  const physicalHooper = hComplete ? hooperEntry.fatigue + hooperEntry.soreness : null;
  const mentalHooper   = hComplete ? hooperEntry.stress + hooperEntry.sleep : null;
  const isPhysBodyTired   = physicalHooper !== null && physicalHooper >= 9;
  const isMentalBodyTired = mentalHooper !== null && mentalHooper >= 9;
  // Ce qui pèse le plus, pour « surtout à cause du stress ».
  const dominantHooper = hComplete ? [
    { key: "fatigue",  val: hooperEntry.fatigue,  cause: "de la fatigue physique" },
    { key: "stress",   val: hooperEntry.stress,   cause: "du stress" },
    { key: "soreness", val: hooperEntry.soreness, cause: "des courbatures" },
    { key: "sleep",    val: hooperEntry.sleep,    cause: "d'une mauvaise nuit" },
  ].reduce((max, f) => (f.val > max.val ? f : max)) : null;

  // ── Hier, et les jours d'avant ──
  const yesterdaySessions = sessionsOn(addDays(todayObj, -1)).filter(s => !isEventItem(s));
  const yesterdayCharge = chargeOf(yesterdaySessions);
  // Jours sans vraie séance avant aujourd'hui, sur quatorze jours au plus. Rien
  // de noté dans cette fenêtre : on ne sait pas, et on ne dit rien (`null`),
  // plutôt que d'annoncer une reprise à quelqu'un qui commence l'app.
  let restDaysBefore = null;
  for (let i = 1; i <= 14; i++) {
    if (isRealTraining(sessionsOn(addDays(todayObj, -i)))) { restDaysBefore = i - 1; break; }
  }
  const todayIsRealTraining = isRealTraining(todaySessions);
  let consecutiveTrainingDays = todayIsRealTraining ? 1 : 0;
  if (todayIsRealTraining) {
    for (let i = 1; i <= 7; i++) {
      if (isRealTraining(sessionsOn(addDays(todayObj, -i)))) consecutiveTrainingDays++;
      else break;
    }
  }

  // ── La semaine ──
  const weekChargeSoFar = chargeOf(weekArr.slice(0, wi).flat().filter(Boolean));
  const weekChargeTotal = chargeOf(weekArr.flat().filter(Boolean));
  const sessionsDoneThisWeek = weekArr.slice(0, wi).flat().filter(s => s && isDone(s)).length;
  const weekChargeRemaining = Math.max(0, weekChargeTotal - weekChargeSoFar - totalCharge);
  const weekPastSessions = weekArr.slice(0, wi + 1).flat().filter(Boolean);
  const weekFeedbackRate = weekPastSessions.length > 0
    ? weekPastSessions.filter(isDone).length / weekPastSessions.length : null;
  const isFirstDayWithSession = !isRestDay && weekArr.slice(0, wi).every(d => !d || d.length === 0);
  const isLastDayWithSession  = !isRestDay && weekArr.slice(wi + 1).every(d => !d || d.length === 0);
  const isHeavyWeek = weekChargeTotal > 30;
  const isEndOfWeek = wi >= 4;

  // ── Demain ── (lu par la date : le dimanche, demain est la semaine suivante)
  const tomorrowSessions = sessionsOn(addDays(todayObj, 1)).filter(s => !isEventItem(s));
  const tomorrowCharge = chargeOf(tomorrowSessions);
  const tomorrowIsRest = tomorrowSessions.length === 0;
  const tomorrowIsHeavy = tomorrowCharge >= 9;
  const tomorrowHasSuspension = tomorrowSessions.some(s => SUSPENSION.test(lower(s)));

  // ── Sommeil ──
  const sleepEntries = data.sleep || [];
  const lastSleep = sleepEntries.length > 0 ? sleepEntries[sleepEntries.length - 1] : null;
  const lastSleepIsRecent = !!lastSleep && (new Date(today) - new Date(lastSleep.date)) / 86400000 <= 1;
  const sleepDuration = lastSleepIsRecent && Number(lastSleep.duration) > 0 ? Number(lastSleep.duration) : null;
  const shortSleep = sleepDuration !== null && sleepDuration < 7;
  const longSleep  = sleepDuration !== null && sleepDuration >= 8.5;

  // ── Mésocycle ──
  const mesoLabel = mesoCtx?.meso?.label || null;
  const microLabel = mesoCtx?.micro?.label || null;
  const mesoPhase = (() => {
    if (!mesoCtx?.meso?.startDate || !mesoCtx.meso.durationWeeks) return null;
    const start = new Date(mesoCtx.meso.startDate);
    const pct = Math.floor((now - start) / 86400000) / (mesoCtx.meso.durationWeeks * 7);
    if (pct < 0.15) return "start";
    if (pct > 0.85) return "end";
    return "middle";
  })();
  const isDeloadMicro    = !!microLabel && /récup|deload|décharge|repos|transition/i.test(microLabel);
  const isIntensityMicro = !!microLabel && /intensi|pic|max|peak/i.test(microLabel);

  // ── Durée, lieu, poids, repas ──
  const totalDuration = todaySessions.reduce((sum, s) => sum + (parseInt(s.estimatedTime) || 0), 0);
  const locations = [...new Set(todaySessions.map(s => s.location).filter(Boolean))];
  const recentWeights = Object.entries(data.weight || {})
    .filter(([d]) => d >= localDateStr(addDays(todayObj, -8)) && d < today)
    .sort(([a], [b]) => a.localeCompare(b));
  const weightTrend = recentWeights.length >= 3 ? (() => {
    const vals = recentWeights.map(([, v]) => v);
    const half = Math.max(1, Math.floor(vals.length / 2));
    const first = vals.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const last  = vals.slice(-half).reduce((a, b) => a + b, 0) / half;
    return last - first > 0.5 ? "up" : last - first < -0.5 ? "down" : "stable";
  })() : null;
  const hasNutritionToday = (data.nutrition?.[today] || []).length > 0;

  return {
    hour, isMorning, isAfternoon, isEvening, isNight, dow,
    sessionCount, isRestDay, totalCharge, chargeLevel, totalDuration,
    isOnlyLight, isStretchingOnly,
    isLongDay: totalDuration >= 120, isQuickSession: totalDuration > 0 && totalDuration <= 30,
    hasForce, hasEndur, hasRecup, hasTech, hasMobility, hasComp, hasSuspension, hasGrimpe,
    hasEarlySession, hasLateSession, hasSplitDay,
    nextSession, minutesToNext, nextSessionSoon, nextSessionVerySoon, allSessionsPassed, allSessionsOver,
    doneSessions, missedSessions, pendingSessions, allDone, someDone, allMissed, doneCharge,
    hTotal, hSoreness,
    isWellRested, isGoodShape, isModFatigued, isVeryFatigued, isOverreached,
    hasHighSoreness, hasPoorSleep, isMentallyTired,
    isPhysBodyTired, isMentalBodyTired, dominantHooper,
    yesterdayCharge, yesterdayWasBig: yesterdayCharge >= 9, restDaysBefore, consecutiveTrainingDays,
    weekChargeSoFar, weekChargeTotal, weekChargeRemaining, sessionsDoneThisWeek, weekFeedbackRate,
    tomorrowSessions, tomorrowCharge, tomorrowIsRest, tomorrowIsHeavy, tomorrowHasSuspension,
    isFirstDayWithSession, isLastDayWithSession, isHeavyWeek, isEndOfWeek,
    sleepDuration, shortSleep, longSleep,
    mesoLabel, mesoPhase, isDeloadMicro, isIntensityMicro,
    locations, weightTrend, hasNutritionToday,
    isPeakContext: isWellRested && totalCharge >= 8,
  };
}

// ── La phrase ────────────────────────────────────────────────────────────────
// Les cas sont essayés dans l'ordre : le premier qui s'applique donne la phrase.
// Ce qui est fait ou manqué passe avant tout, puis l'état du corps, puis le
// programme du jour.

export function getContextualPhrase(ctx) {
  const c = ctx.totalCharge;
  const h = ctx.hTotal;
  const cause = ctx.dominantHooper?.cause;

  // ── 1. Tout est fait ──
  if (ctx.allDone) {
    const n = ctx.doneSessions.length;
    const dc = ctx.doneCharge;
    if (ctx.isEvening || ctx.isNight) {
      if (dc >= 12) return `Grosse journée bouclée, charge ${dc} au total. Mange bien et couche-toi tôt.`;
      if (dc >= 7 && ctx.tomorrowIsHeavy) return `Séance faite, et grosse journée demain (charge ${ctx.tomorrowCharge}). Couche-toi tôt.`;
      if (n >= 2) return `${cap(inWords(n))} séances faites aujourd'hui. Bonne soirée.`;
      if (dc >= 7) return "Belle séance aujourd'hui. Bonne soirée.";
      return "C'est fait pour aujourd'hui. Bonne soirée.";
    }
    if (ctx.isAfternoon) {
      if (dc >= 9) return `Grosse matinée, charge ${dc}. Lève le pied pour le reste de la journée.`;
      if (n >= 2) return `${cap(inWords(n))} séances déjà faites, et il n'est que l'après-midi.`;
      return "Séance faite. Bon après-midi.";
    }
    if (dc >= 8) return `Déjà ${dc} de charge avant midi. Bonne journée.`;
    return n > 1 ? "Tout est fait avant midi." : "Séance faite avant midi.";
  }

  // ── 2. Une partie est faite ──
  if (ctx.someDone) {
    const done = ctx.doneSessions.length;
    const remaining = ctx.pendingSessions.length;
    const missed = ctx.missedSessions.length;
    const remainingCharge = ctx.pendingSessions.reduce((sum, s) => sum + getSessionCharge(s), 0);
    const tally = `${done} séance${s_(done)} sur ${ctx.sessionCount} faite${s_(done)}`;
    if (remaining > 0 && ctx.nextSessionVerySoon)
      return `${tally}. La suivante commence dans ${duration(ctx.minutesToNext)}.`;
    if (remaining > 0 && remainingCharge >= 8 && ctx.isVeryFatigued)
      return `${tally}. Il reste une charge de ${remainingCharge} et ton Hooper est haut, allège si besoin.`;
    if (remaining > 0 && remainingCharge >= 8)
      return `${tally}. Le plus dur reste à faire (charge ${remainingCharge}).`;
    if (remaining > 0)
      return `${tally}. Encore ${inWordsF(remaining)} à faire.`;
    return `${cap(inWordsF(done))} séance${s_(done)} faite${s_(done)}, ${inWordsF(missed)} manquée${s_(missed)}.`;
  }

  // ── 3. Tout est manqué ──
  if (ctx.allMissed) {
    if (ctx.isNight) return "Pas de séance aujourd'hui finalement. On reprend demain.";
    if (ctx.sessionCount >= 2) return `Les ${inWords(ctx.sessionCount)} séances du jour sont passées à la trappe. On reprend demain.`;
    if (ctx.isVeryFatigued) return "Séance manquée, mais avec ce Hooper, c'était sans doute le bon choix.";
    return "Séance manquée. Tu peux la reprogrammer depuis le calendrier.";
  }

  // ── 3 bis. Passée, mais pas encore notée ──
  // L'heure passée, les conseils pour aborder la séance n'ont plus de sens ; ce
  // qui reste à faire, c'est la noter. « Passée » et non « terminée » : on ne
  // sait pas encore si elle a été faite.
  if (ctx.allSessionsOver && ctx.pendingSessions.length === ctx.sessionCount) {
    return ctx.sessionCount > 1
      ? "Tes séances du jour sont passées. Pense à les noter."
      : "Ta séance est passée. Pense à la noter.";
  }

  // ── 4. Hooper très haut (plus de 20) ──
  if (ctx.isOverreached) {
    if (ctx.isRestDay) return `Hooper à ${h}, c'est très haut. Heureusement, c'est repos aujourd'hui.`;
    if (ctx.isStretchingOnly) return `Hooper à ${h}. Des étirements, c'est tout ce qu'il te faut aujourd'hui.`;
    if (ctx.isOnlyLight) return `Hooper à ${h}. Reste sur la séance légère, sans rien ajouter.`;
    if (c >= 8) return `Hooper à ${h} et charge ${c} prévue. Allège nettement ou décale, le risque de blessure monte.`;
    if (ctx.hasSuspension) return `Hooper à ${h} et poutre au programme. Les tendons encaissent mal la fatigue, réduis fortement ou décale.`;
    if (ctx.hasForce) return `Hooper à ${h} et force au programme. Baisse les charges de 30 à 40 %.`;
    if (ctx.hasRecup) return `Hooper à ${h}. La séance de récup tombe bien, n'en rajoute pas.`;
    if (cause) return `Hooper à ${h}, surtout à cause ${cause}. Adapte la séance.`;
    return `Hooper à ${h}, c'est très haut. Baisse l'intensité ou repose-toi.`;
  }

  // ── 5. Compétition ──
  if (ctx.hasComp) {
    if (ctx.nextSessionVerySoon) return `La compét commence dans ${duration(ctx.minutesToNext)}. Échauffe-toi tranquillement.`;
    if (ctx.isVeryFatigued) return "Jour de compét, mais la fatigue est là. Mise sur la lecture et le placement plutôt que sur la force.";
    if (ctx.isWellRested) return "Jour de compét, et tu arrives en forme. Bonne compét.";
    return "Jour de compét. Bonne chance.";
  }

  // ── 6. Deux grosses journées de suite ──
  if (ctx.yesterdayWasBig && c >= 8 && !ctx.isRestDay) {
    const y = ctx.yesterdayCharge;
    if (ctx.isPhysBodyTired && ctx.hasSuspension)
      return `Grosse journée hier (${y}) et poutre aujourd'hui, avec de la fatigue physique. Réduis le volume, pas l'échauffement.`;
    if (ctx.isPhysBodyTired) return `Charge ${y} hier et le corps est fatigué. Monte doucement, et arrête si ça ne répond pas.`;
    if (ctx.isVeryFatigued) return `Charge ${y} hier, ${c} aujourd'hui et un Hooper haut. Baisse l'intensité.`;
    if (ctx.isGoodShape) return `Deuxième grosse journée d'affilée (${y} puis ${c}), et tu tiens bien le coup.`;
    return `Charge ${y} hier et ${c} aujourd'hui. Échauffe-toi bien et surveille la fatigue.`;
  }

  // ── 7. Reprise après quelques jours sans entraînement ──
  const rest = ctx.restDaysBefore;
  if (rest !== null && rest >= 4 && !ctx.isRestDay) {
    if (ctx.hasSuspension) return `${cap(inWords(rest))} jours sans entraînement. Reprends la poutre doucement, même si tu te sens bien.`;
    if (ctx.hasForce) return `${cap(inWords(rest))} jours sans entraînement. Remonte les charges progressivement.`;
    if (ctx.isWellRested) return `${cap(inWords(rest))} jours de repos et un bon Hooper. Tu devrais te sentir bien aujourd'hui.`;
    return `Première séance après ${inWords(rest)} jours de repos. Prends le temps de t'échauffer.`;
  }
  if (rest === 3 && !ctx.isRestDay) {
    if (ctx.isWellRested) return "Trois jours de repos et un bon Hooper. Bonne reprise.";
    if (c >= 8) return "Reprise après trois jours, et la séance est grosse. Vas-y progressivement.";
    return "Reprise après trois jours de repos. Soigne l'échauffement.";
  }
  if (rest === 2 && !ctx.isRestDay) {
    if (ctx.isWellRested) return "Deux jours de repos, tu devrais être frais.";
    if (ctx.hasSuspension) return "Poutre après deux jours de repos. Les doigts ont eu le temps de récupérer.";
    return "Reprise après deux jours de repos. Échauffe-toi bien.";
  }

  // ── 8. Jour de repos ──
  if (ctx.isRestDay) {
    if (ctx.yesterdayWasBig && ctx.isPhysBodyTired)
      return `Charge ${ctx.yesterdayCharge} hier et de la fatigue physique aujourd'hui. Le repos tombe bien.`;
    if (ctx.yesterdayCharge >= 8) return `Grosse séance hier (${ctx.yesterdayCharge}). Laisse le corps récupérer.`;
    if (ctx.isVeryFatigued && cause) return `Hooper haut, surtout à cause ${cause}. Une journée sans séance tombe bien.`;
    if (ctx.hasPoorSleep) return "Mauvaise nuit. Profite du repos pour te coucher tôt ce soir.";
    if (ctx.tomorrowHasSuspension && ctx.tomorrowIsHeavy)
      return `Repos aujourd'hui avant la poutre de demain (charge ${ctx.tomorrowCharge}).`;
    if (ctx.tomorrowIsHeavy) return `Repos aujourd'hui, grosse journée demain (charge ${ctx.tomorrowCharge}). Dors bien.`;
    if (ctx.tomorrowSessions.length >= 2) return `Repos aujourd'hui, ${inWords(ctx.tomorrowSessions.length)} séances demain.`;
    if (ctx.isNight) return "Pas de séance aujourd'hui. Bonne nuit.";
    if (ctx.dow === 0 || ctx.dow === 6) {
      if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.8)
        return `Bonne semaine, ${Math.round(ctx.weekFeedbackRate * 100)} % des séances faites. Profite du week-end.`;
      if (ctx.isWellRested) return "Repos ce week-end, et ton Hooper est bon.";
      return "Pas de séance aujourd'hui. Bon week-end.";
    }
    if (ctx.isWellRested) return "Jour de repos, et tu es en forme.";
    if (ctx.isGoodShape) return "Jour de repos. Tu as bien récupéré.";
    if (ctx.isDeloadMicro) return "Semaine de décharge. Le repos en fait partie.";
    if (ctx.weekChargeSoFar >= 18) return `Déjà ${ctx.weekChargeSoFar} de charge cette semaine. Une journée off fait du bien.`;
    if (ctx.isEndOfWeek && ctx.sessionsDoneThisWeek >= 3)
      return `${cap(inWords(ctx.sessionsDoneThisWeek))} séances faites cette semaine. Repos pour finir.`;
    if (ctx.shortSleep) return `Seulement ${hoursOfSleep(ctx.sleepDuration)} de sommeil. Récupère aujourd'hui.`;
    const quiet = [
      "Pas de séance aujourd'hui.",
      "Journée de repos.",
      "Rien de prévu aujourd'hui.",
      "Repos aujourd'hui. Le corps progresse aussi ces jours-là.",
      "Pas d'entraînement aujourd'hui.",
      "Journée off.",
      "Rien au programme aujourd'hui.",
    ];
    return quiet[ctx.dow % quiet.length];
  }

  // ── 9. Séance dans moins de 30 min ──
  if (ctx.nextSessionVerySoon) {
    const next = ctx.nextSession.session;
    const name = cap(nameOf(next));
    const sc = getSessionCharge(next);
    const inT = duration(ctx.minutesToNext);
    const isSusp = SUSPENSION.test(lower(next));
    if (isSusp && ctx.isPhysBodyTired)
      return `Poutre dans ${inT}, avec de la fatigue physique. Commence à chauffer les doigts maintenant.`;
    if (isSusp) return `${name || "Poutre"} dans ${inT}. Commence à chauffer les doigts.`;
    if (sc >= 8 && ctx.isMorning) return `Grosse séance dans ${inT}, et il est tôt. Prends le temps de t'échauffer.`;
    if (sc >= 8) return `${name || "Séance"} dans ${inT}, charge ${sc}. Échauffe-toi bien.`;
    return `${name || "Séance"} dans ${inT}.`;
  }

  // ── 10. En forme et grosse séance ──
  if (ctx.isPeakContext) {
    if (ctx.hasSuspension && ctx.hasForce) return "Bon Hooper et force à la poutre. C'est le jour pour tenter plus lourd.";
    if (ctx.hasSuspension) return "Bon Hooper, doigts reposés. Tu peux viser haut à la poutre.";
    if (ctx.hasForce && ctx.tomorrowIsRest) return "En forme, et repos demain. Tu peux te donner à fond en force.";
    if (ctx.hasForce) return `Bon Hooper et charge ${c}. Belle journée pour la force.`;
    if (ctx.hasEndur) return "Bon Hooper pour une séance d'endurance. Garde la qualité jusqu'au bout.";
    if (ctx.isIntensityMicro) return "En forme, en pleine semaine d'intensité. C'est le moment de pousser.";
    return `Bon Hooper et charge ${c} au programme. Tout est réuni pour une bonne séance.`;
  }

  // ── 11. Très fatigué (Hooper de 18 à 20) ──
  if (ctx.isVeryFatigued) {
    if (ctx.isStretchingOnly) return `Hooper à ${h}. Des étirements aujourd'hui, ça tombe bien.`;
    if (ctx.isOnlyLight) return `Hooper à ${h}, et seulement une séance légère. N'en fais pas plus.`;
    if (ctx.hasRecup && ctx.isPhysBodyTired) return `Fatigue physique (Hooper ${h}) et séance de récup. N'ajoute rien.`;
    if (ctx.hasRecup) return `Hooper à ${h}, la récup est le bon choix aujourd'hui.`;
    if (ctx.hasSuspension && ctx.isPhysBodyTired) return "Fatigue physique et poutre au programme. Divise le volume par deux, ou décale à demain.";
    if (ctx.hasSuspension) return `Hooper à ${h} avant la poutre. Écoute tes doigts et oublie les records.`;
    if (ctx.hasForce && ctx.isMentalBodyTired && !ctx.isPhysBodyTired)
      return "Fatigue surtout nerveuse aujourd'hui, le corps devrait suivre en force. Reste lucide sur l'effort.";
    if (ctx.hasForce) return `Hooper à ${h} et force au programme. Monte doucement, et arrête si ça ne répond pas à 60 %.`;
    if (ctx.hasEndur) return "Fatigue élevée pour de l'endurance. Baisse l'intensité de 15 à 20 %, garde le volume.";
    if (c >= 8) return `Hooper à ${h} et charge ${c} prévue, c'est beaucoup. Allège, ou décale si tu peux.`;
    if (ctx.isMorning && ctx.dominantHooper?.key === "sleep") return `Mauvaise nuit (Hooper ${h}). Démarre doucement, ça devrait se débloquer.`;
    if (ctx.isMorning) return `Hooper à ${h} ce matin. Double l'échauffement et vois comment ça répond.`;
    return `Hooper à ${h}. Baisse l'intensité, garde le contenu.`;
  }

  // ── 12. Séances matin et soir ──
  if (ctx.hasSplitDay) {
    const n = ctx.sessionCount;
    if (c >= 10) return `${cap(inWords(n))} séances, charge ${c} au total. Mange et bois entre les deux.`;
    if (ctx.hasSuspension) return `${cap(inWords(n))} séances dont la poutre. Laisse au moins trois heures entre les deux.`;
    if (ctx.isWellRested) return `${cap(inWords(n))} séances aujourd'hui, et tu es frais.`;
    return `${cap(inWords(n))} séances dans la journée. Récupère bien entre ${n === 2 ? "les deux" : "chaque séance"}.`;
  }

  // ── 13. Plusieurs jours d'entraînement d'affilée ──
  const streak = ctx.consecutiveTrainingDays;
  if (streak >= 5) {
    if (ctx.tomorrowIsRest) return `${cap(ordinal(streak))} jour d'entraînement d'affilée. Repos demain.`;
    if (ctx.isModFatigued || ctx.isVeryFatigued) return `${cap(inWords(streak))} jours d'affilée et le Hooper monte. Prévois un repos dans les deux jours.`;
    return `${cap(inWords(streak))} jours d'entraînement d'affilée. Reste prudent sur les charges.`;
  }
  if (streak === 4) {
    if (ctx.isGoodShape && ctx.hasSuspension) return "Quatrième jour d'affilée, et toujours en forme. Les tendons fatiguent plus vite qu'on ne le sent.";
    if (ctx.isGoodShape) return "Quatrième jour d'affilée, et ton Hooper tient bien.";
    return "Quatrième jour d'affilée. La fatigue s'accumule, même quand on ne la sent pas encore.";
  }

  // ── 14. Semaine de décharge ──
  if (ctx.isDeloadMicro) {
    if (ctx.hasSuspension) return "Semaine de décharge. À la poutre, réduis le volume plus que les charges.";
    if (ctx.hasForce) return "Semaine de décharge. Garde les charges si tu veux, mais fais moins de séries.";
    if (c >= 7) return `Semaine de décharge, mais charge ${c} prévue. Reste en dessous de tes habitudes.`;
    return "Semaine de décharge. On bouge, sans se fatiguer.";
  }

  // ── 15. La nuit ──
  if (ctx.isNight) {
    // Après minuit, « aujourd'hui » est déjà la journée qui commence : ses
    // séances sont devant, pas derrière.
    if (ctx.hour < 5) {
      if (c >= 8) return `Grosse séance aujourd'hui (charge ${c}). Va dormir, tu en auras besoin.`;
      return `Tu as ${ctx.sessionCount > 1 ? `${inWords(ctx.sessionCount)} séances` : "une séance"} aujourd'hui. Va dormir.`;
    }
    if (ctx.nextSession) {
      if (ctx.hasSuspension) return "Poutre tard ce soir. Échauffe les doigts plus longtemps que d'habitude.";
      if (ctx.hasForce) return "Force tard ce soir. Prends le temps de t'échauffer.";
      return "Séance tardive. Échauffe-toi plus longtemps que d'habitude.";
    }
    // Commencée et sans doute encore en cours ; finie, elle est passée par 3 bis.
    if (ctx.allSessionsPassed) return "Bonne fin de séance.";
    // Sans heure et pas encore notée.
    return `Pense à noter ${ctx.pendingSessions.length > 1 ? "tes séances" : "ta séance"} avant de dormir.`;
  }

  // ── 16. Séance après 20 h ──
  if (ctx.hasLateSession && ctx.isEvening) {
    if (ctx.hasSuspension && ctx.hasHighSoreness) return "Poutre ce soir avec des courbatures. Échauffement long, charges réduites.";
    if (ctx.hasSuspension) return "Poutre ce soir. Les tendons mettent du temps à chauffer, compte vingt minutes.";
    if (ctx.hasForce) return "Force en fin de soirée. Normal de se sentir raide, prends le temps.";
    if (ctx.hasEndur && c >= 7) return `Endurance tard ce soir (charge ${c}). Ne pousse pas trop, pour bien dormir après.`;
    if (ctx.hasMobility) return "Mobilité ce soir, parfait avant de dormir.";
  }

  // ── 17. Séance avant 8 h ──
  if (ctx.hasEarlySession && ctx.isMorning) {
    if (ctx.hasPoorSleep && ctx.hasSuspension) return "Mauvaise nuit et poutre tôt ce matin. Vas-y très progressivement, ou décale.";
    if (ctx.hasPoorSleep) return "Petite nuit et séance tôt. Baisse un peu l'intensité.";
    if (ctx.hasForce && !ctx.longSleep) return "Force au réveil. Le corps met du temps à démarrer, échauffe-toi 15 à 20 minutes.";
    if (ctx.hasSuspension) return "Poutre tôt ce matin. Les doigts sont froids, monte doucement.";
    if (ctx.longSleep) return "Bien dormi, et séance tôt. Bon début de journée.";
    if (ctx.shortSleep) return `${hoursOfSleep(ctx.sleepDuration)} de sommeil et séance tôt. Adapte si le corps ne suit pas.`;
    return "Séance tôt ce matin. Prends le temps de te réveiller avant d'attaquer.";
  }

  // ── 18. Journée très chargée (plus de 9) ──
  if (ctx.chargeLevel === "brutal") {
    if (ctx.isWellRested && ctx.tomorrowIsRest) return `Grosse journée (charge ${c}), tu es en forme et repos demain. Tu peux te donner.`;
    if (ctx.isWellRested) return `Grosse journée (charge ${c}) et bon Hooper. Vise haut, mais garde la technique.`;
    if (ctx.tomorrowIsRest) return `Grosse journée (charge ${c}), repos demain. Donne ce que tu peux.`;
    if (ctx.shortSleep) return `Grosse journée (charge ${c}) avec ${hoursOfSleep(ctx.sleepDuration)} de sommeil. Baisse l'intensité d'un cran.`;
    if (streak >= 3) return `Charge ${c}, ${ordinal(streak)} jour d'affilée. Ne pars pas sur ton max.`;
    return `Grosse journée aujourd'hui (charge ${c}). Échauffement soigné, et récup ce soir.`;
  }

  // ── 19. Étirements seuls ──
  if (ctx.isStretchingOnly) {
    if (ctx.yesterdayWasBig) return "Étirements après la grosse journée d'hier. Insiste là où ça tire.";
    if (ctx.hasHighSoreness) return "Courbatures et étirements au programme. Tiens chaque position 45 secondes à une minute.";
    if (ctx.isEvening) return "Étirements ce soir. Bonne façon de finir la journée.";
    if (ctx.isMorning) return "Étirements ce matin. Prends ton temps sur chaque position.";
    return "Séance d'étirements aujourd'hui. Respire et prends ton temps.";
  }

  // ── 20. Séance légère ──
  if (ctx.isOnlyLight) {
    if (ctx.yesterdayWasBig) return "Récup active après la grosse séance d'hier. Reste léger.";
    if (ctx.hasHighSoreness) return "Courbatures et séance légère, ça tombe bien. Mise sur la qualité du mouvement.";
    if (ctx.hasMobility && ctx.isEvening) return "Mobilité ce soir. De quoi bien décompresser.";
    if (ctx.hasMobility && ctx.isMorning) return "Mobilité ce matin, en douceur.";
    if (ctx.hasRecup) return "Séance de récup. Le but est de bouger, pas de se fatiguer.";
    return "Séance légère aujourd'hui. Profites-en pour soigner la technique.";
  }

  // ── 21. Stress élevé, corps en forme ──
  if (ctx.isMentallyTired) {
    if (ctx.hasGrimpe) return "Beaucoup de stress, mais le corps va bien. Grimper va te vider la tête.";
    if (ctx.hasForce) return "Stress élevé, mais physiquement ça va. Concentre-toi sur la technique, ça aide à décrocher.";
    if (ctx.hasMobility) return "Beaucoup de stress. La mobilité va te faire du bien.";
    return "Stress élevé, mais physiquement ça va. La séance peut te faire du bien.";
  }

  // ── 22. Courbatures ──
  if (ctx.hasHighSoreness) {
    const so = ctx.hSoreness;
    if (ctx.hasForce && ctx.hasSuspension) return `Courbatures (${so}/7) et force à la poutre. Échauffe-toi longtemps, baisse les charges, et arrête si ça tire.`;
    if (ctx.hasSuspension) return `Courbatures (${so}/7) et poutre au programme. Les tendons sont souvent touchés aussi, sois prudent.`;
    if (ctx.hasForce) return `Courbatures à ${so}/7 et force aujourd'hui. Échauffe-toi longtemps.`;
    if (ctx.hasGrimpe) return "Courbatures marquées. Grimpe en souplesse, pas de max aujourd'hui.";
  }

  // ── 23. Mauvaise nuit ──
  if (ctx.hasPoorSleep) {
    if (ctx.hasForce && c >= 7) return "Mauvaise nuit et force au programme. Baisse les charges de 15 à 20 %.";
    if (ctx.hasSuspension) return "Mauvaise nuit et poutre aujourd'hui. Vas-y progressivement.";
    if (c >= 7) return `Mauvaise nuit et charge ${c}. Une séance à 80 % vaut mieux qu'une séance ratée.`;
    return "Mauvaise nuit. Démarre doucement.";
  }

  // ── 24. Un peu de fatigue (Hooper de 15 à 17) ──
  if (ctx.isModFatigued) {
    if (ctx.hasRecup) return `Un peu de fatigue (Hooper ${h}) et une séance de récup. C'est ce qu'il faut.`;
    if (ctx.hasSuspension && ctx.isPhysBodyTired) return "Un peu de fatigue physique et poutre au programme. Sois attentif aux sensations dans les doigts.";
    if (ctx.hasSuspension) return `Hooper à ${h} avant la poutre. Échauffe bien les doigts.`;
    if (c >= 8) return `Hooper à ${h} et charge ${c}. Garde un œil sur l'intensité.`;
    if (ctx.hasForce) return "Un peu de fatigue et force au programme. Vise 80 % de ton max.";
    if (ctx.hasEndur) return `Hooper à ${h} pour de l'endurance. Mieux vaut un effort régulier qu'intense.`;
    if (cause) return `Hooper à ${h}, surtout à cause ${cause}. Rien d'inquiétant.`;
    return `Hooper à ${h}, un peu de fatigue. Rien d'inquiétant.`;
  }

  // ── 25. Séance chargée (7 à 9) ──
  if (ctx.chargeLevel === "heavy") {
    if (ctx.isWellRested && ctx.tomorrowIsHeavy) return `Charge ${c} aujourd'hui et ${ctx.tomorrowCharge} demain. Tu es en forme, mais garde de la réserve.`;
    if (ctx.isWellRested) return `Charge ${c} et bon Hooper. Belle séance en vue.`;
    if (ctx.tomorrowIsRest) return `Charge ${c} et repos demain. Tu peux pousser un peu plus.`;
    if (streak >= 3) return `Charge ${c}, ${ordinal(streak)} jour d'affilée. Garde de la marge.`;
    if (ctx.weekChargeRemaining >= 20) return `Charge ${c} aujourd'hui, et encore ${ctx.weekChargeRemaining} prévus cette semaine. Garde de l'énergie.`;
    return `Charge ${c} au programme. Échauffe-toi bien.`;
  }

  // ── 26. Plusieurs séances ──
  if (ctx.sessionCount >= 2) {
    const n = cap(inWords(ctx.sessionCount));
    if (ctx.totalDuration >= 120) return `${n} séances, ${duration(ctx.totalDuration)} au total. Mange et bois entre les deux.`;
    if (ctx.isWellRested) return `${n} séances aujourd'hui, et tu es frais. Garde de l'énergie pour la suite.`;
    if (ctx.tomorrowIsRest) return `${n} séances et repos demain. Tu peux te donner sur chacune.`;
    return `${n} séances aujourd'hui. Gère ton énergie sur la journée.`;
  }

  // ── 27. Séance dans moins d'une heure et demie ──
  if (ctx.nextSessionSoon) {
    const next = ctx.nextSession.session;
    const name = cap(nameOf(next));
    const sc = getSessionCharge(next);
    const inT = duration(ctx.minutesToNext);
    if (SUSPENSION.test(lower(next))) return `Poutre dans ${inT}. Tu peux commencer à mobiliser les doigts.`;
    if (sc >= 8) return `Grosse séance dans ${inT} (charge ${sc}). Ne pars pas à froid.`;
    return `${name || "Prochaine séance"} dans ${inT}.`;
  }

  // ── 28. Demain chargé ──
  if (ctx.tomorrowIsHeavy) {
    if (ctx.tomorrowHasSuspension) return `Poutre et charge ${ctx.tomorrowCharge} demain. Dors bien ce soir.`;
    return `Grosse journée demain (charge ${ctx.tomorrowCharge}). Couche-toi tôt ce soir.`;
  }

  // ── 29. Repos demain ──
  if (ctx.tomorrowIsRest) {
    if (ctx.hasForce && ctx.isWellRested) return "Force aujourd'hui, repos demain, et tu es en forme. Tu peux aller chercher ton max.";
    if (ctx.hasSuspension && ctx.isWellRested) return "Poutre aujourd'hui et repos demain. Bon moment pour tester tes limites.";
    if (ctx.hasForce) return "Force aujourd'hui et repos demain. Tu peux pousser un peu plus.";
    if (ctx.hasSuspension) return "Poutre aujourd'hui et repos demain. Bon moment pour travailler les charges.";
    return "Repos demain. Tu peux te donner aujourd'hui.";
  }

  // ── 30. Première ou dernière séance de la semaine ──
  if (ctx.isFirstDayWithSession) {
    if (ctx.mesoPhase === "start" && ctx.mesoLabel) return `Début du bloc ${ctx.mesoLabel}, et première séance de la semaine.`;
    if (ctx.hasForce && ctx.isWellRested) return "Force pour commencer la semaine, et tu es en forme.";
    if (ctx.hasSuspension) return "Poutre pour commencer la semaine. Les doigts sont reposés.";
    if (ctx.isWellRested) return "Première séance de la semaine, et tu es en forme.";
    return ctx.isMorning ? "C'est parti pour la semaine." : "Première séance de la semaine.";
  }
  if (ctx.isLastDayWithSession) {
    const d = ctx.sessionsDoneThisWeek;
    if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.85 && d >= 3)
      return `Dernière séance d'une bonne semaine (${Math.round(ctx.weekFeedbackRate * 100)} % des séances faites).`;
    if (d >= 2) return `Dernière séance de la semaine, ${inWords(d)} déjà faites.`;
    return "Dernière séance de la semaine.";
  }

  // ── 31. Bonne forme ──
  if (ctx.isWellRested) {
    if (ctx.hasSuspension && ctx.hasForce) return "Bon Hooper, de quoi pousser à la poutre comme en grimpe.";
    if (ctx.hasSuspension && ctx.mesoPhase === "end" && ctx.mesoLabel)
      return `Fin du bloc ${ctx.mesoLabel}, et tu es en forme. Bon moment pour tester tes progrès à la poutre.`;
    if (ctx.hasSuspension) return "Doigts reposés et bon Hooper. Tu peux pousser les charges à la poutre.";
    if (ctx.hasForce && ctx.isIntensityMicro) return "En forme en semaine d'intensité. Va chercher ton max.";
    if (ctx.hasForce) return "Bon Hooper et force au programme. C'est le jour pour tenter lourd.";
    if (ctx.hasEndur && ctx.totalDuration >= 90) return `Bien récupéré pour ${duration(ctx.totalDuration)} d'endurance.`;
    if (ctx.hasEndur) return "En forme pour l'endurance. Garde la qualité jusqu'au bout.";
    if (ctx.hasTech) return "Bien reposé pour la technique. Bon moment pour travailler la précision.";
    if (ctx.hasGrimpe && ctx.locations.length > 0) return `En forme, direction ${ctx.locations[0]}.`;
    return "Bon Hooper aujourd'hui. Tu es en forme.";
  }
  if (ctx.isGoodShape) {
    if (ctx.hasSuspension) return "Bonne forme, et poutre au programme.";
    if (ctx.hasForce) return "Bon Hooper, et force au programme.";
    if (ctx.hasEndur) return "Bien récupéré, bon jour pour du volume.";
    if (ctx.hasGrimpe) return "Tu es en forme. Bonne grimpe.";
    return "Tu es en forme. Bonne séance.";
  }

  // ── 32. Nuit courte ──
  if (ctx.shortSleep) {
    const sl = hoursOfSleep(ctx.sleepDuration);
    if (ctx.hasSuspension) return `${sl} de sommeil et poutre aujourd'hui. Les tendons récupèrent la nuit, sois prudent.`;
    if (c >= 7) return `${sl} de sommeil et charge ${c}. Adapte, ne force pas.`;
    return `${sl} de sommeil cette nuit. Adapte si le corps ne suit pas.`;
  }

  // ── 33. Longue nuit ──
  if (ctx.longSleep) {
    if (ctx.hasSuspension) return "Belle nuit de sommeil, bon pour la poutre.";
    if (ctx.hasForce) return "Belle nuit de sommeil, et force au programme.";
    return "Belle nuit de sommeil. Ça devrait bien répondre aujourd'hui.";
  }

  // ── 34. Fin d'une semaine chargée ──
  if (ctx.isHeavyWeek && ctx.isEndOfWeek) {
    if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.8)
      return `Grosse semaine (charge ${ctx.weekChargeTotal}) et presque tout est fait. Le repos approche.`;
    return `Semaine chargée (charge ${ctx.weekChargeTotal}). Tiens jusqu'au bout, et récupère bien ce week-end.`;
  }

  // ── 35. Début ou fin de mésocycle ──
  if (ctx.mesoPhase === "start" && ctx.mesoLabel) {
    if (ctx.hasForce) return `Début du bloc ${ctx.mesoLabel}, avec de la force. Pose tes repères de charge.`;
    return `Début du bloc ${ctx.mesoLabel}. Prends tes repères.`;
  }
  if (ctx.mesoPhase === "end" && ctx.mesoLabel) {
    return `Fin du bloc ${ctx.mesoLabel} en vue.`;
  }

  // ── 36. Semaine d'intensité ──
  if (ctx.isIntensityMicro) {
    if (ctx.hasSuspension) return "Semaine d'intensité, et poutre au programme. Vise de nouvelles charges, la technique d'abord.";
    if (ctx.hasForce) return "Semaine d'intensité, et force au programme. C'est le moment de pousser les charges.";
    return "Semaine d'intensité. Dépasse un peu tes repères, sans lâcher la technique.";
  }

  // ── 37. Poutre ──
  if (ctx.hasSuspension) {
    if (ctx.weightTrend === "down" && ctx.hasForce) return "Poutre au programme et poids en baisse. Tes repères de charge ont pu bouger.";
    if (ctx.isMorning && c >= 7) return `Poutre ce matin (charge ${c}). Vingt minutes d'échauffement progressif avant de charger.`;
    if (ctx.isMorning) return "Poutre ce matin. Chauffe les doigts progressivement.";
    if (ctx.isEvening) return "Poutre ce soir. Les doigts sont chauds en fin de journée, c'est un bon moment.";
    return "Séance de poutre. Prends le temps de t'échauffer.";
  }

  // ── 38. Poids en baisse ──
  if (ctx.weightTrend === "down" && ctx.hasForce) {
    if (!ctx.hasNutritionToday && ctx.isAfternoon) return "Poids en baisse et force cet après-midi. Mange bien avant.";
    return "Poids en baisse ces derniers jours. Mange assez avant ta séance de force, surtout des protéines.";
  }

  // ── 39. Séance courte ──
  if (ctx.isQuickSession) {
    const d = duration(ctx.totalDuration);
    if (ctx.hasForce) return `Séance de force courte (${d}). Va à l'essentiel.`;
    return `Séance courte aujourd'hui (${d}).`;
  }

  // ── 40. Longue séance ──
  if (ctx.isLongDay) {
    const d = duration(ctx.totalDuration);
    if (ctx.hasForce && ctx.hasEndur) return `${d} de séance, force et endurance. Garde la force pour le début.`;
    if (ctx.isWellRested) return `${d} de séance et tu es en forme. Pense à boire.`;
    return `Longue séance aujourd'hui (${d}). Prévois à boire et à manger.`;
  }

  // ── 41. Selon l'heure ──
  const at = ctx.locations.length > 0 ? ` à ${ctx.locations[0]}` : "";
  if (ctx.isMorning) {
    if (ctx.hasForce && ctx.weekChargeSoFar === 0) return "Force ce matin pour lancer la semaine.";
    if (ctx.hasForce) return "Force ce matin. Le corps démarre lentement, prends le temps de l'activer.";
    if (ctx.hasEndur) return "De l'endurance pour commencer la journée.";
    if (ctx.hasTech) return "Technique ce matin, avec l'esprit frais.";
    if (ctx.hasMobility) return "Mobilité ce matin, pour bien démarrer.";
    if (ctx.hasRecup) return "Récup active ce matin, en douceur.";
    if (ctx.hasGrimpe) return `Grimpe ce matin${at}.`;
    return "Bonne séance ce matin.";
  }
  if (ctx.isAfternoon) {
    if (ctx.hasForce) return "Force cet après-midi, le corps est bien réveillé.";
    if (ctx.hasEndur) return "Endurance cet après-midi. Garde un rythme régulier.";
    if (ctx.hasTech) return "Technique cet après-midi. Concentre-toi sur la précision.";
    if (ctx.hasGrimpe) return `Grimpe cet après-midi${at}.`;
    return "Bonne séance cet après-midi.";
  }
  if (ctx.isEvening) {
    if (ctx.hasForce) return "Force ce soir. Le corps refroidit vite en fin de journée, échauffe-toi bien.";
    if (ctx.hasEndur && c >= 7) return `Endurance ce soir (charge ${c}). Ne pousse pas trop, pour bien dormir.`;
    if (ctx.hasEndur) return "Endurance ce soir, à un rythme raisonnable.";
    if (ctx.hasMobility) return "Mobilité ce soir, pour décompresser.";
    if (ctx.hasGrimpe) return `Grimpe ce soir${at}.`;
    return "Bonne séance ce soir.";
  }

  // ── Repli ──
  if (c >= 5) return `Charge ${c} au programme. Bonne séance.`;
  if (c > 0) return "Séance légère aujourd'hui.";
  const fallbacks = ["Bonne séance aujourd'hui.", "Allez, bonne séance.", "C'est parti pour la séance du jour.", "Bonne séance."];
  return fallbacks[ctx.dow % fallbacks.length];
}

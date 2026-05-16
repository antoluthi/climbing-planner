import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getMesoForDate, getDayLogWarning } from "../lib/constants.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions, getLastKnownWeight } from "../lib/helpers.js";
import { getChargeColor } from "../lib/charge.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";
import { AccueilSkeleton } from "./ui/Skeleton.jsx";
import { TodaySessionCard } from "./TodaySessionCard.jsx";
import { getActiveRemindersForDate, isReminderCheckedOn } from "../lib/reminders.js";

// ─── GREETING BY TIME OF DAY ──────────────────────────────────────────────────

function getGreeting(hour, firstName) {
  const h = hour ?? new Date().getHours();
  const n = firstName ? `, ${firstName}` : "";
  if (h >= 0  && h <  5)  return `Il est tard${n}`;
  if (h >= 5  && h <  7)  return `C'est tôt ce matin${n}`;
  if (h >= 7  && h < 12)  return `Bonjour${n}`;
  if (h >= 12 && h < 18)  return `Bon après-midi${n}`;
  if (h >= 18 && h < 21)  return `Bonsoir${n}`;
  return `Il se fait tard${n}`;
}

// ─── REAL TRAINING DETECTION ────────────────────────────────────────────────
// A day with only stretching/mobility/recovery at charge ≤ 5 is NOT a real
// training day — it shouldn't inflate consecutive-training-day streaks.

function isRealTraining(sessions) {
  if (sessions.length === 0) return false;
  const charge = sessions.reduce((s, sess) => s + (sess.charge || 0), 0);
  if (charge > 5) return true;
  const names = sessions.map(s => (s.title || s.name || "").toLowerCase()).join(" ");
  const blocks = sessions.flatMap(s => (s.blocks || []).map(b => b.type));
  const hasHeavy = /force|maximal|campus|dynami|puissan|endur|volume|compét|compe|suspend|poutre|hangboard/.test(names)
    || blocks.some(t => t === "Grimpe" || t === "Suspension" || t === "Exercices");
  return hasHeavy;
}

// ─── CONTEXT BUILDER ────────────────────────────────────────────────────────

function buildPhraseContext(data, todaySessions, todayObj, weekSessions, dayIndex, mesoCtx) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dow = todayObj.getDay();
  const today = localDateStr(todayObj);

  // ── Time of day ──
  const isMorning   = hour >= 5  && hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening   = hour >= 17 && hour < 22;
  const isNight     = hour >= 22 || hour < 5;

  // ── Sessions ──
  const sessionCount = todaySessions.length;
  const isRestDay = sessionCount === 0;
  const totalCharge = todaySessions.reduce((s, sess) => s + (sess.charge || 0), 0);
  const chargeLevel = totalCharge === 0 ? "none"
    : totalCharge <= 10 ? "light"
    : totalCharge <= 20 ? "moderate"
    : totalCharge <= 30 ? "heavy"
    : "brutal";

  // Session types from names AND blocks
  const names = todaySessions.map(s => (s.title || s.name || "").toLowerCase()).join(" ");
  const allBlockTypes = todaySessions.flatMap(s => (s.blocks || []).map(b => b.type));

  const hasForce     = /force|maximal|bloc|campus|dynami|puissan/.test(names);
  const hasEndur     = /endur|volume|vol\b|capac|ae\b|fond/.test(names);
  const hasRecup     = /récup|recup|calme|retour|active/.test(names) || allBlockTypes.includes("Retour au calme");
  const hasTech      = /techni|dalle|travers|dégrav|mouv|précis/.test(names);
  const hasMobility  = /mobil|étir|yoga|stretch|souplesse/.test(names) || allBlockTypes.includes("Étirements");
  const hasComp      = /compét|compe|lead|bloc.*final|qualif/.test(names);
  const hasSuspension = /suspend|poutre|hangboard/.test(names) || allBlockTypes.includes("Suspension");
  const hasGrimpe    = allBlockTypes.includes("Grimpe");
  const isOnlyLight     = !isRestDay && totalCharge <= 5 && (hasMobility || hasRecup) && !hasForce && !hasEndur && !hasComp;
  // Séance composée UNIQUEMENT de blocs étirements/retour au calme (ou nom seul si pas de blocs)
  const isStretchingOnly = !isRestDay && (
    allBlockTypes.length > 0
      ? allBlockTypes.every(t => t === "Étirements" || t === "Retour au calme")
      : hasMobility && !hasForce && !hasEndur && !hasGrimpe && !hasSuspension && !hasComp
  ) && !hasForce && !hasEndur && !hasGrimpe && !hasSuspension && !hasComp;

  // Session timing from startTime field
  const sessionTimes = todaySessions
    .filter(s => s.startTime)
    .map(s => {
      const [h, m] = s.startTime.split(":").map(Number);
      return { session: s, hour: h, minute: m, totalMin: h * 60 + m };
    })
    .sort((a, b) => a.totalMin - b.totalMin);

  const firstSessionTime = sessionTimes[0] || null;
  const lastSessionTime = sessionTimes[sessionTimes.length - 1] || null;
  const hasEarlySession = firstSessionTime && firstSessionTime.hour < 8;
  const hasLateSession  = lastSessionTime && lastSessionTime.hour >= 20;
  const hasMorningSession   = sessionTimes.some(t => t.hour >= 6 && t.hour < 12);
  const hasAfternoonSession = sessionTimes.some(t => t.hour >= 12 && t.hour < 17);
  const hasEveningSession   = sessionTimes.some(t => t.hour >= 17);
  const hasSplitDay = hasMorningSession && (hasAfternoonSession || hasEveningSession) && sessionCount >= 2;

  // Next session relative to current time
  const nowMin = hour * 60 + minute;
  const nextSession = sessionTimes.find(t => t.totalMin > nowMin);
  const minutesToNext = nextSession ? nextSession.totalMin - nowMin : null;
  const nextSessionSoon     = minutesToNext !== null && minutesToNext <= 90;
  const nextSessionVerySoon = minutesToNext !== null && minutesToNext <= 30;
  const allSessionsPassed = sessionTimes.length > 0 && sessionTimes.every(t => t.totalMin < nowMin);

  // Feedback status
  const doneSessions    = todaySessions.filter(s => s.feedback?.done === true);
  const missedSessions  = todaySessions.filter(s => s.feedback?.done === false);
  const pendingSessions = todaySessions.filter(s => !s.feedback);
  const allDone  = sessionCount > 0 && doneSessions.length === sessionCount;
  const someDone = doneSessions.length > 0 && doneSessions.length < sessionCount;
  const allMissed = sessionCount > 0 && missedSessions.length === sessionCount && pendingSessions.length === 0;
  const doneCharge = doneSessions.reduce((s, sess) => s + (sess.charge || 0), 0);

  // ── Hooper ──
  const hooperEntry = (data.hooper || []).find(h => h.date === today);
  const hTotal = hooperEntry ? (hooperEntry.fatigue + hooperEntry.stress + hooperEntry.soreness + hooperEntry.sleep) : null;
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
  const hasHighFatigue  = hFatigue !== null && hFatigue >= 5;
  const isPhysicallyFine = hFatigue !== null && hSoreness !== null && hFatigue <= 3 && hSoreness <= 3;
  const isMentallyTired  = hasHighStress && isPhysicallyFine;

  // ── Yesterday & recent history ──
  const yesterdaySessions = getDaySessions(data, addDays(todayObj, -1));
  const yesterdayCharge = yesterdaySessions.reduce((s, sess) => s + (sess.charge || 0), 0);

  // Rest/training streaks — only count real training (étirements seuls ≠ entraînement)
  let restDaysBefore = 0;
  for (let i = 1; i <= 7; i++) {
    if (!isRealTraining(getDaySessions(data, addDays(todayObj, -i)))) restDaysBefore++;
    else break;
  }

  const todayIsRealTraining = isRealTraining(todaySessions);
  let consecutiveTrainingDays = todayIsRealTraining ? 1 : 0;
  if (todayIsRealTraining) {
    for (let i = 1; i <= 7; i++) {
      if (isRealTraining(getDaySessions(data, addDays(todayObj, -i)))) consecutiveTrainingDays++;
      else break;
    }
  }

  // ── Week ──
  const wi = dayIndex;
  const weekArr = weekSessions || Array(7).fill(null).map(() => []);
  const weekChargeSoFar = weekArr.slice(0, wi).flat().reduce((s, sess) => s + (sess?.charge || 0), 0);
  const weekChargeTotal = weekArr.flat().reduce((s, sess) => s + (sess?.charge || 0), 0);
  const weekSessionCountTotal = weekArr.reduce((n, d) => n + (d?.length || 0), 0);
  const sessionsDoneThisWeek = weekArr.slice(0, wi).flat().filter(s => s?.feedback?.done === true).length;

  const tomorrowSessions = wi < 6 ? (weekArr[wi + 1] || []) : [];
  const tomorrowCharge = tomorrowSessions.reduce((s, sess) => s + (sess?.charge || 0), 0);
  const tomorrowIsRest = tomorrowSessions.length === 0 && wi < 6;

  const isFirstDayWithSession = !isRestDay && weekArr.slice(0, wi).every(d => !d || d.length === 0);
  const isLastDayWithSession  = !isRestDay && weekArr.slice(wi + 1).every(d => !d || d.length === 0);
  const isHeavyWeek = weekChargeTotal > 100;
  const isEndOfWeek = wi >= 4;

  // ── Sleep ──
  const sleepEntries = data.sleep || [];
  const lastSleep = sleepEntries.length > 0 ? sleepEntries[sleepEntries.length - 1] : null;
  const lastSleepIsRecent = lastSleep && (new Date(today) - new Date(lastSleep.date)) / 86400000 <= 1;
  const sleepDuration = lastSleepIsRecent ? lastSleep.duration : null;
  const shortSleep = sleepDuration !== null && sleepDuration < 7;
  const longSleep  = sleepDuration !== null && sleepDuration >= 8.5;

  // ── Meso/micro ──
  const mesoLabel = mesoCtx?.meso?.label || null;
  const microLabel = mesoCtx?.micro?.label || null;
  const mesoPhase = (() => {
    if (!mesoCtx?.meso?.startDate || !mesoCtx.meso.durationWeeks) return null;
    const start = new Date(mesoCtx.meso.startDate);
    const totalDays = mesoCtx.meso.durationWeeks * 7;
    const elapsed = Math.floor((new Date() - start) / 86400000);
    const pct = elapsed / totalDays;
    if (pct < 0.15) return "start";
    if (pct > 0.85) return "end";
    return "middle";
  })();
  const isDeloadMicro    = microLabel && /récup|deload|décharge|repos|transition/i.test(microLabel);
  const isIntensityMicro = microLabel && /intensi|pic|max|peak/i.test(microLabel);

  // ── Duration ──
  const totalDuration = todaySessions.reduce((s, sess) => s + (parseInt(sess.estimatedTime) || 0), 0);
  const isLongDay      = totalDuration >= 120;
  const isQuickSession = totalDuration > 0 && totalDuration <= 30;

  // ── Location ──
  const locations = [...new Set(todaySessions.map(s => s.location).filter(Boolean))];

  // ── Session name (première séance) ──
  const sessionName = todaySessions.length > 0 ? (todaySessions[0].title || todaySessions[0].name || null) : null;

  // ── Weight trend (7 derniers jours) ──
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

  // ── Nutrition aujourd'hui ──
  const todayMeals    = data.nutrition?.[today] || [];
  const todayCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const todayProteins = todayMeals.reduce((s, m) => s + (m.proteins || 0), 0);
  const hasNutritionToday = todayMeals.length > 0;

  // ── Demain ──
  const tomorrowIsHeavy      = tomorrowCharge >= 28;
  const tomorrowHasSuspension = tomorrowSessions.some(s =>
    /suspend|poutre|hangboard/.test((s.title || s.name || "").toLowerCase()) ||
    (s.blocks || []).some(b => b.type === "Suspension"));

  // ── Charge restante cette semaine (après aujourd'hui) ──
  const weekChargeRemaining = Math.max(0, weekChargeTotal - weekChargeSoFar - totalCharge);

  // ── Facteur Hooper dominant ──
  const dominantHooper = hooperEntry ? (() => {
    const factors = [
      { key: "fatigue",  val: hooperEntry.fatigue,  label: "fatigue physique" },
      { key: "stress",   val: hooperEntry.stress,   label: "stress" },
      { key: "soreness", val: hooperEntry.soreness, label: "courbatures" },
      { key: "sleep",    val: hooperEntry.sleep,    label: "sommeil" },
    ];
    return factors.reduce((max, f) => f.val > max.val ? f : max, factors[0]);
  })() : null;

  // ── Distinction physique / mental ──
  const physicalHooper    = hooperEntry ? hooperEntry.fatigue + hooperEntry.soreness : null;
  const mentalHooper      = hooperEntry ? hooperEntry.stress + hooperEntry.sleep : null;
  const isPhysBodyTired   = physicalHooper !== null && physicalHooper >= 9;
  const isMentalBodyTired = mentalHooper !== null && mentalHooper >= 9;

  // ── Conditions idéales + grosse séance ──
  const isPeakContext = isWellRested && totalCharge >= 25;

  // ── Taux de complétion séances cette semaine (jours passés) ──
  const weekPastSessions = weekArr.slice(0, wi + 1).flat().filter(Boolean);
  const weekPastDone     = weekPastSessions.filter(s => s.feedback?.done).length;
  const weekFeedbackRate = weekPastSessions.length > 0 ? weekPastDone / weekPastSessions.length : null;

  // ── Hier était une grosse journée ──
  const yesterdayWasBig = yesterdayCharge >= 28;

  return {
    hour, isMorning, isAfternoon, isEvening, isNight, dow,
    sessionCount, isRestDay, totalCharge, chargeLevel, totalDuration,
    isOnlyLight, isStretchingOnly, isLongDay, isQuickSession,
    hasForce, hasEndur, hasRecup, hasTech, hasMobility, hasComp, hasSuspension, hasGrimpe,
    firstSessionTime, lastSessionTime, hasEarlySession, hasLateSession,
    hasMorningSession, hasAfternoonSession, hasEveningSession, hasSplitDay,
    nextSession, minutesToNext, nextSessionSoon, nextSessionVerySoon, allSessionsPassed,
    doneSessions, missedSessions, pendingSessions, allDone, someDone, allMissed, doneCharge,
    hTotal, hFatigue, hStress, hSoreness, hSleep,
    isWellRested, isGoodShape, isModFatigued, isVeryFatigued, isOverreached,
    hasHighSoreness, hasHighStress, hasPoorSleep, hasHighFatigue,
    isPhysicallyFine, isMentallyTired,
    isPhysBodyTired, isMentalBodyTired, dominantHooper, physicalHooper, mentalHooper,
    yesterdayCharge, yesterdayWasBig, restDaysBefore, consecutiveTrainingDays,
    weekChargeSoFar, weekChargeTotal, weekSessionCountTotal, weekChargeRemaining,
    sessionsDoneThisWeek, tomorrowSessions, tomorrowCharge, tomorrowIsRest,
    tomorrowIsHeavy, tomorrowHasSuspension,
    isFirstDayWithSession, isLastDayWithSession, isHeavyWeek, isEndOfWeek,
    sleepDuration, shortSleep, longSleep,
    mesoCtx, mesoLabel, microLabel, mesoPhase, isDeloadMicro, isIntensityMicro,
    locations, sessionName,
    weightTrend, todayCalories, todayProteins, hasNutritionToday,
    isPeakContext, weekFeedbackRate,
  };
}

// ─── CONTEXTUAL GREETING PHRASE ───────────────────────────────────────────────

function getContextualPhrase(ctx) {
  const sn = ctx.sessionName; // shortcut

  // ── 1. Toutes les séances faites ──
  if (ctx.allDone) {
    const n = ctx.doneSessions.length;
    const charge = ctx.doneCharge;
    if (ctx.isEvening || ctx.isNight) {
      if (charge >= 35)  return `Charge ${charge} dans les jambes — grosse journée, reposez-vous sérieusement ce soir.`;
      if (charge >= 25 && ctx.tomorrowIsHeavy) return `Charge ${charge} abattue et gros programme demain (${ctx.tomorrowCharge}) — récupération prioritaire ce soir.`;
      if (n >= 3)        return `${n} séances bouclées aujourd'hui — belle discipline, bonne soirée.`;
      if (n >= 2)        return `${n} séances dans les jambes — journée productive, profitez de ce soir.`;
      if (charge >= 25)  return `Charge ${charge} — bon boulot, la progression se construit comme ça.`;
      return `Séance terminée — le travail est fait, bonne soirée.`;
    }
    if (ctx.isAfternoon) {
      if (charge >= 30)  return `Charge ${charge} déjà avalée ce matin — gros début de journée, le reste vous appartient.`;
      if (n >= 2)        return `${n} séances dans les jambes en milieu de journée — belle matinée productive.`;
      return `Séance bouclée — profitez du reste de l'après-midi !`;
    }
    if (charge >= 25) return `Charge ${charge} avant midi — efficace. Journée bien lancée.`;
    return `Séance${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} avant midi — en avance sur le plan !`;
  }

  // ── 2. Partiellement fait ──
  if (ctx.someDone) {
    const done      = ctx.doneSessions.length;
    const remaining = ctx.pendingSessions.length;
    const missed    = ctx.missedSessions.length;
    const remainingCharge = ctx.pendingSessions.reduce((s, sess) => s + (sess.charge || 0), 0);
    if (remaining > 0 && ctx.nextSessionVerySoon) {
      const nextName = ctx.nextSession?.session?.name || ctx.nextSession?.session?.title || null;
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — ${nextName ? `"${nextName}"` : "la prochaine"} dans ${ctx.minutesToNext} min, c'est l'heure !`;
    }
    if (remaining > 0 && remainingCharge >= 25 && ctx.isVeryFatigued) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — charge ${remainingCharge} encore au programme, mais votre Hooper est élevé. Adaptez.`;
    }
    if (remaining > 0 && remainingCharge >= 25) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — le gros morceau arrive encore (charge ${remainingCharge}), continuez.`;
    }
    if (remaining > 0) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — encore ${remaining} à venir, restez sur la lancée.`;
    }
    return `${done} séance${done > 1 ? "s" : ""} réalisée${done > 1 ? "s" : ""}${missed > 0 ? `, ${missed} manquée${missed > 1 ? "s" : ""}` : ""} — la journée avance.`;
  }

  // ── 3. Tout manqué ──
  if (ctx.allMissed) {
    if (ctx.isNight)           return "Ça n'a pas pu se faire aujourd'hui — pas grave, le corps a parfois besoin de ça. Demain on repart.";
    if (ctx.sessionCount >= 2) return `${ctx.sessionCount} séances non réalisées — si c'est voulu, parfait. Sinon, identifiez le frein pour demain.`;
    if (ctx.isVeryFatigued)    return "Séance manquée mais Hooper élevé — parfois le bon choix c'est de ne pas y aller.";
    return "Séance manquée — il est encore temps de rattraper, sinon ce sera pour demain.";
  }

  // ── 4. Surmenage (Hooper > 20) ──
  if (ctx.isOverreached) {
    if (ctx.isRestDay)        return `Hooper à ${ctx.hTotal} — votre corps est en surmenage, ce repos n'est pas un luxe, c'est une nécessité.`;
    if (ctx.isStretchingOnly) return `Hooper en surmenage (${ctx.hTotal}) — les étirements sont exactement ce qu'il faut. Respirez, tenez les positions, rien de plus.`;
    if (ctx.isOnlyLight)      return `Hooper ${ctx.hTotal} — surmenage confirmé. La séance légère est la limite à ne pas dépasser aujourd'hui.`;
    if (ctx.totalCharge >= 25) return `Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} au programme — sérieusement : adaptez ou reportez, le risque de blessure est réel.`;
    if (ctx.hasSuspension)    return `Hooper ${ctx.hTotal} et poutre au programme — les tendons sont fragiles en surmenage. Soit vous réduisez drastiquement, soit vous remettez à plus tard.`;
    if (ctx.hasForce)         return `Surmenage (Hooper ${ctx.hTotal}) et force au programme — réduisez les charges de 30–40%, le travail de qualité reste possible.`;
    if (ctx.hasRecup)         return `Hooper ${ctx.hTotal} — la séance récup est ce qu'il vous faut. N'ajoutez rien, même si vous vous sentez mieux en cours de séance.`;
    if (ctx.dominantHooper)   return `Hooper ${ctx.hTotal} — le facteur dominant est la ${ctx.dominantHooper.label}. Adaptez en conséquence.`;
    return `Indice Hooper à ${ctx.hTotal} — état de surmenage. Adaptez l'intensité, ou reposez-vous tout simplement.`;
  }

  // ── 5. Compétition ──
  if (ctx.hasComp) {
    if (ctx.isWellRested && ctx.isIntensityMicro) return "Hooper au vert en semaine d'intensité — vous arrivez à cette compétition dans un état optimal. Faites confiance au travail.";
    if (ctx.isWellRested)    return "En pleine forme physiquement — la compétition est là, faites confiance à votre préparation.";
    if (ctx.isOverreached)   return `Compétition avec un Hooper à ${ctx.hTotal} — gérez votre énergie comme un capital limité, ne partez pas fort.`;
    if (ctx.isVeryFatigued)  return "Compétition avec de la fatigue — priorisez la lecture des voies, le placement, la régularité. Pas l'intensité.";
    if (ctx.nextSessionVerySoon) return `Compétition dans ${ctx.minutesToNext} min — respirez, restez dans votre bulle. Le travail est déjà fait.`;
    return "Journée de compétition — allez-y séquence par séquence, restez dans l'instant.";
  }

  // ── 6. Deux gros jours consécutifs ──
  if (ctx.yesterdayWasBig && ctx.totalCharge >= 25 && !ctx.isRestDay) {
    if (ctx.isPhysBodyTired && ctx.hasSuspension) return `Grosse journée hier (${ctx.yesterdayCharge}) et poutre aujourd'hui avec fatigue physique élevée — les tendons ne pardonnent pas. Réduisez le volume, pas l'échauffement.`;
    if (ctx.isPhysBodyTired) return `Charge ${ctx.yesterdayCharge} hier et corps physiquement fatigué aujourd'hui — montez progressivement, sortez si ça ne répond pas.`;
    if (ctx.isGoodShape)    return `Deux grosses journées d'affilée (${ctx.yesterdayCharge} + ${ctx.totalCharge}) et bon Hooper — vous encaissez bien, restez intelligent.`;
    if (ctx.isVeryFatigued) return `Charge ${ctx.yesterdayCharge} hier, ${ctx.totalCharge} aujourd'hui et Hooper élevé — c'est le moment de vraiment adapter l'intensité.`;
    return `Charge ${ctx.yesterdayCharge} hier et ${ctx.totalCharge} aujourd'hui — échauffez-vous sérieusement et écoutez les signaux d'accumulation.`;
  }

  // ── 7. Retour après repos prolongé ──
  if (ctx.restDaysBefore >= 4 && !ctx.isRestDay) {
    if (ctx.hasSuspension) return `${ctx.restDaysBefore} jours sans entraînement — les tendons déchargés, reprenez la poutre très progressivement, même si les sensations sont bonnes.`;
    if (ctx.hasForce)      return `${ctx.restDaysBefore} jours de repos et retour en force — montez les charges progressivement, le système nerveux a besoin de se recaler.`;
    if (ctx.isWellRested)  return `${ctx.restDaysBefore} jours off et batteries au max — vous allez probablement très bien sentir cette séance. Profitez-en.`;
    return `${ctx.restDaysBefore} jours de repos, c'est reparti — l'échauffement sera crucial, prenez le temps.`;
  }
  if (ctx.restDaysBefore === 3 && !ctx.isRestDay) {
    if (ctx.isWellRested)  return `3 jours de repos et Hooper au vert — conditions idéales pour reprendre. Allez-y avec confiance.`;
    if (ctx.totalCharge >= 25) return `Reprise après 3 jours off avec une grosse charge — soyez progressif, même si l'envie est là.`;
    return `3 jours de repos — bon moment pour reprendre. Prenez soin de l'échauffement.`;
  }
  if (ctx.restDaysBefore === 2 && !ctx.isRestDay) {
    if (ctx.isWellRested)  return "Deux jours de repos et batteries rechargées — belles conditions pour cette reprise.";
    if (ctx.hasSuspension) return "Deux jours de repos avant la poutre — les tendons ont récupéré, c'est le bon moment.";
    return "Reprise après deux jours off — l'échauffement sera votre meilleur allié.";
  }

  // ── 8. Journée de repos ──
  if (ctx.isRestDay) {
    if (ctx.yesterdayWasBig && ctx.isPhysBodyTired)
      return `Charge ${ctx.yesterdayCharge} hier et fatigue physique élevée — ce repos est exactement ce qu'il faut. Pas d'improvisation aujourd'hui.`;
    if (ctx.yesterdayCharge >= 25)
      return `Charge ${ctx.yesterdayCharge} hier — laissez les muscles se reconstruire, c'est là que la progression opère.`;
    if (ctx.isOverreached)
      return `Hooper à ${ctx.hTotal} — votre corps est en surmenage. Ce repos n'est pas optionnel.`;
    if (ctx.isVeryFatigued && ctx.dominantHooper)
      return `Fatigue élevée (facteur dominant : ${ctx.dominantHooper.label}) — bon choix de ne pas forcer aujourd'hui.`;
    if (ctx.hasPoorSleep && ctx.isVeryFatigued)
      return "Mauvaise nuit + Hooper élevé — récupération double à l'ordre du jour. Dormez si vous pouvez.";
    if (ctx.hasPoorSleep)
      return "Mauvaise nuit de sommeil — profitez du repos pour compenser. Évitez les écrans avant de dormir ce soir.";
    if (ctx.tomorrowHasSuspension && ctx.tomorrowIsHeavy)
      return `Repos aujourd'hui, poutre et charge ${ctx.tomorrowCharge} demain — stratégique. Hydratez-vous bien.`;
    if (ctx.tomorrowIsHeavy)
      return `Repos aujourd'hui et charge ${ctx.tomorrowCharge} demain — rechargez sérieusement : sommeil, hydratation, alimentation.`;
    if (ctx.tomorrowSessions.length >= 2)
      return `Repos stratégique avant ${ctx.tomorrowSessions.length} séances demain — mangez bien et couchez-vous à l'heure.`;
    if (ctx.isNight)
      return "Nuit de récupération en vue — dormez bien, c'est là que le corps s'adapte et progresse.";
    if (ctx.dow === 0 || ctx.dow === 6) {
      if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.8)
        return `Super semaine d'entraînement — ${Math.round(ctx.weekFeedbackRate * 100)}% de complétion. Week-end de repos bien mérité.`;
      if (ctx.isWellRested) return "Week-end off et Hooper au vert — profitez vraiment de cette journée.";
      return "Week-end de repos — rechargez les batteries pour la semaine à venir.";
    }
    if (ctx.isWellRested)   return "Journée off et excellent Hooper — vous êtes au top. Profitez-en sans culpabiliser.";
    if (ctx.isGoodShape)    return "Bien récupéré — profitez de cette journée de repos.";
    if (ctx.isDeloadMicro)  return "Semaine de décharge — le repos fait partie intégrante du plan d'entraînement, pas la peine de compenser.";
    if (ctx.weekChargeSoFar >= 60)
      return `Déjà ${ctx.weekChargeSoFar} de charge cette semaine — ce repos est une décision d'entraînement, pas un abandon.`;
    if (ctx.isEndOfWeek && ctx.sessionsDoneThisWeek >= 3)
      return `${ctx.sessionsDoneThisWeek} séances cette semaine — repos bien mérité pour terminer.`;
    if (ctx.shortSleep)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil seulement — profitez de cette journée pour rattraper le sommeil.`;
    const restMessages = [
      "L'adaptation se fait dans le repos — savourez cette journée off.",
      "Le corps se renforce quand il récupère. Journée off, c'est du travail invisible.",
      "Pas de séance aujourd'hui — profitez, vous l'avez mérité.",
      "Repos actif ou complet, à vous de choisir — l'important c'est de récupérer vraiment.",
      "La progression passe autant par le repos que par l'entraînement.",
      "Journée off — rechargez les batteries.",
      "Profitez de votre journée de repos, sans culpabiliser.",
    ];
    return restMessages[ctx.dow % restMessages.length];
  }

  // ── 9. Séance imminente (< 30 min) ──
  if (ctx.nextSessionVerySoon) {
    const s      = ctx.nextSession.session;
    const sName  = s.title || s.name || null;
    const sCharge = s.charge || 0;
    if (ctx.hasSuspension && ctx.isPhysBodyTired)
      return `Poutre dans ${ctx.minutesToNext} min et fatigue physique élevée — commencez l'échauffement doigts maintenant, pas au moment de raccrocher.`;
    if (ctx.hasSuspension)
      return `${sName ? `"${sName}"` : "Poutre"} dans ${ctx.minutesToNext} min — mobilisez les doigts progressivement dès maintenant.`;
    if (sCharge >= 25 && ctx.isMorning)
      return `Charge ${sCharge} dans ${ctx.minutesToNext} min — l'échauffement est non-négociable ce matin, le corps est encore froid.`;
    if (sCharge >= 25)
      return `${sName ? `"${sName}"` : "Séance"} dans ${ctx.minutesToNext} min (charge ${sCharge}) — préparez-vous sérieusement.`;
    if (sName)
      return `"${sName}" dans ${ctx.minutesToNext} min — c'est bientôt l'heure !`;
    return `Séance dans ${ctx.minutesToNext} min — préparez-vous !`;
  }

  // ── 10. Conditions idéales + grosse séance ──
  if (ctx.isPeakContext) {
    if (ctx.hasSuspension && ctx.hasForce)
      return `Hooper au vert et charge ${ctx.totalCharge} — conditions optimales. Force et poutre aujourd'hui, c'est exactement le bon moment pour chercher de nouvelles perfs.`;
    if (ctx.hasSuspension)
      return `Hooper au vert — vos tendons sont frais et reposés. Conditions idéales pour la poutre, cherchez vos limites aujourd'hui.`;
    if (ctx.hasForce && ctx.tomorrowIsRest)
      return `Forme optimale + repos demain — c'est maintenant qu'il faut tout donner en force. Faites-le.`;
    if (ctx.hasForce)
      return `Excellent Hooper et charge ${ctx.totalCharge} — conditions parfaites. Allez chercher du max en force.`;
    if (ctx.hasEndur)
      return `Hooper au vert pour une séance d'endurance — le corps va répondre. Partez confiant et maintenez la qualité.`;
    if (ctx.isIntensityMicro)
      return `Forme optimale en semaine d'intensité — le timing est parfait. Poussez les limites intelligemment.`;
    return `Hooper au vert et charge ${ctx.totalCharge} au programme — les conditions sont réunies. Allez chercher la performance.`;
  }

  // ── 11. Très fatigué (Hooper 17–20) ──
  if (ctx.isVeryFatigued) {
    if (ctx.isStretchingOnly)
      return `Hooper à ${ctx.hTotal} — les étirements du jour tombent parfaitement. Prenez le temps sur chaque position, c'est tout ce que le corps demande.`;
    if (ctx.isOnlyLight)
      return `Hooper ${ctx.hTotal} — fatigué mais séance légère au programme. Parfait dosage, ne cherchez pas à en faire plus.`;
    if (ctx.hasRecup && ctx.isPhysBodyTired)
      return `Fatigue physique marquée (Hooper ${ctx.hTotal}) et récup au programme — c'est exactement ce qu'il faut. Résistez à l'envie d'ajouter.`;
    if (ctx.hasRecup)
      return `Hooper ${ctx.hTotal} et séance récup — la séance est adaptée à votre état. Faites-la bien, sans en faire plus.`;
    if (ctx.hasSuspension && ctx.isPhysBodyTired)
      return `Fatigue physique élevée (${ctx.dominantHooper?.label || "corps fatigué"}) et poutre au programme — risque tendineux. Soit vous réduisez le volume de moitié, soit vous remettez à demain.`;
    if (ctx.hasSuspension)
      return `Hooper ${ctx.hTotal} avant la poutre — écoutez vos doigts et vos tendons plus que d'habitude. Pas d'ego sur les charges.`;
    if (ctx.hasForce && ctx.isMentalBodyTired && !ctx.isPhysBodyTired)
      return `Fatigue surtout mentale (${ctx.dominantHooper?.label || "stress/sommeil"}) et force au programme — physiquement ça devrait aller. Mais restez lucide sur l'effort.`;
    if (ctx.hasForce)
      return `Hooper ${ctx.hTotal} et force aujourd'hui — montez les charges très progressivement. Si le corps ne répond pas à 60%, sortez et récupérez.`;
    if (ctx.hasEndur)
      return `Fatigue élevée pour une séance d'endurance — réduisez l'intensité cible de 15–20%, le volume peut rester.`;
    if (ctx.totalCharge >= 25)
      return `Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} prévue — c'est trop. Réduisez l'intensité ou remettez à demain si possible.`;
    if (ctx.isMorning && ctx.dominantHooper?.key === "sleep")
      return `Mauvaise nuit dans les pattes (Hooper ${ctx.hTotal}) — démarrez très doucement, le corps va probablement se réveiller progressivement.`;
    if (ctx.isMorning)
      return `Fatigué ce matin (Hooper ${ctx.hTotal}) — prenez le double de temps d'échauffement habituel et voyez comment le corps répond.`;
    return `Hooper à ${ctx.hTotal} — gérez l'effort comme un capital limité. Adaptez l'intensité, pas le contenu.`;
  }

  // ── 12. Journée fractionnée (matin + soir) ──
  if (ctx.hasSplitDay) {
    if (ctx.isWellRested && ctx.totalCharge >= 30)
      return `Double séance avec charge ${ctx.totalCharge} et Hooper au vert — gérez bien l'énergie entre les deux, mangez vraiment entre les séances.`;
    if (ctx.isWellRested)
      return `${ctx.sessionCount} séances aujourd'hui et vous êtes frais — journée productive, dosez pour les deux.`;
    if (ctx.totalCharge >= 30)
      return `Journée bi-séance, charge ${ctx.totalCharge} — alimentation et hydratation entre les deux, c'est pas optionnel.`;
    if (ctx.hasSuspension)
      return `Double séance avec poutre — prévoyez au moins 3h de récupération entre les deux et ne rechargez pas les doigts à froid.`;
    return `${ctx.sessionCount} séances réparties dans la journée — récupérez vraiment entre chaque, même 20 min de repos.`;
  }

  // ── 13. Longue série de jours d'entraînement ──
  if (ctx.consecutiveTrainingDays >= 6) {
    if (ctx.tomorrowIsRest) return `6ème jour d'affilée — dernière ligne droite, repos demain. Finissez proprement.`;
    if (ctx.isVeryFatigued) return `${ctx.consecutiveTrainingDays} jours consécutifs et Hooper élevé — planifiez un repos dans les 48h, vous accumulez du passif.`;
    return `${ctx.consecutiveTrainingDays} jours d'entraînement de suite — l'accumulation est réelle. Soyez attentif aux signaux de sur-sollicitation.`;
  }
  if (ctx.consecutiveTrainingDays === 5) {
    if (ctx.tomorrowIsRest) return `5ème jour de suite — repos demain, tenez bon sur cette dernière.`;
    return "5 jours consécutifs — fatigue accumulée, soyez conservateur sur les charges aujourd'hui.";
  }
  if (ctx.consecutiveTrainingDays === 4) {
    if (ctx.isGoodShape && ctx.hasSuspension) return "4ème jour de suite et toujours en forme — mais les tendons fatiguent moins vite que la perception. Restez attentif.";
    if (ctx.isGoodShape) return "4ème jour consécutif et bon Hooper — vous encaissez bien, restez discipliné sur l'échauffement.";
    return "4 jours de suite — le corps accumule, même sans signal fort. Adaptez si nécessaire.";
  }

  // ── 14. Semaine de décharge ──
  if (ctx.isDeloadMicro) {
    if (ctx.hasSuspension) return "Semaine de décharge et poutre au programme — réduisez le volume, pas nécessairement les charges de travail. L'objectif c'est la récupération.";
    if (ctx.hasForce)      return "Décharge + force — charges normales si vous le souhaitez, mais volume réduit. Laissez le système récupérer.";
    if (ctx.totalCharge >= 20) return `Semaine de décharge mais charge ${ctx.totalCharge} — restez sous vos capacités habituelles, c'est le principe de la semaine.`;
    return "Semaine de décharge — le mouvement sans la fatigue. C'est une semaine d'entraînement comme les autres, juste plus douce.";
  }

  // ── 15. Séance tardive (nuit) ──
  if (ctx.isNight) {
    // Après minuit (0h–5h) : les séances du jour sont forcément passées même si
    // leur heure (ex. 17:00 = 1020 min) est > nowMin (ex. 1h = 60 min)
    if (ctx.hour < 5) {
      const tmwCount = ctx.tomorrowSessions.length;
      const tmwCharge = ctx.tomorrowCharge;
      if (ctx.sessionCount > 0) {
        // Séances du jour passées → anticiper demain
        if (ctx.tomorrowIsRest)
          return "Séances du jour passées. Repos demain aussi — profitez-en pour vraiment récupérer.";
        if (ctx.tomorrowHasSuspension && ctx.tomorrowIsHeavy)
          return `Séances du jour passées. Demain : poutre + charge ${tmwCharge} — dormez au moins 8h, les tendons récupèrent la nuit.`;
        if (ctx.tomorrowIsHeavy)
          return `Séances du jour passées. Grosse journée demain (charge ${tmwCharge}) — sommeil prioritaire, éteignez les écrans.`;
        if (tmwCount >= 2)
          return `Séances du jour passées. ${tmwCount} séances demain — reposez-vous sérieusement cette nuit.`;
        if (tmwCount === 1)
          return "Séances du jour passées. Bon repos — récupération et sommeil pour attaquer demain.";
        return "Les séances du jour sont passées. Bon repos — la récupération commence maintenant.";
      }
      // Jour de repos, anticiper demain
      if (ctx.tomorrowIsRest)
        return "Repos aujourd'hui et demain — profitez-en, c'est planifié.";
      if (ctx.tomorrowHasSuspension && ctx.tomorrowIsHeavy)
        return `Poutre et charge ${tmwCharge} demain — dormez bien, les tendons récupèrent principalement la nuit.`;
      if (ctx.tomorrowIsHeavy)
        return `Charge ${tmwCharge} demain — rechargez cette nuit : sommeil, hydratation, pas d'écrans.`;
      if (tmwCount >= 1)
        return "Nuit calme avant l'entraînement de demain — dormez bien.";
      return "Nuit calme — dormez bien, la progression se fait autant la nuit qu'à l'entraînement.";
    }
    // ≥ 22h : séances à venir ou passées
    if (ctx.allSessionsPassed) return "Les séances sont passées — si c'est fait, bravo. Sinon, reposez-vous et attaquez proprement demain.";
    if (ctx.hasSuspension) return "Poutre en pleine nuit — les tendons sont froids. Échauffez-vous deux fois plus que d'habitude, sans exception.";
    if (ctx.hasForce)      return "Force très tard le soir — le corps est en mode récupération, l'échauffement sera long mais indispensable.";
    return "Séance très tardive — prenez le double de temps d'échauffement, le corps refroidit vite à cette heure.";
  }

  // ── 16. Séance le soir tard (≥ 20h) ──
  if (ctx.hasLateSession && ctx.isEvening) {
    if (ctx.hasSuspension && ctx.hasHighSoreness)
      return "Poutre en soirée avec des courbatures — les tendons et les muscles sont déjà sollicités. Échauffement long, charges réduites.";
    if (ctx.hasSuspension)
      return "Poutre en soirée — les tendons mettent plus de temps à chauffer. 20 min d'échauffement progressif minimum.";
    if (ctx.hasForce)
      return "Force tard le soir — bien s'échauffer même si le corps semble raide. C'est normal en fin de journée.";
    if (ctx.hasEndur && ctx.totalCharge >= 20)
      return `Endurance en soirée avec charge ${ctx.totalCharge} — dosez pour ne pas trop perturber le sommeil de récupération.`;
    if (ctx.hasMobility)
      return "Mobilité en soirée — parfait pour décompresser et préparer le sommeil.";
  }

  // ── 17. Séance tôt le matin (< 8h) ──
  if (ctx.hasEarlySession && ctx.isMorning) {
    if (ctx.hasPoorSleep && ctx.hasSuspension)
      return `Mauvaise nuit (${ctx.sleepDuration?.toFixed(1) || "peu"}h) et poutre tôt ce matin — tendons froids + fatigue cumulée. Soyez très progressif, ou repoussez.`;
    if (ctx.hasPoorSleep)
      return `${ctx.sleepDuration?.toFixed(1) || "Peu"}h de sommeil et séance matinale — adaptez l'intensité, votre corps n'est pas à 100% ce matin.`;
    if (ctx.hasForce && !ctx.longSleep)
      return "Force au réveil — le système nerveux met du temps à démarrer. Prenez 15–20 min d'échauffement, même si vous êtes pressé.";
    if (ctx.hasSuspension)
      return "Poutre tôt le matin — les tendons sont froids et rigides. Échauffement très progressif, sans raccourcis.";
    if (ctx.longSleep)
      return "Belle nuit et séance matinale — meilleures conditions pour tôt le matin. Lancez-vous !";
    if (ctx.shortSleep)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil et séance matinale — restez à l'écoute, adaptez si le corps ne suit pas.`;
    return "Séance tôt ce matin — réveillez bien le corps avant d'attaquer. L'échauffement compte double.";
  }

  // ── 18. Charge brutale (> 30) ──
  if (ctx.chargeLevel === "brutal") {
    if (ctx.isPeakContext)
      return `Charge ${ctx.totalCharge} et forme optimale — la combinaison idéale pour progresser. Allez chercher du neuf.`;
    if (ctx.isWellRested && ctx.tomorrowIsRest)
      return `Charge ${ctx.totalCharge}, Hooper au vert et repos demain — conditions parfaites pour tout donner aujourd'hui.`;
    if (ctx.isWellRested)
      return `Charge ${ctx.totalCharge} et excellent Hooper — les conditions sont là, soyez ambitieux mais gardez la technique.`;
    if (ctx.tomorrowIsRest)
      return `Charge ${ctx.totalCharge} et repos demain — donnez ce que vous pouvez aujourd'hui, vous récupérerez bien.`;
    if (ctx.shortSleep)
      return `Charge ${ctx.totalCharge} avec ${ctx.sleepDuration?.toFixed(1) || "peu"}h de sommeil — réduisez l'intensité de 20%, ne vous blessez pas pour une séance.`;
    if (ctx.consecutiveTrainingDays >= 3)
      return `Charge ${ctx.totalCharge} avec ${ctx.consecutiveTrainingDays} jours dans les jambes — gérez la fatigue accumulée, ne partez pas sur votre max.`;
    return `Charge ${ctx.totalCharge} au programme — grosse journée. Échauffement soigné, exécution propre, récupération sérieuse.`;
  }

  // ── 19. Séance uniquement étirements ──
  if (ctx.isStretchingOnly) {
    if (ctx.yesterdayWasBig)
      return `Étirements après la grosse journée d'hier (charge ${ctx.yesterdayCharge}) — concentrez-vous sur les zones qui tirent. Ça compte vraiment.`;
    if (ctx.hasHighSoreness)
      return `Courbatures notables et étirements au programme — tenez chaque position 45–60 secondes minimum, respirez dans l'inconfort.`;
    if (ctx.consecutiveTrainingDays >= 3)
      return `${ctx.consecutiveTrainingDays} jours d'entraînement et étirements aujourd'hui — votre corps va vous remercier. Faites-le consciencieusement.`;
    if (ctx.isEvening)
      return "Étirements en soirée — tenez les positions, respirez profondément, c'est la meilleure préparation au sommeil.";
    if (ctx.isMorning)
      return "Étirements au réveil — prenez le temps sur chaque position. Ce que vous faites là se voit sur le long terme.";
    return "Séance d'étirements — qualité et respiration sur chaque position. C'est là que se construit la mobilité.";
  }

  // ── 20. Séance légère (récup/mobilité, charge ≤ 5) ──
  if (ctx.isOnlyLight) {
    if (ctx.yesterdayWasBig) return `Récup active après la charge ${ctx.yesterdayCharge} d'hier — parfait. Restez bien en dessous de l'effort, c'est le but.`;
    if (ctx.hasHighSoreness) return `Courbatures + séance légère — exactement ce qu'il faut. Qualité du mouvement, pas d'intensité.`;
    if (ctx.hasMobility && ctx.isEvening)  return "Mobilité en soirée — décompressez vraiment, chaque position tenue compte.";
    if (ctx.hasMobility && ctx.isMorning)  return "Mobilité au réveil — prenez le temps, c'est un investissement sur la durée.";
    if (ctx.hasRecup)   return "Séance de récupération — l'objectif c'est la qualité du mouvement et la circulation. Pas l'effort.";
    return "Séance légère au programme — profitez-en pour soigner la technique et la qualité.";
  }

  // ── 21. Fatigué mentalement mais physiquement bien ──
  if (ctx.isMentallyTired) {
    if (ctx.hasForce && ctx.hasGrimpe)
      return `Stress élevé mais corps en forme — la grimpe est un des meilleurs anti-stress qui existe. Utilisez cette séance.`;
    if (ctx.hasForce)
      return "Beaucoup de stress mais physiquement OK — concentrez-vous sur l'exécution technique, ça vide la tête.";
    if (ctx.hasMobility || ctx.isOnlyLight)
      return "Beaucoup de stress — la séance de mobilité va faire du bien. Respirez dans chaque position.";
    if (ctx.hasGrimpe)
      return "Stress élevé et grimpe au programme — l'escalade demande de l'attention totale, profitez-en pour couper du bruit mental.";
    return "Stress élevé mais physiquement ça va — la séance peut être un excellent exutoire. Allez-y.";
  }

  // ── 22. Courbatures élevées + séance exigeante ──
  if (ctx.hasHighSoreness) {
    if (ctx.hasForce && ctx.hasSuspension)
      return `Courbatures (${ctx.hSoreness}/7) et séance force + poutre — échauffez-vous longuement, réduisez les charges, et si ça tire vraiment, sortez.`;
    if (ctx.hasSuspension)
      return `Courbatures notables (${ctx.hSoreness}/7) et poutre au programme — les tendons sont souvent affectés en même temps que les muscles. Soyez vigilant.`;
    if (ctx.hasForce)
      return `Courbatures à ${ctx.hSoreness}/7 et force aujourd'hui — échauffez-vous longuement. Les courbatures peuvent masquer la vraie fatigue musculaire.`;
    if (ctx.hasGrimpe)
      return `Courbatures notables — privilégiez la technique et les mouvements fluides. Pas de séance de difficulté max quand les muscles parlent.`;
  }

  // ── 23. Mauvais sommeil + entraînement ──
  if (ctx.hasPoorSleep) {
    if (ctx.hasForce && ctx.totalCharge >= 20)
      return `Mauvaise nuit et force au programme (charge ${ctx.totalCharge}) — le système nerveux est sous-optimal. Réduisez les charges de 15–20%, pas la peine de forcer.`;
    if (ctx.hasSuspension)
      return "Mauvaise nuit de sommeil et poutre aujourd'hui — la réactivité neuro-musculaire est réduite. Progressif et attentif.";
    if (ctx.totalCharge >= 20)
      return `Sommeil insuffisant et charge ${ctx.totalCharge} — adaptez l'intensité si le corps ne répond pas. Une bonne séance à 80% vaut mieux qu'une séance ratée à 100%.`;
    return "Sommeil difficile — allez-y progressivement, votre corps a besoin de temps pour se réveiller vraiment.";
  }

  // ── 24. Fatigue modérée ──
  if (ctx.isModFatigued) {
    if (ctx.hasRecup)
      return `Un peu de fatigue (Hooper ${ctx.hTotal}) et récup au programme — combo parfait. N'ajoutez rien d'intensif.`;
    if (ctx.hasSuspension && ctx.isPhysBodyTired)
      return `Fatigue physique modérée et poutre — soyez attentif aux sensations doigts. C'est le signal à ne pas ignorer.`;
    if (ctx.hasSuspension)
      return `Fatigue modérée (Hooper ${ctx.hTotal}) avant la poutre — échauffez bien les doigts et restez à l'écoute.`;
    if (ctx.totalCharge >= 25)
      return `Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} — fatigue modérée, restez lucide sur l'intensité réelle.`;
    if (ctx.hasForce)
      return `Fatigue modérée et force au programme — montez progressivement, 80% du max est souvent le bon dosage dans cet état.`;
    if (ctx.hasEndur)
      return `Hooper ${ctx.hTotal} pour une séance d'endurance — gardez un effort dosé, la qualité sur la durée compte plus que l'intensité.`;
    if (ctx.dominantHooper)
      return `Fatigue modérée — le facteur dominant aujourd'hui c'est la ${ctx.dominantHooper.label}. Gardez ça en tête.`;
    return `Hooper à ${ctx.hTotal} — un peu de fatigue, rien d'alarmant. Restez à l'écoute.`;
  }

  // ── 25. Charge lourde (21–30) ──
  if (ctx.chargeLevel === "heavy") {
    if (ctx.isWellRested && ctx.tomorrowIsHeavy)
      return `Charge ${ctx.totalCharge} avec forme optimale, et encore ${ctx.tomorrowCharge} demain — allez-y fort mais gardez quelque chose en réserve.`;
    if (ctx.isWellRested)
      return `Charge ${ctx.totalCharge} et excellent Hooper — conditions parfaites pour cette séance. Cherchez la progression.`;
    if (ctx.tomorrowIsRest)
      return `Charge ${ctx.totalCharge} et repos demain — poussez un peu plus que d'habitude, vous récupérerez.`;
    if (ctx.consecutiveTrainingDays >= 3)
      return `Charge ${ctx.totalCharge} avec ${ctx.consecutiveTrainingDays} jours dans les jambes — gérez l'accumulation, ne partez pas sur le max.`;
    if (ctx.weekChargeRemaining >= 30)
      return `Charge ${ctx.totalCharge} aujourd'hui et encore ${ctx.weekChargeRemaining} prévus cette semaine — pensez au long terme.`;
    return `Charge ${ctx.totalCharge} au programme — séance conséquente. Échauffement soigné.`;
  }

  // ── 26. Journée multi-séances ──
  if (ctx.sessionCount >= 2) {
    if (ctx.isWellRested && ctx.totalDuration >= 120)
      return `${ctx.sessionCount} séances (${ctx.totalDuration} min au total) et forme optimale — mangez entre les deux et gérez l'énergie sur la durée.`;
    if (ctx.isWellRested)
      return `${ctx.sessionCount} séances aujourd'hui et vous êtes frais — journée productive. Dosez la première pour assurer la deuxième.`;
    if (ctx.tomorrowIsRest)
      return `${ctx.sessionCount} séances et repos demain — donnez tout sur chacune.`;
    if (ctx.totalDuration >= 120)
      return `${ctx.sessionCount} séances, ${ctx.totalDuration} min total — alimentation et hydratation entre les deux, c'est la base.`;
    return `${ctx.sessionCount} séances au programme — gérez votre énergie sur la journée.`;
  }

  // ── 27. Séance dans moins de 90 min ──
  if (ctx.nextSessionSoon && ctx.minutesToNext > 30) {
    const s     = ctx.nextSession.session;
    const sName = s.title || s.name || null;
    if (ctx.hasSuspension)
      return `Poutre dans ${ctx.minutesToNext} min — commencez à mobiliser les doigts progressivement maintenant.`;
    if (s.charge >= 25)
      return `Séance dans ${ctx.minutesToNext} min (charge ${s.charge}) — pensez à l'échauffement. Ne commencez pas froid.`;
    if (sName)
      return `"${sName}" dans ${ctx.minutesToNext} min — préparez-vous.`;
    return `Prochaine séance dans ${ctx.minutesToNext} min — bientôt l'heure.`;
  }

  // ── 28. Demain est une grosse journée ──
  if (ctx.tomorrowIsHeavy && !ctx.isRestDay) {
    if (ctx.tomorrowHasSuspension)
      return `Demain : poutre et charge ${ctx.tomorrowCharge} — soignez votre récup ce soir (sommeil, alimentation) pour des tendons frais demain.`;
    return `Demain charge ${ctx.tomorrowCharge} au programme — récupération sérieuse ce soir, dormez suffisamment.`;
  }

  // ── 29. Repos demain ──
  if (ctx.tomorrowIsRest) {
    if (ctx.hasForce && ctx.isWellRested) return "Force et repos demain — allez chercher du max aujourd'hui, les conditions sont là.";
    if (ctx.hasSuspension && ctx.isWellRested) return "Poutre et repos demain — tenez-vous en bonne forme, c'est le moment d'explorer vos limites.";
    if (ctx.hasForce)      return "Force et repos demain — poussez un peu plus que d'habitude, vous récupérerez.";
    if (ctx.hasSuspension) return "Poutre et repos demain — conditions correctes pour travailler sur les charges.";
    return "Repos demain — profitez de cette séance pour bien travailler, la récupération suit.";
  }

  // ── 30. Semaine : première / dernière séance ──
  if (ctx.isFirstDayWithSession) {
    if (ctx.mesoPhase === "start" && ctx.mesoLabel)
      return `Début du "${ctx.mesoLabel}" et première séance de la semaine — posez les bases proprement.`;
    if (ctx.hasForce && ctx.isWellRested)
      return "Force pour ouvrir la semaine et forme optimale — belle manière de poser le ton.";
    if (ctx.hasSuspension)
      return "Poutre pour ouvrir la semaine — les tendons sont reposés, c'est le bon moment.";
    if (ctx.isMorning && ctx.isWellRested)
      return "Première séance de la semaine et forme au top — lancez la machine.";
    if (ctx.isMorning)
      return "C'est parti pour la semaine — posez un bon rythme dès aujourd'hui.";
    return "Première séance de la semaine — donnez le ton.";
  }
  if (ctx.isLastDayWithSession) {
    if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.85 && ctx.sessionsDoneThisWeek >= 3)
      return `Dernière séance après une excellente semaine (${Math.round(ctx.weekFeedbackRate * 100)}% complétion) — finissez en beauté.`;
    if (ctx.sessionsDoneThisWeek >= 4)
      return `Dernière séance de la semaine — ${ctx.sessionsDoneThisWeek} déjà dans les jambes, belle semaine. Terminez proprement.`;
    if (ctx.sessionsDoneThisWeek >= 2)
      return `Dernière séance de la semaine — ${ctx.sessionsDoneThisWeek} faites, finissez sur une bonne note.`;
    return "Dernière séance de la semaine — terminez sur un effort de qualité.";
  }

  // ── 31. Forme optimale ──
  if (ctx.isWellRested) {
    if (ctx.hasSuspension && ctx.hasForce)
      return "Hooper au vert — parfait pour forcer sur la poutre et en grimpe. Profitez-en vraiment.";
    if (ctx.hasSuspension && ctx.mesoPhase === "end")
      return `Fin du "${ctx.mesoLabel}" et Hooper optimal — c'est maintenant qu'on teste les acquis. Allez sur la poutre avec ambition.`;
    if (ctx.hasSuspension)
      return "Doigts reposés et forme au top — c'est maintenant qu'il faut pousser les charges sur la poutre.";
    if (ctx.hasForce && ctx.isIntensityMicro)
      return "Forme optimale en semaine d'intensité — vous êtes dans le bon état pour aller chercher du max.";
    if (ctx.hasForce)
      return "Excellent Hooper et force au programme — allez chercher vos limites aujourd'hui.";
    if (ctx.hasEndur && ctx.totalDuration >= 90)
      return `Bien récupéré pour ${ctx.totalDuration} min d'endurance — le corps va répondre. Partez confiant.`;
    if (ctx.hasEndur)
      return "Forme au top pour l'endurance — maintenez la qualité sur toute la durée.";
    if (ctx.hasTech)
      return "Esprit et corps frais pour la technique — c'est dans cet état qu'on automatise les bons patterns.";
    if (ctx.hasGrimpe && ctx.locations.length > 0)
      return `Forme optimale et direction ${ctx.locations[0]} — excellente séance en vue.`;
    return "Hooper au vert — vous êtes dans les meilleures conditions. Soyez ambitieux.";
  }
  if (ctx.isGoodShape) {
    if (ctx.hasSuspension) return "Bonne forme et poutre au programme — les conditions sont réunies pour un bon travail.";
    if (ctx.hasForce)  return "Bon Hooper et force au programme — cherchez de belles performances.";
    if (ctx.hasEndur)  return "Bien récupéré — idéal pour mettre du volume en endurance.";
    if (ctx.hasGrimpe) return "Bonne forme générale — allez grimper avec confiance.";
    return "Bonne forme générale — bonne séance en vue.";
  }

  // ── 32. Sommeil court ──
  if (ctx.shortSleep) {
    if (ctx.hasSuspension)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil et poutre aujourd'hui — la récupération tendineuse passe par le sommeil. Soyez particulièrement attentif.`;
    if (ctx.totalCharge >= 20)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil et charge ${ctx.totalCharge} — votre capacité de performance est réduite. Adaptez, ne forcez pas.`;
    return `${ctx.sleepDuration.toFixed(1)}h de sommeil — restez à l'écoute, adaptez si le corps ne répond pas normalement.`;
  }

  // ── 33. Long sommeil ──
  if (ctx.longSleep) {
    if (ctx.hasSuspension) return "Belle nuit de sommeil — les tendons ont bien récupéré. Conditions idéales pour la poutre.";
    if (ctx.hasForce) return "Belle nuit de sommeil et force au programme — le système nerveux est frais. Profitez-en.";
    return "Belle nuit de sommeil — vous devriez bien répondre à l'effort aujourd'hui.";
  }

  // ── 34. Semaine chargée ──
  if (ctx.isHeavyWeek && ctx.isEndOfWeek) {
    if (ctx.weekFeedbackRate !== null && ctx.weekFeedbackRate >= 0.8)
      return `Semaine chargée (${ctx.weekChargeTotal}) et très bonne complétion — finissez-la bien, le repos de demain sera mérité.`;
    return `Semaine à ${ctx.weekChargeTotal} de charge — fin de semaine, tenez le cap. Récupération sérieuse à prévoir.`;
  }

  // ── 35. Phase mésocycle ──
  if (ctx.mesoPhase === "start" && ctx.mesoLabel) {
    if (ctx.hasForce) return `Début du "${ctx.mesoLabel}" avec force au programme — posez les bases de charge proprement, la progression vient après.`;
    return `Début du "${ctx.mesoLabel}" — installez le rythme et les repères. La progression viendra par accumulation.`;
  }
  if (ctx.mesoPhase === "end" && ctx.mesoLabel) {
    if (ctx.isWellRested) return `Fin du "${ctx.mesoLabel}" et forme optimale — profitez de ces dernières séances pour aller chercher du max.`;
    return `Fin du "${ctx.mesoLabel}" en vue — restez concentré et propre jusqu'à la fin du bloc.`;
  }

  // ── 36. Semaine d'intensité ──
  if (ctx.isIntensityMicro) {
    if (ctx.hasSuspension) return "Semaine d'intensité et poutre au programme — c'est la semaine pour chercher de nouvelles charges. Gardez la technique.";
    if (ctx.hasForce)      return "Semaine d'intensité et force — poussez les charges intelligemment, c'est fait pour ça.";
    return "Semaine d'intensité — dépassez vos repères habituels mais gardez la qualité d'exécution.";
  }

  // ── 37. Suspension (sans autre condition déclenchée) ──
  if (ctx.hasSuspension) {
    if (ctx.weightTrend === "down" && ctx.hasForce)
      return "Poutre au programme avec un poids en baisse — méfiance sur les performances relatives, votre ratio force/poids a peut-être changé.";
    if (ctx.isMorning && ctx.totalCharge >= 20)
      return `Poutre ce matin (charge ${ctx.totalCharge}) — 20 min minimum d'échauffement progressif avant de charger. Les tendons matinaux ne pardonnent pas.`;
    if (ctx.isMorning) return "Poutre ce matin — prenez le temps de chauffer progressivement les doigts avant de charger.";
    if (ctx.isEvening) return "Poutre en soirée — les tendons sont plus préparés en fin de journée. Profitez-en.";
    return "Séance de suspension — la patience sur l'échauffement fait vraiment toute la différence.";
  }

  // ── 38. Tendance poids ──
  if (ctx.weightTrend === "down" && ctx.hasForce && !ctx.hasNutritionToday && ctx.isAfternoon) {
    return "Poids en baisse et séance de force en après-midi — pensez à bien manger avant, les performances en force sont très sensibles à l'alimentation.";
  }
  if (ctx.weightTrend === "down" && ctx.hasForce) {
    return "Poids en baisse ces derniers jours et force au programme — assurez-vous d'avoir bien mangé, surtout en protéines.";
  }

  // ── 39. Séance courte (≤ 30 min) ──
  if (ctx.isQuickSession) {
    if (ctx.hasForce)      return `Séance de force courte (${ctx.totalDuration} min) — allez droit au but, pas de temps à perdre sur l'accessoire.`;
    if (ctx.hasSuspension) return `${ctx.totalDuration} min de suspension — court mais dense. Échauffement complet même pour une courte séance.`;
    return `Séance courte (${ctx.totalDuration} min) — efficacité maximale, chaque minute compte.`;
  }

  // ── 40. Longue journée (≥ 120 min) ──
  if (ctx.isLongDay) {
    if (ctx.hasForce && ctx.hasEndur)
      return `${ctx.totalDuration} min avec force et endurance — gérez bien l'ordre et la récupération entre les parties.`;
    if (ctx.isWellRested)
      return `${ctx.totalDuration} min de séance et forme optimale — belle journée d'entraînement en vue. Hydratez-vous.`;
    return `Grosse séance de ${ctx.totalDuration} min — alimentation, hydratation, et prenez les pauses si besoin.`;
  }

  // ── 41. Combos heure × type ──
  if (ctx.isMorning) {
    if (ctx.hasForce && ctx.weekChargeSoFar === 0)
      return "Force pour ouvrir la semaine ce matin — idéal pour poser un bon rythme dès le départ.";
    if (ctx.hasForce)    return "Force ce matin — le système nerveux démarre doucement, prenez le temps de l'activer.";
    if (ctx.hasEndur)    return "Endurance au petit matin — idéal pour commencer la journée par quelque chose de solide.";
    if (ctx.hasTech)     return "Technique ce matin — l'esprit frais, concentrez-vous sur la précision du mouvement.";
    if (ctx.hasMobility) return "Mobilité ce matin — beau départ de journée, prenez le temps d'être présent.";
    if (ctx.hasRecup)    return "Récup active ce matin — réveil en douceur pour le corps, parfait.";
    if (ctx.hasGrimpe && ctx.locations.length > 0)
      return `Grimpe ce matin à ${ctx.locations[0]} — beau départ de journée.`;
    if (ctx.hasGrimpe)   return "Grimpe ce matin — belle façon de démarrer.";
    return "Bonne séance ce matin — partez du bon pied.";
  }
  if (ctx.isAfternoon) {
    if (ctx.hasForce)    return "Force cet après-midi — le corps est bien réveillé, c'est souvent le meilleur moment pour la force.";
    if (ctx.hasEndur)    return "Volume cet après-midi — patience et régularité, l'endurance se construit dans la durée.";
    if (ctx.hasTech)     return "Technique en après-midi — bonne plage horaire pour l'apprentissage. Concentrez-vous.";
    if (ctx.hasGrimpe && ctx.locations.length > 0)
      return `Grimpe cet après-midi à ${ctx.locations[0]} — bonne séance.`;
    if (ctx.hasGrimpe)   return "Grimpe cet après-midi — le corps est bien en route, profitez-en.";
    return "Bonne séance cet après-midi.";
  }
  if (ctx.isEvening) {
    if (ctx.hasForce)    return "Force en soirée — bien s'échauffer, le corps refroidit vite en fin de journée.";
    if (ctx.hasEndur && ctx.totalCharge >= 20)
      return `Endurance en soirée (charge ${ctx.totalCharge}) — dosez pour ne pas trop perturber votre sommeil de récupération.`;
    if (ctx.hasEndur)    return "Endurance en soirée — gardez un effort raisonnable, le sommeil qui suit compte.";
    if (ctx.hasMobility) return "Mobilité en soirée — parfait pour décompresser avant la nuit.";
    if (ctx.hasGrimpe && ctx.locations.length > 0)
      return `Grimpe ce soir à ${ctx.locations[0]} — bonne séance.`;
    if (ctx.hasGrimpe)   return "Grimpe ce soir — belle façon de terminer la journée.";
    return "Bonne séance ce soir.";
  }

  // ── 42. Lieu (fallback location) ──
  if (ctx.locations.length > 0) {
    if (ctx.isWellRested) return `Direction ${ctx.locations[0]} en pleine forme — bonne grimpe !`;
    return `Séance à ${ctx.locations[0]} — bonne grimpe.`;
  }

  // ── FALLBACK ──
  if (ctx.totalCharge >= 25) return `Charge ${ctx.totalCharge} au programme — séance conséquente. Bonne grimpe !`;
  if (ctx.totalCharge >= 15) return `Charge ${ctx.totalCharge} — séance solide. Allez-y.`;
  if (ctx.totalCharge > 0)   return "Séance légère au programme — profitez-en pour soigner la qualité.";

  const fallbacks = [
    "Bonne séance aujourd'hui — faites-en quelque chose.",
    "C'est parti — allez chercher ce que vous êtes venu chercher.",
    "Une séance de plus, une brique de plus vers l'objectif.",
    "Allez, on y va — bonne grimpe.",
  ];
  return fallbacks[ctx.dow % fallbacks.length];
}

// ─── ACCUEIL ──────────────────────────────────────────────────────────────────

// Wrapper qui isole l'early-return de loading sans casser l'ordre des hooks
// du composant principal.
export function AccueilView(props) {
  if (props.isLoading) return <AccueilSkeleton />;
  return <AccueilViewBody {...props} />;
}

function AccueilViewBody({
  data, isMobile,
  onOpenSession,
  onToggleReminder, onSaveWeight,
  onAddNutrition, onDeleteNutrition,
  onOpenLog,
  onAddSession,
  onToggleSessionDone,
}) {
  // onAddHooper n'est plus utilisé ici : l'édition Hooper se fait dans
  // DayLogModal, ouvert via la carte "Journal du jour" ci-dessous.
  const { isDark } = useThemeCtx();

  const today = localDateStr(new Date());
  const todayObj = new Date(today + "T12:00:00");

  // Today's sessions
  const monday = getMondayOf(todayObj);
  const wKey = weekKey(monday);
  const dow = todayObj.getDay();
  const dayIndex = dow === 0 ? 6 : dow - 1;
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const todaySessions = weekSessions[dayIndex] || [];
  const todayCharge = todaySessions.reduce((s, x) => s + (x.charge || 0), 0);

  // Profile
  const firstName = data.profile?.firstName || "";

  // ── Tokens partagés avec DayLogModal / DayListView ───────────────────────
  const paper        = isDark ? "#241b13" : "#fcf8ef";
  const paperDim     = isDark ? "#15100b" : "#f7f1e2";
  const surfaceCard  = isDark ? "#241b13" : "#ffffff";
  const surfaceMuted = isDark ? "#2e2419" : "#f0ebde";
  const border       = isDark ? "#3a2e22" : "#e6dfd1";
  const text         = isDark ? "#f0e6d0" : "#2a2218";
  const textMid      = isDark ? "#c4b69c" : "#5a4d3c";
  const textLight    = isDark ? "#a89a82" : "#8a7f70";
  const accent       = isDark ? "#e0a875" : "#8b4c20";
  const inkPrimary   = isDark ? "#e6d8bc" : "#2a2218";

  // ── Hooper (read-only summary, édition complète dans DayLogModal) ────────
  const existingHooper = (data.hooper || []).find(h => h.date === today);

  // ── Rappels du jour ──
  const activeReminders = getActiveRemindersForDate(data.reminders || [], todayObj);
  const checkedReminders = activeReminders.filter(r => isReminderCheckedOn(data.reminderState, r.id, today));

  // ── Poids (stepper inline, pré-rempli avec la dernière valeur connue) ──
  const todayWeight = data.weight?.[today] ?? null;
  const prefillWeight = todayWeight ?? getLastKnownWeight(data, today);
  const [weightInput, setWeightInput] = useState(
    prefillWeight != null ? String(prefillWeight) : ""
  );
  const commitWeight = () => {
    const val = parseFloat(weightInput.replace(",", "."));
    if (!isNaN(val) && val > 0) onSaveWeight?.(today, Math.round(val * 10) / 10);
    else if (weightInput.trim() === "") onSaveWeight?.(today, null);
  };

  // ── Nutrition ──
  const todayMeals = data.nutrition?.[today] || [];
  const totalCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProteins = todayMeals.reduce((s, m) => s + (m.proteins || 0), 0);
  const [nutrOpen, setNutrOpen] = useState(false);
  const [nutrForm, setNutrForm] = useState({ name: "", calories: "", proteins: "" });
  const nutrValid = nutrForm.name.trim() && (nutrForm.calories !== "" || nutrForm.proteins !== "");
  const handleAddMeal = () => {
    if (!nutrValid) return;
    const meal = {
      id: "m_" + Date.now().toString(36),
      name: nutrForm.name.trim(),
      calories: nutrForm.calories !== "" ? Math.round(Number(nutrForm.calories)) : 0,
      proteins: nutrForm.proteins !== "" ? Math.round(Number(nutrForm.proteins)) : 0,
    };
    onAddNutrition(today, meal);
    setNutrForm({ name: "", calories: "", proteins: "" });
    setNutrOpen(false);
  };

  // ── Méso contexte ──
  const mesoCtx = getMesoForDate(data.mesocycles || [], todayObj);
  const microIdx = mesoCtx?.meso && mesoCtx?.micro
    ? (mesoCtx.meso.microcycles || []).findIndex(m => m.id === mesoCtx.micro.id)
    : -1;
  const microTotal = mesoCtx?.meso?.microcycles?.length || 0;

  // ── Phrase contextuelle (helper existant) ──
  const phraseCtx = buildPhraseContext(data, todaySessions, todayObj, weekSessions, dayIndex, mesoCtx);
  const contextualPhrase = getContextualPhrase(phraseCtx);

  // ── Journal du jour : état ──
  const logWarning = getDayLogWarning(data, today, todayObj);
  const allRemindersDone = activeReminders.length === 0 || checkedReminders.length === activeReminders.length;
  const journalState = logWarning?.hasWarning
    ? "warn"
    : (existingHooper && todayWeight != null && allRemindersDone) ? "complete" : "empty";

  const journalColors = (() => {
    if (journalState === "warn")     return { bg: isDark ? "#2a1612" : "#fbecdc", border: isDark ? "#5a3a18" : "#f0c890", fg: isDark ? "#e6c46a" : "#8a4f10" };
    if (journalState === "complete") return { bg: isDark ? "#1a2a1d" : "#e7f2e0", border: isDark ? "#5a3a18" : "#a8d0a8", fg: isDark ? "#82c894" : "#2e6b3f" };
    return { bg: surfaceCard, border, fg: accent };
  })();

  const journalText = journalState === "complete"
    ? { title: "Journal complété", sub: "Tout est rempli pour aujourd'hui" }
    : journalState === "warn"
      ? { title: "Journal à compléter", sub: "Il manque encore des éléments" }
      : { title: "Journal du jour", sub: "Note, poids, Hooper en un instant" };

  // ── Styles partagés ──
  const cardLabel = {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 13, fontWeight: 500, color: text, letterSpacing: "0.02em",
  };
  const sectionHeading = {
    fontSize: 11,
    fontWeight: 500,
    color: textLight,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "'Newsreader', Georgia, serif",
    margin: "0 0 10px",
  };

  const dateFull = todayObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const weekN = (() => {
    const d = new Date(todayObj);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  })();

  const chargeColors = (() => {
    if (todayCharge < 4)  return { bg: isDark ? "#1a2a1d" : "#e3f0e5", fg: isDark ? "#82c894" : "#2e6b3f" };
    if (todayCharge < 7)  return { bg: isDark ? "#2a2010" : "#fef2dc", fg: isDark ? "#e6c46a" : "#b8881a" };
    return { bg: isDark ? "#2a1d11" : "#fbecdc", fg: isDark ? "#e0a875" : "#b8651a" };
  })();

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* ── Hero header (gradient — même style que DayListView/DayLogModal) ── */}
      <div
        style={{
          padding: isMobile ? "24px 18px 20px" : "40px 32px 28px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
        }}
      >
        {/* Eyebrow date · semaine */}
        <div
          style={{
            fontSize: 11, fontWeight: 600, color: accent,
            letterSpacing: "0.1em", textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {dateFull} · S{String(weekN).padStart(2, "0")}
        </div>

        {/* Greeting */}
        <div
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: isMobile ? 34 : 44,
            fontWeight: 500, color: text,
            lineHeight: 1.08, letterSpacing: "-0.01em",
            textWrap: "balance",
          }}
        >
          {getGreeting(new Date().getHours(), firstName)}
        </div>

        {/* Contextual phrase */}
        <div
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: isMobile ? 15 : 17,
            color: textMid, fontStyle: "italic",
            lineHeight: 1.5, marginTop: 8,
            maxWidth: 640,
          }}
        >
          {contextualPhrase}
        </div>

        {/* Meta row : meso chip + charge chip */}
        {(mesoCtx?.meso || todayCharge > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
            {mesoCtx?.meso && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: mesoCtx.meso.color + "22",
                color: mesoCtx.meso.color,
                border: `1px solid ${mesoCtx.meso.color}44`,
                borderRadius: 14, padding: "3px 10px",
                letterSpacing: "0.04em",
              }}>
                {mesoCtx.meso.label}
                {mesoCtx.micro && microIdx >= 0 && microTotal > 1 && (
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>· S{microIdx + 1}/{microTotal}</span>
                )}
              </span>
            )}
            {todayCharge > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: chargeColors.bg,
                color: chargeColors.fg,
                border: `1px solid ${chargeColors.fg}55`,
                borderRadius: 14, padding: "3px 10px",
              }}>
                Charge · {todayCharge}
              </span>
            )}
            {todaySessions.length > 0 && (
              <span style={{ fontSize: 12, color: textLight }}>
                {todaySessions.length} séance{todaySessions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          padding: isMobile ? "18px 16px 24px" : "24px 32px 40px",
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ── Programme du jour ───────────────────────────────────── */}
        <section>
          <div style={sectionHeading}>Programme du jour</div>
          {todaySessions.length === 0 ? (
            <div style={{
              background: surfaceCard, border: `1px dashed ${border}`,
              borderRadius: 12, padding: "22px 16px",
              textAlign: "center", color: textLight, fontSize: 13,
            }}>
              Pas de séance prévue aujourd'hui.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {todaySessions.map((session, si) => (
                <TodaySessionCard
                  key={si}
                  session={session}
                  onTap={() => onOpenSession(wKey, dayIndex, si)}
                  onToggleDone={() => onToggleSessionDone?.(wKey, dayIndex, si)}
                />
              ))}
            </div>
          )}
          {onAddSession && (
            <button
              onClick={() => onAddSession(dayIndex)}
              style={{
                marginTop: 10,
                width: "100%",
                background: inkPrimary,
                color: isDark ? paper : "#fff",
                border: "none", borderRadius: 12,
                padding: "12px 16px",
                fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >+ Ajouter une séance</button>
          )}
        </section>

        {/* ── Journal du jour (raccourci tappable) ─────────────────── */}
        {onOpenLog && (
          <button
            onClick={() => onOpenLog(today)}
            style={{
              background: journalColors.bg,
              border: `1px solid ${journalColors.border}`,
              borderRadius: 12, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", textAlign: "left",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: journalState === "complete" ? "#2e6b3f" : journalState === "warn" ? "#f0c890" : accent + "22",
              color: journalState === "complete" ? "#fff" : journalState === "warn" ? "#8a4f10" : accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>
              {journalState === "complete" ? "✓" : journalState === "warn" ? "!" : "✎"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{journalText.title}</div>
              <div style={{ fontSize: 11, color: textLight, marginTop: 1 }}>{journalText.sub}</div>
            </div>
            <span style={{ color: textLight, fontSize: 16 }}>›</span>
          </button>
        )}

        {/* ── Wellness grid (mêmes cards que DayLogModal) ──────────── */}
        <section>
          <div style={sectionHeading}>Aujourd'hui</div>

          {/* Row 1 : Poids + Créatine */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {/* Poids stepper */}
            <div style={{
              background: surfaceCard, border: `1px solid ${border}`,
              borderRadius: 12, padding: "10px 12px",
              flex: 1, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 11, color: textLight, flex: 1 }}>Poids</span>
              <button
                onClick={() => {
                  const cur = parseFloat(weightInput.replace(",", ".")) || 0;
                  const next = Math.max(0, Math.round((cur - 0.1) * 10) / 10);
                  setWeightInput(String(next));
                }}
                aria-label="Diminuer"
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: surfaceMuted, color: accent,
                  border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >−</button>
              <input
                type="text" inputMode="decimal"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                onBlur={commitWeight}
                onKeyDown={e => { if (e.key === "Enter") { commitWeight(); e.target.blur(); } }}
                placeholder="—"
                style={{
                  width: 50, textAlign: "center",
                  background: "transparent", border: "none",
                  fontSize: 14, fontWeight: 600, color: text,
                  fontFamily: "inherit", outline: "none",
                }}
              />
              <button
                onClick={() => {
                  const cur = parseFloat(weightInput.replace(",", ".")) || 0;
                  const next = Math.round((cur + 0.1) * 10) / 10;
                  setWeightInput(String(next));
                }}
                aria-label="Augmenter"
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: surfaceMuted, color: accent,
                  border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</button>
            </div>
          </div>

          {/* Rappels du jour (chips) */}
          {activeReminders.length > 0 && (
            <div style={{
              background: surfaceCard, border: `1px solid ${border}`,
              borderRadius: 12, padding: 14, marginBottom: 10,
            }}>
              <div style={{ ...cardLabel, marginBottom: 8 }}>Rappels du jour</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {activeReminders.map(rem => {
                  const checked = isReminderCheckedOn(data.reminderState, rem.id, today);
                  const doneBg     = isDark ? "#1a2a1d" : "#e3f0e5";
                  const doneBorder = isDark ? "#2a4a30" : "#a8d0a8";
                  const doneFg     = isDark ? "#82c894" : "#2e6b3f";
                  return (
                    <button
                      key={rem.id}
                      onClick={() => onToggleReminder?.(rem.id, today)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 11px", borderRadius: 999,
                        background: checked ? doneBg : surfaceMuted,
                        border: `1px solid ${checked ? doneBorder : border}`,
                        color: checked ? doneFg : textMid,
                        fontSize: 12, fontWeight: checked ? 600 : 500,
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.12s, border-color 0.12s",
                      }}
                    >
                      {checked && <span style={{ fontWeight: 700 }}>✓</span>}
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: rem.color, flexShrink: 0,
                      }} />
                      {rem.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: textLight, marginTop: 8 }}>
                Tape pour cocher · {checkedReminders.length} / {activeReminders.length} aujourd'hui
              </div>
            </div>
          )}

          {/* Hooper (summary tappable, édition dans DayLogModal) */}
          <button
            onClick={() => onOpenLog?.(today)}
            style={{
              background: surfaceCard, border: `1px solid ${border}`,
              borderRadius: 12, padding: 14, width: "100%",
              display: "flex", alignItems: "center", gap: 12,
              cursor: onOpenLog ? "pointer" : "default", fontFamily: "inherit",
              textAlign: "left",
              marginBottom: 10,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ ...cardLabel, marginBottom: 4 }}>Hooper</div>
              {existingHooper ? (
                <div style={{
                  fontSize: 12, color: hooperColor(existingHooper.total, isDark),
                  fontWeight: 600,
                }}>
                  {hooperLabel(existingHooper.total)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: textLight }}>
                  Pas encore rempli aujourd'hui
                </div>
              )}
            </div>
            <span style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 18, fontWeight: 700,
              color: existingHooper ? hooperColor(existingHooper.total, isDark) : textLight,
            }}>
              {existingHooper ? `${existingHooper.total} / 28` : "—"}
            </span>
            <span style={{ color: textLight, fontSize: 16 }}>›</span>
          </button>

          {/* Nutrition card */}
          <div style={{
            background: surfaceCard, border: `1px solid ${border}`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: nutrOpen ? 10 : 0 }}>
              <div>
                <div style={cardLabel}>Nutrition</div>
                {(totalCalories > 0 || totalProteins > 0) ? (
                  <div style={{ fontSize: 11, color: textMid, marginTop: 2 }}>
                    {totalCalories} kcal · {totalProteins} g de protéines
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: textLight, marginTop: 2 }}>
                    Aucun repas enregistré
                  </div>
                )}
              </div>
              <button
                onClick={() => setNutrOpen(o => !o)}
                style={{
                  background: "transparent", border: `1px solid ${border}`,
                  borderRadius: 6, color: textMid,
                  padding: "4px 12px", cursor: "pointer",
                  fontSize: 11, fontFamily: "inherit",
                }}
              >
                {nutrOpen ? "Fermer" : "+ Ajouter"}
              </button>
            </div>

            {nutrOpen && (
              <div style={{ marginTop: 8 }}>
                {todayMeals.length > 0 && (
                  <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {todayMeals.map(m => (
                      <div key={m.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: paperDim, borderRadius: 8, padding: "6px 10px",
                        fontSize: 12, color: text,
                      }}>
                        <span style={{ flex: 1, fontWeight: 500 }}>{m.name}</span>
                        <span style={{ color: textLight, fontSize: 11 }}>{m.calories} kcal · {m.proteins} g</span>
                        <button
                          onClick={() => onDeleteNutrition(today, m.id)}
                          aria-label="Supprimer"
                          style={{
                            background: "none", border: "none",
                            cursor: "pointer", color: isDark ? "#f08070" : "#b83030",
                            fontSize: 12, padding: "0 4px", lineHeight: 1,
                            fontFamily: "inherit",
                          }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input
                    type="text"
                    placeholder="Repas (Déjeuner, Poulet riz…)"
                    value={nutrForm.name}
                    onChange={e => setNutrForm(f => ({ ...f, name: e.target.value }))}
                    style={{
                      background: paperDim, border: `1px solid ${border}`,
                      borderRadius: 8, padding: "8px 10px",
                      fontSize: 13, fontFamily: "inherit", color: text,
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      type="number" min={0}
                      placeholder="Calories"
                      value={nutrForm.calories}
                      onChange={e => setNutrForm(f => ({ ...f, calories: e.target.value }))}
                      style={{
                        flex: 1,
                        background: paperDim, border: `1px solid ${border}`,
                        borderRadius: 8, padding: "8px 10px",
                        fontSize: 13, fontFamily: "inherit", color: text,
                        outline: "none",
                      }}
                    />
                    <input
                      type="number" min={0}
                      placeholder="Protéines (g)"
                      value={nutrForm.proteins}
                      onChange={e => setNutrForm(f => ({ ...f, proteins: e.target.value }))}
                      style={{
                        flex: 1,
                        background: paperDim, border: `1px solid ${border}`,
                        borderRadius: 8, padding: "8px 10px",
                        fontSize: 13, fontFamily: "inherit", color: text,
                        outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={handleAddMeal}
                    disabled={!nutrValid}
                    style={{
                      alignSelf: "flex-start",
                      background: nutrValid ? inkPrimary : border,
                      color: nutrValid ? (isDark ? paper : "#fff") : textLight,
                      border: "none", borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13, fontWeight: 600,
                      cursor: nutrValid ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Objectifs à venir ────────────────────────────────────── */}
        {(() => {
          const allObj = (data.quickSessions || []).filter(qs => qs.isObjective);
          const upcoming = allObj
            .filter(o => (o.endDate || o.startDate) >= today)
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
          if (upcoming.length === 0) return null;
          return (
            <section>
              <div style={sectionHeading}>Objectifs à venir</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map(o => {
                  const daysUntil = Math.ceil((new Date(o.startDate + "T00:00:00") - new Date(today + "T12:00:00")) / 864e5);
                  const c = o.color || "#f59e0b";
                  return (
                    <div key={o.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: surfaceCard,
                      border: `1px solid ${border}`,
                      borderLeft: `4px solid ${c}`,
                      borderRadius: 12, padding: "10px 14px",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{o.name}</div>
                        <div style={{ fontSize: 11, color: c, marginTop: 2, fontWeight: 500 }}>
                          {new Date(o.startDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                          {daysUntil > 0 ? ` — dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}` : daysUntil === 0 ? " — aujourd'hui" : ""}
                        </div>
                      </div>
                      {o.content && (
                        <span style={{
                          fontSize: 11, color: textLight,
                          maxWidth: 140, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{o.content}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}
      </div>
    </div>
  );
}

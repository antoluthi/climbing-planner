import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, getMesoForDate } from "../lib/constants.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions } from "../lib/helpers.js";
import { getChargeColor } from "../lib/charge.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";

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
  const isOnlyLight  = !isRestDay && totalCharge <= 5 && (hasMobility || hasRecup) && !hasForce && !hasEndur && !hasComp;

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
  const isLongDay     = totalDuration >= 120;
  const isQuickSession = totalDuration > 0 && totalDuration <= 30;

  // ── Location ──
  const locations = [...new Set(todaySessions.map(s => s.location).filter(Boolean))];

  return {
    hour, isMorning, isAfternoon, isEvening, isNight, dow,
    sessionCount, isRestDay, totalCharge, chargeLevel, totalDuration,
    isOnlyLight, isLongDay, isQuickSession,
    hasForce, hasEndur, hasRecup, hasTech, hasMobility, hasComp, hasSuspension, hasGrimpe,
    firstSessionTime, lastSessionTime, hasEarlySession, hasLateSession,
    hasMorningSession, hasAfternoonSession, hasEveningSession, hasSplitDay,
    nextSession, minutesToNext, nextSessionSoon, nextSessionVerySoon, allSessionsPassed,
    doneSessions, missedSessions, pendingSessions, allDone, someDone, allMissed, doneCharge,
    hTotal, hFatigue, hStress, hSoreness, hSleep,
    isWellRested, isGoodShape, isModFatigued, isVeryFatigued, isOverreached,
    hasHighSoreness, hasHighStress, hasPoorSleep, hasHighFatigue,
    isPhysicallyFine, isMentallyTired,
    yesterdayCharge, restDaysBefore, consecutiveTrainingDays,
    weekChargeSoFar, weekChargeTotal, weekSessionCountTotal,
    sessionsDoneThisWeek, tomorrowSessions, tomorrowCharge, tomorrowIsRest,
    isFirstDayWithSession, isLastDayWithSession, isHeavyWeek, isEndOfWeek,
    sleepDuration, shortSleep, longSleep,
    mesoCtx, mesoLabel, microLabel, mesoPhase, isDeloadMicro, isIntensityMicro,
    locations,
  };
}

// ─── CONTEXTUAL GREETING PHRASE ───────────────────────────────────────────────

function getContextualPhrase(ctx) {

  // ── 1. All sessions completed ──
  if (ctx.allDone) {
    const n = ctx.doneSessions.length;
    const charge = ctx.doneCharge;
    if (ctx.isEvening || ctx.isNight) {
      if (charge >= 30)  return `Grosse journée (charge ${charge}) dans les jambes — bravo, reposez-vous bien ce soir.`;
      if (n >= 2)        return `${n} séances bouclées — belle journée d'entraînement, profitez de votre soirée !`;
      return `Séance terminée — bonne soirée, le travail est fait.`;
    }
    if (ctx.isAfternoon) {
      if (charge >= 30)  return `Charge ${charge} déjà avalée — grosse matinée ! Le reste de la journée est à vous.`;
      return `Déjà ${n > 1 ? `${n} séances faites` : "la séance dans les jambes"} — profitez du reste de l'après-midi !`;
    }
    if (charge >= 30) return `Charge ${charge} avant midi — chapeau ! Journée productive.`;
    return `Séance${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} avant midi — quelle matinée !`;
  }

  // ── 2. Partially done ──
  if (ctx.someDone) {
    const done = ctx.doneSessions.length;
    const remaining = ctx.pendingSessions.length;
    const missed = ctx.missedSessions.length;
    const remainingCharge = ctx.pendingSessions.reduce((s, sess) => s + (sess.charge || 0), 0);

    if (remaining > 0 && ctx.nextSessionVerySoon) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — la prochaine commence dans ${ctx.minutesToNext} min, préparez-vous !`;
    }
    if (remaining > 0 && remainingCharge >= 25) {
      return `${done} séance${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""}, mais le gros morceau arrive — charge ${remainingCharge} encore au programme.`;
    }
    if (remaining > 0) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — encore ${remaining} à venir, continuez sur cette lancée !`;
    }
    return `${done} séance${done > 1 ? "s" : ""} réalisée${done > 1 ? "s" : ""}${missed > 0 ? `, ${missed} manquée${missed > 1 ? "s" : ""}` : ""} — la journée avance.`;
  }

  // ── 3. All missed ──
  if (ctx.allMissed) {
    if (ctx.isNight) return "Ça n'a pas pu se faire aujourd'hui — c'est pas grave, demain on repart.";
    if (ctx.sessionCount >= 2) return `${ctx.sessionCount} séances manquées — écoutez votre corps, parfois le repos est plus utile.`;
    return "Séance manquée — il est encore temps de rattraper ou de récupérer.";
  }

  // ── 4. Surmenage (Hooper > 20) ──
  if (ctx.isOverreached) {
    if (ctx.isRestDay)   return "Hooper en surmenage — votre corps vous dit de souffler, écoutez-le.";
    if (ctx.isOnlyLight) return "Hooper très élevé, mais la séance légère est parfaite dans ce cas.";
    if (ctx.totalCharge >= 25) return `Attention : Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} au programme — sérieusement, adaptez ou reportez.`;
    if (ctx.hasRecup)    return "Hooper élevé — la séance récup est exactement ce qu'il faut aujourd'hui.";
    return `Indice Hooper à ${ctx.hTotal} — adaptez l'intensité et écoutez votre corps.`;
  }

  // ── 5. Compétition ──
  if (ctx.hasComp) {
    if (ctx.isWellRested) return "En pleine forme pour la compétition — faites confiance à votre préparation !";
    if (ctx.isVeryFatigued) return "Compétition avec de la fatigue — gérez votre énergie, priorisez la lecture et le placement.";
    if (ctx.nextSessionVerySoon) return "Compétition imminente — restez calme, respirez, grimpez votre escalade.";
    return "Journée de compétition — restez dans votre bulle, le travail est déjà fait.";
  }

  // ── 6. Back-to-back heavy days ──
  if (ctx.yesterdayCharge >= 25 && ctx.totalCharge >= 25 && !ctx.isRestDay) {
    if (ctx.isGoodShape) return `Deux grosses journées d'affilée (${ctx.yesterdayCharge} hier, ${ctx.totalCharge} aujourd'hui) mais vous êtes en forme — allez-y intelligemment.`;
    if (ctx.isVeryFatigued) return `Charge ${ctx.yesterdayCharge} hier et ${ctx.totalCharge} aujourd'hui — avec votre fatigue actuelle, adaptez vraiment l'intensité.`;
    return `Charge ${ctx.yesterdayCharge} hier et ${ctx.totalCharge} prévue aujourd'hui — échauffez-vous bien et écoutez les signaux.`;
  }

  // ── 7. Comeback after rest ──
  if (ctx.restDaysBefore >= 3 && !ctx.isRestDay) {
    if (ctx.isWellRested) return `De retour après ${ctx.restDaysBefore} jours de repos et en pleine forme — vous allez régaler !`;
    if (ctx.totalCharge >= 25) return `Reprise après ${ctx.restDaysBefore} jours off avec une grosse charge — montez progressivement.`;
    return `${ctx.restDaysBefore} jours de repos, c'est reparti — prenez le temps de bien vous remettre dedans.`;
  }
  if (ctx.restDaysBefore === 2 && !ctx.isRestDay) {
    if (ctx.isWellRested) return "Deux jours de repos et batteries rechargées — conditions idéales pour performer !";
    return "Reprise après deux jours off — l'échauffement sera important.";
  }

  // ── 8. Rest day ──
  if (ctx.isRestDay) {
    if (ctx.yesterdayCharge >= 25)
      return `Repos bien mérité après la charge ${ctx.yesterdayCharge} d'hier — laissez les muscles récupérer.`;

    if (ctx.isVeryFatigued) return "Vous êtes très fatigué — ce repos tombe vraiment bien.";
    if (ctx.hasPoorSleep)   return "Mauvaise nuit de sommeil — profitez du repos pour compenser.";

    if (ctx.tomorrowCharge >= 25)
      return `Repos aujourd'hui et charge ${ctx.tomorrowCharge} demain — préparez-vous, ça va être costaud.`;
    if (ctx.tomorrowSessions.length >= 2)
      return `Repos stratégique avant ${ctx.tomorrowSessions.length} séances demain — rechargez bien.`;

    if (ctx.isNight) return "Nuit de récupération en vue — dormez bien, c'est là que la progression se construit.";

    if (ctx.dow === 0 || ctx.dow === 6) {
      if (ctx.isWellRested) return "Week-end off et en pleine forme — profitez bien de cette journée !";
      return "Week-end de repos — rechargez les batteries.";
    }

    if (ctx.isWellRested)  return "Journée off et excellent Hooper — vous êtes au top, profitez-en !";
    if (ctx.isGoodShape)   return "Bien récupéré — profitez de cette journée de repos.";
    if (ctx.isDeloadMicro) return "Semaine de décharge — le repos fait partie intégrante du plan.";

    if (ctx.weekChargeSoFar >= 60)
      return `Déjà ${ctx.weekChargeSoFar} de charge cette semaine — ce repos est stratégique.`;

    if (ctx.isEndOfWeek && ctx.sessionsDoneThisWeek >= 3)
      return `${ctx.sessionsDoneThisWeek} séances cette semaine — repos bien mérité en fin de semaine.`;

    if (ctx.shortSleep)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil seulement — profitez du repos pour rattraper.`;

    const restMessages = [
      "L'entraînement se construit dans la récupération — profitez de cette journée off.",
      "Journée de repos — le corps se renforce quand il récupère.",
      "Pas de séance aujourd'hui — savourez ce temps libre.",
      "Repos actif ou complet, à vous de choisir — l'important c'est de récupérer.",
      "La progression passe par le repos — prenez-le bien.",
      "Journée off — rechargez les batteries.",
      "Profitez de votre journée de repos !",
    ];
    return restMessages[ctx.dow % restMessages.length];
  }

  // ── 9. Session imminent (< 30 min) ──
  if (ctx.nextSessionVerySoon) {
    const s = ctx.nextSession.session;
    const sCharge = s.charge || 0;
    if (sCharge >= 25)     return `Séance dans ${ctx.minutesToNext} min — charge ${sCharge}, échauffez-vous bien avant.`;
    if (ctx.hasSuspension) return `Poutre dans ${ctx.minutesToNext} min — préparez vos doigts progressivement.`;
    return `Séance dans ${ctx.minutesToNext} min — c'est bientôt l'heure, préparez-vous !`;
  }

  // ── 10. Very fatigued (Hooper 17-20) ──
  if (ctx.isVeryFatigued) {
    if (ctx.isOnlyLight)   return "Hooper élevé mais séance légère — parfait dosage, allez-y en douceur.";
    if (ctx.hasRecup)      return "La séance récup tombe bien — vous êtes fatigué, allez-y mollo.";
    if (ctx.totalCharge >= 25) return `Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} prévue — pensez à réduire l'intensité si le corps ne suit pas.`;
    if (ctx.hasForce)      return "Fatigue notable et séance de force — montez très progressivement et adaptez si besoin.";
    if (ctx.hasSuspension) return "Fatigue élevée avant la poutre — écoutez vos doigts et vos tendons, pas d'ego aujourd'hui.";
    if (ctx.isMorning)     return "Vous êtes fatigué ce matin — démarrez doucement et voyez comment ça répond.";
    return `Hooper à ${ctx.hTotal} — gérez bien l'effort, l'adaptation se fait aussi en s'écoutant.`;
  }

  // ── 11. Split day (morning + evening) ──
  if (ctx.hasSplitDay) {
    if (ctx.isWellRested)     return `Double séance (matin + soir) et vous êtes frais — gérez bien l'énergie sur la journée !`;
    if (ctx.totalCharge >= 30) return `Journée bi-séance avec charge ${ctx.totalCharge} — mangez bien entre les deux et hydratez-vous.`;
    return `${ctx.sessionCount} séances réparties dans la journée — pensez à bien récupérer entre chaque.`;
  }

  // ── 12. Long training streak (4+ consecutive days) ──
  if (ctx.consecutiveTrainingDays >= 5) {
    if (ctx.tomorrowIsRest) return `${ctx.consecutiveTrainingDays}ème jour de suite — repos demain, tenez bon !`;
    return `${ctx.consecutiveTrainingDays} jours d'entraînement consécutifs — attention à l'accumulation de fatigue.`;
  }
  if (ctx.consecutiveTrainingDays === 4) {
    if (ctx.isGoodShape) return "4ème jour consécutif et toujours en forme — vous encaissez bien !";
    return "4 jours de suite — écoutez bien votre corps aujourd'hui.";
  }

  // ── 13. Deload week ──
  if (ctx.isDeloadMicro) {
    if (ctx.totalCharge >= 20) return "Semaine de décharge — même si la charge est notable, restez sous vos capacités habituelles.";
    return "Semaine de décharge — gardez le mouvement mais sans forcer, c'est le plan.";
  }

  // ── 14. Night with session ──
  if (ctx.isNight) {
    if (ctx.allSessionsPassed) return "Les séances sont passées — si c'est fait, bravo. Sinon, reposez-vous pour demain.";
    return "Séance tardive — échauffez-vous plus longuement, le corps refroidit vite le soir.";
  }

  // ── 15. Late session (>= 20h) ──
  if (ctx.hasLateSession && ctx.isEvening) {
    if (ctx.hasSuspension) return "Poutre en soirée — les tendons mettent plus de temps à chauffer, prenez-le en compte.";
    if (ctx.hasForce)      return "Séance de force tard le soir — bien s'échauffer, le corps est souvent plus raide en fin de journée.";
    if (ctx.hasEndur)      return "Endurance en soirée — dosez pour ne pas trop perturber le sommeil.";
    if (ctx.hasMobility)   return "Mobilité en soirée — parfait pour décompresser avant la nuit.";
  }

  // ── 16. Early session (< 8h) ──
  if (ctx.hasEarlySession && ctx.isMorning) {
    if (ctx.hasPoorSleep)    return "Séance matinale malgré une mauvaise nuit — adaptez l'intensité, votre corps n'est pas encore prêt.";
    if (ctx.hasForce)        return "Force au réveil — prenez 15 min de plus pour l'échauffement, les muscles sont encore froids.";
    if (ctx.hasSuspension)   return "Poutre tôt le matin — soyez très progressif, les tendons ont besoin de temps pour chauffer.";
    if (ctx.shortSleep)      return `${ctx.sleepDuration.toFixed(1)}h de sommeil et séance matinale — restez à l'écoute.`;
    if (ctx.longSleep)       return "Belle nuit de sommeil et séance matinale — conditions idéales, lancez-vous !";
    return "Séance tôt ce matin — réveillez bien le corps avant d'attaquer.";
  }

  // ── 17. Brutal charge (> 30) ──
  if (ctx.chargeLevel === "brutal") {
    if (ctx.isWellRested)   return `Charge ${ctx.totalCharge} au programme et Hooper au vert — conditions idéales pour envoyer.`;
    if (ctx.isGoodShape)    return `Grosse journée (charge ${ctx.totalCharge}) — vous êtes en forme, allez chercher la progression.`;
    if (ctx.tomorrowIsRest) return `Charge ${ctx.totalCharge} et repos demain — donnez tout aujourd'hui !`;
    if (ctx.shortSleep)     return `Charge ${ctx.totalCharge} prévue avec peu de sommeil — adaptez si nécessaire, pas la peine de se blesser.`;
    return `Charge ${ctx.totalCharge} au programme — grosse journée, gérez bien l'échauffement et la récupération.`;
  }

  // ── 18. Only light session (mobility/recovery, charge ≤ 5) ──
  if (ctx.isOnlyLight) {
    if (ctx.yesterdayCharge >= 25) return "Séance légère après une grosse journée hier — parfait pour la récupération active.";
    if (ctx.hasHighSoreness)      return "Courbatures + séance légère — exactement ce qu'il faut, allez-y en douceur.";
    if (ctx.hasMobility && ctx.isEvening)  return "Mobilité en soirée — parfait pour décompresser et préparer une bonne nuit.";
    if (ctx.hasMobility && ctx.isMorning)  return "Mobilité au réveil — doux start pour la journée, prenez le temps.";
    if (ctx.hasRecup)   return "Séance de récupération — l'objectif c'est la qualité du mouvement, pas l'intensité.";
    return "Séance légère au programme — profitez-en pour soigner la qualité.";
  }

  // ── 19. Mentally tired but physically fine ──
  if (ctx.isMentallyTired) {
    if (ctx.hasForce)    return "Stress élevé mais corps en forme — la grimpe peut aider à décompresser, utilisez-la.";
    if (ctx.hasMobility) return "Beaucoup de stress — la séance de mobilité va vous faire du bien.";
    return "Stress élevé mais physiquement ça va — la séance peut être un bon exutoire, allez-y.";
  }

  // ── 20. High soreness + force/suspension ──
  if (ctx.hasHighSoreness) {
    if (ctx.hasForce)      return `Courbatures à ${ctx.hSoreness}/7 et séance de force — échauffez-vous longuement et adaptez les charges.`;
    if (ctx.hasSuspension) return `Courbatures notables et poutre au programme — soyez très prudent avec les tendons.`;
    if (ctx.hasGrimpe)     return `Courbatures notables — privilégiez la technique et les mouvements fluides plutôt que la difficulté.`;
  }

  // ── 21. Poor sleep + training ──
  if (ctx.hasPoorSleep) {
    if (ctx.totalCharge >= 20) return `Mauvaise nuit et charge ${ctx.totalCharge} — adaptez si le corps ne répond pas.`;
    return "Sommeil difficile — allez-y progressivement, pas besoin de forcer.";
  }

  // ── 22. Moderate fatigue ──
  if (ctx.isModFatigued) {
    if (ctx.hasRecup)          return "Modérément fatigué et récup au programme — combo parfait.";
    if (ctx.totalCharge >= 25) return `Fatigue modérée et charge ${ctx.totalCharge} — restez lucide, adaptez si besoin.`;
    if (ctx.hasForce)          return "Un peu de fatigue pour la force — montez progressivement, voyez comment ça répond.";
    if (ctx.hasEndur)          return "Fatigue modérée pour l'endurance — gardez un effort dosé.";
    if (ctx.hasSuspension)     return "Fatigue modérée avant la poutre — échauffez bien les doigts et restez à l'écoute.";
    return "Un peu de fatigue — rien de grave, mais restez à l'écoute.";
  }

  // ── 23. Heavy charge (21-30) ──
  if (ctx.chargeLevel === "heavy") {
    if (ctx.isWellRested)              return `Charge ${ctx.totalCharge} et excellent Hooper — conditions parfaites pour progresser !`;
    if (ctx.tomorrowIsRest)            return `Charge ${ctx.totalCharge} et repos demain — poussez un peu plus que d'habitude.`;
    if (ctx.consecutiveTrainingDays >= 3) return `Charge ${ctx.totalCharge} après ${ctx.consecutiveTrainingDays - 1} jours d'entraînement — gérez bien l'accumulation.`;
    return `Charge ${ctx.totalCharge} au programme — séance conséquente, échauffez-vous bien.`;
  }

  // ── 24. Multi-session day (2+) ──
  if (ctx.sessionCount >= 2) {
    if (ctx.isWellRested)       return `${ctx.sessionCount} séances aujourd'hui et vous êtes frais — journée productive en vue !`;
    if (ctx.tomorrowIsRest)     return `${ctx.sessionCount} séances et repos demain — donnez tout aujourd'hui.`;
    if (ctx.totalDuration >= 120) return `${ctx.sessionCount} séances, ${ctx.totalDuration} min au total — pensez à bien manger et vous hydrater entre.`;
    return `${ctx.sessionCount} séances au programme — gérez bien votre énergie sur la journée.`;
  }

  // ── 25. Session coming soon (< 90 min) ──
  if (ctx.nextSessionSoon && ctx.minutesToNext > 30) {
    const s = ctx.nextSession.session;
    if (ctx.hasSuspension) return `Poutre dans ${ctx.minutesToNext} min — commencez à mobiliser les doigts.`;
    if (s.charge >= 20)    return `Séance dans ${ctx.minutesToNext} min (charge ${s.charge}) — pensez à l'échauffement.`;
    return `Prochaine séance dans ${ctx.minutesToNext} min — bientôt l'heure !`;
  }

  // ── 26. Tomorrow rest ──
  if (ctx.tomorrowIsRest) {
    if (ctx.hasForce)      return "Force et repos demain — allez chercher le maximum !";
    if (ctx.hasSuspension) return "Poutre et repos demain — conditions idéales pour tester vos limites.";
    return "Repos demain — profitez de cette séance pour bien travailler.";
  }

  // ── 27. Week position ──
  if (ctx.isFirstDayWithSession) {
    if (ctx.isMorning && ctx.hasForce) return "Force pour ouvrir la semaine — bonne manière de poser le ton !";
    if (ctx.isMorning) return "C'est parti pour la semaine — première séance pour lancer la dynamique !";
    return "Première séance de la semaine — posez le rythme dès maintenant.";
  }
  if (ctx.isLastDayWithSession) {
    if (ctx.sessionsDoneThisWeek >= 4) return `Dernière séance après ${ctx.sessionsDoneThisWeek} déjà dans les jambes — belle semaine, finissez en beauté !`;
    if (ctx.sessionsDoneThisWeek >= 2) return `Dernière séance de la semaine — ${ctx.sessionsDoneThisWeek} déjà faites, terminez bien.`;
    return "Dernière séance de la semaine — terminez en force !";
  }

  // ── 28. Well rested / good shape ──
  if (ctx.isWellRested) {
    if (ctx.hasForce && ctx.hasSuspension) return "En pleine forme — parfait pour forcer sur la poutre et la grimpe.";
    if (ctx.hasForce)      return "Excellent Hooper et force au programme — allez chercher le max !";
    if (ctx.hasEndur)      return "Vous êtes frais — parfait pour une longue séance d'endurance.";
    if (ctx.hasSuspension) return "Doigts reposés et Hooper au vert — conditions idéales pour la poutre.";
    if (ctx.hasTech)       return "En forme et séance technique — l'esprit frais, c'est là qu'on apprend le mieux.";
    return "Vous vous sentez super bien — excellente séance en vue !";
  }
  if (ctx.isGoodShape) {
    if (ctx.hasForce)  return "Bonne forme — allez chercher de belles performances en force.";
    if (ctx.hasEndur)  return "Bien récupéré — idéal pour mettre du volume.";
    return "Bonne forme générale — bonne séance !";
  }

  // ── 29. Short sleep ──
  if (ctx.shortSleep) {
    return `${ctx.sleepDuration.toFixed(1)}h de sommeil — soyez à l'écoute et adaptez si le corps ne répond pas.`;
  }

  // ── 30. Long sleep ──
  if (ctx.longSleep) {
    return "Belle nuit de sommeil — vous devriez être bien pour la séance !";
  }

  // ── 31. Heavy week ──
  if (ctx.isHeavyWeek && ctx.isEndOfWeek) {
    return `Semaine chargée (${ctx.weekChargeTotal} au total) — fin de semaine, tenez le cap.`;
  }

  // ── 32. Meso phase ──
  if (ctx.mesoPhase === "start") {
    return `Début du ${ctx.mesoLabel} — posez les bases, la progression viendra.`;
  }
  if (ctx.mesoPhase === "end") {
    return `Fin du ${ctx.mesoLabel} en vue — restez concentré jusqu'au bout.`;
  }

  // ── 33. Intensity micro ──
  if (ctx.isIntensityMicro) {
    return "Semaine d'intensité — poussez vos limites mais gardez la technique.";
  }

  // ── 34. Suspension-specific ──
  if (ctx.hasSuspension) {
    if (ctx.isMorning) return "Poutre ce matin — prenez le temps de bien chauffer les doigts avant de charger.";
    if (ctx.isEvening) return "Poutre en soirée — les tendons sont mieux préparés en fin de journée.";
    return "Séance de suspension au programme — la patience sur l'échauffement fait toute la différence.";
  }

  // ── 35. Quick session (≤ 30 min) ──
  if (ctx.isQuickSession) {
    return `Séance courte (${ctx.totalDuration} min) — allez droit à l'essentiel !`;
  }

  // ── 36. Long day (≥ 120 min) ──
  if (ctx.isLongDay) {
    return `Grosse séance de ${ctx.totalDuration} min — pensez à bien vous hydrater et manger.`;
  }

  // ── 37. Time + type combos ──
  if (ctx.isMorning) {
    if (ctx.hasForce)    return "Séance de force ce matin — réveillez bien les muscles avant d'attaquer.";
    if (ctx.hasEndur)    return "Endurance au petit matin — idéal pour commencer la journée.";
    if (ctx.hasTech)     return "Technique ce matin — l'esprit frais, concentrez-vous sur la précision.";
    if (ctx.hasMobility) return "Mobilité au programme ce matin — prenez le temps d'être présent.";
    if (ctx.hasRecup)    return "Récup active ce matin — doux réveil pour le corps.";
    if (ctx.hasGrimpe)   return "Grimpe ce matin — bonne séance pour bien démarrer la journée !";
    return "Bonne séance ce matin — partez du bon pied !";
  }
  if (ctx.isAfternoon) {
    if (ctx.hasForce)    return "Force cet après-midi — le corps est bien réveillé, c'est le bon moment.";
    if (ctx.hasEndur)    return "Volume cet après-midi — patience et régularité.";
    if (ctx.hasTech)     return "Technique — concentrez-vous sur la qualité du mouvement.";
    if (ctx.hasRecup)    return "Récup en milieu de journée — allez-y en douceur.";
    if (ctx.hasGrimpe)   return "Grimpe cet après-midi — bonne séance !";
    return "Bonne séance cet après-midi !";
  }
  if (ctx.isEvening) {
    if (ctx.hasForce)    return "Force en soirée — bien s'échauffer, le corps refroidit vite.";
    if (ctx.hasEndur)    return "Endurance en soirée — dosez pour ne pas perturber le sommeil.";
    if (ctx.hasMobility) return "Mobilité en soirée — parfait pour décompresser.";
    if (ctx.hasRecup)    return "Récup en fin de journée — idéal pour relâcher les tensions.";
    if (ctx.hasGrimpe)   return "Grimpe ce soir — bonne séance et bonne soirée !";
    return "Bonne séance ce soir !";
  }

  // ── 38. Location-aware ──
  if (ctx.locations.length > 0) {
    return `Séance prévue — direction ${ctx.locations[0]}, bonne grimpe !`;
  }

  // ── FALLBACK with charge context ──
  if (ctx.totalCharge >= 20) return `Charge ${ctx.totalCharge} au programme — séance conséquente, bonne grimpe !`;
  if (ctx.totalCharge > 0 && ctx.totalCharge <= 10) return "Séance légère au programme — profitez-en !";

  const generic = [
    "Bonne séance aujourd'hui !",
    "C'est parti — bonne séance !",
    "Une séance de plus vers votre objectif.",
    "Allez, on y va — bonne grimpe !",
  ];
  return generic[ctx.dow % generic.length];
}

// ─── ACCUEIL ──────────────────────────────────────────────────────────────────

export function AccueilView({ data, isMobile, onOpenSession, onToggleCreatine, onAddHooper, onAddNutrition, onDeleteNutrition, deadlines, onOpenDeadline, onNewDeadline, onRemoveDeadline }) {
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

  // Profile
  const firstName = data.profile?.firstName || "";

  // Hooper
  const existingHooper = (data.hooper || []).find(h => h.date === today);
  const [hOpen, setHOpen] = useState(false);
  const [hForm, setHForm] = useState(
    existingHooper
      ? { fatigue: existingHooper.fatigue, stress: existingHooper.stress, soreness: existingHooper.soreness, sleep: existingHooper.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
  );
  const [hSaved, setHSaved] = useState(false);
  const hAllFilled = hForm.fatigue && hForm.stress && hForm.soreness && hForm.sleep;
  const hTotal = hAllFilled ? hForm.fatigue + hForm.stress + hForm.soreness + hForm.sleep : null;

  const handleHooperSave = () => {
    if (!hAllFilled) return;
    onAddHooper({
      id: existingHooper?.id || "h_" + Date.now().toString(36),
      date: today,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      ...hForm,
      total: hTotal,
    });
    setHSaved(true);
    setHOpen(false);
    setTimeout(() => setHSaved(false), 3000);
  };

  // Creatine
  const hasCreatine = !!data.creatine?.[today];

  // Nutrition
  const todayMeals = data.nutrition?.[today] || [];
  const totalCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProteins = todayMeals.reduce((s, m) => s + (m.proteins || 0), 0);
  const [nutrOpen, setNutrOpen] = useState(false);
  const [nutrForm, setNutrForm] = useState({ name: "", calories: "", proteins: "" });
  const nutrValid = nutrForm.name.trim() && (nutrForm.calories !== "" || nutrForm.proteins !== "");
  const handleAddMeal = () => {
    if (!nutrValid) return;
    const meal = { id: "m_" + Date.now().toString(36), name: nutrForm.name.trim(), calories: nutrForm.calories !== "" ? Math.round(Number(nutrForm.calories)) : 0, proteins: nutrForm.proteins !== "" ? Math.round(Number(nutrForm.proteins)) : 0 };
    onAddNutrition(today, meal);
    setNutrForm({ name: "", calories: "", proteins: "" });
    setNutrOpen(false);
  };

  // Mesocycle context
  const mesoCtx = getMesoForDate(data.mesocycles || [], todayObj);

  // Contextual phrase
  const phraseCtx = buildPhraseContext(data, todaySessions, todayObj, weekSessions, dayIndex, mesoCtx);
  const contextualPhrase = getContextualPhrase(phraseCtx);

  // Colors
  const accentGreen = isDark ? "#c8906a" : "#8b4c20";
  const panelBg = isDark ? "#1e231f" : "#e8e3da";
  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#9ca3af" : "#6b7280";
  const panelBorder = isDark ? "#2a2f2a" : "#d0cbc3";
  const btnNum = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };
  const sectionLabel = { fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 };

  const dateFull = todayObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const HCRIT = [
    { key: "fatigue",  label: "Fatigue",    sub: "épuisement général" },
    { key: "stress",   label: "Stress",      sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures", sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",   sub: "1 = excellent · 7 = très mauvais" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "24px 16px" : "36px 40px", display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Greeting */}
      <div>
        <div style={{ fontSize: isMobile ? 36 : 52, fontWeight: 600, color: textMain, letterSpacing: "0.01em", lineHeight: 1.1, fontFamily: "'Newsreader', Georgia, serif" }}>
          {getGreeting(new Date().getHours(), firstName)}
        </div>
        <div style={{ fontSize: 13, color: textMuted, marginTop: 5, textTransform: "capitalize" }}>
          {dateFull}
        </div>
        <div style={{ fontSize: isMobile ? 14 : 15, color: textMuted, marginTop: 8, fontStyle: "italic", fontFamily: "'Newsreader', Georgia, serif", lineHeight: 1.4 }}>
          {contextualPhrase}
        </div>
        {mesoCtx?.meso && (
          <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: mesoCtx.meso.color, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {mesoCtx.meso.label}
            </span>
            {mesoCtx.micro && (
              <>
                <span style={{ fontSize: 10, color: mesoCtx.meso.color + "55" }}>›</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: mesoCtx.meso.color + "cc", letterSpacing: "0.06em", background: mesoCtx.meso.color + "22", padding: "1px 7px", borderRadius: 10, border: `1px solid ${mesoCtx.meso.color}44` }}>
                  {mesoCtx.micro.label}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24, alignItems: "start" }}>

        {/* Left: Programme du jour */}
        <div>
          <div style={sectionLabel}>Programme du jour</div>
          {todaySessions.length === 0 ? (
            <div style={{ fontSize: 13, color: textMuted, fontStyle: "italic", padding: "12px 0" }}>
              Pas de séance prévue aujourd'hui
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {todaySessions.map((session, si) => (
                <div
                  key={si}
                  onClick={() => onOpenSession(wKey, dayIndex, si)}
                  style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${panelBorder}` }}
                >
                  <div style={{ width: 3, borderRadius: 2, background: getChargeColor(session.charge), alignSelf: "stretch", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {session.startTime && (
                      <div style={{ fontSize: 11, color: accentGreen, fontWeight: 600, marginBottom: 3 }}>
                        {session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 600, color: textMain }}>
                      {session.title || session.name}
                    </div>
                    {session.blocks && session.blocks.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                        {session.blocks.map((bl, bi) => {
                          const cfg = BLOCK_TYPES[bl.type];
                          if (!cfg) return null;
                          return (
                            <span key={bi} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: cfg.color + "22", color: cfg.color, border: `1px solid ${cfg.color}44` }}>
                              {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {session.coachNote && (
                      <div style={{ fontSize: 10, color: isDark ? "#a0b8a0" : "#4a7060", fontStyle: "italic", marginTop: 5, lineHeight: 1.4, borderLeft: `2px solid ${isDark ? "#3a6040" : "#a0c8a8"}`, paddingLeft: 5 }}>
                        {session.coachNote}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: getChargeColor(session.charge) }}>⚡{session.charge}</span>
                      {session.estimatedTime && <span style={{ fontSize: 10, color: textMuted }}>{session.estimatedTime}min</span>}
                      {session.feedback ? (
                        <span style={{ fontSize: 10, color: session.feedback.done ? accentGreen : "#f87171", fontWeight: 600 }}>
                          {session.feedback.done ? "✓ Fait" : "✗ Manqué"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: textMuted, fontStyle: "italic" }}>Feedback →</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Infos à remplir */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={sectionLabel}>Infos du jour</div>

          {/* Créatine */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasCreatine}
                onChange={() => onToggleCreatine(today)}
                style={{ width: 16, height: 16, accentColor: accentGreen, cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: textMain }}>Créatine</div>
                <div style={{ fontSize: 10, color: textMuted }}>Prise de créatine du jour</div>
              </div>
              {hasCreatine && <span style={{ marginLeft: "auto", fontSize: 12, color: accentGreen, fontWeight: 700 }}>✓</span>}
            </label>
          </div>

          {/* Hooper */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hOpen ? 14 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Indice Hooper</div>
                {existingHooper && !hOpen && (
                  <div style={{ fontSize: 11, color: hooperColor(existingHooper.total, isDark), marginTop: 2, fontWeight: 600 }}>
                    {existingHooper.total} — {hooperLabel(existingHooper.total)}
                    <span style={{ fontSize: 10, color: textMuted, fontWeight: 400, marginLeft: 6 }}>{existingHooper.time}</span>
                  </div>
                )}
                {!existingHooper && !hOpen && (
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>À remplir</div>
                )}
                {hSaved && <div style={{ fontSize: 10, color: accentGreen, marginTop: 2 }}>✓ Enregistré</div>}
              </div>
              <button
                onClick={() => {
                  if (!hOpen && existingHooper) {
                    setHForm({ fatigue: existingHooper.fatigue, stress: existingHooper.stress, soreness: existingHooper.soreness, sleep: existingHooper.sleep });
                  }
                  setHOpen(o => !o);
                }}
                style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
              >
                {hOpen ? "✕ Fermer" : existingHooper ? "Modifier" : "+ Remplir"}
              </button>
            </div>

            {hOpen && (
              <div>
                {HCRIT.map(({ key, label, sub }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 110, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: textMain }}>{label}</div>
                      <div style={{ fontSize: 9, color: textMuted }}>{sub}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4, 5, 6, 7].map(v => {
                        const active = hForm[key] === v;
                        const btnBg = active
                          ? (v <= 2 ? (isDark ? "#4ade80" : "#2a7d4f") : v <= 4 ? "#f97316" : "#f87171")
                          : (isDark ? "#2a2f2a" : "#d8d3ca");
                        return (
                          <button key={v} onClick={() => setHForm(f => ({ ...f, [key]: v }))}
                            style={{ ...btnNum, background: btnBg, color: active ? "#fff" : textMain, fontWeight: active ? 600 : 400 }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {hTotal !== null && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(hTotal, isDark) }}>
                    Indice : {hTotal} — {hooperLabel(hTotal)}
                  </div>
                )}
                <button
                  onClick={handleHooperSave}
                  disabled={!hAllFilled}
                  style={{ background: hAllFilled ? accentGreen : (isDark ? "#2a2f2a" : "#d0d0c0"), border: "none", borderRadius: 6, color: hAllFilled ? (isDark ? "#0a0f0a" : "#fff") : textMuted, padding: "6px 18px", cursor: hAllFilled ? "pointer" : "default", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
                >
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* Nutrition */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: nutrOpen ? 12 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Nutrition</div>
                {(totalCalories > 0 || totalProteins > 0) && !nutrOpen && (
                  <div style={{ fontSize: 11, color: accentGreen, marginTop: 2, fontWeight: 600 }}>
                    {totalCalories} kcal · {totalProteins} g prot
                  </div>
                )}
                {totalCalories === 0 && totalProteins === 0 && !nutrOpen && (
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Aucun repas enregistré</div>
                )}
              </div>
              <button
                onClick={() => setNutrOpen(o => !o)}
                style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
              >
                {nutrOpen ? "✕ Fermer" : "+ Ajouter"}
              </button>
            </div>

            {nutrOpen && (
              <div>
                {/* Meal list */}
                {todayMeals.length > 0 && (
                  <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    {todayMeals.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: textMain }}>
                        <span style={{ flex: 1, fontWeight: 500 }}>{m.name}</span>
                        <span style={{ color: textMuted, fontSize: 11 }}>{m.calories} kcal · {m.proteins} g</span>
                        <button
                          onClick={() => onDeleteNutrition(today, m.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                        >✕</button>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, fontWeight: 700, color: accentGreen, marginTop: 4, borderTop: `1px solid ${panelBorder}`, paddingTop: 6 }}>
                      Total : {totalCalories} kcal · {totalProteins} g protéines
                    </div>
                  </div>
                )}

                {/* Add meal form */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input
                    type="text"
                    placeholder="Repas (ex : Déjeuner, Poulet riz…)"
                    value={nutrForm.name}
                    onChange={e => setNutrForm(f => ({ ...f, name: e.target.value }))}
                    style={{ background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      type="number"
                      placeholder="Calories (kcal)"
                      min={0}
                      value={nutrForm.calories}
                      onChange={e => setNutrForm(f => ({ ...f, calories: e.target.value }))}
                      style={{ flex: 1, background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                    <input
                      type="number"
                      placeholder="Protéines (g)"
                      min={0}
                      value={nutrForm.proteins}
                      onChange={e => setNutrForm(f => ({ ...f, proteins: e.target.value }))}
                      style={{ flex: 1, background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                  <button
                    onClick={handleAddMeal}
                    disabled={!nutrValid}
                    style={{ background: nutrValid ? accentGreen : (isDark ? "#2a2f2a" : "#d0d0c0"), border: "none", borderRadius: 6, color: nutrValid ? (isDark ? "#0a0f0a" : "#fff") : textMuted, padding: "6px 18px", cursor: nutrValid ? "pointer" : "default", fontSize: 12, fontFamily: "inherit", fontWeight: 600, alignSelf: "flex-start" }}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

        {/* ── Échéances / Objectifs ── */}
        {((deadlines || []).length > 0 || onNewDeadline) && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ ...sectionLabel, marginBottom: 0 }}>Échéances</span>
              {onNewDeadline && (
                <button
                  onClick={onNewDeadline}
                  style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 6, color: textMuted, fontSize: 11, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  + Nouvelle
                </button>
              )}
            </div>
            {(deadlines || []).length === 0 ? (
              <div style={{ fontSize: 12, color: textMuted, fontStyle: "italic", padding: "8px 0" }}>Aucune échéance planifiée.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(deadlines || []).map(dl => {
                  const isPast = dl.startDate < new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={dl.id}
                      onClick={() => onOpenDeadline?.(dl)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: dl.color + (isDark ? "15" : "10"),
                        border: `1px solid ${dl.color}44`,
                        borderLeft: `4px solid ${dl.color}`,
                        borderRadius: 7, padding: "8px 12px", cursor: "pointer",
                        opacity: isPast ? 0.55 : 1,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {dl.label}
                        </div>
                        <div style={{ fontSize: 11, color: dl.color, marginTop: 2 }}>
                          {new Date(dl.startDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                          {dl.endDate && ` → ${new Date(dl.endDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: dl.color, background: dl.color + "22", borderRadius: 10, padding: "1px 7px", border: `1px solid ${dl.color}44`, flexShrink: 0 }}>
                        {dl.priority}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); onRemoveDeadline?.(dl.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#4a4a4a" : "#bbb", fontSize: 14, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                        title="Supprimer"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, getMesoForDate } from "../lib/constants.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions } from "../lib/helpers.js";
import { getChargeColor } from "../lib/charge.js";
import { hooperColor, hooperLabel } from "../lib/hooper.js";

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
  const isOnlyLight  = !isRestDay && totalCharge <= 5 && (hasMobility || hasRecup) && !hasForce && !hasEndur && !hasComp;

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
  const isLongDay     = totalDuration >= 120;
  const isQuickSession = totalDuration > 0 && totalDuration <= 30;

  // ── Location ──
  const locations = [...new Set(todaySessions.map(s => s.location).filter(Boolean))];

  return {
    hour, isMorning, isAfternoon, isEvening, isNight, dow,
    sessionCount, isRestDay, totalCharge, chargeLevel, totalDuration,
    isOnlyLight, isLongDay, isQuickSession,
    hasForce, hasEndur, hasRecup, hasTech, hasMobility, hasComp, hasSuspension, hasGrimpe,
    firstSessionTime, lastSessionTime, hasEarlySession, hasLateSession,
    hasMorningSession, hasAfternoonSession, hasEveningSession, hasSplitDay,
    nextSession, minutesToNext, nextSessionSoon, nextSessionVerySoon, allSessionsPassed,
    doneSessions, missedSessions, pendingSessions, allDone, someDone, allMissed, doneCharge,
    hTotal, hFatigue, hStress, hSoreness, hSleep,
    isWellRested, isGoodShape, isModFatigued, isVeryFatigued, isOverreached,
    hasHighSoreness, hasHighStress, hasPoorSleep, hasHighFatigue,
    isPhysicallyFine, isMentallyTired,
    yesterdayCharge, restDaysBefore, consecutiveTrainingDays,
    weekChargeSoFar, weekChargeTotal, weekSessionCountTotal,
    sessionsDoneThisWeek, tomorrowSessions, tomorrowCharge, tomorrowIsRest,
    isFirstDayWithSession, isLastDayWithSession, isHeavyWeek, isEndOfWeek,
    sleepDuration, shortSleep, longSleep,
    mesoCtx, mesoLabel, microLabel, mesoPhase, isDeloadMicro, isIntensityMicro,
    locations,
  };
}

// ─── CONTEXTUAL GREETING PHRASE ───────────────────────────────────────────────

function getContextualPhrase(ctx) {

  // ── 1. All sessions completed ──
  if (ctx.allDone) {
    const n = ctx.doneSessions.length;
    const charge = ctx.doneCharge;
    if (ctx.isEvening || ctx.isNight) {
      if (charge >= 30)  return `Grosse journée (charge ${charge}) dans les jambes — bravo, reposez-vous bien ce soir.`;
      if (n >= 2)        return `${n} séances bouclées — belle journée d'entraînement, profitez de votre soirée !`;
      return `Séance terminée — bonne soirée, le travail est fait.`;
    }
    if (ctx.isAfternoon) {
      if (charge >= 30)  return `Charge ${charge} déjà avalée — grosse matinée ! Le reste de la journée est à vous.`;
      return `Déjà ${n > 1 ? `${n} séances faites` : "la séance dans les jambes"} — profitez du reste de l'après-midi !`;
    }
    if (charge >= 30) return `Charge ${charge} avant midi — chapeau ! Journée productive.`;
    return `Séance${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} avant midi — quelle matinée !`;
  }

  // ── 2. Partially done ──
  if (ctx.someDone) {
    const done = ctx.doneSessions.length;
    const remaining = ctx.pendingSessions.length;
    const missed = ctx.missedSessions.length;
    const remainingCharge = ctx.pendingSessions.reduce((s, sess) => s + (sess.charge || 0), 0);

    if (remaining > 0 && ctx.nextSessionVerySoon) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — la prochaine commence dans ${ctx.minutesToNext} min, préparez-vous !`;
    }
    if (remaining > 0 && remainingCharge >= 25) {
      return `${done} séance${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""}, mais le gros morceau arrive — charge ${remainingCharge} encore au programme.`;
    }
    if (remaining > 0) {
      return `${done}/${ctx.sessionCount} faite${done > 1 ? "s" : ""} — encore ${remaining} à venir, continuez sur cette lancée !`;
    }
    return `${done} séance${done > 1 ? "s" : ""} réalisée${done > 1 ? "s" : ""}${missed > 0 ? `, ${missed} manquée${missed > 1 ? "s" : ""}` : ""} — la journée avance.`;
  }

  // ── 3. All missed ──
  if (ctx.allMissed) {
    if (ctx.isNight) return "Ça n'a pas pu se faire aujourd'hui — c'est pas grave, demain on repart.";
    if (ctx.sessionCount >= 2) return `${ctx.sessionCount} séances manquées — écoutez votre corps, parfois le repos est plus utile.`;
    return "Séance manquée — il est encore temps de rattraper ou de récupérer.";
  }

  // ── 4. Surmenage (Hooper > 20) ──
  if (ctx.isOverreached) {
    if (ctx.isRestDay)   return "Hooper en surmenage — votre corps vous dit de souffler, écoutez-le.";
    if (ctx.isOnlyLight) return "Hooper très élevé, mais la séance légère est parfaite dans ce cas.";
    if (ctx.totalCharge >= 25) return `Attention : Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} au programme — sérieusement, adaptez ou reportez.`;
    if (ctx.hasRecup)    return "Hooper élevé — la séance récup est exactement ce qu'il faut aujourd'hui.";
    return `Indice Hooper à ${ctx.hTotal} — adaptez l'intensité et écoutez votre corps.`;
  }

  // ── 5. Compétition ──
  if (ctx.hasComp) {
    if (ctx.isWellRested) return "En pleine forme pour la compétition — faites confiance à votre préparation !";
    if (ctx.isVeryFatigued) return "Compétition avec de la fatigue — gérez votre énergie, priorisez la lecture et le placement.";
    if (ctx.nextSessionVerySoon) return "Compétition imminente — restez calme, respirez, grimpez votre escalade.";
    return "Journée de compétition — restez dans votre bulle, le travail est déjà fait.";
  }

  // ── 6. Back-to-back heavy days ──
  if (ctx.yesterdayCharge >= 25 && ctx.totalCharge >= 25 && !ctx.isRestDay) {
    if (ctx.isGoodShape) return `Deux grosses journées d'affilée (${ctx.yesterdayCharge} hier, ${ctx.totalCharge} aujourd'hui) mais vous êtes en forme — allez-y intelligemment.`;
    if (ctx.isVeryFatigued) return `Charge ${ctx.yesterdayCharge} hier et ${ctx.totalCharge} aujourd'hui — avec votre fatigue actuelle, adaptez vraiment l'intensité.`;
    return `Charge ${ctx.yesterdayCharge} hier et ${ctx.totalCharge} prévue aujourd'hui — échauffez-vous bien et écoutez les signaux.`;
  }

  // ── 7. Comeback after rest ──
  if (ctx.restDaysBefore >= 3 && !ctx.isRestDay) {
    if (ctx.isWellRested) return `De retour après ${ctx.restDaysBefore} jours de repos et en pleine forme — vous allez régaler !`;
    if (ctx.totalCharge >= 25) return `Reprise après ${ctx.restDaysBefore} jours off avec une grosse charge — montez progressivement.`;
    return `${ctx.restDaysBefore} jours de repos, c'est reparti — prenez le temps de bien vous remettre dedans.`;
  }
  if (ctx.restDaysBefore === 2 && !ctx.isRestDay) {
    if (ctx.isWellRested) return "Deux jours de repos et batteries rechargées — conditions idéales pour performer !";
    return "Reprise après deux jours off — l'échauffement sera important.";
  }

  // ── 8. Rest day ──
  if (ctx.isRestDay) {
    if (ctx.yesterdayCharge >= 25)
      return `Repos bien mérité après la charge ${ctx.yesterdayCharge} d'hier — laissez les muscles récupérer.`;

    if (ctx.isVeryFatigued) return "Vous êtes très fatigué — ce repos tombe vraiment bien.";
    if (ctx.hasPoorSleep)   return "Mauvaise nuit de sommeil — profitez du repos pour compenser.";

    if (ctx.tomorrowCharge >= 25)
      return `Repos aujourd'hui et charge ${ctx.tomorrowCharge} demain — préparez-vous, ça va être costaud.`;
    if (ctx.tomorrowSessions.length >= 2)
      return `Repos stratégique avant ${ctx.tomorrowSessions.length} séances demain — rechargez bien.`;

    if (ctx.isNight) return "Nuit de récupération en vue — dormez bien, c'est là que la progression se construit.";

    if (ctx.dow === 0 || ctx.dow === 6) {
      if (ctx.isWellRested) return "Week-end off et en pleine forme — profitez bien de cette journée !";
      return "Week-end de repos — rechargez les batteries.";
    }

    if (ctx.isWellRested)  return "Journée off et excellent Hooper — vous êtes au top, profitez-en !";
    if (ctx.isGoodShape)   return "Bien récupéré — profitez de cette journée de repos.";
    if (ctx.isDeloadMicro) return "Semaine de décharge — le repos fait partie intégrante du plan.";

    if (ctx.weekChargeSoFar >= 60)
      return `Déjà ${ctx.weekChargeSoFar} de charge cette semaine — ce repos est stratégique.`;

    if (ctx.isEndOfWeek && ctx.sessionsDoneThisWeek >= 3)
      return `${ctx.sessionsDoneThisWeek} séances cette semaine — repos bien mérité en fin de semaine.`;

    if (ctx.shortSleep)
      return `${ctx.sleepDuration.toFixed(1)}h de sommeil seulement — profitez du repos pour rattraper.`;

    const restMessages = [
      "L'entraînement se construit dans la récupération — profitez de cette journée off.",
      "Journée de repos — le corps se renforce quand il récupère.",
      "Pas de séance aujourd'hui — savourez ce temps libre.",
      "Repos actif ou complet, à vous de choisir — l'important c'est de récupérer.",
      "La progression passe par le repos — prenez-le bien.",
      "Journée off — rechargez les batteries.",
      "Profitez de votre journée de repos !",
    ];
    return restMessages[ctx.dow % restMessages.length];
  }

  // ── 9. Session imminent (< 30 min) ──
  if (ctx.nextSessionVerySoon) {
    const s = ctx.nextSession.session;
    const sCharge = s.charge || 0;
    if (sCharge >= 25)     return `Séance dans ${ctx.minutesToNext} min — charge ${sCharge}, échauffez-vous bien avant.`;
    if (ctx.hasSuspension) return `Poutre dans ${ctx.minutesToNext} min — préparez vos doigts progressivement.`;
    return `Séance dans ${ctx.minutesToNext} min — c'est bientôt l'heure, préparez-vous !`;
  }

  // ── 10. Very fatigued (Hooper 17-20) ──
  if (ctx.isVeryFatigued) {
    if (ctx.isOnlyLight)   return "Hooper élevé mais séance légère — parfait dosage, allez-y en douceur.";
    if (ctx.hasRecup)      return "La séance récup tombe bien — vous êtes fatigué, allez-y mollo.";
    if (ctx.totalCharge >= 25) return `Hooper ${ctx.hTotal} et charge ${ctx.totalCharge} prévue — pensez à réduire l'intensité si le corps ne suit pas.`;
    if (ctx.hasForce)      return "Fatigue notable et séance de force — montez très progressivement et adaptez si besoin.";
    if (ctx.hasSuspension) return "Fatigue élevée avant la poutre — écoutez vos doigts et vos tendons, pas d'ego aujourd'hui.";
    if (ctx.isMorning)     return "Vous êtes fatigué ce matin — démarrez doucement et voyez comment ça répond.";
    return `Hooper à ${ctx.hTotal} — gérez bien l'effort, l'adaptation se fait aussi en s'écoutant.`;
  }

  // ── 11. Split day (morning + evening) ──
  if (ctx.hasSplitDay) {
    if (ctx.isWellRested)     return `Double séance (matin + soir) et vous êtes frais — gérez bien l'énergie sur la journée !`;
    if (ctx.totalCharge >= 30) return `Journée bi-séance avec charge ${ctx.totalCharge} — mangez bien entre les deux et hydratez-vous.`;
    return `${ctx.sessionCount} séances réparties dans la journée — pensez à bien récupérer entre chaque.`;
  }

  // ── 12. Long training streak (4+ consecutive days) ──
  if (ctx.consecutiveTrainingDays >= 5) {
    if (ctx.tomorrowIsRest) return `${ctx.consecutiveTrainingDays}ème jour de suite — repos demain, tenez bon !`;
    return `${ctx.consecutiveTrainingDays} jours d'entraînement consécutifs — attention à l'accumulation de fatigue.`;
  }
  if (ctx.consecutiveTrainingDays === 4) {
    if (ctx.isGoodShape) return "4ème jour consécutif et toujours en forme — vous encaissez bien !";
    return "4 jours de suite — écoutez bien votre corps aujourd'hui.";
  }

  // ── 13. Deload week ──
  if (ctx.isDeloadMicro) {
    if (ctx.totalCharge >= 20) return "Semaine de décharge — même si la charge est notable, restez sous vos capacités habituelles.";
    return "Semaine de décharge — gardez le mouvement mais sans forcer, c'est le plan.";
  }

  // ── 14. Night with session ──
  if (ctx.isNight) {
    if (ctx.allSessionsPassed) return "Les séances sont passées — si c'est fait, bravo. Sinon, reposez-vous pour demain.";
    return "Séance tardive — échauffez-vous plus longuement, le corps refroidit vite le soir.";
  }

  // ── 15. Late session (>= 20h) ──
  if (ctx.hasLateSession && ctx.isEvening) {
    if (ctx.hasSuspension) return "Poutre en soirée — les tendons mettent plus de temps à chauffer, prenez-le en compte.";
    if (ctx.hasForce)      return "Séance de force tard le soir — bien s'échauffer, le corps est souvent plus raide en fin de journée.";
    if (ctx.hasEndur)      return "Endurance en soirée — dosez pour ne pas trop perturber le sommeil.";
    if (ctx.hasMobility)   return "Mobilité en soirée — parfait pour décompresser avant la nuit.";
  }

  // ── 16. Early session (< 8h) ──
  if (ctx.hasEarlySession && ctx.isMorning) {
    if (ctx.hasPoorSleep)    return "Séance matinale malgré une mauvaise nuit — adaptez l'intensité, votre corps n'est pas encore prêt.";
    if (ctx.hasForce)        return "Force au réveil — prenez 15 min de plus pour l'échauffement, les muscles sont encore froids.";
    if (ctx.hasSuspension)   return "Poutre tôt le matin — soyez très progressif, les tendons ont besoin de temps pour chauffer.";
    if (ctx.shortSleep)      return `${ctx.sleepDuration.toFixed(1)}h de sommeil et séance matinale — restez à l'écoute.`;
    if (ctx.longSleep)       return "Belle nuit de sommeil et séance matinale — conditions idéales, lancez-vous !";
    return "Séance tôt ce matin — réveillez bien le corps avant d'attaquer.";
  }

  // ── 17. Brutal charge (> 30) ──
  if (ctx.chargeLevel === "brutal") {
    if (ctx.isWellRested)   return `Charge ${ctx.totalCharge} au programme et Hooper au vert — conditions idéales pour envoyer.`;
    if (ctx.isGoodShape)    return `Grosse journée (charge ${ctx.totalCharge}) — vous êtes en forme, allez chercher la progression.`;
    if (ctx.tomorrowIsRest) return `Charge ${ctx.totalCharge} et repos demain — donnez tout aujourd'hui !`;
    if (ctx.shortSleep)     return `Charge ${ctx.totalCharge} prévue avec peu de sommeil — adaptez si nécessaire, pas la peine de se blesser.`;
    return `Charge ${ctx.totalCharge} au programme — grosse journée, gérez bien l'échauffement et la récupération.`;
  }

  // ── 18. Only light session (mobility/recovery, charge ≤ 5) ──
  if (ctx.isOnlyLight) {
    if (ctx.yesterdayCharge >= 25) return "Séance légère après une grosse journée hier — parfait pour la récupération active.";
    if (ctx.hasHighSoreness)      return "Courbatures + séance légère — exactement ce qu'il faut, allez-y en douceur.";
    if (ctx.hasMobility && ctx.isEvening)  return "Mobilité en soirée — parfait pour décompresser et préparer une bonne nuit.";
    if (ctx.hasMobility && ctx.isMorning)  return "Mobilité au réveil — doux start pour la journée, prenez le temps.";
    if (ctx.hasRecup)   return "Séance de récupération — l'objectif c'est la qualité du mouvement, pas l'intensité.";
    return "Séance légère au programme — profitez-en pour soigner la qualité.";
  }

  // ── 19. Mentally tired but physically fine ──
  if (ctx.isMentallyTired) {
    if (ctx.hasForce)    return "Stress élevé mais corps en forme — la grimpe peut aider à décompresser, utilisez-la.";
    if (ctx.hasMobility) return "Beaucoup de stress — la séance de mobilité va vous faire du bien.";
    return "Stress élevé mais physiquement ça va — la séance peut être un bon exutoire, allez-y.";
  }

  // ── 20. High soreness + force/suspension ──
  if (ctx.hasHighSoreness) {
    if (ctx.hasForce)      return `Courbatures à ${ctx.hSoreness}/7 et séance de force — échauffez-vous longuement et adaptez les charges.`;
    if (ctx.hasSuspension) return `Courbatures notables et poutre au programme — soyez très prudent avec les tendons.`;
    if (ctx.hasGrimpe)     return `Courbatures notables — privilégiez la technique et les mouvements fluides plutôt que la difficulté.`;
  }

  // ── 21. Poor sleep + training ──
  if (ctx.hasPoorSleep) {
    if (ctx.totalCharge >= 20) return `Mauvaise nuit et charge ${ctx.totalCharge} — adaptez si le corps ne répond pas.`;
    return "Sommeil difficile — allez-y progressivement, pas besoin de forcer.";
  }

  // ── 22. Moderate fatigue ──
  if (ctx.isModFatigued) {
    if (ctx.hasRecup)          return "Modérément fatigué et récup au programme — combo parfait.";
    if (ctx.totalCharge >= 25) return `Fatigue modérée et charge ${ctx.totalCharge} — restez lucide, adaptez si besoin.`;
    if (ctx.hasForce)          return "Un peu de fatigue pour la force — montez progressivement, voyez comment ça répond.";
    if (ctx.hasEndur)          return "Fatigue modérée pour l'endurance — gardez un effort dosé.";
    if (ctx.hasSuspension)     return "Fatigue modérée avant la poutre — échauffez bien les doigts et restez à l'écoute.";
    return "Un peu de fatigue — rien de grave, mais restez à l'écoute.";
  }

  // ── 23. Heavy charge (21-30) ──
  if (ctx.chargeLevel === "heavy") {
    if (ctx.isWellRested)              return `Charge ${ctx.totalCharge} et excellent Hooper — conditions parfaites pour progresser !`;
    if (ctx.tomorrowIsRest)            return `Charge ${ctx.totalCharge} et repos demain — poussez un peu plus que d'habitude.`;
    if (ctx.consecutiveTrainingDays >= 3) return `Charge ${ctx.totalCharge} après ${ctx.consecutiveTrainingDays - 1} jours d'entraînement — gérez bien l'accumulation.`;
    return `Charge ${ctx.totalCharge} au programme — séance conséquente, échauffez-vous bien.`;
  }

  // ── 24. Multi-session day (2+) ──
  if (ctx.sessionCount >= 2) {
    if (ctx.isWellRested)       return `${ctx.sessionCount} séances aujourd'hui et vous êtes frais — journée productive en vue !`;
    if (ctx.tomorrowIsRest)     return `${ctx.sessionCount} séances et repos demain — donnez tout aujourd'hui.`;
    if (ctx.totalDuration >= 120) return `${ctx.sessionCount} séances, ${ctx.totalDuration} min au total — pensez à bien manger et vous hydrater entre.`;
    return `${ctx.sessionCount} séances au programme — gérez bien votre énergie sur la journée.`;
  }

  // ── 25. Session coming soon (< 90 min) ──
  if (ctx.nextSessionSoon && ctx.minutesToNext > 30) {
    const s = ctx.nextSession.session;
    if (ctx.hasSuspension) return `Poutre dans ${ctx.minutesToNext} min — commencez à mobiliser les doigts.`;
    if (s.charge >= 20)    return `Séance dans ${ctx.minutesToNext} min (charge ${s.charge}) — pensez à l'échauffement.`;
    return `Prochaine séance dans ${ctx.minutesToNext} min — bientôt l'heure !`;
  }

  // ── 26. Tomorrow rest ──
  if (ctx.tomorrowIsRest) {
    if (ctx.hasForce)      return "Force et repos demain — allez chercher le maximum !";
    if (ctx.hasSuspension) return "Poutre et repos demain — conditions idéales pour tester vos limites.";
    return "Repos demain — profitez de cette séance pour bien travailler.";
  }

  // ── 27. Week position ──
  if (ctx.isFirstDayWithSession) {
    if (ctx.isMorning && ctx.hasForce) return "Force pour ouvrir la semaine — bonne manière de poser le ton !";
    if (ctx.isMorning) return "C'est parti pour la semaine — première séance pour lancer la dynamique !";
    return "Première séance de la semaine — posez le rythme dès maintenant.";
  }
  if (ctx.isLastDayWithSession) {
    if (ctx.sessionsDoneThisWeek >= 4) return `Dernière séance après ${ctx.sessionsDoneThisWeek} déjà dans les jambes — belle semaine, finissez en beauté !`;
    if (ctx.sessionsDoneThisWeek >= 2) return `Dernière séance de la semaine — ${ctx.sessionsDoneThisWeek} déjà faites, terminez bien.`;
    return "Dernière séance de la semaine — terminez en force !";
  }

  // ── 28. Well rested / good shape ──
  if (ctx.isWellRested) {
    if (ctx.hasForce && ctx.hasSuspension) return "En pleine forme — parfait pour forcer sur la poutre et la grimpe.";
    if (ctx.hasForce)      return "Excellent Hooper et force au programme — allez chercher le max !";
    if (ctx.hasEndur)      return "Vous êtes frais — parfait pour une longue séance d'endurance.";
    if (ctx.hasSuspension) return "Doigts reposés et Hooper au vert — conditions idéales pour la poutre.";
    if (ctx.hasTech)       return "En forme et séance technique — l'esprit frais, c'est là qu'on apprend le mieux.";
    return "Vous vous sentez super bien — excellente séance en vue !";
  }
  if (ctx.isGoodShape) {
    if (ctx.hasForce)  return "Bonne forme — allez chercher de belles performances en force.";
    if (ctx.hasEndur)  return "Bien récupéré — idéal pour mettre du volume.";
    return "Bonne forme générale — bonne séance !";
  }

  // ── 29. Short sleep ──
  if (ctx.shortSleep) {
    return `${ctx.sleepDuration.toFixed(1)}h de sommeil — soyez à l'écoute et adaptez si le corps ne répond pas.`;
  }

  // ── 30. Long sleep ──
  if (ctx.longSleep) {
    return "Belle nuit de sommeil — vous devriez être bien pour la séance !";
  }

  // ── 31. Heavy week ──
  if (ctx.isHeavyWeek && ctx.isEndOfWeek) {
    return `Semaine chargée (${ctx.weekChargeTotal} au total) — fin de semaine, tenez le cap.`;
  }

  // ── 32. Meso phase ──
  if (ctx.mesoPhase === "start") {
    return `Début du ${ctx.mesoLabel} — posez les bases, la progression viendra.`;
  }
  if (ctx.mesoPhase === "end") {
    return `Fin du ${ctx.mesoLabel} en vue — restez concentré jusqu'au bout.`;
  }

  // ── 33. Intensity micro ──
  if (ctx.isIntensityMicro) {
    return "Semaine d'intensité — poussez vos limites mais gardez la technique.";
  }

  // ── 34. Suspension-specific ──
  if (ctx.hasSuspension) {
    if (ctx.isMorning) return "Poutre ce matin — prenez le temps de bien chauffer les doigts avant de charger.";
    if (ctx.isEvening) return "Poutre en soirée — les tendons sont mieux préparés en fin de journée.";
    return "Séance de suspension au programme — la patience sur l'échauffement fait toute la différence.";
  }

  // ── 35. Quick session (≤ 30 min) ──
  if (ctx.isQuickSession) {
    return `Séance courte (${ctx.totalDuration} min) — allez droit à l'essentiel !`;
  }

  // ── 36. Long day (≥ 120 min) ──
  if (ctx.isLongDay) {
    return `Grosse séance de ${ctx.totalDuration} min — pensez à bien vous hydrater et manger.`;
  }

  // ── 37. Time + type combos ──
  if (ctx.isMorning) {
    if (ctx.hasForce)    return "Séance de force ce matin — réveillez bien les muscles avant d'attaquer.";
    if (ctx.hasEndur)    return "Endurance au petit matin — idéal pour commencer la journée.";
    if (ctx.hasTech)     return "Technique ce matin — l'esprit frais, concentrez-vous sur la précision.";
    if (ctx.hasMobility) return "Mobilité au programme ce matin — prenez le temps d'être présent.";
    if (ctx.hasRecup)    return "Récup active ce matin — doux réveil pour le corps.";
    if (ctx.hasGrimpe)   return "Grimpe ce matin — bonne séance pour bien démarrer la journée !";
    return "Bonne séance ce matin — partez du bon pied !";
  }
  if (ctx.isAfternoon) {
    if (ctx.hasForce)    return "Force cet après-midi — le corps est bien réveillé, c'est le bon moment.";
    if (ctx.hasEndur)    return "Volume cet après-midi — patience et régularité.";
    if (ctx.hasTech)     return "Technique — concentrez-vous sur la qualité du mouvement.";
    if (ctx.hasRecup)    return "Récup en milieu de journée — allez-y en douceur.";
    if (ctx.hasGrimpe)   return "Grimpe cet après-midi — bonne séance !";
    return "Bonne séance cet après-midi !";
  }
  if (ctx.isEvening) {
    if (ctx.hasForce)    return "Force en soirée — bien s'échauffer, le corps refroidit vite.";
    if (ctx.hasEndur)    return "Endurance en soirée — dosez pour ne pas perturber le sommeil.";
    if (ctx.hasMobility) return "Mobilité en soirée — parfait pour décompresser.";
    if (ctx.hasRecup)    return "Récup en fin de journée — idéal pour relâcher les tensions.";
    if (ctx.hasGrimpe)   return "Grimpe ce soir — bonne séance et bonne soirée !";
    return "Bonne séance ce soir !";
  }

  // ── 38. Location-aware ──
  if (ctx.locations.length > 0) {
    return `Séance prévue — direction ${ctx.locations[0]}, bonne grimpe !`;
  }

  // ── FALLBACK with charge context ──
  if (ctx.totalCharge >= 20) return `Charge ${ctx.totalCharge} au programme — séance conséquente, bonne grimpe !`;
  if (ctx.totalCharge > 0 && ctx.totalCharge <= 10) return "Séance légère au programme — profitez-en !";

  const generic = [
    "Bonne séance aujourd'hui !",
    "C'est parti — bonne séance !",
    "Une séance de plus vers votre objectif.",
    "Allez, on y va — bonne grimpe !",
  ];
  return generic[ctx.dow % generic.length];
}

// ─── ACCUEIL ──────────────────────────────────────────────────────────────────

export function AccueilView({ data, isMobile, onOpenSession, onToggleCreatine, onAddHooper, onAddNutrition, onDeleteNutrition, deadlines, onOpenDeadline, onNewDeadline, onRemoveDeadline }) {
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

  // Profile
  const firstName = data.profile?.firstName || "";

  // Hooper
  const existingHooper = (data.hooper || []).find(h => h.date === today);
  const [hOpen, setHOpen] = useState(false);
  const [hForm, setHForm] = useState(
    existingHooper
      ? { fatigue: existingHooper.fatigue, stress: existingHooper.stress, soreness: existingHooper.soreness, sleep: existingHooper.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
  );
  const [hSaved, setHSaved] = useState(false);
  const hAllFilled = hForm.fatigue && hForm.stress && hForm.soreness && hForm.sleep;
  const hTotal = hAllFilled ? hForm.fatigue + hForm.stress + hForm.soreness + hForm.sleep : null;

  const handleHooperSave = () => {
    if (!hAllFilled) return;
    onAddHooper({
      id: existingHooper?.id || "h_" + Date.now().toString(36),
      date: today,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      ...hForm,
      total: hTotal,
    });
    setHSaved(true);
    setHOpen(false);
    setTimeout(() => setHSaved(false), 3000);
  };

  // Creatine
  const hasCreatine = !!data.creatine?.[today];

  // Nutrition
  const todayMeals = data.nutrition?.[today] || [];
  const totalCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProteins = todayMeals.reduce((s, m) => s + (m.proteins || 0), 0);
  const [nutrOpen, setNutrOpen] = useState(false);
  const [nutrForm, setNutrForm] = useState({ name: "", calories: "", proteins: "" });
  const nutrValid = nutrForm.name.trim() && (nutrForm.calories !== "" || nutrForm.proteins !== "");
  const handleAddMeal = () => {
    if (!nutrValid) return;
    const meal = { id: "m_" + Date.now().toString(36), name: nutrForm.name.trim(), calories: nutrForm.calories !== "" ? Math.round(Number(nutrForm.calories)) : 0, proteins: nutrForm.proteins !== "" ? Math.round(Number(nutrForm.proteins)) : 0 };
    onAddNutrition(today, meal);
    setNutrForm({ name: "", calories: "", proteins: "" });
    setNutrOpen(false);
  };

  // Mesocycle context
  const mesoCtx = getMesoForDate(data.mesocycles || [], todayObj);

  // Contextual phrase
  const phraseCtx = buildPhraseContext(data, todaySessions, todayObj, weekSessions, dayIndex, mesoCtx);
  const contextualPhrase = getContextualPhrase(phraseCtx);

  // Colors
  const accentGreen = isDark ? "#c8906a" : "#8b4c20";
  const panelBg = isDark ? "#1e231f" : "#e8e3da";
  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#9ca3af" : "#6b7280";
  const panelBorder = isDark ? "#2a2f2a" : "#d0cbc3";
  const btnNum = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };
  const sectionLabel = { fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 };

  const dateFull = todayObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const HCRIT = [
    { key: "fatigue",  label: "Fatigue",    sub: "épuisement général" },
    { key: "stress",   label: "Stress",      sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures", sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",   sub: "1 = excellent · 7 = très mauvais" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "24px 16px" : "36px 40px", display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Greeting */}
      <div>
        <div style={{ fontSize: isMobile ? 36 : 52, fontWeight: 600, color: textMain, letterSpacing: "0.01em", lineHeight: 1.1, fontFamily: "'Newsreader', Georgia, serif" }}>
          {getGreeting(new Date().getHours(), firstName)}
        </div>
        <div style={{ fontSize: 13, color: textMuted, marginTop: 5, textTransform: "capitalize" }}>
          {dateFull}
        </div>
        <div style={{ fontSize: isMobile ? 14 : 15, color: textMuted, marginTop: 8, fontStyle: "italic", fontFamily: "'Newsreader', Georgia, serif", lineHeight: 1.4 }}>
          {contextualPhrase}
        </div>
        {mesoCtx?.meso && (
          <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: mesoCtx.meso.color, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {mesoCtx.meso.label}
            </span>
            {mesoCtx.micro && (
              <>
                <span style={{ fontSize: 10, color: mesoCtx.meso.color + "55" }}>›</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: mesoCtx.meso.color + "cc", letterSpacing: "0.06em", background: mesoCtx.meso.color + "22", padding: "1px 7px", borderRadius: 10, border: `1px solid ${mesoCtx.meso.color}44` }}>
                  {mesoCtx.micro.label}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24, alignItems: "start" }}>

        {/* Left: Programme du jour */}
        <div>
          <div style={sectionLabel}>Programme du jour</div>
          {todaySessions.length === 0 ? (
            <div style={{ fontSize: 13, color: textMuted, fontStyle: "italic", padding: "12px 0" }}>
              Pas de séance prévue aujourd'hui
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {todaySessions.map((session, si) => (
                <div
                  key={si}
                  onClick={() => onOpenSession(wKey, dayIndex, si)}
                  style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${panelBorder}` }}
                >
                  <div style={{ width: 3, borderRadius: 2, background: getChargeColor(session.charge), alignSelf: "stretch", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {session.startTime && (
                      <div style={{ fontSize: 11, color: accentGreen, fontWeight: 600, marginBottom: 3 }}>
                        {session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 600, color: textMain }}>
                      {session.title || session.name}
                    </div>
                    {session.blocks && session.blocks.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                        {session.blocks.map((bl, bi) => {
                          const cfg = BLOCK_TYPES[bl.type];
                          if (!cfg) return null;
                          return (
                            <span key={bi} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: cfg.color + "22", color: cfg.color, border: `1px solid ${cfg.color}44` }}>
                              {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {session.coachNote && (
                      <div style={{ fontSize: 10, color: isDark ? "#a0b8a0" : "#4a7060", fontStyle: "italic", marginTop: 5, lineHeight: 1.4, borderLeft: `2px solid ${isDark ? "#3a6040" : "#a0c8a8"}`, paddingLeft: 5 }}>
                        {session.coachNote}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: getChargeColor(session.charge) }}>⚡{session.charge}</span>
                      {session.estimatedTime && <span style={{ fontSize: 10, color: textMuted }}>{session.estimatedTime}min</span>}
                      {session.feedback ? (
                        <span style={{ fontSize: 10, color: session.feedback.done ? accentGreen : "#f87171", fontWeight: 600 }}>
                          {session.feedback.done ? "✓ Fait" : "✗ Manqué"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: textMuted, fontStyle: "italic" }}>Feedback →</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Infos à remplir */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={sectionLabel}>Infos du jour</div>

          {/* Créatine */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasCreatine}
                onChange={() => onToggleCreatine(today)}
                style={{ width: 16, height: 16, accentColor: accentGreen, cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: textMain }}>Créatine</div>
                <div style={{ fontSize: 10, color: textMuted }}>Prise de créatine du jour</div>
              </div>
              {hasCreatine && <span style={{ marginLeft: "auto", fontSize: 12, color: accentGreen, fontWeight: 700 }}>✓</span>}
            </label>
          </div>

          {/* Hooper */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hOpen ? 14 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Indice Hooper</div>
                {existingHooper && !hOpen && (
                  <div style={{ fontSize: 11, color: hooperColor(existingHooper.total, isDark), marginTop: 2, fontWeight: 600 }}>
                    {existingHooper.total} — {hooperLabel(existingHooper.total)}
                    <span style={{ fontSize: 10, color: textMuted, fontWeight: 400, marginLeft: 6 }}>{existingHooper.time}</span>
                  </div>
                )}
                {!existingHooper && !hOpen && (
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>À remplir</div>
                )}
                {hSaved && <div style={{ fontSize: 10, color: accentGreen, marginTop: 2 }}>✓ Enregistré</div>}
              </div>
              <button
                onClick={() => {
                  if (!hOpen && existingHooper) {
                    setHForm({ fatigue: existingHooper.fatigue, stress: existingHooper.stress, soreness: existingHooper.soreness, sleep: existingHooper.sleep });
                  }
                  setHOpen(o => !o);
                }}
                style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
              >
                {hOpen ? "✕ Fermer" : existingHooper ? "Modifier" : "+ Remplir"}
              </button>
            </div>

            {hOpen && (
              <div>
                {HCRIT.map(({ key, label, sub }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 110, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: textMain }}>{label}</div>
                      <div style={{ fontSize: 9, color: textMuted }}>{sub}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4, 5, 6, 7].map(v => {
                        const active = hForm[key] === v;
                        const btnBg = active
                          ? (v <= 2 ? (isDark ? "#4ade80" : "#2a7d4f") : v <= 4 ? "#f97316" : "#f87171")
                          : (isDark ? "#2a2f2a" : "#d8d3ca");
                        return (
                          <button key={v} onClick={() => setHForm(f => ({ ...f, [key]: v }))}
                            style={{ ...btnNum, background: btnBg, color: active ? "#fff" : textMain, fontWeight: active ? 600 : 400 }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {hTotal !== null && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(hTotal, isDark) }}>
                    Indice : {hTotal} — {hooperLabel(hTotal)}
                  </div>
                )}
                <button
                  onClick={handleHooperSave}
                  disabled={!hAllFilled}
                  style={{ background: hAllFilled ? accentGreen : (isDark ? "#2a2f2a" : "#d0d0c0"), border: "none", borderRadius: 6, color: hAllFilled ? (isDark ? "#0a0f0a" : "#fff") : textMuted, padding: "6px 18px", cursor: hAllFilled ? "pointer" : "default", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
                >
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* Nutrition */}
          <div style={{ background: panelBg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${panelBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: nutrOpen ? 12 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>Nutrition</div>
                {(totalCalories > 0 || totalProteins > 0) && !nutrOpen && (
                  <div style={{ fontSize: 11, color: accentGreen, marginTop: 2, fontWeight: 600 }}>
                    {totalCalories} kcal · {totalProteins} g prot
                  </div>
                )}
                {totalCalories === 0 && totalProteins === 0 && !nutrOpen && (
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Aucun repas enregistré</div>
                )}
              </div>
              <button
                onClick={() => setNutrOpen(o => !o)}
                style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
              >
                {nutrOpen ? "✕ Fermer" : "+ Ajouter"}
              </button>
            </div>

            {nutrOpen && (
              <div>
                {/* Meal list */}
                {todayMeals.length > 0 && (
                  <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    {todayMeals.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: textMain }}>
                        <span style={{ flex: 1, fontWeight: 500 }}>{m.name}</span>
                        <span style={{ color: textMuted, fontSize: 11 }}>{m.calories} kcal · {m.proteins} g</span>
                        <button
                          onClick={() => onDeleteNutrition(today, m.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                        >✕</button>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, fontWeight: 700, color: accentGreen, marginTop: 4, borderTop: `1px solid ${panelBorder}`, paddingTop: 6 }}>
                      Total : {totalCalories} kcal · {totalProteins} g protéines
                    </div>
                  </div>
                )}

                {/* Add meal form */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input
                    type="text"
                    placeholder="Repas (ex : Déjeuner, Poulet riz…)"
                    value={nutrForm.name}
                    onChange={e => setNutrForm(f => ({ ...f, name: e.target.value }))}
                    style={{ background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      type="number"
                      placeholder="Calories (kcal)"
                      min={0}
                      value={nutrForm.calories}
                      onChange={e => setNutrForm(f => ({ ...f, calories: e.target.value }))}
                      style={{ flex: 1, background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                    <input
                      type="number"
                      placeholder="Protéines (g)"
                      min={0}
                      value={nutrForm.proteins}
                      onChange={e => setNutrForm(f => ({ ...f, proteins: e.target.value }))}
                      style={{ flex: 1, background: isDark ? "#161a16" : "#f0ece4", border: `1px solid ${panelBorder}`, borderRadius: 5, color: textMain, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                  <button
                    onClick={handleAddMeal}
                    disabled={!nutrValid}
                    style={{ background: nutrValid ? accentGreen : (isDark ? "#2a2f2a" : "#d0d0c0"), border: "none", borderRadius: 6, color: nutrValid ? (isDark ? "#0a0f0a" : "#fff") : textMuted, padding: "6px 18px", cursor: nutrValid ? "pointer" : "default", fontSize: 12, fontFamily: "inherit", fontWeight: 600, alignSelf: "flex-start" }}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

        {/* ── Échéances / Objectifs ── */}
        {((deadlines || []).length > 0 || onNewDeadline) && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ ...sectionLabel, marginBottom: 0 }}>Échéances</span>
              {onNewDeadline && (
                <button
                  onClick={onNewDeadline}
                  style={{ background: "none", border: `1px solid ${panelBorder}`, borderRadius: 6, color: textMuted, fontSize: 11, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  + Nouvelle
                </button>
              )}
            </div>
            {(deadlines || []).length === 0 ? (
              <div style={{ fontSize: 12, color: textMuted, fontStyle: "italic", padding: "8px 0" }}>Aucune échéance planifiée.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(deadlines || []).map(dl => {
                  const isPast = dl.startDate < new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={dl.id}
                      onClick={() => onOpenDeadline?.(dl)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: dl.color + (isDark ? "15" : "10"),
                        border: `1px solid ${dl.color}44`,
                        borderLeft: `4px solid ${dl.color}`,

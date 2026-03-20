import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, getMesoForDate } from "../lib/constants.js";
import { getMondayOf, weekKey, localDateStr } from "../lib/helpers.js";
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

// ─── CONTEXTUAL GREETING PHRASE ───────────────────────────────────────────────

function getContextualPhrase(todaySessions, hooperEntry, dayOfWeek, { hour, weekSessions, dayIndex, mesoCtx } = {}) {
  const now = hour ?? new Date().getHours();
  const isRest     = todaySessions.length === 0;
  const isHeavyDay = todaySessions.length >= 2;

  // Session completion status
  const doneSessions    = todaySessions.filter(s => s.feedback?.done === true);
  const missedSessions  = todaySessions.filter(s => s.feedback?.done === false);
  const pendingSessions = todaySessions.filter(s => !s.feedback);
  const allDone         = todaySessions.length > 0 && doneSessions.length === todaySessions.length;
  const someDone        = doneSessions.length > 0 && doneSessions.length < todaySessions.length;
  const allMissed       = todaySessions.length > 0 && missedSessions.length === todaySessions.length && pendingSessions.length === 0;

  // Time of day slots
  const isMorning   = now >= 5  && now < 12;
  const isAfternoon = now >= 12 && now < 17;
  const isEvening   = now >= 17 && now < 22;
  const isNight     = now >= 22 || now < 5;

  // Session type detection
  const names      = todaySessions.map(s => (s.title || s.name || "").toLowerCase()).join(" ");
  const isForce    = /force|maximal|bloc|campus|dynami|puissan/.test(names);
  const isEndur    = /endur|volume|vol\b|capac|ae\b|fond/.test(names);
  const isRecup    = /récup|recup|calme|retour|active/.test(names);
  const isTech     = /techni|dalle|travers|dégrav|mouv|précis/.test(names);
  const isMobility = /mobil|étir|yoga|stretch|souplesse/.test(names);
  const isComp     = /compét|compe|lead|bloc.*final|qualif/.test(names);

  // Week context
  const wi = typeof dayIndex === "number" ? dayIndex : (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  const sessionsDoneThisWeek = weekSessions
    ? weekSessions.slice(0, wi).flat().filter(s => s?.feedback?.done === true).length
    : 0;
  const tomorrowSessions = weekSessions && wi < 6 ? (weekSessions[wi + 1] || []) : [];
  const tomorrowIsRest   = tomorrowSessions.length === 0 && wi < 6;
  const isFirstDayWithSession = weekSessions
    ? weekSessions.slice(0, wi).every(d => !d || d.length === 0)
    : false;
  const isLastDayWithSession = weekSessions
    ? weekSessions.slice(wi + 1).every(d => !d || d.length === 0)
    : false;

  // Mesocycle phase (start/end)
  const mesoPhrase = (() => {
    if (!mesoCtx?.meso?.startDate || !mesoCtx.meso.durationWeeks) return null;
    const start = new Date(mesoCtx.meso.startDate);
    const totalDays = mesoCtx.meso.durationWeeks * 7;
    const elapsed = Math.floor((new Date() - start) / 86400000);
    const pct = elapsed / totalDays;
    if (pct < 0.15) return `Début du ${mesoCtx.meso.label} — posez les bases.`;
    if (pct > 0.85) return `Fin de mésocycle en vue — restez concentré jusqu'au bout.`;
    return null;
  })();

  // Hooper index
  const hTotal = hooperEntry
    ? (hooperEntry.fatigue + hooperEntry.stress + hooperEntry.soreness + hooperEntry.sleep)
    : null;

  // ── PRIORITY 1 : sessions already completed today ──
  if (allDone) {
    const n = doneSessions.length;
    if (isEvening || isNight) return `Séance${n > 1 ? "s" : ""} bouclée${n > 1 ? "s" : ""} — belle journée d'entraînement, profitez de votre soirée !`;
    if (isAfternoon)          return `Déjà ${n > 1 ? `${n} séances faites` : "la séance dans les jambes"} — profitez du reste de l'après-midi !`;
    return `Séance${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} avant midi — quelle matinée productive !`;
  }

  // ── PRIORITY 2 : partially done (some remain) ──
  if (someDone) {
    const remaining = pendingSessions.length;
    return `${doneSessions.length}/${todaySessions.length} séance${doneSessions.length > 1 ? "s" : ""} faite${doneSessions.length > 1 ? "s" : ""} — encore ${remaining} à venir, continuez sur cette lancée !`;
  }

  // ── PRIORITY 3 : all missed, nothing pending ──
  if (allMissed) {
    if (isNight) return "Ça n'a pas pu se faire aujourd'hui — demain, on repart de zéro.";
    return "Séance manquée — il est encore temps de rattraper ça ou de récupérer.";
  }

  // ── PRIORITY 4 : Hooper critique (très fatigué) ──
  if (hTotal !== null && hTotal > 20) {
    if (isRest)  return "Vous en avez vraiment besoin — reposez-vous bien aujourd'hui.";
    if (isRecup) return "Hooper très élevé mais la séance récup est parfaite dans ce cas.";
    return "Indice Hooper élevé — adaptez l'intensité et écoutez votre corps.";
  }

  // ── PRIORITY 5 : compétition ──
  if (isComp) {
    if (hTotal !== null && hTotal <= 14) return "Vous êtes en forme pour la compétition — faites confiance à votre préparation !";
    if (hTotal !== null && hTotal > 17)  return "Compétition aujourd'hui — gérez votre énergie, vous êtes plus fatigué que d'habitude.";
    return "Journée de compétition — restez dans votre bulle et grimpez votre escalade.";
  }

  // ── PRIORITY 6 : contexte heure + repos ──
  if (isRest) {
    if (isNight)     return "Nuit de récupération en vue — dormez bien, c'est là que ça se passe.";
    if (isMorning)   {
      if (hTotal !== null && hTotal > 17) return "Vous êtes fatigué — ce repos du matin tombe vraiment bien.";
      if (dayOfWeek === 1) return "Lundi off — profitez pour récupérer avant la semaine.";
      if (dayOfWeek === 0) return "Dimanche de repos — rechargez les batteries pour la semaine qui vient.";
    }
    if (isEvening && tomorrowSessions.length > 0)
      return "Repos ce soir — il y a du travail demain, préparez-vous bien.";

    if (hTotal !== null) {
      if (hTotal > 17) return "Vous êtes fatigué, ce repos tombe à pic.";
      if (hTotal <= 12) return "Vous êtes au top — profitez de cette belle journée off !";
      return "Bien récupéré — profitez de cette journée off.";
    }

    const restMessages = [
      "Profitez de votre journée de repos !",
      "L'entraînement se construit dans la récupération.",
      "Journée off — rechargez bien les batteries.",
      "Reposez-vous, c'est aussi de l'entraînement.",
      "Temps libre aujourd'hui — savourez-le.",
      "La progression passe aussi par le repos.",
      "Une journée de repos bien méritée !",
    ];
    return restMessages[dayOfWeek % restMessages.length];
  }

  // ── PRIORITY 7 : nuit avec séance ──
  if (isNight) {
    return "Séance tardive — prenez bien le temps de vous échauffer avant d'attaquer.";
  }

  // ── PRIORITY 8 : Hooper modéré (fatigué mais gérable) ──
  if (hTotal !== null && hTotal > 17) {
    if (isRecup)  return "La séance récup tombe bien — vous êtes modérément fatigué.";
    if (isForce)  return "Séance de force avec une fatigue notable — montez progressivement.";
    if (isEndur)  return "Gardez un effort dosé aujourd'hui, votre corps récupère encore.";
    if (isMorning) return "Vous semblez fatigué ce matin — démarrez en douceur et voyez comment vous vous sentez.";
    return "Vous êtes un peu fatigué — gérez bien l'effort aujourd'hui.";
  }

  // ── PRIORITY 9 : journée chargée (2+ séances) ──
  if (isHeavyDay) {
    if (hTotal !== null && hTotal <= 12) return `Grande journée : ${todaySessions.length} séances au programme — vous êtes frais, allez-y !`;
    if (tomorrowIsRest) return `${todaySessions.length} séances aujourd'hui et repos demain — donnez tout !`;
    return `${todaySessions.length} séances au programme — gérez bien votre énergie sur la journée.`;
  }

  // ── PRIORITY 10 : demain c'est repos ──
  if (tomorrowIsRest && !isRest) {
    if (isForce) return "Séance de force et repos demain — allez chercher le maximum ce soir !";
    return "Repos demain — profitez de cette séance pour tout donner.";
  }

  // ── PRIORITY 11 : début / fin de semaine ──
  if (isFirstDayWithSession) {
    if (isMorning) return "C'est parti pour la semaine — belle séance pour bien lancer ça !";
    return "Première séance de la semaine — posez le ton dès maintenant.";
  }
  if (isLastDayWithSession) {
    if (sessionsDoneThisWeek >= 3) return `Dernière séance d'une belle semaine (${sessionsDoneThisWeek} déjà faites) — finissez en force !`;
    return "Dernière séance de la semaine — terminez bien.";
  }

  // ── PRIORITY 12 : Hooper bon ──
  if (hTotal !== null) {
    if (hTotal <= 12) {
      if (isForce) return "Excellente récupération et séance de force — allez chercher le max !";
      if (isEndur) return "Vous êtes frais, parfait pour une longue séance d'endurance !";
      if (isMorning) return "Vous vous sentez super bien ce matin — excellente séance en vue !";
      return "Vous vous sentez super bien — excellente journée devant vous !";
    }
    if (hTotal <= 14) {
      if (isForce) return "Bonne forme — allez chercher de belles performances.";
      if (isEndur) return "Vous êtes bien récupéré, idéal pour le volume.";
      return "Vous êtes en forme — bonne séance !";
    }
    // 15-17
    if (isForce) return "Séance de force avec une légère fatigue — montez progressivement.";
    if (isEndur) return "Gardez un effort dosé aujourd'hui, votre corps récupère encore.";
  }

  // ── PRIORITY 13 : phase de mésocycle ──
  if (mesoPhrase) return mesoPhrase;

  // ── PRIORITY 14 : heure + type de séance ──
  if (isMorning) {
    if (isForce)    return "Séance de force ce matin — réveillez bien vos muscles avant d'attaquer.";
    if (isEndur)    return "Séance d'endurance au petit matin — idéal pour commencer la journée.";
    if (isTech)     return "Séance technique ce matin — l'esprit est frais, profitez-en pour vous concentrer.";
    if (isMobility) return "Mobilité au programme ce matin — prenez le temps d'être présent.";
    if (isRecup)    return "Récupération active ce matin — doux réveil pour le corps.";
    return "Bonne séance ce matin — partez du bon pied pour la journée !";
  }
  if (isAfternoon) {
    if (isForce)    return "Séance de force cette après-midi — le corps est bien réveillé, c'est le bon moment.";
    if (isEndur)    return "Volume au programme cet après-midi — patience et régularité.";
    if (isTech)     return "Séance technique — concentrez-vous sur la qualité du mouvement.";
    if (isRecup)    return "Récupération en milieu de journée — allez-y en douceur.";
    return "Bonne séance cet après-midi !";
  }
  if (isEvening) {
    if (isForce)    return "Séance de force en soirée — bien s'échauffer, le corps est souvent sûr le soir.";
    if (isEndur)    return "Endurance en soirée — dosez bien pour ne pas perturber le sommeil.";
    if (isMobility) return "Mobilité en soirée — parfait pour décompresser et bien récupérer la nuit.";
    if (isRecup)    return "Séance récup en fin de journée — idéal pour relâcher les tensions.";
    return "Bonne séance ce soir — profitez bien !";
  }

  // ── FALLBACK ──
  if (isForce)    return "Séance de force au programme — bien s'échauffer avant d'attaquer !";
  if (isEndur)    return "Volume au programme — patience et régularité, vous êtes sur la bonne voie.";
  if (isRecup)    return "Séance de récupération — allez-y en douceur, c'est l'objectif.";
  if (isTech)     return "Séance technique — concentrez-vous sur la qualité du mouvement.";
  if (isMobility) return "Mobilité au programme — prenez le temps d'être présent.";

  const genericMessages = [
    "Bonne séance aujourd'hui !",
    "C'est parti pour une belle journée d'entraînement.",
    "Allez, on y va — bonne séance !",
    "Une séance de plus vers votre objectif.",
  ];
  return genericMessages[dayOfWeek % genericMessages.length];
}

// ─── ACCUEIL ──────────────────────────────────────────────────────────────────

export function AccueilView({ data, isMobile, onOpenSession, onToggleCreatine, onAddHooper, onAddNutrition, onDeleteNutrition }) {
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
  const contextualPhrase = getContextualPhrase(todaySessions, existingHooper, dow, {
    hour: new Date().getHours(),
    weekSessions,
    dayIndex,
    mesoCtx,
  });

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

        </div>
      </div>
    </div>
  );
}

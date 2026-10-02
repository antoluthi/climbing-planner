import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { useState } from "react";
import { getMesoForDate, getCustomCycleDay } from "../lib/constants.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions, isEventItem } from "../lib/helpers.js";
import { getSessionCharge } from "../lib/charge.js";
import { weekRunSummary, goalBarSegments } from "../lib/run-goals.js";
import { generateId } from "../lib/storage.js";
import { AccueilSkeleton } from "./ui/Skeleton.jsx";
import { getActiveRemindersForDate, isReminderCheckedOn } from "../lib/reminders.js";
import { colors, DATA } from "../theme/palette.js";
import { getGreeting, buildPhraseContext, getContextualPhrase } from "../lib/home-phrase.js";
import { BellIcon } from "./NotificationBell.jsx";
import { Card, SectionLabel, StatValue, SportBadge, PrimaryButton, SecondaryButton,
         RoundCheck, InitialsAvatar, SANS, MONO, GoalBar } from "./ui/Ascent.jsx";

// « 18:30 » → 1110. Une séance sans heure part en fin de journée : elle n'a pas
// de place dans l'ordre de réalisation, mais elle doit rester visible.
function minutesOfDay(startTime) {
  if (!startTime) return Number.MAX_SAFE_INTEGER;
  const [h, m] = String(startTime).split(":").map(Number);
  if (Number.isNaN(h)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
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
  onToggleReminder,
  onOpenLog,
  onAddSession,
  onOpenAccount,
  onAddNutrition,
  onOpenNotifications,
  onOpenEvent,
  unreadCount = 0,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const today = localDateStr(new Date());
  const todayObj = new Date(today + "T12:00:00");

  // ── Prochain événement ──
  // Un événement est une échéance : compétition, sortie, objectif. Il tient sa
  // place en haut de l'accueil tant qu'il n'est pas passé, avec son décompte.
  const nextEvent = (data.quickSessions || [])
    .filter(e => (e.endDate || e.startDate) >= today)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))[0] || null;
  const eventDays = nextEvent
    ? Math.round((new Date(nextEvent.startDate + "T12:00:00") - todayObj) / 86400000)
    : null;

  // ── Semaine courante ──
  const monday = getMondayOf(todayObj);
  const wKey = weekKey(monday);
  const dow = todayObj.getDay();
  const dayIndex = dow === 0 ? 6 : dow - 1;
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const todaySessions = weekSessions[dayIndex] || [];

  // ── Identité ──
  const firstName = data.profile?.firstName || "";
  const lastName = data.profile?.lastName || "";
  const initials = ((firstName[0] || "") + (lastName[0] || "")).toUpperCase();
  const photoUrl = data.profile?.avatarUrl || data.profile?.avatarDataUrl || "";

  // ── Journal du jour ──
  const existingHooper = (data.hooper || []).find(h => h.date === today);
  const todayWeight = data.weight?.[today] ?? null;
  const todayMeals = data.nutrition?.[today] || [];
  const totalCalories = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProteins = todayMeals.reduce((s, m) => s + (m.proteins || 0), 0);
  const checkinDone = existingHooper != null || todayWeight != null || todayMeals.length > 0;

  // ── Ajout d'un repas ──
  // La nutrition n'est pas une étape du journal : elle se saisit ici, au fil de
  // la journée, depuis les chiffres de la carte.
  const [mealOpen, setMealOpen] = useState(false);
  const [meal, setMeal] = useState({ name: "", calories: "", proteins: "" });
  const mealValid = meal.name.trim() && (meal.calories !== "" || meal.proteins !== "");
  const submitMeal = () => {
    if (!mealValid) return;
    onAddNutrition?.(today, {
      id: generateId("m"),
      name: meal.name.trim(),
      calories: meal.calories !== "" ? Math.round(Number(meal.calories)) : 0,
      proteins: meal.proteins !== "" ? Math.round(Number(meal.proteins)) : 0,
    });
    setMeal({ name: "", calories: "", proteins: "" });
    setMealOpen(false);
  };

  // ── Rappels ──
  const activeReminders = getActiveRemindersForDate(data.reminders || [], todayObj);
  // Un rappel dont le nom correspond à un cycle personnalisé (créatine…)
  // affiche sa position dans le cycle.
  const cycleFor = (name) => {
    const cyc = (data.customCycles || []).find(
      x => x.label && name && x.label.toLowerCase() === name.toLowerCase());
    return cyc ? getCustomCycleDay(cyc, todayObj) : null;
  };

  // ── Contexte pour la phrase d'accueil ──
  const mesoCtx = getMesoForDate(data.mesocycles || [], todayObj);

  // Où l'on en est dans le plan : mésocycle, microcycle, et le rang de la
  // semaine dans le mésocycle.
  const planPosition = (() => {
    const meso = mesoCtx?.meso;
    if (!meso) return null;
    const micros = meso.microcycles || [];
    const idx = mesoCtx.micro ? micros.findIndex(m => m.id === mesoCtx.micro.id) : -1;
    return {
      color: meso.color,
      // La semaine porte **sa** couleur quand elle en a une : en éclaircir une
      // pour la distinguer de ses voisines ne se voyait que dans l'éditeur.
      // Sans couleur propre, le nom du microcycle reste en gris — c'est le nom
      // du bloc qui doit ressortir.
      microColor: mesoCtx.micro?.color || null,
      meso: meso.label,
      micro: mesoCtx.micro?.label || null,
      rank: idx >= 0 && micros.length > 1 ? `${idx + 1}/${micros.length}` : null,
    };
  })();

  // Les séances de la semaine, jour par jour — échéances comprises, comme dans
  // le calendrier. Sert aux pastilles sous les jours.
  const weekItems = Array.from({ length: 7 }, (_, i) => getDaySessions(data, addDays(monday, i)));
  const contextualPhrase = getContextualPhrase(buildPhraseContext({ data, todayObj, mesoCtx }));

  // ── Barres de charge de la semaine ──
  const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];
  const dayCharges = weekSessions.map(ds => (ds || []).reduce((sum, x) => sum + getSessionCharge(x), 0));
  // Objectif de course : rien tant que l'option est éteinte, et rien non plus
  // si la semaine ne concerne aucun bloc et qu'aucun kilomètre n'a été couru.
  const runWeek = data.profile?.kmGoal ? weekRunSummary(data, data.runBlocks || [], todayObj) : null;
  const showRun = !!runWeek && (runWeek.goal != null || runWeek.done + runWeek.planned > 0);
  const maxCharge = Math.max(1, ...dayCharges);

  const dateLabel = todayObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const greeting = getGreeting(new Date().getHours(), firstName);

  // ── Les séances du jour, dans l'ordre où on les fera ──
  // On garde l'index d'origine : c'est lui qui ouvre la bonne séance dans
  // `data.weeks`, et il ne survit pas au tri. Une séance sans heure passe en
  // fin de journée, à sa place dans la liste.
  const todayOrdered = todaySessions
    .map((s, index) => ({ s, index }))
    .sort((a, b) => (minutesOfDay(a.s.startTime) - minutesOfDay(b.s.startTime)) || (a.index - b.index));

  const pad = isMobile ? 16 : 20;

  return (
    <div style={{
      background: c.bg, minHeight: "100%", fontFamily: SANS,
      // Sur grand écran la colonne reste étroite : sans ça les boutons
      // pleine largeur s'étirent sur tout le moniteur.
      maxWidth: 600, margin: "0 auto", width: "100%",
    }}>

      {/* ── En-tête : date, salutation, avatar ── */}
      <div style={{ padding: `${pad + 8}px ${pad}px 0`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: c.textMuted, fontWeight: 600, textTransform: "capitalize" }}>{dateLabel}</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", color: c.text, marginTop: 2 }}>{greeting}</div>
          {contextualPhrase && (
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 6, lineHeight: 1.45, maxWidth: 320 }}>
              {contextualPhrase}
            </div>
          )}
        </div>
        {/* Cloche et avatar — seuls points d'entrée « compte » de l'app depuis
            que les autres écrans ont perdu l'en-tête du shell. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {onOpenNotifications && (
            <button
              onClick={onOpenNotifications}
              aria-label={unreadCount > 0
                ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                : "Notifications"}
              title="Notifications"
              style={{
                position: "relative", width: 40, height: 40, borderRadius: 20,
                background: c.control, border: "none", padding: 0, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: unreadCount > 0 ? c.accent : c.textMuted, flexShrink: 0,
              }}
            >
              <BellIcon size={19} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 1, right: 1,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: c.danger, color: c.onColor,
                  fontSize: 9, fontWeight: 700, lineHeight: "16px",
                  padding: "0 3px", textAlign: "center",
                  boxShadow: `0 0 0 2px ${c.bg}`,
                }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}
          <InitialsAvatar isDark={isDark} initials={initials} photoUrl={photoUrl} size={40} onClick={onOpenAccount} />
        </div>
      </div>

      {/* ── Où l'on en est dans le plan ── */}
      {planPosition && (
        <div style={{
          padding: `14px ${pad}px 0`, display: "flex", alignItems: "center",
          gap: 8, flexWrap: "wrap",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4, flexShrink: 0,
            background: planPosition.color || c.accent,
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
            color: planPosition.color || c.accent,
          }}>
            {planPosition.meso}
          </span>
          {planPosition.micro && (
            <>
              <span style={{ fontSize: 11, color: c.textDim }}>·</span>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.6px",
                textTransform: "uppercase", color: planPosition.microColor || c.textMuted,
              }}>
                {planPosition.micro}
              </span>
            </>
          )}
          {planPosition.rank && (
            <span style={{ font: `700 11px ${MONO}`, color: c.textDim }}>
              sem. {planPosition.rank}
            </span>
          )}
        </div>
      )}

      {/* ── Charge de la semaine ── */}
      <div style={{ padding: `${pad}px ${pad}px 0` }}>
        <div style={{ display: "flex", gap: 6, height: 40, alignItems: "flex-end" }}>
          {dayCharges.map((val, i) => (
            <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
              <div style={{
                width: "100%", borderRadius: 3,
                height: `${Math.max(6, (val / maxCharge) * 100)}%`,
                background: i === dayIndex ? c.accent : c.control,
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {dayLabels.map((l, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700,
              color: i === dayIndex ? c.accent : c.textDim,
            }}>{l}</div>
          ))}
        </div>

        {/* Une pastille par séance, à la couleur de sa discipline — ou à celle
            de l'échéance. Coup d'œil sur la semaine, sans ouvrir le calendrier. */}
        <div style={{ display: "flex", gap: 6, marginTop: 6, minHeight: 6 }}>
          {weekItems.map((items, i) => (
            <div key={i} style={{
              flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 3,
            }}>
              {items.slice(0, 3).map((item, j) => (
                <span key={j} style={{
                  width: 5, height: 5, borderRadius: 3,
                  background: isEventItem(item)
                    ? (item.color || c.accent)
                    : (DATA.sports[item.discipline] || DATA.sports.custom),
                }} />
              ))}
            </div>
          ))}
        </div>

        {/* ── Kilomètres de la semaine ──
            Trois segments : couru, encore au planning, ce qu'il reste. La
            légende nomme les deux premiers — la couleur seule ne doit jamais
            porter le sens, et ces deux oranges sont proches par construction. */}
        {showRun && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px",
                textTransform: "uppercase", color: c.textDim,
              }}>Course</span>
              <span style={{ fontSize: 12, color: c.textMuted, fontVariantNumeric: "tabular-nums" }}>
                <strong style={{ color: c.accent, fontWeight: 700 }}>{runWeek.done}</strong>
                {runWeek.goal != null ? ` / ${runWeek.goal} km` : " km"}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <GoalBar
                isDark={isDark}
                segments={goalBarSegments(runWeek.done, runWeek.planned, runWeek.goal || 0)}
              />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: c.textDim }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: c.accent }} />
                {runWeek.done} fait{runWeek.done > 1 ? "s" : ""}
              </span>
              {runWeek.planned > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: c.textDim }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: c.accentSoft }} />
                  {runWeek.planned} prévu{runWeek.planned > 1 ? "s" : ""}
                </span>
              )}
              {runWeek.goal != null && runWeek.done + runWeek.planned > runWeek.goal && (
                <span style={{ fontSize: 10, color: c.textDim }}>
                  objectif dépassé de {Math.round((runWeek.done + runWeek.planned - runWeek.goal) * 10) / 10} km
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Prochaine échéance ── */}
      {nextEvent && (
        <div style={{ padding: `${pad}px ${pad}px 0` }}>
          <Card isDark={isDark} onClick={() => onOpenEvent?.(nextEvent)} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 54, flexShrink: 0, textAlign: "center",
                padding: "8px 0", borderRadius: 12,
                background: (nextEvent.color || c.accent) + "22",
              }}>
                <div style={{ font: `800 20px ${MONO}`, color: nextEvent.color || c.accent, lineHeight: 1 }}>
                  {eventDays <= 0 ? "J" : `J-${eventDays}`}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  color: c.textDim, marginBottom: 3,
                }}>
                  {eventDays <= 0 ? "Aujourd'hui" : eventDays === 1 ? "Demain" : "Prochaine échéance"}
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 700, color: c.text,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {nextEvent.name || nextEvent.title}
                </div>
                <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                  {new Date(nextEvent.startDate + "T12:00:00").toLocaleDateString("fr-FR",
                    { weekday: "long", day: "numeric", month: "long" })}
                  {nextEvent.location ? ` · ${nextEvent.location}` : ""}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Séances du jour ──
           Toutes, dans l'ordre de réalisation, l'heure de départ en tête de
           ligne. Une séance déjà faite s'efface — nom barré, ligne en retrait —
           pour que ce qui reste à faire ressorte seul. */}
      <div style={{ padding: `${pad}px ${pad}px 0` }}>
        <Card isDark={isDark}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: c.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: c.textMuted }}>
              {todayOrdered.length > 1 ? `Séances du jour · ${todayOrdered.length}` : "Séance du jour"}
            </div>
          </div>

          {todayOrdered.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {todayOrdered.map(({ s, index }, row) => {
                const done = s.feedback?.done === true;
                const minutes = s.estimatedTime ?? s.duration ?? null;
                const charge = Math.round(getSessionCharge(s));
                return (
                  <button
                    key={s.id || index}
                    onClick={() => onOpenSession?.(wKey, dayIndex, index)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      padding: "10px 0", fontFamily: SANS,
                      borderTop: row === 0 ? "none" : `0.5px solid ${c.border}`,
                      opacity: done ? 0.45 : 1,
                    }}
                  >
                    <div style={{
                      font: `700 13px ${MONO}`, color: c.textMuted,
                      width: 42, flexShrink: 0, textAlign: "left",
                    }}>
                      {s.startTime || ""}
                    </div>
                    <SportBadge disciplineId={s.discipline || "climbing"} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 15, fontWeight: 700, color: c.text,
                        textDecoration: done ? "line-through" : "none",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {s.name || s.title}
                      </div>
                      {/* Sans durée ni lieu, pas de ligne du tout : un tiret à la
                          place se lisait comme une donnée manquante. */}
                      {(() => {
                        const details = [minutes ? `${minutes} min` : null,
                          s.metrics?.distanceKm ? `${s.metrics.distanceKm} km` : null,
                          s.location || null].filter(Boolean).join(" · ");
                        return details ? (
                          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>{details}</div>
                        ) : null;
                      })()}
                    </div>
                    {charge > 0 && (
                      <div style={{ font: `700 13px ${MONO}`, color: c.accent, flexShrink: 0 }}>
                        {charge}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, color: c.textMuted, marginBottom: 16 }}>
                Pas de séance prévue aujourd'hui.
              </div>
              <PrimaryButton isDark={isDark} onClick={() => onAddSession?.(dayIndex)}>
                Ajouter une séance
              </PrimaryButton>
            </>
          )}
        </Card>
      </div>

      {/* ── Journal du jour ── */}
      <div style={{ padding: `${pad}px ${pad}px 0` }}>
        <Card isDark={isDark}>
          <SectionLabel isDark={isDark} style={{ margin: "0 0 12px" }}>Journal du jour</SectionLabel>

          {checkinDone ? (
            <>
              <div style={{ display: "flex", gap: 18, marginBottom: 16, flexWrap: "wrap" }}>
                <StatValue isDark={isDark} value={totalCalories || "—"} unit="kcal" />
                <StatValue isDark={isDark} value={totalProteins ? totalProteins + "g" : "—"} unit="protéines" />
                <StatValue isDark={isDark} value={todayWeight != null ? todayWeight : "—"} unit="kg" />
                <StatValue isDark={isDark} value={existingHooper?.total ?? "—"} unit="bien-être" accent />
                <button
                  onClick={() => setMealOpen(o => !o)}
                  style={{
                    marginLeft: "auto", alignSelf: "flex-start",
                    background: c.control, border: "none", borderRadius: 999,
                    color: c.text, fontSize: 12, fontWeight: 700, fontFamily: SANS,
                    padding: "6px 12px", cursor: "pointer",
                  }}
                >
                  {mealOpen ? "Annuler" : "+ repas"}
                </button>
              </div>

              {mealOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  <input
                    autoFocus
                    placeholder="Nom du repas"
                    value={meal.name}
                    onChange={e => setMeal(m => ({ ...m, name: e.target.value }))}
                    style={mealInput(c)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number" placeholder="kcal" value={meal.calories}
                      onChange={e => setMeal(m => ({ ...m, calories: e.target.value }))}
                      style={{ ...mealInput(c), flex: 1 }}
                    />
                    <input
                      type="number" placeholder="protéines (g)" value={meal.proteins}
                      onChange={e => setMeal(m => ({ ...m, proteins: e.target.value }))}
                      style={{ ...mealInput(c), flex: 1 }}
                    />
                  </div>
                  <SecondaryButton isDark={isDark} onClick={submitMeal} style={{ opacity: mealValid ? 1 : 0.5 }}>
                    Ajouter le repas
                  </SecondaryButton>
                </div>
              )}
              <SecondaryButton isDark={isDark} onClick={() => onOpenLog?.(today)}>
                Modifier le journal
              </SecondaryButton>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: c.textMuted, marginBottom: 16, lineHeight: 1.45 }}>
                Ton ressenti, ton poids et tes repas. Ça prend une minute.
              </div>
              <PrimaryButton isDark={isDark} height={44} onClick={() => onOpenLog?.(today)}>
                Remplir aujourd'hui
              </PrimaryButton>
            </>
          )}
        </Card>
      </div>

      {/* ── Rappels ── */}
      {activeReminders.length > 0 && (
        <div style={{ padding: `${pad}px ${pad}px ${pad}px` }}>
          <Card isDark={isDark} padding={16}>
            <SectionLabel isDark={isDark} style={{ margin: "4px 4px 4px" }}>Rappels</SectionLabel>
            <div style={{ padding: "0 4px" }}>
              {activeReminders.map(r => {
                const done = isReminderCheckedOn(data.reminderState, r.id, today);
                const cyc = cycleFor(r.name);
                const cycle = cyc ? ` · jour ${cyc.day} / ${cyc.total}` : "";
                return (
                  <RoundCheck
                    key={r.id}
                    isDark={isDark}
                    checked={done}
                    onChange={() => onToggleReminder?.(r.id, today)}
                    label={r.name + cycle}
                  />
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}

// Champ de saisie d'un repas — même allure que les contrôles « Ascent ».
function mealInput(c) {
  return {
    background: c.control, border: "none", borderRadius: 12,
    padding: "10px 12px", color: c.text, fontSize: 14, fontFamily: SANS,
    outline: "none", width: "100%",
  };
}

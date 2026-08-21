import { useState, useRef, useEffect } from "react";
import { useSwipe } from "../hooks/useSwipe.js";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions, isEventItem } from "../lib/helpers.js";
import { getSessionCharge } from "../lib/charge.js";
import { Card, Segmented, RoundIconButton, SportBadge, SportDot, PageTitle, SANS, MONO } from "./ui/Ascent.jsx";

// ─── CALENDRIER (refonte « Ascent ») ──────────────────────────────────────────
// Un seul écran, trois vues : Mois, Semaine, Année. Reprend la mise en page du
// prototype — grille 7 colonnes avec un point coloré par sport sous le numéro,
// jour sélectionné en accent, jours sans séance en opacité réduite.

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Couleur dominante d'une journée = sport de sa première séance.
function dayColor(sessions) {
  const first = (sessions || [])[0];
  if (!first) return null;
  return DATA.sports[first.discipline] || DATA.sports.custom;
}

// Une échéance ressort du calendrier par un bandeau à sa couleur, là où une
// séance n'a qu'un point.
function eventOf(sessions) {
  return (sessions || []).find(isEventItem) || null;
}

function Chevron({ dir = "left", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

export function CalendarView({
  data, currentDate, setCurrentDate, viewMode, setViewMode,
  onOpenSession, onAddSession, onOpenEvent,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const today = localDateStr(new Date());

  const [selected, setSelected] = useState(() => localDateStr(new Date()));
  const selectedObj = new Date(selected + "T12:00:00");
  const selectedSessions = getDaySessions(data, selectedObj);

  const mode = viewMode === "month" ? "month" : viewMode === "year" ? "year" : "week";

  // ── Navigation ──
  const step = (dir) => {
    if (mode === "week") setCurrentDate(d => addDays(d, 7 * dir));
    else if (mode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setCurrentDate(d => new Date(d.getFullYear() + dir, 0, 1));
  };

  const periodLabel = mode === "week"
    ? (() => {
        const mon = getMondayOf(currentDate);
        const sun = addDays(mon, 6);
        const f = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4).toLowerCase()}`;
        return `${f(mon)} – ${f(sun)}`;
      })()
    : mode === "month"
      ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : String(currentDate.getFullYear());

  // ── Retour à la période courante ──
  // Cliquer sur la date ramène à aujourd'hui **sans changer de vue** : depuis
  // « 2028 » en vue année on revient sur l'année en cours, toujours en année.
  const now = new Date();
  const isCurrentPeriod = mode === "week"
    ? weekKey(getMondayOf(currentDate)) === weekKey(getMondayOf(now))
    : mode === "month"
      ? currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth()
      : currentDate.getFullYear() === now.getFullYear();
  const currentLabel = mode === "week" ? "Semaine en cours" : mode === "month" ? "Mois en cours" : "Année en cours";
  const goToCurrentLabel = mode === "week"
    ? "Aller à la semaine en cours"
    : mode === "month" ? "Aller au mois en cours" : "Aller à l'année en cours";
  const goToCurrent = () => { setCurrentDate(new Date()); setSelected(localDateStr(new Date())); };

  // Zone de balayage du calendrier : change de période, et s'arrête là.
  // `stopPropagation` empêche le geste de remonter jusqu'au conteneur de page,
  // qui lui change d'onglet — sans ça, un swipe sur la grille ferait les deux.
  const gridSwipe = useSwipe({
    onLeft:  () => step(1),
    onRight: () => step(-1),
    stopPropagation: true,
  });

  const pad = 20;

  return (
    <div style={{
      background: c.bg, minHeight: "100%", fontFamily: SANS,
      // Sur grand écran la colonne reste étroite : sans ça les boutons
      // pleine largeur s'étirent sur tout le moniteur.
      maxWidth: 600, margin: "0 auto", width: "100%",
    }}>

      {/* ── Titre + sélecteur de vue ── */}
      <div style={{ padding: `${pad + 8}px ${pad}px 12px` }}>
        <PageTitle isDark={isDark}>Calendrier</PageTitle>
        <Segmented
          isDark={isDark}
          value={mode}
          onChange={setViewMode}
          options={[
            { value: "week", label: "Semaine" },
            { value: "month", label: "Mois" },
            { value: "year", label: "Année" },
          ]}
        />
      </div>

      {/* ── Barre de navigation de période ── */}
      <div style={{
        padding: `8px ${pad}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <RoundIconButton isDark={isDark} size={32} label="Précédent" onClick={() => step(-1)}>
          <Chevron dir="left" />
        </RoundIconButton>
        <div
          onClick={isCurrentPeriod ? undefined : goToCurrent}
          title={isCurrentPeriod ? undefined : goToCurrentLabel}
          style={{
            textAlign: "center", minWidth: 0,
            cursor: isCurrentPeriod ? "default" : "pointer",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text, textTransform: "capitalize" }}>
            {periodLabel}
          </div>
          {isCurrentPeriod && (
            <div style={{ fontSize: 10, fontWeight: 600, color: c.accent, letterSpacing: "0.04em", marginTop: 1 }}>
              {currentLabel}
            </div>
          )}
        </div>
        <RoundIconButton isDark={isDark} size={32} label="Suivant" onClick={() => step(1)}>
          <Chevron dir="right" />
        </RoundIconButton>
      </div>

      <div {...gridSwipe} data-swipe="calendar-grid" style={{ touchAction: "pan-y" }}>
      {mode === "month" && (
        <MonthGrid
          isDark={isDark} data={data} currentDate={currentDate}
          selected={selected} setSelected={setSelected} today={today}
        />
      )}

      {mode === "week" && (
        <WeekStrip
          isDark={isDark} data={data} currentDate={currentDate}
          selected={selected} setSelected={setSelected} today={today}
        />
      )}

      {mode === "year" && (
        <YearGrid
          isDark={isDark} data={data} year={currentDate.getFullYear()} today={today}
          onPickMonth={(m) => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setViewMode("month"); }}
        />
      )}
      </div>

      {/* ── Détail du jour sélectionné (mois et semaine) ── */}
      {mode !== "year" && (
        <div style={{ padding: `16px ${pad}px 24px` }}>
          <Card isDark={isDark}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: c.textMuted, marginBottom: 12 }}>
              {selectedObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>

            {selectedSessions.length === 0 ? (
              <>
                <div style={{ fontSize: 14, color: c.textMuted, marginBottom: 14 }}>Aucune séance ce jour-là.</div>
                <button
                  onClick={() => onAddSession?.(dayIndexOf(selectedObj))}
                  style={{
                    width: "100%", height: 44, borderRadius: 12, border: "none", cursor: "pointer",
                    background: c.accent, color: c.textOnAccent, fontSize: 14, fontWeight: 700, fontFamily: SANS,
                  }}
                >
                  Ajouter une séance
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedSessions.map((s, i) => {
                  const ev = isEventItem(s);
                  // L'index de séance ne vaut que pour data.weeks : une échéance
                  // n'y est pas, elle s'ouvre par son objet.
                  const sessionIndex = selectedSessions.slice(0, i).filter(x => !isEventItem(x)).length;
                  const tone = ev ? (s.color || c.accent) : null;
                  return (
                    <button
                      key={s.id || i}
                      onClick={() => ev
                        ? onOpenEvent?.(s)
                        : onOpenSession?.(weekKey(getMondayOf(selectedObj)), dayIndexOf(selectedObj), sessionIndex)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        background: ev ? tone + "1e" : "none",
                        border: "none", cursor: "pointer", textAlign: "left",
                        padding: ev ? "10px 12px" : 0,
                        borderRadius: ev ? 12 : 0,
                        borderLeft: ev ? `3px solid ${tone}` : "none",
                      }}
                    >
                      <SportBadge disciplineId={s.discipline || "custom"} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: ev ? tone : c.textMuted, marginTop: 2 }}>
                          {ev
                            ? ["Échéance", eventRangeLabel(s)].filter(Boolean).join(" · ")
                            : [s.startTime, s.estimatedTime ? s.estimatedTime + " min" : null]
                                .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {getSessionCharge(s) > 0 && (
                        <div style={{ font: `700 13px ${MONO}`, color: tone || c.accent }}>
                          {Math.round(getSessionCharge(s))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// « du 2 au 4 septembre » pour une échéance qui court sur plusieurs jours.
function eventRangeLabel(ev) {
  if (!ev?.endDate || ev.endDate <= ev.startDate) return null;
  const f = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `du ${f(ev.startDate)} au ${f(ev.endDate)}`;
}

// Index lundi=0 … dimanche=6, comme data.weeks.
function dayIndexOf(date) {
  const dow = date.getDay();
  return dow === 0 ? 6 : dow - 1;
}

// ── Grille du mois ───────────────────────────────────────────────────────────
function MonthGrid({ isDark, data, currentDate, selected, setSelected, today }) {
  const c = colors(isDark);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const first = new Date(year, month, 1);
  const start = getMondayOf(first);

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  }

  return (
    <div style={{ padding: "4px 20px 0" }}>
      <div style={{ display: "flex", marginBottom: 6 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700,
            color: c.textDim, padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "flex", marginBottom: 2 }}>
          {week.map((date, di) => {
            const iso = localDateStr(date);
            const inMonth = date.getMonth() === month;
            const sessions = getDaySessions(data, date);
            const ev = eventOf(sessions);
            const dot = dayColor(sessions.filter(x => !isEventItem(x)));
            const isSelected = iso === selected;
            const isToday = iso === today;
            return (
              <button
                key={di}
                onClick={() => setSelected(iso)}
                style={{
                  flex: 1, aspectRatio: "1", margin: 2, borderRadius: 10, border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  background: isSelected ? c.accent : ev ? (ev.color || c.accent) + "26" : "transparent",
                  opacity: inMonth ? (sessions.length ? 1 : 0.55) : 0.25,
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: isSelected ? c.textOnAccent : isToday ? c.accent : c.text,
                }}>
                  {date.getDate()}
                </div>
                <SportDot color={isSelected ? c.textOnAccent : dot || "transparent"} size={5} />
                {ev && (
                  <div style={{
                    position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
                    background: ev.color || c.accent,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Bandeau de la semaine ────────────────────────────────────────────────────
function WeekStrip({ isDark, data, currentDate, selected, setSelected, today }) {
  const c = colors(isDark);
  const monday = getMondayOf(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <div style={{ padding: "4px 20px 0" }}>
      <div style={{ display: "flex", gap: 4 }}>
        {days.map((date, i) => {
          const iso = localDateStr(date);
          const sessions = getDaySessions(data, date);
          const ev = eventOf(sessions);
          const dot = dayColor(sessions.filter(x => !isEventItem(x)));
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={i}
              onClick={() => setSelected(iso)}
              style={{
                flex: 1, borderRadius: 12, border: "none", cursor: "pointer",
                padding: "10px 0", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 5,
                background: isSelected ? c.accent : ev ? (ev.color || c.accent) + "26" : c.control,
                boxShadow: ev && !isSelected ? `inset 0 -3px 0 ${ev.color || c.accent}` : undefined,
              }}
            >
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                color: isSelected ? c.textOnAccent : c.textDim,
              }}>
                {WEEKDAYS[i]}
              </div>
              <div style={{
                font: `700 15px ${MONO}`,
                color: isSelected ? c.textOnAccent : isToday ? c.accent : c.text,
              }}>
                {date.getDate()}
              </div>
              <SportDot color={isSelected ? c.textOnAccent : dot || "transparent"} size={5} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Vue année : 12 mini-grilles de points ────────────────────────────────────
// Le mois courant se signale par sa bordure accent et se place au milieu de
// l'écran à l'ouverture : arriver en janvier quand on est en décembre oblige à
// faire défiler toute l'année pour retrouver aujourd'hui.
function YearGrid({ isDark, data, year, today, onPickMonth }) {
  const c = colors(isDark);
  const todayObj = new Date(today + "T12:00:00");
  const currentMonth = todayObj.getFullYear() === year ? todayObj.getMonth() : null;
  const currentRef = useRef(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [year]);

  return (
    <div style={{
      padding: "4px 20px 24px", display: "grid",
      gridTemplateColumns: "1fr 1fr", gap: 12,
    }}>
      {MONTHS.map((label, m) => {
        const first = new Date(year, m, 1);
        const start = getMondayOf(first);
        const weeks = Array.from({ length: 6 }, (_, w) =>
          Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
        const isCurrent = m === currentMonth;
        return (
          <div
            key={m}
            ref={isCurrent ? currentRef : undefined}
            onClick={() => onPickMonth(m)}
            style={{
              background: c.card,
              border: `1px solid ${isCurrent ? c.accent : c.border}`,
              borderRadius: 14, padding: 12, cursor: "pointer",
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 700, marginBottom: 8,
              color: isCurrent ? c.accent : c.textCard,
            }}>
              {label}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                {week.map((date, di) => {
                  const inMonth = date.getMonth() === m;
                  const isToday = inMonth && localDateStr(date) === today;
                  const dayItems = inMonth ? getDaySessions(data, date) : [];
                  const ev = eventOf(dayItems);
                  const dot = ev ? (ev.color || null) : dayColor(dayItems);
                  return (
                    <div key={di} style={{
                      flex: 1, aspectRatio: "1",
                      borderRadius: isToday ? 3 : 1,
                      // Aujourd'hui : encadré à l'accent — et teinté quand la
                      // journée est vide, sans quoi le repère se perd à cette
                      // taille de case.
                      background: dot || (isToday ? c.accent + "55" : inMonth ? c.control : "transparent"),
                      boxShadow: isToday ? `0 0 0 1.5px ${c.accent}` : undefined,
                    }} />
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

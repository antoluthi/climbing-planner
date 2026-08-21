import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { getMondayOf, addDays, localDateStr, getDaySessions } from "../lib/helpers.js";
import { getSessionCharge } from "../lib/charge.js";
import { Card, Segmented, RoundIconButton, SportBadge, SportDot, SANS, MONO } from "./ui/Ascent.jsx";

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
  onOpenSession, onAddSession,
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

  const pad = 20;

  return (
    <div style={{ background: c.bg, minHeight: "100%", fontFamily: SANS }}>

      {/* ── Titre + sélecteur de vue ── */}
      <div style={{ padding: `${pad + 8}px ${pad}px 12px` }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.3px", color: c.text, marginBottom: 14 }}>
          Calendrier
        </div>
        <Segmented
          isDark={isDark}
          value={mode}
          onChange={setViewMode}
          options={[
            { value: "month", label: "Mois" },
            { value: "week", label: "Semaine" },
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
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, textTransform: "capitalize" }}>
          {periodLabel}
        </div>
        <RoundIconButton isDark={isDark} size={32} label="Suivant" onClick={() => step(1)}>
          <Chevron dir="right" />
        </RoundIconButton>
      </div>

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
          isDark={isDark} data={data} year={currentDate.getFullYear()}
          onPickMonth={(m) => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setViewMode("month"); }}
        />
      )}

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
                {selectedSessions.map((s, i) => (
                  <button
                    key={s.id || i}
                    onClick={() => onOpenSession?.(dayIndexOf(selectedObj), i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <SportBadge disciplineId={s.discipline || "custom"} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                        {[s.time, s.duration ? s.duration + " min" : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div style={{ font: `700 13px ${MONO}`, color: c.accent }}>
                      {Math.round(getSessionCharge(s))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
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
            const dot = dayColor(sessions);
            const isSelected = iso === selected;
            const isToday = iso === today;
            return (
              <button
                key={di}
                onClick={() => setSelected(iso)}
                style={{
                  flex: 1, aspectRatio: "1", margin: 2, borderRadius: 10, border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  background: isSelected ? c.accent : "transparent",
                  opacity: inMonth ? (sessions.length ? 1 : 0.55) : 0.25,
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: isSelected ? c.textOnAccent : isToday ? c.accent : c.text,
                }}>
                  {date.getDate()}
                </div>
                <SportDot color={isSelected ? c.textOnAccent : dot || "transparent"} size={5} />
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
          const dot = dayColor(sessions);
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
                background: isSelected ? c.accent : c.control,
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
function YearGrid({ isDark, data, year, onPickMonth }) {
  const c = colors(isDark);
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
        return (
          <div
            key={m}
            onClick={() => onPickMonth(m)}
            style={{
              background: c.card, border: `1px solid ${c.border}`,
              borderRadius: 14, padding: 12, cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: c.textCard, marginBottom: 8 }}>{label}</div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                {week.map((date, di) => {
                  const inMonth = date.getMonth() === m;
                  const dot = inMonth ? dayColor(getDaySessions(data, date)) : null;
                  return (
                    <div key={di} style={{
                      flex: 1, aspectRatio: "1", borderRadius: 1,
                      background: dot || (inMonth ? c.control : "transparent"),
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

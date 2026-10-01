import { useState, useRef, useEffect, useMemo } from "react";
import { useSwipe } from "../hooks/useSwipe.js";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { getMondayOf, addDays, weekKey, localDateStr, getDaySessions, isEventItem, hasDayLog } from "../lib/helpers.js";
import { getSessionCharge } from "../lib/charge.js";
import { getMesoForDate } from "../lib/constants.js";
import { mesosInRange, recomputeMesoDates, weeksOf, microColor, cycleBg } from "../lib/cycles.js";
import { weekRunSummary, goalBarSegments } from "../lib/run-goals.js";
import { MesoDetailModal } from "./MesoDetailModal.jsx";
import { Card, Segmented, RoundIconButton, SportBadge, PageTitle, SANS, MONO, GoalBar } from "./ui/Ascent.jsx";
import { DayJournalBlock } from "./DayJournalBlock.jsx";
import { JournalPip } from "./JournalPip.jsx";
import { WeekTimeGrid } from "./WeekTimeGrid.jsx";

// ─── CALENDRIER (refonte « Ascent ») ──────────────────────────────────────────
// Un seul écran, trois vues : Mois, Semaine, Année. Reprend la mise en page du
// prototype — grille 7 colonnes avec un point coloré par sport sous le numéro,
// jour sélectionné en accent, jours sans séance en opacité réduite.

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// La semaine se lit en liste (bande des jours + détail du jour choisi) ou en
// grille horaire, comme un agenda. C'est une préférence d'affichage, pas une
// donnée du plan : elle vit en localStorage, propre à l'appareil, et ne part
// pas dans la synchronisation.
const LAYOUT_KEY = "climbing_week_layout";
function readLayout() {
  try { return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list"; }
  catch { return "list"; }
}

// Une échéance ressort du calendrier par un bandeau à sa couleur, là où une
// séance n'a qu'un point.
function eventOf(sessions) {
  return (sessions || []).find(isEventItem) || null;
}

// ── Liste ou grille horaire ──────────────────────────────────────────────────
// Deux icônes dans une pastille, celle qui est active à l'accent : l'état se lit
// d'un coup d'œil, là où une icône seule annoncerait ce qu'elle ferait — et
// laisserait deviner dans quelle vue on se trouve.
function LayoutToggle({ isDark, value, onChange }) {
  const c = colors(isDark);
  const options = [
    {
      value: "list", label: "Semaine en liste",
      icon: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
    },
    {
      value: "grid", label: "Semaine en grille horaire",
      icon: (
        // Un agenda : l'en-tête et ses anneaux, trois séances posées à des
        // hauteurs différentes.
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
          <rect x="6" y="11.5" width="3" height="5" rx="0.8" fill="currentColor" stroke="none" />
          <rect x="10.5" y="13.5" width="3" height="4.5" rx="0.8" fill="currentColor" stroke="none" />
          <rect x="15" y="11.5" width="3" height="3" rx="0.8" fill="currentColor" stroke="none" />
        </>
      ),
    },
  ];
  return (
    <div role="group" aria-label="Affichage de la semaine" style={{
      display: "flex", gap: 2, padding: 3, borderRadius: 999, background: c.control, flexShrink: 0,
    }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            aria-label={o.label}
            title={o.label}
            style={{
              width: 34, height: 30, borderRadius: 999, border: "none", padding: 0, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? c.accent : "transparent",
              color: active ? c.textOnAccent : c.textMuted,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {o.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
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
  onOpenSession, onAddSession, onOpenEvent, onOpenLog, onToggleReminder,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const today = localDateStr(new Date());

  const [selected, setSelected] = useState(() => localDateStr(new Date()));
  const [mesoDetail, setMesoDetail] = useState(null);
  const [layout, setLayout] = useState(readLayout);
  const chooseLayout = (next) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); }
    catch { /* stockage indisponible : le choix vaut pour cette session */ }
  };
  const selectedObj = new Date(selected + "T12:00:00");
  const selectedSessions = getDaySessions(data, selectedObj);

  const mode = viewMode === "month" ? "month" : viewMode === "year" ? "year" : "week";
  const timeGrid = mode === "week" && layout === "grid";

  // Les cycles colorent le fond des jours. Dates chaînées comme dans la
  // timeline : un plan partiellement daté se peint quand même, sans que rien
  // ne soit réécrit dans les données.
  const mesos = useMemo(() => recomputeMesoDates(data.mesocycles || []), [data.mesocycles]);
  // ⚠️ La teinte vient du **microcycle**, pas du seul bloc. Éclaircir une
  // semaine pour la distinguer de ses voisines ne se voyait que dans l'éditeur :
  // le calendrier lisait `meso.color` et jetait le microcycle que
  // `getMesoForDate` lui rendait pourtant. `microColor` reprend la couleur du
  // bloc quand le microcycle n'en a pas — le cas courant.
  const cycleColorAt = (date) => {
    const at = getMesoForDate(mesos, date);
    return at?.meso ? microColor(at.micro, at.meso) : null;
  };

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
      // En grille horaire, l'écran ne défile plus : seules les heures défilent,
      // sous le titre et la navigation qui restent en place — comme un agenda.
      ...(timeGrid ? { height: "100%", display: "flex", flexDirection: "column" } : null),
    }}>

      {/* ── Titre + sélecteur de vue ── */}
      <div style={{ padding: `${pad + 8}px ${pad}px 12px` }}>
        {/* La hauteur ne bouge pas quand la bascule disparaît (Mois, Année) :
            sinon le sélecteur sauterait de quelques pixels à chaque vue. */}
        <PageTitle
          isDark={isDark}
          style={{ minHeight: 36 }}
          right={mode === "week" && (
            <LayoutToggle isDark={isDark} value={layout} onChange={chooseLayout} />
          )}
        >
          Calendrier
        </PageTitle>
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

      {/* La barre de kilomètres de la semaine : dans la bande des jours en
          liste, au-dessus des heures en grille. */}
      {timeGrid && (
        <div style={{ padding: `0 ${pad}px 8px`, marginTop: -6 }}>
          <WeekKm isDark={isDark} data={data} monday={getMondayOf(currentDate)} />
        </div>
      )}

      <div
        {...gridSwipe}
        data-swipe="calendar-grid"
        style={{
          touchAction: "pan-y",
          ...(timeGrid ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : null),
        }}
      >
      {mode === "month" && (
        <MonthGrid
          isDark={isDark} data={data} currentDate={currentDate}
          selected={selected} setSelected={setSelected} today={today}
          cycleColorAt={cycleColorAt}
        />
      )}

      {timeGrid && (
        <WeekTimeGrid
          isDark={isDark} data={data} monday={getMondayOf(currentDate)} today={today}
          cycleColorAt={cycleColorAt}
          onOpenSession={onOpenSession}
          onOpenEvent={onOpenEvent}
          onOpenLog={onOpenLog}
          onAddSession={onAddSession}
          footer={(
            <div style={{ paddingBottom: 16 }}>
              <CycleLegend
                isDark={isDark} mesos={mesos} mode={mode} currentDate={currentDate}
                onOpen={(meso) => setMesoDetail(meso)}
              />
            </div>
          )}
        />
      )}

      {mode === "week" && !timeGrid && (
        <WeekStrip
          isDark={isDark} data={data} currentDate={currentDate}
          selected={selected} setSelected={setSelected} today={today}
          cycleColorAt={cycleColorAt} onOpenLog={onOpenLog}
        />
      )}

      {mode === "year" && (
        <YearGrid
          isDark={isDark} data={data} year={currentDate.getFullYear()} today={today}
          cycleColorAt={cycleColorAt}
          onPickMonth={(m) => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setViewMode("month"); }}
        />
      )}
      </div>

      {/* ── Légende des cycles visibles ──
          En grille, elle ferme la journée, sous minuit : au-dessus des heures,
          elle mangerait la place qu'on vient leur donner. */}
      {!timeGrid && (
        <CycleLegend
          isDark={isDark} mesos={mesos} mode={mode} currentDate={currentDate}
          onOpen={(meso) => setMesoDetail(meso)}
        />
      )}

      {/* ── Détail du jour sélectionné (mois et semaine en liste) ──
          La grille montre déjà toute la semaine ; le détail d'un jour (rappels,
          résumé du journal) reste dans la vue liste, à une touche. */}
      {mode !== "year" && !timeGrid && (
        <div style={{ padding: `16px ${pad}px 24px` }}>
          <Card isDark={isDark}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: c.textMuted, marginBottom: 12 }}>
              {selectedObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>

            {/* Le journal et les rappels de CE jour-là — c'est ici qu'on
                rattrape un rappel oublié ou qu'on relit un ressenti. */}
            <DayJournalBlock
              isDark={isDark}
              data={data}
              dateStr={selected}
              onOpenLog={onOpenLog}
              onToggleReminder={onToggleReminder}
            />

            {selectedSessions.length === 0 && (
              <div style={{ fontSize: 14, color: c.textMuted, marginBottom: 14 }}>Aucune séance ce jour-là.</div>
            )}

            {selectedSessions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedSessions.map((s, i) => {
                  const ev = isEventItem(s);
                  // L'index de séance ne vaut que pour data.weeks : une échéance
                  // n'y est pas, elle s'ouvre par son objet.
                  const sessionIndex = selectedSessions.slice(0, i).filter(x => !isEventItem(x)).length;
                  const tone = ev ? (s.color || c.accent) : null;
                  // Séance faite : elle s'efface, comme une tâche cochée.
                  const done = !ev && s.feedback?.done === true;
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
                        opacity: done ? 0.45 : 1,
                      }}
                    >
                      <SportBadge disciplineId={s.discipline || "custom"} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 700, color: c.text,
                          textDecoration: done ? "line-through" : "none",
                        }}>{s.name}</div>
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

            {/* Une journée porte souvent plusieurs séances : le bouton reste,
                qu'il y en ait déjà ou non. */}
            <button
              onClick={() => onAddSession?.(dayIndexOf(selectedObj))}
              style={{
                width: "100%", height: 44, borderRadius: 12, border: "none", cursor: "pointer",
                marginTop: selectedSessions.length ? 14 : 0,
                background: selectedSessions.length ? c.control : c.accent,
                color: selectedSessions.length ? c.accent : c.textOnAccent,
                fontSize: 14, fontWeight: 700, fontFamily: SANS,
              }}
            >
              {selectedSessions.length ? "＋ Ajouter une séance" : "Ajouter une séance"}
            </button>
          </Card>
        </div>
      )}
      {mesoDetail && (
        <MesoDetailModal meso={mesoDetail} onClose={() => setMesoDetail(null)} />
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

// ── Légende des cycles de la période ─────────────────────────────────────────
// La teinte des cases dit où sont les blocs ; la légende dit lesquels, et
// donne l'entrée vers leur objectif — un mésocycle ne se lisait nulle part
// depuis le calendrier.
function periodBounds(mode, d) {
  const at = (y, m, day) => new Date(y, m, day, 0, 0, 0, 0);
  if (mode === "week") {
    const mon = getMondayOf(d);
    return [at(mon.getFullYear(), mon.getMonth(), mon.getDate()),
            addDays(at(mon.getFullYear(), mon.getMonth(), mon.getDate()), 6)];
  }
  if (mode === "month") {
    return [at(d.getFullYear(), d.getMonth(), 1), at(d.getFullYear(), d.getMonth() + 1, 0)];
  }
  return [at(d.getFullYear(), 0, 1), at(d.getFullYear(), 11, 31)];
}

function CycleLegend({ isDark, mesos, mode, currentDate, onOpen }) {
  const c = colors(isDark);
  const [from, to] = periodBounds(mode, currentDate);
  const list = mesosInRange(mesos, from, to);
  if (list.length === 0) return null;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div style={{ padding: "12px 20px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
      {list.map(meso => {
        const tone = meso.color || c.accent;
        const start = new Date(meso.startDate + "T00:00:00");
        const current = today >= start && today < addDays(start, weeksOf(meso) * 7);
        return (
          <button
            key={meso.id}
            onClick={() => onOpen(meso)}
            title={`${meso.label} — voir l’objectif`}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: tone + (current ? "2e" : "16"),
              border: `1px solid ${tone}${current ? "88" : "33"}`,
              borderRadius: 999, padding: "5px 11px 5px 9px",
              cursor: "pointer", fontFamily: SANS,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 7, background: tone, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: c.text }}>{meso.label}</span>
            {current && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: tone,
              }}>en cours</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Une pastille par séance ──────────────────────────────────────────────────
// Le même langage que l'accueil : un point par séance, à la couleur de sa
// discipline — celle de l'échéance pour une échéance. Une seule pastille ne
// disait pas combien il y en avait ; au-delà de trois, un « +n » prend le
// relais là où la place le permet (semaine et mois ; les cases de l'année sont
// trop petites, elles s'arrêtent aux points).
function DayDots({ items, c, size = 5, max = 3, showOverflow = true, tone = null, minHeight }) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: Math.max(2, size - 2), minHeight: minHeight ?? size,
    }}>
      {shown.map((item, i) => (
        <span key={i} style={{
          width: size, height: size, borderRadius: size, flexShrink: 0,
          background: tone || (isEventItem(item)
            ? (item.color || c.accent)
            : (DATA.sports[item.discipline] || DATA.sports.custom)),
        }} />
      ))}
      {extra > 0 && showOverflow && (
        <span style={{
          font: `700 ${size + 3}px ${MONO}`, lineHeight: 1,
          color: tone || c.textDim, marginLeft: 1,
        }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Grille du mois ───────────────────────────────────────────────────────────
// ── Kilomètres d'une semaine ─────────────────────────────────────────────────
// Le même indicateur pour la vue semaine et la vue mois, à deux tailles. Ne
// s'affiche que si l'objectif est activé ET que la semaine est couverte par un
// bloc de course : sinon la grille du mois s'allongerait de six lignes vides.
function WeekKm({ isDark, data, monday, compact = false }) {
  if (!data?.profile?.kmGoal) return null;
  const w = weekRunSummary(data, data.runBlocks || [], monday);
  if (w.goal == null && w.done + w.planned === 0) return null;
  const c = colors(isDark);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginTop: compact ? 3 : 10, marginBottom: compact ? 3 : 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <GoalBar
          isDark={isDark}
          height={compact ? 4 : 8}
          segments={goalBarSegments(w.done, w.planned, w.goal || 0)}
        />
      </div>
      <span style={{
        fontSize: compact ? 9 : 11, color: c.textMuted, flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
      }}>
        {/* Arrondi dans la vue mois : à 9 px, « 36,3 » est du bruit. La valeur
            exacte reste lisible dans l'éditeur du bloc et sur la vue semaine. */}
        <strong style={{ color: c.accent, fontWeight: 700 }}>
          {compact ? Math.round(w.done) : w.done}
        </strong>
        {w.goal != null ? `/${compact ? Math.round(w.goal) : w.goal}` : ""} km
      </span>
    </div>
  );
}

function MonthGrid({ isDark, data, currentDate, selected, setSelected, today, cycleColorAt }) {
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
        <div key={wi}>
        <div style={{ display: "flex", marginBottom: 2 }}>
          {week.map((date, di) => {
            const iso = localDateStr(date);
            const inMonth = date.getMonth() === month;
            const sessions = getDaySessions(data, date);
            const ev = eventOf(sessions);
            const isSelected = iso === selected;
            const isToday = iso === today;
            const cycleColor = inMonth ? cycleColorAt(date) : null;
            return (
              <button
                key={di}
                onClick={() => setSelected(iso)}
                style={{
                  flex: 1, aspectRatio: "1", margin: 2, borderRadius: 10, border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                  background: isSelected ? c.accent
                    : ev ? (ev.color || c.accent) + "26"
                    : cycleBg(cycleColor, isDark, "transparent"),
                  // L'opacité ne porte plus sur toute la case : elle trouait la
                  // bande du cycle un jour sur deux. Un jour vide se lit
                  // maintenant à la couleur de son chiffre.
                  opacity: inMonth ? 1 : 0.3,
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: isSelected ? c.textOnAccent
                    : isToday ? c.accent
                    : sessions.length ? c.text : c.textDim,
                }}>
                  {date.getDate()}
                </div>
                <DayDots
                  items={sessions} c={c} size={5} max={3}
                  tone={isSelected ? c.textOnAccent : null}
                />
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
        <WeekKm isDark={isDark} data={data} monday={week[0]} compact />
        </div>
      ))}
    </div>
  );
}

// ── Bandeau de la semaine ────────────────────────────────────────────────────
// Sous chaque jour, une pastille qui ouvre son journal. Le bloc journal ne se
// lit que sous la grille, pour le jour sélectionné : noter le ressenti d'hier
// demandait donc de le sélectionner, puis de descendre le chercher. Ici, une
// touche sur n'importe quel jour de la semaine — passé comme à venir — ouvre
// directement l'assistant (bien-être, poids, note) sur CE jour-là.
function WeekStrip({ isDark, data, currentDate, selected, setSelected, today, cycleColorAt, onOpenLog }) {
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
          const isSelected = iso === selected;
          const isToday = iso === today;
          const cycleColor = cycleColorAt(date);
          const dayLabel = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          return (
            // Deux boutons empilés, jamais imbriqués : un bouton dans un bouton
            // n'est pas du HTML valide, et le clic du second remonterait au
            // premier.
            <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <button
                onClick={() => setSelected(iso)}
                style={{
                  width: "100%", borderRadius: 12, border: "none", cursor: "pointer",
                  padding: "10px 0", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 5,
                  background: isSelected ? c.accent
                    : ev ? (ev.color || c.accent) + "26"
                    : cycleBg(cycleColor, isDark, c.control),
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
                <DayDots
                  items={sessions} c={c} size={5} max={3}
                  tone={isSelected ? c.textOnAccent : null}
                />
              </button>
              <JournalPip
                isDark={isDark}
                filled={hasDayLog(data, iso)}
                onClick={() => onOpenLog?.(iso)}
                label={`Journal du ${dayLabel}`}
              />
            </div>
          );
        })}
      </div>
      <WeekKm isDark={isDark} data={data} monday={monday} />
    </div>
  );
}

// ── Vue année : 12 mini-grilles de points ────────────────────────────────────
// Le mois courant se signale par sa bordure accent et se place au milieu de
// l'écran à l'ouverture : arriver en janvier quand on est en décembre oblige à
// faire défiler toute l'année pour retrouver aujourd'hui.
function YearGrid({ isDark, data, year, today, cycleColorAt, onPickMonth }) {
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
                  const cycleColor = inMonth ? cycleColorAt(date) : null;
                  return (
                    <div key={di} style={{
                      flex: 1, aspectRatio: "1", borderRadius: 3,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      // La case ne prend pas la couleur du sport — ce sont les
                      // points qui parlent — mais celle de son mésocycle : sur
                      // une année entière, les blocs se lisent comme des
                      // bandes. Aujourd'hui garde son encadré accent.
                      background: isToday ? c.accent + "33"
                        : cycleBg(cycleColor, isDark, inMonth ? c.control : "transparent"),
                      boxShadow: isToday ? `0 0 0 1.5px ${c.accent}` : undefined,
                    }}>
                      {/* Trois points de 3 px tiennent dans une case de ~20 px ;
                          au-delà, pas la place d'un compte — le mois le dira. */}
                      <DayDots items={dayItems} c={c} size={3} max={3} showOverflow={false} minHeight={3} />
                    </div>
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

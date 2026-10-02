import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { colors, DATA } from "../theme/palette.js";
import { SANS, MONO } from "./ui/Ascent.jsx";
import { JournalPip } from "./JournalPip.jsx";
import { addDays, weekKey, localDateStr, hasDayLog } from "../lib/helpers.js";
import { cycleBg } from "../lib/cycles.js";
import {
  DAY_MIN, MIN_BLOCK_MIN, sessionSpan, layoutDay, cascadeOffset, weekColumns, layoutAllDay,
  hiddenPerColumn, slotAt, clockLabel, firstVisibleHour,
  HOUR_PX, clampHourPx, hoursAt, scrollToKeep, slotStep,
} from "../lib/time-grid.js";

// ─── GRILLE HORAIRE DE LA SEMAINE (calendrier mobile, en option) ─────────────
// La semaine telle qu'un agenda la montre : sept colonnes, les heures de 0 h à
// 24 h, chaque séance posée à son heure de départ sur la hauteur de sa durée.
// Ce que la vue liste dit jour par jour, celle-ci le dit d'un coup d'œil — où
// sont les séances, où sont les trous.
//
// - **Un seul conteneur qui défile**, en-tête compris : l'en-tête des jours y
//   est `sticky`. Rendu à part, il se décalerait des colonnes dès qu'une barre
//   de défilement prend de la largeur (un navigateur de bureau), puisque seules
//   les heures en auraient une.
// - **Les séances qui se chevauchent se posent en cascade**, chacune décalée
//   vers la droite et par-dessus la précédente, plutôt que côte à côte : une
//   journée fait ~45 px sur un téléphone, et trois séances partageant la
//   largeur n'en avaient que 15 chacune — leurs noms s'écrivaient lettre par
//   lettre. Les blocs sont donc opaques (la teinte posée sur le fond), sinon
//   ils se mélangeraient en se recouvrant.
// - **La rangée du haut** reçoit ce qui n'a pas d'heure : les échéances, en
//   bandeau continu sur leurs jours, et les séances enregistrées sans heure
//   (« Plus tard »). Au-delà de trois rangées, elle se replie sur un « +n ».
// - **Toucher une case vide** pose un créneau « + 14:30 » ; le toucher à son
//   tour ouvre l'ajout de séance, jour et heure déjà réglés. En deux temps,
//   comme dans un agenda : une touche égarée en voulant ouvrir une séance ne
//   lance rien.
// - **Un pincement zoome** : il change la hauteur d'une heure, de la journée
//   entière à l'écran jusqu'au quart d'heure lisible, en gardant sous les
//   doigts l'heure qui s'y trouvait. Ctrl + molette (ou le pincement d'un pavé
//   tactile) fait de même sur ordinateur. Le niveau est retenu sur l'appareil.
// - Le tout est calculé par `lib/time-grid.js`, pur et testé ; ici, on pose.

const PAD = 8;       // marge haute et basse : le « 0 » et la ligne de minuit restent entiers
const GUTTER = 32;   // colonne des heures
const RIGHT = 8;     // marge de droite
const LANE = 20;     // hauteur d'une rangée du haut
const LANE_GAP = 3;
const KEEP = 3;      // rangées du haut visibles avant repli
const LINE = 13;     // interligne du nom dans un bloc

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// Le zoom est une préférence d'affichage de l'appareil, comme le choix liste /
// grille : en localStorage, hors synchronisation.
const HOUR_KEY = "climbing_week_hour_px";
function readHourPx() {
  try { return clampHourPx(localStorage.getItem(HOUR_KEY)); }
  catch { return HOUR_PX.default; }
}

// ⚠️ Toutes les hauteurs passent par la variable CSS `--hour`, pas par une
// valeur calculée au rendu. Pendant un pincement, c'est elle seule qu'on change,
// directement dans le DOM : redessiner la grille à chaque image du geste ne
// tiendrait pas soixante images par seconde sur un téléphone moyen. React ne la
// réécrit qu'à la fin du geste, quand le niveau est enregistré.
const atHours = (hours, plus = 0) => `calc(${PAD + plus}px + ${hours} * var(--hour))`;
const hoursLong = (hours, minus = 0) => `calc(${hours} * var(--hour) - ${minus}px)`;

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const sportTone = (s) => DATA.sports[s?.discipline] || DATA.sports.custom;

export function WeekTimeGrid({
  isDark, data, monday, today, cycleColorAt,
  onOpenSession, onOpenEvent, onOpenLog, onAddSession, footer,
}) {
  const c = colors(isDark);
  const mondayISO = localDateStr(monday);
  const wk = weekKey(monday);

  // ── Ce que la semaine contient ──
  // Recalculé sur la date du lundi, pas sur l'objet `monday` : le parent en
  // fabrique un neuf à chaque rendu.
  const { columns, allDay } = useMemo(() => {
    const week = data.weeks?.[wk] || [];
    const mon = new Date(`${mondayISO}T00:00:00`);
    const cols = Array.from({ length: 7 }, (_, di) => {
      const date = addDays(mon, di);
      const timed = [];
      const untimed = [];
      (week[di] || []).forEach((s, si) => {
        if (!s) return;
        const span = sessionSpan(s);
        if (span) timed.push({ s, si, span });
        else untimed.push({ s, si });
      });
      const lay = layoutDay(timed.map(t => t.span));
      return { date, iso: localDateStr(date), timed: timed.map((t, k) => ({ ...t, ...lay[k] })), untimed };
    });
    const top = [];
    (data.quickSessions || []).forEach(ev => {
      if (!ev?.startDate) return;
      const at = weekColumns(ev.startDate, ev.endDate, mondayISO);
      if (at) top.push({ kind: "event", ev, ...at });
    });
    cols.forEach((col, di) => col.untimed.forEach(u =>
      top.push({ kind: "session", s: u.s, si: u.si, from: di, to: di })));
    return { columns: cols, allDay: top };
  }, [data.weeks, data.quickSessions, wk, mondayISO]);

  const { lanes, lane } = useMemo(() => layoutAllDay(allDay), [allDay]);
  const [allDayOpen, setAllDayOpen] = useState(false);
  const folded = lanes > KEEP && !allDayOpen;
  const shownLanes = folded ? KEEP - 1 : lanes;
  const hidden = folded ? hiddenPerColumn(allDay, lane, shownLanes) : null;

  // ── Zoom ──
  // `hourPx` est le niveau enregistré (ce que le rendu lit) ; `hourRef`, la
  // valeur vivante pendant un geste, que lisent les gestionnaires.
  const [hourPx, setHourPx] = useState(readHourPx);
  const hourRef = useRef(hourPx);
  const headerRef = useRef(null);

  // ── Créneau posé par une touche dans une case vide ──
  // Il porte sa semaine : changer de semaine le fait disparaître sans effet à
  // déclencher.
  const [ghost, setGhost] = useState(null);
  const ghostHere = ghost && ghost.week === mondayISO ? ghost : null;
  const tapColumn = (e, di) => {
    if (!onAddSession || e.target.closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = hourRef.current;
    setGhost({ week: mondayISO, day: di, min: slotAt(((e.clientY - rect.top - PAD) / px) * 60, slotStep(px)) });
  };

  // ── L'heure qu'il est ──
  const [nowMin, setNowMin] = useState(minutesNow);
  useEffect(() => {
    const id = setInterval(() => setNowMin(minutesNow()), 60000);
    return () => clearInterval(id);
  }, []);
  const todayCol = columns.findIndex(col => col.iso === today);

  // ── Ouverture sur le matin ──
  // Une fois, au montage : passer d'une semaine à l'autre garde la hauteur où
  // l'on était, comme dans un agenda.
  const scrollRef = useRef(null);
  const scrolled = useRef(false);
  const firstHour = useMemo(
    () => firstVisibleHour(columns.flatMap(col => col.timed.map(t => t.span))),
    [columns],
  );
  useLayoutEffect(() => {
    if (scrolled.current || !scrollRef.current) return;
    scrolled.current = true;
    scrollRef.current.scrollTop = Math.max(0, PAD + firstHour * hourPx - 6);
  }, [firstHour, hourPx]);

  // ── Pincer pour zoomer ──
  // Écouteurs posés à la main : seul un écouteur non passif peut empêcher le
  // défilement (et le zoom de la page) pendant que deux doigts pincent — ceux
  // de React sont passifs.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    // 0 h dans le contenu qui défile : sous l'en-tête (dans le flux, même collé)
    // et sous la marge.
    const zeroAt = () => (headerRef.current?.offsetHeight || 0) + PAD;
    const apply = (px, hours, offsetY) => {
      hourRef.current = px;
      el.style.setProperty("--hour", `${px}px`);
      el.scrollTop = scrollToKeep(hours, offsetY, zeroAt(), px);
    };
    const commit = () => {
      setHourPx(hourRef.current);
      try { localStorage.setItem(HOUR_KEY, String(Math.round(hourRef.current))); }
      catch { /* stockage indisponible : le zoom vaut pour cette session */ }
    };

    let pinch = null;
    const spread = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      const offsetY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - el.getBoundingClientRect().top;
      pinch = {
        spread: spread(e.touches) || 1,
        px: hourRef.current,
        offsetY,
        hours: hoursAt(offsetY, el.scrollTop, zeroAt(), hourRef.current),
      };
    };
    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      apply(clampHourPx(pinch.px * spread(e.touches) / pinch.spread), pinch.hours, pinch.offsetY);
    };
    const onEnd = (e) => {
      if (!pinch || e.touches.length >= 2) return;
      pinch = null;
      commit();
    };

    // Sur ordinateur : Ctrl + molette, et le pincement d'un pavé tactile, que
    // le navigateur rapporte justement comme une molette avec Ctrl.
    let wheelDone = null;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const offsetY = e.clientY - el.getBoundingClientRect().top;
      const hours = hoursAt(offsetY, el.scrollTop, zeroAt(), hourRef.current);
      // Un cran de molette (~100) change l'échelle d'un quart environ ; les
      // petits pas d'un pavé tactile la font glisser. Firefox compte en lignes.
      const delta = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
      const step = Math.max(-50, Math.min(50, delta));
      apply(clampHourPx(hourRef.current * Math.exp(-step * 0.006)), hours, offsetY);
      clearTimeout(wheelDone);
      wheelDone = setTimeout(commit, 200);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
      clearTimeout(wheelDone);
    };
  }, []);

  const dayName = (date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const pct = (n) => `${(n / 7) * 100}%`;

  return (
    <div
      ref={scrollRef}
      data-time-grid=""
      style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        overscrollBehavior: "contain", position: "relative", fontFamily: SANS,
        // ⚠️ Pas d'ancrage de défilement. D'une semaine à l'autre, la rangée
        // du haut change de hauteur ; le navigateur « compensait » en déplaçant
        // le défilement, et les heures sautaient d'une heure sous le doigt.
        // Sous un en-tête collé, l'heure visible ne dépend que de `scrollTop` :
        // le garder tel quel suffit.
        overflowAnchor: "none",
        // Un seul geste natif : le défilement vertical. Le pincement est à nous,
        // pas au zoom de la page.
        touchAction: "pan-y",
        "--hour": `${hourPx}px`,
      }}
    >
      {/* ── En-tête : jours, journal, rangée du haut ── */}
      <div ref={headerRef} style={{
        position: "sticky", top: 0, zIndex: 4, background: c.bg,
        paddingTop: 4, paddingBottom: 6, boxShadow: `0 1px 0 ${c.border}`,
      }}>
        <div style={{ display: "flex", paddingLeft: GUTTER, paddingRight: RIGHT }}>
          {columns.map((col, di) => {
            const isToday = di === todayCol;
            return (
              <div key={di} style={{ flex: 1, minWidth: 0, padding: "0 2px", display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{
                  borderRadius: 10, padding: "5px 0",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  background: isToday ? c.accent : cycleBg(cycleColorAt(col.date), isDark, c.control),
                }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em",
                    color: isToday ? c.textOnAccent : c.textDim,
                  }}>
                    {WEEKDAYS[di]}
                  </div>
                  <div style={{ font: `700 14px ${MONO}`, color: isToday ? c.textOnAccent : c.text }}>
                    {col.date.getDate()}
                  </div>
                </div>
                <JournalPip
                  isDark={isDark}
                  filled={hasDayLog(data, col.iso)}
                  onClick={() => onOpenLog?.(col.iso)}
                  label={`Journal du ${dayName(col.date)}`}
                />
              </div>
            );
          })}
        </div>

        {lanes > 0 && (
          <div style={{ display: "flex", marginTop: 6, paddingRight: RIGHT }}>
            <div style={{ width: GUTTER, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              {lanes > KEEP && (
                <button
                  onClick={() => setAllDayOpen(o => !o)}
                  aria-label={allDayOpen ? "Replier la rangée du haut" : "Déplier la rangée du haut"}
                  title={allDayOpen ? "Replier" : "Tout afficher"}
                  style={{
                    width: 24, height: LANE, border: "none", background: "none", padding: 0,
                    color: c.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={allDayOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
                  </svg>
                </button>
              )}
            </div>
            <div style={{
              flex: 1, minWidth: 0, position: "relative",
              height: (shownLanes + (folded ? 1 : 0)) * (LANE + LANE_GAP) - LANE_GAP,
            }}>
              {allDay.map((item, k) => {
                if (lane[k] >= shownLanes) return null;
                const ev = item.kind === "event";
                const tone = ev ? (item.ev.color || c.accent) : sportTone(item.s);
                const done = !ev && item.s.feedback?.done === true;
                const name = ev ? item.ev.name : item.s.name;
                const rL = item.before ? 0 : 5;
                const rR = item.after ? 0 : 5;
                return (
                  <button
                    // Le rang dans la liste, pas l'id seul : des séances
                    // planifiées depuis un même modèle partagent parfois le leur.
                    key={`${item.kind}${k}`}
                    onClick={() => ev ? onOpenEvent?.(item.ev) : onOpenSession?.(wk, item.from, item.si)}
                    aria-label={ev ? `Échéance : ${name}` : `${name}, sans heure`}
                    title={name}
                    style={{
                      position: "absolute", top: lane[k] * (LANE + LANE_GAP), height: LANE,
                      left: `calc(${pct(item.from)} + 2px)`,
                      width: `calc(${pct(item.to - item.from + 1)} - 4px)`,
                      border: "none", padding: "0 5px", cursor: "pointer", textAlign: "left",
                      borderRadius: `${rL}px ${rR}px ${rR}px ${rL}px`,
                      background: tone + (isDark ? "4d" : "38"),
                      boxShadow: item.before ? undefined : `inset 3px 0 0 ${tone}`,
                      opacity: done ? 0.45 : 1,
                      fontFamily: SANS, fontSize: 10, fontWeight: 700, lineHeight: `${LANE}px`,
                      color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {name}
                  </button>
                );
              })}
              {folded && hidden.map((n, di) => n > 0 && (
                <button
                  key={`more${di}`}
                  onClick={() => setAllDayOpen(true)}
                  aria-label={`${n} de plus le ${dayName(columns[di].date)}`}
                  style={{
                    position: "absolute", top: shownLanes * (LANE + LANE_GAP), height: LANE,
                    left: `calc(${pct(di)} + 2px)`, width: `calc(${pct(1)} - 4px)`,
                    border: "none", borderRadius: 5, padding: 0, cursor: "pointer",
                    background: c.control, color: c.textMuted,
                    font: `700 10px ${MONO}`,
                  }}
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Les heures ──
          `zIndex: 0` en fait un contexte d'empilement : les blocs en cascade
          montent leur z-index rang après rang, et sans ce plafond le plus haut
          passerait par-dessus l'en-tête collé en haut. */}
      <div style={{ position: "relative", zIndex: 0, height: atHours(24, PAD), marginRight: RIGHT }}>
        {Array.from({ length: 24 }, (_, h) => (
          // L'heure qu'il est prend la place de la graduation voisine.
          todayCol >= 0 && (Math.abs(h * 60 - nowMin) / 60) * hourPx < 10 ? null :
          <div key={h} aria-hidden="true" style={{
            position: "absolute", left: 0, width: GUTTER - 6, top: atHours(h),
            transform: "translateY(-50%)", textAlign: "right",
            font: `500 10px ${MONO}`, color: c.textDim, lineHeight: 1,
          }}>
            {h}
          </div>
        ))}
        {todayCol >= 0 && (
          <div aria-hidden="true" style={{
            position: "absolute", left: 0, width: GUTTER - 2, top: atHours(nowMin / 60),
            transform: "translateY(-50%)", textAlign: "right", zIndex: 1,
            font: `700 9px ${MONO}`, color: c.accent, background: c.bg, lineHeight: "12px",
          }}>
            {clockLabel(nowMin)}
          </div>
        )}

        <div style={{ position: "absolute", left: GUTTER, right: 0, top: 0, bottom: 0 }}>
          {Array.from({ length: 25 }, (_, h) => (
            <div key={`h${h}`} style={{
              position: "absolute", left: 0, right: 0, top: atHours(h),
              borderTop: `1px solid ${c.border}`,
            }} />
          ))}
          {/* Les demi-heures, tant qu'elles ne font pas une trame serrée. */}
          {hourPx >= 30 && Array.from({ length: 24 }, (_, h) => (
            <div key={`m${h}`} style={{
              position: "absolute", left: 0, right: 0, top: atHours(h + 0.5),
              borderTop: `1px dashed ${c.borderSubtle}`,
            }} />
          ))}

          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {columns.map((col, di) => {
              const isToday = di === todayCol;
              const g = ghostHere && ghostHere.day === di ? ghostHere : null;
              return (
                <div
                  key={di}
                  data-day={col.iso}
                  onClick={(e) => tapColumn(e, di)}
                  style={{
                    flex: 1, minWidth: 0, position: "relative",
                    borderLeft: `1px solid ${c.border}`,
                    borderRight: di === 6 ? `1px solid ${c.border}` : undefined,
                    background: isToday ? c.tint : undefined,
                  }}
                >
                  {col.timed.map((t) => {
                    const { s, si } = t;
                    const tone = sportTone(s);
                    const done = s.feedback?.done === true;
                    const dur = Math.max(MIN_BLOCK_MIN, t.span.end - t.span.start) / 60;
                    const h = dur * hourPx - 2;
                    const off = cascadeOffset(t.col, t.cols) * 100;
                    const fill = tone + (isDark ? "4d" : "38");
                    // L'heure, sous le nom, seulement si deux lignes de nom
                    // tiennent au-dessus — et jamais sur un bloc en cascade :
                    // le suivant la couperait en morceaux.
                    const showTime = t.cols === 1 && h - 8 >= 2 * LINE + 11;
                    const lines = Math.max(1, Math.floor((h - 8 - (showTime ? 11 : 0)) / LINE));
                    // Dézoomé, une séance courte n'a plus la hauteur d'une ligne :
                    // son nom passe sur une seule ligne centrée, plus petite, et
                    // disparaît quand même ça ne tient plus — coupé à mi-hauteur,
                    // il ne se lirait pas davantage.
                    const tight = h < LINE + 4;
                    const named = h >= 9;
                    const range = `${clockLabel(t.span.start)} – ${clockLabel(t.span.end)}`;
                    return (
                      <button
                        key={`${si}-${s.id ?? ""}`}
                        onClick={() => { setGhost(null); onOpenSession?.(wk, di, si); }}
                        aria-label={`${s.name}, ${range}`}
                        title={`${s.name} · ${range}`}
                        style={{
                          position: "absolute", top: atHours(t.span.start / 60, 1), height: hoursLong(dur, 2),
                          left: `calc(${off}% + 1px)`, width: `calc(${100 - off}% - 2px)`,
                          border: "none", borderRadius: tight ? 4 : 6,
                          padding: tight ? "0 2px 0 5px" : "2px 2px 2px 5px",
                          background: `linear-gradient(${fill}, ${fill}), ${c.bg}`,
                          // Le filet à la couleur du fond détache un bloc de celui
                          // qu'il recouvre en cascade.
                          boxShadow: t.cols > 1
                            ? `inset 3px 0 0 ${tone}, 0 0 0 1px ${c.bg}`
                            : `inset 3px 0 0 ${tone}`,
                          textAlign: "left", cursor: "pointer", overflow: "hidden",
                          display: "flex", flexDirection: "column", alignItems: "stretch",
                          opacity: done ? 0.45 : 1, fontFamily: SANS, zIndex: 1 + t.col,
                        }}
                      >
                        {named && tight && (
                          <span style={{
                            fontSize: Math.min(10, h - 1), fontWeight: 700, letterSpacing: "-0.1px",
                            lineHeight: `${h}px`, color: c.text,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            textDecoration: done ? "line-through" : "none",
                          }}>
                            {s.name}
                          </span>
                        )}
                        {!tight && (
                          <span lang="fr" style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: "-0.1px",
                            lineHeight: `${LINE}px`, color: c.text,
                            overflowWrap: "anywhere", hyphens: "auto",
                            display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines,
                            overflow: "hidden", textDecoration: done ? "line-through" : "none",
                          }}>
                            {s.name}
                          </span>
                        )}
                        {showTime && (
                          <span style={{ font: `600 9px ${MONO}`, color: c.textMuted, marginTop: 1 }}>
                            {clockLabel(t.span.start)}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {g && (
                    <button
                      onClick={() => { setGhost(null); onAddSession?.(di, clockLabel(g.min)); }}
                      aria-label={`Ajouter une séance le ${dayName(col.date)} à ${clockLabel(g.min)}`}
                      style={{
                        position: "absolute", top: atHours(g.min / 60, 1),
                        height: hoursLong(Math.min(60, DAY_MIN - g.min) / 60, 2),
                        left: 2, right: 2, zIndex: 30, cursor: "pointer", padding: 0,
                        borderRadius: 6, border: `1.5px solid ${c.accent}`, background: c.accentBg,
                        color: c.accent, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 1,
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
                      <span style={{ font: `700 9px ${MONO}` }}>{clockLabel(g.min)}</span>
                    </button>
                  )}

                  {isToday && (
                    <div aria-hidden="true" style={{
                      position: "absolute", left: -1, right: 0, height: 2, zIndex: 40,
                      top: atHours(nowMin / 60, -1),
                      background: c.accent, pointerEvents: "none",
                    }}>
                      <span style={{
                        position: "absolute", left: -3, top: -3, width: 8, height: 8,
                        borderRadius: 8, background: c.accent,
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {footer}
    </div>
  );
}

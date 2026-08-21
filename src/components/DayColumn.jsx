import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor, getSessionCharge } from "../lib/charge.js";
import { BLOCK_TYPES, getMesoColor } from "../lib/constants.js";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { colors } from "../theme/palette.js";

// ─── TIMELINE CONSTANTS ─────────────────────────────────────────────────────
const GUTTER_WIDTH = 26; // width of time labels gutter
const GUTTER_WIDTH_MOBILE = 22;

const timeToMinutes = (time) => {
  if (!time || typeof time !== "string" || !time.includes(":")) return null;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// ─── SCROLL SYNC (module-level, shared across all DayColumns) ──────────────
let _sharedScrollTop = null; // will be set on first render based on ratio
const _scrollListeners = new Set();

function subscribeScroll(fn) {
  _scrollListeners.add(fn);
  return () => _scrollListeners.delete(fn);
}

function broadcastScroll(top) {
  _sharedScrollTop = top;
  _scrollListeners.forEach((fn) => fn(top));
}

// Inject scrollbar-hiding CSS once
let _cssInjected = false;
function injectTimelineCSS() {
  if (_cssInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `.cp-timeline::-webkit-scrollbar { display: none; }`;
  document.head.appendChild(style);
  _cssInjected = true;
}

// ─── JOURNAL BUTTON ─────────────────────────────────────────────────────────
function JournalButton({ logWarning, isToday, isMobile, isCompact, isDark, onOpenLog }) {
  const warn = logWarning?.hasWarning;
  const future = logWarning?.isFuture;
  const btnStyle = warn
    ? isToday
      ? { background: colors(isDark).dangerBg, border: `2px solid ${colors(isDark).danger}`, color: colors(isDark).danger, fontWeight: 700 }
      : { background: colors(isDark).warnBg, border: `2px solid ${colors(isDark).warn}`, color: colors(isDark).warn, fontWeight: 700 }
    : future
    ? { background: "transparent", border: `1px solid ${colors(isDark).borderSubtle}`, color: colors(isDark).border, fontWeight: 400 }
    : isToday
    ? { background: colors(isDark).borderSubtle, border: `1px solid ${colors(isDark).borderStrong}`, color: colors(isDark).accent, fontWeight: 600 }
    : { background: "transparent", border: `1px solid ${colors(isDark).border}`, color: colors(isDark).border, fontWeight: 400 };

  return (
    <button
      onClick={() => onOpenLog?.()}
      style={{
        width: "100%", cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center", gap: isCompact ? 0 : 5,
        padding: isCompact ? "0 2px" : "0 8px", fontSize: isCompact ? 8 : 11, borderRadius: isCompact ? 4 : 6, lineHeight: 1,
        height: isCompact ? 18 : 26, boxSizing: "border-box",
        ...btnStyle,
      }}
    >
      {warn && <span style={{ fontSize: isCompact ? 7 : 11 }}>{warn ? "△" : "="}</span>}
      {!isMobile && !isCompact && (
        <span>
          {warn
            ? isToday
              ? "Completer le journal"
              : "Journal incomplet"
            : isToday
            ? "Journal du jour"
            : "Journal"}
        </span>
      )}
      {isCompact && !warn && <span style={{ fontSize: 7 }}>J</span>}
    </button>
  );
}

// ─── COMPOSANT JOUR ─────────────────────────────────────────────────────────
export function DayColumn({
  dayLabel,
  dateLabel,
  sessions,
  isToday,
  weekMeta,
  onAddSession,
  onOpenSession,
  onRemove,
  isMobile,
  hasCreatine,
  note,
  onSaveNote,
  logWarning,
  onOpenLog,
  pendingSuggestionsIds,
  quickSessions,
  onOpenQuickSession,
  onRemoveQuickSession,
  colWidth,
  timelineRange,
  dateISO,
}) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + getSessionCharge(s), 0);

  // Dynamic sizing based on column width
  const isCompact = colWidth && colWidth < 80;
  const isNarrow = colWidth && colWidth < 120;
  const sz = {
    dayName: isCompact ? 7 : isNarrow ? 8 : isMobile ? 9 : 11,
    dayDate: isCompact ? 0 : isNarrow ? 7 : isMobile ? 8 : 10,
    charge: isCompact ? 7 : isNarrow ? 8 : 10,
    sessionTitle: isCompact ? 7 : isNarrow ? 8 : isMobile ? 9 : 12,
    sessionTime: isCompact ? 6 : isNarrow ? 7 : 11,
    hourLabel: isCompact ? 6 : isNarrow ? 7 : 9,
    addBtn: isCompact ? 8 : isNarrow ? 9 : 12,
  };
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note || "");
  const noteRef = useRef(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);
  const timelineRef = useRef(null);
  const isSyncingRef = useRef(false);
  const [timelineHeight, setTimelineHeight] = useState(600);

  useEffect(() => {
    if (!noteOpen) setNoteText(note || "");
  }, [note, noteOpen]);

  useEffect(() => {
    if (noteOpen && noteRef.current) noteRef.current.focus();
  }, [noteOpen]);

  // Timeline: inject CSS, measure height, init scroll position, subscribe to sync
  useEffect(() => {
    injectTimelineCSS();
    if (!timelineRef.current) return;

    // Measure available height
    const measure = () => {
      if (!timelineRef.current) return;
      const h = timelineRef.current.clientHeight;
      if (h > 0) setTimelineHeight(h);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(timelineRef.current);

    if (!isMobile) {
      // Sync scroll across columns (desktop only)
      if (_sharedScrollTop !== null) {
        timelineRef.current.scrollTop = _sharedScrollTop;
      } else {
        // Default: scroll to top (range already starts at configured hour)
        timelineRef.current.scrollTop = 0;
        _sharedScrollTop = timelineRef.current.scrollTop;
      }

      const unsub = subscribeScroll((top) => {
        if (!timelineRef.current || isSyncingRef.current) return;
        isSyncingRef.current = true;
        timelineRef.current.scrollTop = top;
        isSyncingRef.current = false;
      });

      return () => { ro.disconnect(); unsub(); };
    }

    return () => ro.disconnect();
  }, [isMobile]);

  const handleTimelineScroll = (e) => {
    if (isSyncingRef.current) return;
    if (!isMobile) broadcastScroll(e.target.scrollTop);
  };

  const handleNoteBlur = () => {
    setNoteOpen(false);
    if (noteText !== (note || "")) onSaveNote?.(noteText);
  };

  // Annotate each session with its original index before splitting
  const sessionsWithIdx = sessions.map((s, i) => ({ ...s, _origIdx: i }));
  const timedSessions = sessionsWithIdx.filter(
    (s) => s.startTime && timeToMinutes(s.startTime) !== null
  );
  const untimedSessions = sessionsWithIdx.filter(
    (s) => !s.startTime || timeToMinutes(s.startTime) === null
  );

  // Build unified event list for timeline positioning + overlap detection
  // All events get: startMin, endMin, type, key, and original data
  const allEvents = [];

  // Regular timed sessions
  timedSessions.forEach(s => {
    const startMin = timeToMinutes(s.startTime);
    const endMin = s.endTime ? timeToMinutes(s.endTime) : startMin + (s.estimatedTime || 60);
    allEvents.push({ type: "session", key: `s${s._origIdx}`, startMin, endMin: Math.max(endMin, startMin + 15), data: s });
  });

  // Regular untimed sessions → full day span
  untimedSessions.forEach(s => {
    allEvents.push({ type: "session", key: `su${s._origIdx}`, startMin: 0, endMin: 24 * 60, data: s, isAllDay: true });
  });

  // QuickSessions
  (quickSessions || []).forEach(qs => {
    const isMultiDay = qs.endDate && qs.startDate !== qs.endDate;
    if (!qs.allDay && qs.startTime && timeToMinutes(qs.startTime) !== null) {
      // Timed quickSession
      const startMin = timeToMinutes(qs.startTime);
      const endMin = qs.endTime ? timeToMinutes(qs.endTime) : startMin + (qs.duration || 60);
      allEvents.push({ type: "quick", key: `q${qs.id}`, startMin, endMin: Math.max(endMin, startMin + 15), data: qs, isMultiDay });
    } else {
      // All-day quickSession → full day span
      allEvents.push({ type: "quick", key: `qa${qs.id}`, startMin: 0, endMin: 24 * 60, data: qs, isAllDay: true, isMultiDay });
    }
  });

  // Compute overlap columns: greedy left-to-right assignment
  // Sort by startMin, then by duration (longer first)
  const sorted = [...allEvents].sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));
  const columns = []; // each column is array of events with their endMin
  sorted.forEach(ev => {
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      if (columns[c].every(ce => ce.endMin <= ev.startMin || ev.endMin <= ce.startMin)) {
        columns[c].push(ev);
        ev._col = c;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ev._col = columns.length;
      columns.push([ev]);
    }
  });
  const totalCols = Math.max(columns.length, 1);

  // For each event, find how many columns overlap with it at its time range
  sorted.forEach(ev => {
    // Find all events overlapping with this one
    const overlapping = sorted.filter(o => o.startMin < ev.endMin && o.endMin > ev.startMin);
    const maxCol = Math.max(...overlapping.map(o => o._col)) + 1;
    ev._totalCols = maxCol;
  });

  // Timeline range (configurable, default 0-24 = full day)
  const rangeStart = timelineRange?.start ?? 6;
  const rangeEnd = timelineRange?.end ?? 22;
  const rangeHours = rangeEnd - rangeStart;

  // Compute dynamic hour height based on visible range
  // Mobile & desktop : fit-to-container, plus de scroll vertical.
  // Min 8px/h sur mobile, 16px/h sur desktop pour éviter l'absurde sur
  // fenêtre minuscule.
  const hourHeight = Math.max(
    timelineHeight / rangeHours,
    isMobile ? 8 : 16,
  );
  const minutesToPx = (minutes) => ((minutes / 60) - rangeStart) * hourHeight;
  const gutter = isCompact ? 10 : isNarrow ? 16 : isMobile ? GUTTER_WIDTH_MOBILE : GUTTER_WIDTH;

  const noteAreaStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: colors(isDark).borderSubtle,
    border: `1px solid ${colors(isDark).border}`,
    borderRadius: 4,
    color: colors(isDark).text,
    fontSize: 10,
    fontFamily: "inherit",
    lineHeight: 1.45,
    padding: "5px 7px",
    resize: "none",
    height: 52,
    outline: "none",
  };

  // ── Shared timeline view (desktop + mobile) ──
  return (
    <div
      style={{
        ...styles.dayCol,
        ...(isToday ? styles.dayColToday : {}),
        ...(isMobile ? styles.dayColMobile : {}),
        padding: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── En-tête (hauteur fixe pour alignement entre colonnes) ── */}
      <div
        style={{
          ...styles.dayHeader,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isCompact ? "2px 1px 1px" : isNarrow ? "4px 4px 3px" : "8px 8px 6px",
          marginBottom: 0,
          gap: 0,
          height: isCompact ? 28 : isNarrow ? 34 : undefined,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}), fontSize: sz.dayName, lineHeight: 1.2 }}>
          {isCompact ? dayLabel.slice(0, 3) : dayLabel}
        </span>
        {isCompact ? (
          totalCharge > 0 && (
            <span style={{ fontSize: 6, color: getChargeColor(totalCharge), fontWeight: 700, lineHeight: 1 }}>
              ⚡{totalCharge}
            </span>
          )
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            {sz.dayDate > 0 && <span style={{ ...styles.dayDate, fontSize: sz.dayDate }}>{dateLabel}</span>}
            {totalCharge > 0 && (
              <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge), fontSize: sz.charge }}>
                ⚡{totalCharge}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Journal ── */}
      <div style={{ padding: isCompact ? "0 1px" : isNarrow ? "0 2px" : "0 6px" }}>
        <JournalButton logWarning={logWarning} isToday={isToday} isMobile={isMobile} isCompact={isCompact} isDark={isDark} onOpenLog={onOpenLog} />
      </div>

      {/* ── Timeline ── */}
      <div
        ref={timelineRef}
        className="cp-timeline"
        onScroll={handleTimelineScroll}
        style={{
          flex: 1,
          // Fit-to-screen sur mobile ET desktop : pas de scroll vertical
          // pour montrer la journée entière en un coup d'œil.
          overflowY: "hidden",
          overflowX: "hidden",
          scrollbarWidth: "none",
          position: "relative",
          minHeight: 0,
        }}
      >
        <div style={{ position: "relative", height: "100%" }}>

          {/* Lignes horaires */}
          {Array.from({ length: rangeHours + 1 }, (_, i) => {
            const h = rangeStart + i;
            if (h > 23) return null;
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: i * hourHeight,
                  left: 0,
                  right: 0,
                  display: "flex",
                  alignItems: "flex-start",
                  pointerEvents: "none",
                }}
              >
                {gutter > 0 && <span style={{
                  fontSize: sz.hourLabel,
                  color: colors(isDark).border,
                  width: gutter,
                  textAlign: "right",
                  paddingRight: isCompact ? 1 : isNarrow ? 2 : 5,
                  lineHeight: 1,
                  flexShrink: 0,
                  userSelect: "none",
                  marginTop: -1,
                  visibility: isCompact && (h % 3 !== 0) ? "hidden" : "visible",
                }}>
                  {isCompact ? h : `${h.toString().padStart(2, "0")}h`}
                </span>}
                <div style={{
                  flex: 1,
                  borderTop: h % 6 === 0
                    ? `1px solid ${colors(isDark).border}`
                    : `1px solid ${colors(isDark).borderSubtle}`,
                }} />
              </div>
            );
          })}

          {/* Lignes demi-heures (pointillées) — only if enough space */}
          {hourHeight >= 30 && Array.from({ length: rangeHours }, (_, i) => {
            const h = rangeStart + i;
            return (
              <div
                key={`hh${h}`}
                style={{
                  position: "absolute",
                  top: i * hourHeight + hourHeight / 2,
                  left: gutter,
                  right: 0,
                  borderTop: `1px dashed ${colors(isDark).borderSubtle}`,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Indicateur heure actuelle */}
          {isToday && (() => {
            const now = new Date();
            const nowPx = minutesToPx(now.getHours() * 60 + now.getMinutes());
            return (
              <div
                style={{
                  position: "absolute",
                  top: nowPx,
                  left: gutter - 4,
                  right: 0,
                  zIndex: 10,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors(isDark).danger, flexShrink: 0 }} />
                <div style={{ flex: 1, borderTop: `1.5px solid ${colors(isDark).danger}` }} />
              </div>
            );
          })()}

          {/* ── Tous les événements positionnés (sessions + quickSessions) ── */}
          {sorted.map((ev) => {
            const top = Math.max(minutesToPx(ev.startMin), 0);
            const bottom = minutesToPx(ev.endMin);
            const height = Math.max(bottom - top, isCompact ? 8 : 16);
            const isShort = height < 34;
            const colW = (100 / ev._totalCols);
            const leftPct = ev._col * colW;

            // Multi-day quickSession styling
            const isMultiDay = ev.isMultiDay;
            const isStart = isMultiDay && dateISO === ev.data.startDate;
            const isEnd = isMultiDay && dateISO === ev.data.endDate;

            if (ev.type === "session") {
              const s = ev.data;
              const chargeColor = getChargeColor(getSessionCharge(s));
              return (
                <div
                  key={ev.key}
                  style={{
                    position: "absolute",
                    top,
                    left: `calc(${gutter + 2}px + ${leftPct}%)`,
                    width: `calc(${colW}% - ${gutter + 5}px)`,
                    height,
                    background: ev.isAllDay
                      ? (isDark ? chargeColor + "15" : chargeColor + "10")
                      : (colors(isDark).surface),
                    border: `1px solid ${chargeColor}44`,
                    borderLeft: `3px solid ${chargeColor}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    padding: isShort ? "1px 3px" : "3px 5px",
                    zIndex: ev.isAllDay ? 1 : 2,
                  }}
                  onClick={() => onOpenSession(s._origIdx)}
                >
                  {isCompact ? null : (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1, minHeight: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {!isShort && !isNarrow && !ev.isAllDay && (
                          <span style={{
                            fontSize: sz.sessionTime,
                            color: colors(isDark).success,
                            fontWeight: 600, display: "block", lineHeight: 1.3,
                          }}>
                            {s.startTime}{s.endTime ? ` → ${s.endTime}` : ""}
                          </span>
                        )}
                        {!isNarrow && (
                          <span style={{
                            fontSize: isShort ? Math.max(sz.sessionTitle - 1, 6) : sz.sessionTitle,
                            fontWeight: 600, color: colors(isDark).textCard,
                            display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3,
                          }}>
                            {s.title || s.name}
                          </span>
                        )}
                        {!isShort && !isNarrow && s.blocks && s.blocks.length > 0 && (
                          <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                            {s.blocks.slice(0, 3).map((bl, bi) => {
                              const cfg = BLOCK_TYPES[bl.type];
                              if (!cfg) return null;
                              return (
                                <span key={bi} style={{
                                  fontSize: 8, padding: "0px 4px", borderRadius: 8,
                                  background: cfg.color + "22", color: cfg.color,
                                  border: `1px solid ${cfg.color}44`, lineHeight: 1.6,
                                }}>
                                  {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                        <span style={{ fontSize: sz.charge, color: chargeColor, fontWeight: 700, lineHeight: 1.2 }}>
                          ⚡{s.charge}
                        </span>
                        {!isNarrow && s.feedback && (
                          <span style={styles.feedbackDot} title="Feedback">{s.feedback.done ? "☑" : "☐"}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // QuickSession
            const qs = ev.data;
            const accent = qs.color || colors(isDark).info;
            return (
              <div
                key={ev.key}
                style={{
                  position: "absolute",
                  top,
                  left: `calc(${gutter + 2}px + ${leftPct}%)`,
                  width: `calc(${colW}% - ${gutter + 5}px)`,
                  height,
                  background: accent + (isDark ? "18" : "12"),
                  border: `1px solid ${accent}55`,
                  borderLeft: isMultiDay && !isStart ? `1px solid ${accent}55` : `3px solid ${accent}`,
                  borderRight: isMultiDay && !isEnd ? "none" : `1px solid ${accent}55`,
                  borderRadius: isMultiDay
                    ? (isStart && isEnd ? 4 : isStart ? "4px 0 0 4px" : isEnd ? "0 4px 4px 0" : 0)
                    : 4,
                  cursor: "pointer",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  padding: isCompact ? "1px 2px" : "3px 5px",
                  zIndex: ev.isAllDay ? 1 : 2,
                }}
                onClick={() => onOpenQuickSession?.(qs)}
              >
                {!isCompact && (isMultiDay ? isStart : true) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    {qs.isObjective && (
                      <span style={{
                        fontSize: 6, fontWeight: 700, letterSpacing: "0.05em",
                        color: accent, background: accent + "22",
                        borderRadius: 3, padding: "1px 3px", lineHeight: 1, flexShrink: 0,
                      }}>OBJ</span>
                    )}
                    <span style={{
                      fontSize: sz.sessionTitle, fontWeight: 600,
                      color: colors(isDark).textCard,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                    }}>
                      {qs.name}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Pied : bouton ajouter ── */}
      <div style={{ padding: isCompact ? "1px 1px 2px" : isNarrow ? "3px 2px 4px" : "4px 6px 6px", flexShrink: 0, borderTop: `1px solid ${colors(isDark).borderSubtle}` }}>
        {!isNarrow && !isCompact && (
          <div style={{ marginBottom: 4 }}>
            {noteOpen ? (
              <textarea
                ref={noteRef}
                style={noteAreaStyle}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Note du jour..."
              />
            ) : noteText ? (
              <div
                onClick={() => setNoteOpen(true)}
                style={{
                  fontSize: 10,
                  color: colors(isDark).textDim,
                  lineHeight: 1.4,
                  cursor: "text",
                  padding: "3px 5px",
                  borderRadius: 4,
                  borderLeft: `2px solid ${colors(isDark).border}`,
                  background: colors(isDark).bgVeil,
                  wordBreak: "break-word",
                }}
              >
                {noteText.length > 60 ? noteText.slice(0, 60) + "…" : noteText}
              </div>
            ) : (
              <div
                onClick={() => setNoteOpen(true)}
                style={{ fontSize: 9, color: colors(isDark).border, cursor: "text", padding: "2px 3px", letterSpacing: "0.03em" }}
              >
                note
              </div>
            )}
          </div>
        )}
        <button style={{ ...styles.addBtn, fontSize: sz.addBtn, padding: isCompact ? "1px 0" : undefined, minHeight: isCompact ? 16 : undefined }} onClick={onAddSession}>
          <span style={{ ...styles.addBtnIcon, fontSize: isCompact ? 10 : sz.addBtn }}>+</span>
          {!isCompact && <span style={{ ...styles.addBtnLabel, fontSize: sz.addBtn }}>Séance</span>}
        </button>
      </div>

      {pendingDeleteIdx !== null && (
        <ConfirmModal
          title="Supprimer cette séance ?"
          sub={sessions[pendingDeleteIdx]?.name}
          onConfirm={() => onRemove(pendingDeleteIdx)}
          onClose={() => setPendingDeleteIdx(null)}
        />
      )}
    </div>
  );
}


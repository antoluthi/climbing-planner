import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES, getMesoColor } from "../lib/constants.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

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
      ? { background: "#ef444418", border: "2px solid #ef4444", color: "#ef4444", fontWeight: 700 }
      : { background: "#f9731618", border: "2px solid #f97316", color: "#f97316", fontWeight: 700 }
    : future
    ? { background: "transparent", border: `1px solid ${isDark ? "#1e221e" : "#e5e0d8"}`, color: isDark ? "#252a25" : "#ccc8c0", fontWeight: 400 }
    : isToday
    ? { background: isDark ? "#221510" : "#ecddd4", border: `1px solid ${isDark ? "#4a2a10" : "#c8a080"}`, color: isDark ? "#c8906a" : "#8b4c20", fontWeight: 600 }
    : { background: "transparent", border: `1px solid ${isDark ? "#252a25" : "#d8d3ca"}`, color: isDark ? "#333833" : "#c0bbb2", fontWeight: 400 };

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
}) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);

  // Dynamic sizing based on column width
  const isCompact = colWidth && colWidth < 80;
  const isNarrow = colWidth && colWidth < 120;
  const sz = {
    dayName: isCompact ? 7 : isNarrow ? 8 : isMobile ? 9 : 11,
    dayDate: isCompact ? 0 : isNarrow ? 7 : isMobile ? 8 : 10,
    charge: isCompact ? 7 : isNarrow ? 8 : 9,
    sessionTitle: isCompact ? 7 : isNarrow ? 8 : isMobile ? 9 : 10,
    sessionTime: isCompact ? 6 : isNarrow ? 7 : 8,
    hourLabel: isCompact ? 6 : isNarrow ? 7 : 8,
    addBtn: isCompact ? 8 : isNarrow ? 9 : 11,
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

  // Timeline range (configurable, default 0-24 = full day)
  const rangeStart = timelineRange?.start ?? 6;
  const rangeEnd = timelineRange?.end ?? 22;
  const rangeHours = rangeEnd - rangeStart;

  // Compute dynamic hour height based on visible range
  // On mobile: force-fit to container (no scroll), minimum 8px/hour
  // On desktop: minimum 20px/hour (scrolls if needed)
  const hourHeight = isMobile
    ? Math.max(timelineHeight / rangeHours, 8)
    : Math.max(timelineHeight / rangeHours, 20);
  const totalHeight = hourHeight * rangeHours;
  const minutesToPx = (minutes) => ((minutes / 60) - rangeStart) * hourHeight;
  const gutter = isCompact ? 0 : isNarrow ? 16 : isMobile ? GUTTER_WIDTH_MOBILE : GUTTER_WIDTH;

  const noteAreaStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: isDark ? "#1a1f1c" : "#e4dfd6",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4,
    color: isDark ? "#d8d4ce" : "#2a2218",
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
      {/* ── En-tête ── */}
      <div
        style={{
          ...styles.dayHeader,
          flexDirection: isCompact ? "column" : "row",
          alignItems: isCompact ? "center" : "center",
          justifyContent: "space-between",
          padding: isCompact ? "2px 2px 1px" : isNarrow ? "4px 4px 3px" : "8px 8px 6px",
          marginBottom: 0,
          gap: isCompact ? 1 : 0,
        }}
      >
        <div style={{ display: "flex", gap: isCompact ? 0 : 4, flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "center" : "baseline" }}>
          <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}), fontSize: sz.dayName }}>
            {isCompact ? dayLabel.slice(0, 3) : dayLabel}
          </span>
          {sz.dayDate > 0 && <span style={{ ...styles.dayDate, fontSize: sz.dayDate }}>{dateLabel}</span>}
        </div>
        {totalCharge > 0 && (
          <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge), fontSize: sz.charge }}>
            ⚡{totalCharge}
          </span>
        )}
      </div>

      {/* ── Journal ── */}
      <div style={{ padding: isCompact ? "0 1px" : isNarrow ? "0 2px" : "0 6px" }}>
        <JournalButton logWarning={logWarning} isToday={isToday} isMobile={isMobile} isCompact={isCompact} isDark={isDark} onOpenLog={onOpenLog} />
      </div>

      {/* ── Séances sans heure (compact, au-dessus de la timeline) ── */}
      {(untimedSessions.length > 0 || (quickSessions || []).length > 0) && (
        <div style={{ padding: isCompact ? "0 1px 2px" : isNarrow ? "0 2px 3px" : "0 6px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
          {untimedSessions.map((s) => (
            <div
              key={s._origIdx}
              style={{
                background: isDark ? "#1e231f" : "#f0ece4",
                border: `1px solid ${getChargeColor(s.charge)}33`,
                borderLeft: `2px solid ${getChargeColor(s.charge)}`,
                borderRadius: 3,
                padding: isCompact ? "1px 2px" : "3px 6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
              onClick={() => onOpenSession(s._origIdx)}
            >
              <span style={{
                fontSize: sz.sessionTitle, fontWeight: 600,
                color: isDark ? "#c8c4be" : "#3a3028",
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {s.title || s.name}
              </span>
              {!isCompact && (
                <span style={{ fontSize: sz.charge, color: getChargeColor(s.charge), fontWeight: 700 }}>
                  ⚡{s.charge}
                </span>
              )}
            </div>
          ))}
          {(quickSessions || []).map((qs, qi) => (
            <QuickSessionCard
              key={qs.id || qi}
              qs={qs}
              isDark={isDark}
              isCompact={isCompact}
              isNarrow={isNarrow}
              onClick={() => onOpenQuickSession?.(qs)}
              onDelete={() => onRemoveQuickSession?.(qs.id)}
            />
          ))}
        </div>
      )}

      {/* ── Timeline ── */}
      <div
        ref={timelineRef}
        className="cp-timeline"
        onScroll={handleTimelineScroll}
        style={{
          flex: 1,
          overflowY: isMobile ? "hidden" : "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          position: "relative",
          minHeight: 0,
        }}
      >
        <div style={{ position: "relative", height: isMobile ? "100%" : totalHeight }}>

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
                  color: isDark ? "#3a4040" : "#bcb8b0",
                  width: gutter,
                  textAlign: "right",
                  paddingRight: isNarrow ? 2 : 5,
                  lineHeight: 1,
                  flexShrink: 0,
                  userSelect: "none",
                  marginTop: -1,
                }}>
                  {isCompact ? h : `${h.toString().padStart(2, "0")}h`}
                </span>}
                <div style={{
                  flex: 1,
                  borderTop: h % 6 === 0
                    ? `1px solid ${isDark ? "#2a302a" : "#ccc6b8"}`
                    : `1px solid ${isDark ? "#1e221e" : "#e5e0da"}`,
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
                  borderTop: `1px dashed ${isDark ? "#191d19" : "#eae6e0"}`,
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
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                <div style={{ flex: 1, borderTop: "1.5px solid #ef4444" }} />
              </div>
            );
          })()}

          {/* Séances positionnées sur la timeline */}
          {timedSessions.map((s) => {
            const startMin = timeToMinutes(s.startTime);
            const endMin = s.endTime
              ? timeToMinutes(s.endTime)
              : startMin + (s.estimatedTime || 60);
            const duration = Math.max((endMin ?? startMin + 60) - startMin, 15);
            const top = minutesToPx(startMin);
            const height = Math.max(minutesToPx(duration), 20);
            const isShort = height < 34;

            return (
              <div
                key={s._origIdx}
                style={{
                  position: "absolute",
                  top,
                  left: gutter + 2,
                  right: 3,
                  height,
                  background: isDark ? "#1c211d" : "#f2ede5",
                  border: `1px solid ${getChargeColor(s.charge)}44`,
                  borderLeft: `3px solid ${getChargeColor(s.charge)}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  padding: isShort ? "1px 5px" : "3px 5px",
                  zIndex: 2,
                }}
                onClick={() => onOpenSession(s._origIdx)}
              >
                {isCompact ? null : (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1, minHeight: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Heure */}
                      {!isShort && !isNarrow && (
                        <span style={{
                          fontSize: sz.sessionTime,
                          color: isDark ? "#5a7860" : "#7a9a80",
                          fontWeight: 600,
                          display: "block",
                          lineHeight: 1.3,
                        }}>
                          {s.startTime}{s.endTime ? ` → ${s.endTime}` : ""}
                        </span>
                      )}
                      {/* Titre */}
                      {!isNarrow && (
                        <span style={{
                          fontSize: isShort ? Math.max(sz.sessionTitle - 1, 6) : sz.sessionTitle,
                          fontWeight: 600,
                          color: isDark ? "#c8c4be" : "#3a3028",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          lineHeight: 1.3,
                        }}>
                          {s.title || s.name}
                        </span>
                      )}
                      {/* Blocs */}
                      {!isShort && !isNarrow && s.blocks && s.blocks.length > 0 && (
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                          {s.blocks.slice(0, 3).map((bl, bi) => {
                            const cfg = BLOCK_TYPES[bl.type];
                            if (!cfg) return null;
                            return (
                              <span key={bi} style={{
                                fontSize: 8,
                                padding: "0px 4px",
                                borderRadius: 8,
                                background: cfg.color + "22",
                                color: cfg.color,
                                border: `1px solid ${cfg.color}44`,
                                lineHeight: 1.6,
                              }}>
                                {bl.type === "Exercices" && bl.name
                                  ? bl.name.split(" ").slice(0, 2).join(" ")
                                  : bl.type}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Charge */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                      <span style={{ fontSize: sz.charge, color: getChargeColor(s.charge), fontWeight: 700, lineHeight: 1.2 }}>
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
          })}
        </div>
      </div>

      {/* ── Pied : bouton ajouter ── */}
      <div style={{ padding: isCompact ? "1px 1px 2px" : isNarrow ? "3px 2px 4px" : "4px 6px 6px", flexShrink: 0, borderTop: `1px solid ${isDark ? "#1e221e" : "#e5e0da"}` }}>
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
                  color: isDark ? "#8a9090" : "#6b7060",
                  lineHeight: 1.4,
                  cursor: "text",
                  padding: "3px 5px",
                  borderRadius: 4,
                  borderLeft: `2px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
                  background: isDark ? "#1a1f1c55" : "#e4dfd655",
                  wordBreak: "break-word",
                }}
              >
                {noteText.length > 60 ? noteText.slice(0, 60) + "…" : noteText}
              </div>
            ) : (
              <div
                onClick={() => setNoteOpen(true)}
                style={{ fontSize: 9, color: isDark ? "#303530" : "#ccc8c0", cursor: "text", padding: "2px 3px", letterSpacing: "0.03em" }}
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

// ─── CARTE SÉANCE RAPIDE ────────────────────────────────────────────────────
function QuickSessionCard({ qs, isDark, isCompact, isNarrow, onClick, onDelete }) {
  const accent = qs.color || "#60a5fa";
  const titleSize = isCompact ? 7 : isNarrow ? 8 : 9;
  return (
    <div
      style={{
        background: accent + (isDark ? "18" : "12"),
        border: `1px solid ${accent}55`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: isCompact ? "2px 3px" : "3px 6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: isCompact ? 2 : 4,
      }}
      onClick={onClick}
    >
      {qs.isObjective && !isCompact && (
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
          color: accent, background: accent + "22",
          borderRadius: 3, padding: "1px 3px", lineHeight: 1, flexShrink: 0,
        }}>OBJ</span>
      )}
      <span style={{
        fontSize: titleSize, fontWeight: 600,
        color: isDark ? "#c8c4be" : "#3a3028",
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {qs.name}
      </span>
      {qs.startTime && !isCompact && (
        <span style={{ fontSize: isNarrow ? 7 : 9, color: accent, fontWeight: 600 }}>
          {qs.startTime}
        </span>
      )}
      {!isCompact && (
        <button
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: isDark ? "#5a5a5a" : "#aaa", padding: "0 2px", lineHeight: 1 }}
          title="Supprimer"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >×</button>
      )}
    </div>
  );
}

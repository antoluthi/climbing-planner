import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES, getMesoColor } from "../lib/constants.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

// âââ TIMELINE CONSTANTS ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const HOUR_HEIGHT = 56; // px per hour
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT; // 1344px (full day)
const GUTTER_WIDTH = 30; // width of time labels gutter

const timeToMinutes = (time) => {
  if (!time || typeof time !== "string" || !time.includes(":")) return null;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

const minutesToPx = (minutes) => (minutes / 60) * HOUR_HEIGHT;

// âââ SCROLL SYNC (module-level, shared across all DayColumns) âââââââââââââââââ
let _sharedScrollTop = 7 * HOUR_HEIGHT; // default view: 07:00
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

// âââ JOURNAL BUTTON âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function JournalButton({ logWarning, isToday, isMobile, isDark, onOpenLog }) {
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
        width: "100%",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: isMobile ? "6px 2px" : "6px 8px",
        fontSize: isMobile ? 10 : 11,
        borderRadius: 6,
        lineHeight: 1,
        marginBottom: 6,
        ...btnStyle,
      }}
    >
      <span style={{ fontSize: warn ? 13 : 11 }}>{warn ? "â " : "â¡"}</span>
      {!isMobile && (
        <span>
          {warn
            ? isToday
              ? "ComplÃ©ter le journal"
              : "Journal incomplet"
            : isToday
            ? "Journal du jour â"
            : "Journal"}
        </span>
      )}
    </button>
  );
}

// âââ COMPOSANT JOUR âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
}) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note || "");
  const noteRef = useRef(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);
  const timelineRef = useRef(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (!noteOpen) setNoteText(note || "");
  }, [note, noteOpen]);

  useEffect(() => {
    if (noteOpen && noteRef.current) noteRef.current.focus();
  }, [noteOpen]);

  // Timeline: inject CSS, init scroll position, subscribe to sync
  useEffect(() => {
    injectTimelineCSS();
    if (isMobile || !timelineRef.current) return;

    timelineRef.current.scrollTop = _sharedScrollTop;

    const unsub = subscribeScroll((top) => {
      if (!timelineRef.current || isSyncingRef.current) return;
      isSyncingRef.current = true;
      timelineRef.current.scrollTop = top;
      isSyncingRef.current = false;
    });

    return unsub;
  }, [isMobile]);

  const handleTimelineScroll = (e) => {
    if (isSyncingRef.current) return;
    broadcastScroll(e.target.scrollTop);
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

  // ââ MOBILE: vue liste originale ââââââââââââââââââââââââââââââââââââââââââââââ
  if (isMobile) {
    return (
      <div
        style={{
          ...styles.dayCol,
          ...(isToday ? styles.dayColToday : {}),
          ...styles.dayColMobile,
        }}
      >
        <div style={styles.dayHeaderMobile}>
          <div style={styles.dayHeaderMobileLeft}>
            <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>
              {dayLabel}
            </span>
            <span style={styles.dayDate}>{dateLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {hasCreatine && (
              <span
                style={{ fontSize: 7, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", lineHeight: 1 }}
                title="CrÃ©atine"
              >â²</span>
            )}
            {totalCharge > 0 && (
              <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>
                â¡{totalCharge}
              </span>
            )}
          </div>
        </div>

        <JournalButton logWarning={logWarning} isToday={isToday} isMobile={true} isDark={isDark} onOpenLog={onOpenLog} />

        <div style={styles.sessionCards}>
          {sessions.map((s, i) => (
            <MobileSessionCard
              key={i}
              s={s}
              i={i}
              styles={styles}
              isDark={isDark}
              meso={meso}
              mesoColor={mesoColor}
              onOpenSession={onOpenSession}
              pendingSuggestionsIds={pendingSuggestionsIds}
              onDelete={() => setPendingDeleteIdx(i)}
            />
          ))}
          {(quickSessions || []).map((qs, qi) => (
            <QuickSessionCard
              key={qs.id || qi}
              qs={qs}
              isDark={isDark}
              onClick={() => onOpenQuickSession?.(qs)}
              onDelete={() => onRemoveQuickSession?.(qs.id)}
            />
          ))}
        </div>

        <button style={{ ...styles.addBtn, marginTop: 0 }} onClick={onAddSession}>
          <span style={styles.addBtnIcon}>ï¼</span>
          <span style={styles.addBtnLabel}>SÃ©ance</span>
        </button>

        {pendingDeleteIdx !== null && (
          <ConfirmModal
            title="Supprimer cette sÃ©ance ?"
            sub={sessions[pendingDeleteIdx]?.name}
            onConfirm={() => onRemove(pendingDeleteIdx)}
            onClose={() => setPendingDeleteIdx(null)}
          />
        )}
      </div>
    );
  }

  // ââ DESKTOP: vue calendrier timeline ââââââââââââââââââââââââââââââââââââââââ
  return (
    <div
      style={{
        ...styles.dayCol,
        ...(isToday ? styles.dayColToday : {}),
        padding: 0,
        minHeight: "unset",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ââ En-tÃªte ââ */}
      <div
        style={{
          ...styles.dayHeader,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 8px 6px",
          marginBottom: 0,
        }}
      >
        <div>
          <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>
            {dayLabel}
          </span>
          <span style={{ ...styles.dayDate, marginLeft: 5 }}>{dateLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {hasCreatine && (
            <span
              style={{ fontSize: 7, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", lineHeight: 1 }}
              title="CrÃ©atine"
            >â²</span>
          )}
          {totalCharge > 0 && (
            <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>
              â¡{totalCharge}
            </span>
          )}
        </div>
      </div>

      {/* ââ Journal ââ */}
      <div style={{ padding: "0 6px" }}>
        <JournalButton logWarning={logWarning} isToday={isToday} isMobile={false} isDark={isDark} onOpenLog={onOpenLog} />
      </div>

      {/* ââ SÃ©ances sans heure (compact, au-dessus de la timeline) ââ */}
      {(untimedSessions.length > 0 || (quickSessions || []).length > 0) && (
        <div style={{ padding: "0 6px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
          {untimedSessions.map((s) => (
            <div
              key={s._origIdx}
              style={{
                background: isDark ? "#1e231f" : "#f0ece4",
                border: `1px solid ${getChargeColor(s.charge)}33`,
                borderLeft: `3px solid ${getChargeColor(s.charge)}`,
                borderRadius: 4,
                padding: "3px 6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={() => onOpenSession(s._origIdx)}
            >
              <span style={{
                fontSize: 9, fontWeight: 600,
                color: isDark ? "#c8c4be" : "#3a3028",
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {s.title || s.name}
              </span>
              <span style={{ fontSize: 9, color: getChargeColor(s.charge), fontWeight: 700 }}>
                ⚡{s.charge}
              </span>
              <button
                style={{ ...styles.actionBtn, padding: "0 3px", fontSize: 9 }}
                title="Supprimer"
                onClick={(e) => { e.stopPropagation(); setPendingDeleteIdx(s._origIdx); }}
              >×</button>
            </div>
          ))}
          {(quickSessions || []).map((qs, qi) => (
            <QuickSessionCard
              key={qs.id || qi}
              qs={qs}
              isDark={isDark}
              onClick={() => onOpenQuickSession?.(qs)}
              onDelete={() => onRemoveQuickSession?.(qs.id)}
            />
          ))}
        </div>
      )}

      Timeline ââ */}
      <div
        ref={timelineRef}
        className="cp-timeline"
        onScroll={handleTimelineScroll}
        style={{
          flex: 1,
          overflowY: "scroll",
          overflowX: "hidden",
          scrollbarWidth: "none",
          position: "relative",
          minHeight: 400,
        }}
      >
        <div style={{ position: "relative", height: TOTAL_HEIGHT }}>

          {/* Lignes horaires */}
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              style={{
                position: "absolute",
                top: h * HOUR_HEIGHT,
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "flex-start",
                pointerEvents: "none",
              }}
            >
              <span style={{
                fontSize: 8,
                color: isDark ? "#3a4040" : "#bcb8b0",
                width: GUTTER_WIDTH,
                textAlign: "right",
                paddingRight: 5,
                lineHeight: 1,
                flexShrink: 0,
                userSelect: "none",
                marginTop: -1,
              }}>
                {`${h.toString().padStart(2, "0")}h`}
              </span>
              <div style={{
                flex: 1,
                borderTop: h % 6 === 0
                  ? `1px solid ${isDark ? "#2a302a" : "#ccc6b8"}`
                  : `1px solid ${isDark ? "#1e221e" : "#e5e0da"}`,
              }} />
            </div>
          ))}

          {/* Lignes demi-heures (pointillÃ©es) */}
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={`hh${h}`}
              style={{
                position: "absolute",
                top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                left: GUTTER_WIDTH,
                right: 0,
                borderTop: `1px dashed ${isDark ? "#191d19" : "#eae6e0"}`,
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Indicateur heure actuelle */}
          {isToday && (() => {
            const now = new Date();
            const nowPx = minutesToPx(now.getHours() * 60 + now.getMinutes());
            return (
              <div
                style={{
                  position: "absolute",
                  top: nowPx,
                  left: GUTTER_WIDTH - 5,
                  right: 0,
                  zIndex: 10,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                <div style={{ flex: 1, borderTop: "1.5px solid #ef4444" }} />
              </div>
            );
          })()}

          {/* SÃ©ances positionnÃ©es sur la timeline */}
          {timedSessions.map((s) => {
            const startMin = timeToMinutes(s.startTime);
            const endMin = s.endTime
              ? timeToMinutes(s.endTime)
              : startMin + (s.estimatedTime || 60);
            const duration = Math.max((endMin ?? startMin + 60) - startMin, 15);
            const top = minutesToPx(startMin);
            const height = Math.max(minutesToPx(duration), 22);
            const isShort = height < 38;

            return (
              <div
                key={s._origIdx}
                style={{
                  position: "absolute",
                  top,
                  left: GUTTER_WIDTH + 2,
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
                <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1, minHeight: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Heure */}
                    {!isShort && (
                      <span style={{
                        fontSize: 8,
                        color: isDark ? "#5a7860" : "#7a9a80",
                           fontWeight: 600,
                        display: "block",
                        lineHeight: 1.3,
                      }}>
                        {s.startTime}{s.endTime ? ` â ${s.endTime}` : ""}
                      </span>
                    )}
                    {/* Titre */}
                    <span style={{
                      fontSize: isShort ? 9 : 10,
                      fontWeight: 600,
                      color: isDark ? "#c8c4be" : "#3a3028",
                      display: "block",
                      whiteSpace: isShort ? "nowrap" : "normal",
                      overflow: "hidden",
                      textOverflow: isShort ? "ellipsis" : "clip",
                      lineHeight: 1.3,
                    }}>
                      {s.title || s.name}
                    </span>
                    {/* Blocs */}
                    {!isShort && s.blocks && s.blocks.length > 0 && (
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

                  {/* Charge + bouton supprimer */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, color: getChargeColor(s.charge), fontWeight: 700, lineHeight: 1.2 }}>
                      â¡{s.charge}
                    </span>
                    {s.feedback && (
                      <span style={styles.feedbackDot} title="Feedback">{s.feedback.done ? "â" : "â"}</span>
                    )}
                    {pendingSuggestionsIds?.has(s.id) && (
                      <span style={{ fontSize: 8, background: "#f9731622", color: "#f97316", border: "1px solid #f9731655", borderRadius: 6, padding: "0 3px" }}>â</span>
                    )}
                    <button
                      style={{ ...styles.actionBtn, padding: "1px 3px", fontSize: 9, marginTop: "auto" }}
                      title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); setPendingDeleteIdx(s._origIdx); }}
                    >â</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ââ Pied : note + bouton ajouter ââ */}
      <div style={{ padding: "4px 6px 6px", flexShrink: 0, borderTop: `1px solid ${isDark ? "#1e221e" : "#e5e0da"}` }}>
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
              {noteText.length > 60 ? noteText.slice(0, 60) + "â¦" : noteText}
            </div>
          ) : (
            <div
              onClick={() => setNoteOpen(true)}
              style={{ fontSize: 9, color: isDark ? "#303530" : "#ccc8c0", cursor: "text", padding: "2px 3px", letterSpacing: "0.03em" }}
            >
              ï¼ note
            </div>
          )}
        </div>
        <button style={styles.addBtn} onClick={onAddSession}>
          <span style={styles.addBtnIcon}>ï¼</span>
          <span style={styles.addBtnLabel}>SÃ©ance</span>
        </button>
      </div>

      {pendingDeleteIdx !== null && (
        <ConfirmModal
          title="Supprimer cette sÃ©ance ?"
          sub={sessions[pendingDeleteIdx]?.name}
          onConfirm={() => onRemove(pendingDeleteIdx)}
          onClose={() => setPendingDeleteIdx(null)}
        />
      )}
    </div>
  );
}

// âââ CARTE SÃIANCE (mobile / liste) ââââââââââââââââââââââââââââââââââââââââââââ
function MobileSessionCard({ s, i, styles, isDark, meso, mesoColor, onOpenSession, pendingSuggestionsIds, onDelete }) {
  return (
    <div
      style={{ ...styles.sessionCard, cursor: "pointer" }}
      onClick={() => onOpenSession(i)}
    >
      <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
      <div style={styles.sessionCardContent}>
        {s.startTime && (
          <span style={{ fontSize: 9, color: isDark ? "#5a7860" : "#7a9a80", fontWeight: 600, marginBottom: 1, display: "block" }}>
            {s.startTime}{s.endTime ? ` â ${s.endTime}` : ""}
          </span>
        )}
        <span style={styles.sessionCardName}>{s.title || s.name}</span>

        {s.blocks && s.blocks.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
            {s.blocks.map((bl, bi) => {
              const cfg = BLOCK_TYPES[bl.type];
              if (!cfg) return null;
              return (
                <span key={bi} title={bl.type + (bl.name ? ` â ${bl.name}` : "")} style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 10,
                  background: cfg.color + "22", color: cfg.color, border: `1px solid ${cfg.color}44`, lineHeight: 1.6,
                }}>
                  {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                </span>
              );
            })}
          </div>
        )}

        {!s.blocks && s.isCustom && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
            <span style={styles.customBadge}>perso</span>
            {s.estimatedTime && (
              <span style={{ ...styles.customBadge, background: "none", borderColor: "transparent", color: styles.dashText }}>
                {s.estimatedTime}min
              </span>
            )}
            {meso && (
              <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>
                {meso}
              </span>
            )}
          </div>
        )}

        {s.coachNote && (
          <div style={{
            fontSize: 9, color: isDark ? "#a0b8a0" : "#4a7060", fontStyle: "italic",
            marginTop: 3, lineHeight: 1.4,
            borderLeft: `2px solid ${isDark ? "#3a6040" : "#a0c8a8"}`, paddingLeft: 5,
          }}>
            {s.coachNote}
          </div>
        )}

        <div style={styles.sessionCardFooter}>
          <span style={{ ...styles.sessionCardCharge, color: getChargeColor(s.charge) }}>â¡{s.charge}</span>
          {s.estimatedTime && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080" }}>{s.estimatedTime}min</span>}
          {s.feedback && <span style={styles.feedbackDot} title="Feedback enregistrÃ©">{s.feedback.done ? "â" : "â"}</span>}
          {pendingSuggestionsIds?.has(s.id) && (
            <span title="Suggestion de dÃ©placement en attente" style={{ fontSize: 9, background: "#f9731622", color: "#f97316", border: "1px solid #f9731655", borderRadius: 8, padding: "1px 5px", fontWeight: 700 }}>â</span>
          )}
        </div>
      </div>
      <div style={styles.sessionCardActions}>
        <button style={styles.actionBtn} title="Supprimer" onClick={(e) => { e.stopPropagation(); onDelete(); }}>â</button>
      </div>
    </div>
  );
}

// ─── CARTE SÉANCE RAPIDE ─────────────────────────────────────────────────────
function QuickSessionCard({ qs, isDark, onClick, onDelete }) {
  const accent = qs.color || "#60a5fa";
  return (
    <div
      style={{
        background: accent + (isDark ? "18" : "12"),
        border: `1px solid ${accent}55`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: "3px 6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
      onClick={onClick}
    >
      <span style={{
        fontSize: 9, fontWeight: 600,
        color: isDark ? "#c8c4be" : "#3a3028",
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {qs.name}
      </span>
      {qs.startTime && (
        <span style={{ fontSize: 9, color: accent, fontWeight: 600 }}>
          {qs.startTime}
        </span>
      )}
      <span style={{ fontSize: 8, color: accent, background: accent + "22", borderRadius: 8, padding: "0 4px" }}>
        ✎
      </span>
      <button
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: isDark ? "#5a5a5a" : "#aaa", padding: "0 2px", lineHeight: 1 }}
        title="Supprimer"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >×</button>
    </div>
  );
}

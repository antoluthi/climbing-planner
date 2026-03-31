import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES, getMesoColor } from "../lib/constants.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

const GUTTER_WIDTH = 26; // px pour les labels d'heure

// ─── BOUTON JOURNAL ───────────────────────────────────────────────────────────

function JournalButton({ logWarning, isToday, isDark, onOpenLog }) {
  const warn = logWarning?.hasWarning;
  const future = logWarning?.isFuture;
  const btnStyle = warn
    ? (isToday
        ? { background: "#ef444418", border: "2px solid #ef4444", color: "#ef4444", fontWeight: 700 }
        : { background: "#f9731618", border: "2px solid #f97316", color: "#f97316", fontWeight: 700 })
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
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        padding: "5px 8px", fontSize: 11, borderRadius: 6, lineHeight: 1,
        ...btnStyle,
      }}
    >
      <span style={{ fontSize: warn ? 13 : 11 }}>{warn ? "⚠" : "≡"}</span>
      <span>{warn ? (isToday ? "Compléter le journal" : "Journal incomplet") : (isToday ? "Journal du jour ✓" : "Journal")}</span>
    </button>
  );
}

// ─── COMPOSANT JOUR ───────────────────────────────────────────────────────────

export function DayColumn({ dayLabel, dateLabel, sessions, isToday, weekMeta, onAddSession, onOpenSession, onRemove, isMobile, hasCreatine, note, onSaveNote, logWarning, onOpenLog, pendingSuggestionsIds }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note || "");
  const noteRef = useRef(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);
  const timelineRef = useRef(null);
  const [timelineHeight, setTimelineHeight] = useState(400);

  useEffect(() => { if (!noteOpen) setNoteText(note || ""); }, [note, noteOpen]);
  useEffect(() => { if (noteOpen && noteRef.current) noteRef.current.focus(); }, [noteOpen]);

  // Mesure la hauteur réelle du conteneur timeline pour adapter le positionnement
  useEffect(() => {
    if (!timelineRef.current) return;
    const ro = new ResizeObserver(entries => {
      const h = entries[0].contentRect.height;
      if (h > 0) setTimelineHeight(h);
    });
    ro.observe(timelineRef.current);
    return () => ro.disconnect();
  }, []);

  const handleNoteBlur = () => {
    setNoteOpen(false);
    if (noteText !== (note || "")) onSaveNote?.(noteText);
  };

  // 1 minute → px dans la timeline (adaptatif selon hauteur réelle)
  const minutesToPx = (min) => (min / (24 * 60)) * timelineHeight;

  // Séances avec heure vs sans heure
  const timedSessions = [];
  const untimedSessions = [];
  sessions.forEach((s, i) => {
    if (s.startTime) timedSessions.push({ ...s, _origIdx: i });
    else untimedSessions.push({ ...s, _origIdx: i });
  });

  const noteAreaStyle = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#1a1f1c" : "#e4dfd6",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4, color: isDark ? "#d8d4ce" : "#2a2218",
    fontSize: 10, fontFamily: "inherit", lineHeight: 1.45,
    padding: "4px 6px", resize: "none", height: 46, outline: "none",
  };

  // ── VUE MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ ...styles.dayCol, ...(isToday ? styles.dayColToday : {}), ...styles.dayColMobile }}>
        <div style={styles.dayHeaderMobile}>
          <div style={styles.dayHeaderMobileLeft}>
            <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>{dayLabel}</span>
            <span style={styles.dayDate}>{dateLabel}</span>
          </div>
          {totalCharge > 0 && (
            <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>⚡{totalCharge}</span>
          )}
        </div>
        <div style={styles.sessionCards}>
          {sessions.map((s, i) => (
            <div key={i} style={{ ...styles.sessionCard, cursor: "pointer" }} onClick={() => onOpenSession(i)}>
              <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
              <div style={styles.sessionCardContent}>
                {s.startTime && (
                  <span style={{ fontSize: 9, color: isDark ? "#5a7860" : "#7a9a80", fontWeight: 600, marginBottom: 1, display: "block" }}>
                    {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                  </span>
                )}
                <span style={styles.sessionCardName}>{s.title || s.name}</span>
                <div style={styles.sessionCardFooter}>
                  <span style={{ ...styles.sessionCardCharge, color: getChargeColor(s.charge) }}>⚡{s.charge}</span>
                  {s.feedback && <span style={styles.feedbackDot} title="Feedback">{s.feedback.done ? "✓" : "✗"}</span>}
                  {pendingSuggestionsIds?.has(s.id) && (
                    <span style={{ fontSize: 9, background: "#f9731622", color: "#f97316", border: "1px solid #f9731655", borderRadius: 8, padding: "1px 5px" }}>↔</span>
                  )}
                </div>
              </div>
              <div style={styles.sessionCardActions}>
                <button style={styles.actionBtn} title="Supprimer" onClick={e => { e.stopPropagation(); setPendingDeleteIdx(i); }}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <button style={styles.addBtn} onClick={onAddSession}>
          <span style={styles.addBtnIcon}>＋</span>
          <span style={styles.addBtnLabel}>Séance</span>
        </button>
        {pendingDeleteIdx !== null && (
          <ConfirmModal title="Supprimer cette séance ?" sub={sessions[pendingDeleteIdx]?.name} onConfirm={() => onRemove(pendingDeleteIdx)} onClose={() => setPendingDeleteIdx(null)} />
        )}
      </div>
    );
  }

  // ── VUE DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      ...styles.dayCol,
      ...(isToday ? styles.dayColToday : {}),
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── En-tête ── */}
      <div style={{ ...styles.dayHeader, flexShrink: 0, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>{dayLabel}</span>
          <span style={styles.dayDate}>{dateLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 18 }}>
          {hasCreatine && (
            <span style={{ fontSize: 7, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", lineHeight: 1 }} title="Créatine">▲</span>
          )}
          {totalCharge > 0 && (
            <span style={{ ...styles.dayCharge, marginTop: 0, color: getChargeColor(totalCharge) }}>⚡{totalCharge}</span>
          )}
        </div>
      </div>

      {/* ── Journal ── */}
      <div style={{ padding: "0 6px 4px", flexShrink: 0 }}>
        <JournalButton logWarning={logWarning} isToday={isToday} isDark={isDark} onOpenLog={onOpenLog} />
      </div>

      {/* ── Séances sans heure (pills) ── */}
      {untimedSessions.length > 0 && (
        <div style={{ padding: "0 6px 3px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {untimedSessions.map((s) => (
            <div
              key={s._origIdx}
              style={{
                background: isDark ? "#1e231f" : "#f0ece4",
                border: `1px solid ${getChargeColor(s.charge)}33`,
                borderLeft: `3px solid ${getChargeColor(s.charge)}`,
                borderRadius: 4, padding: "2px 6px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
              onClick={() => onOpenSession(s._origIdx)}
            >
              <span style={{ fontSize: 9, fontWeight: 600, color: isDark ? "#c8c4be" : "#3a3028", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.title || s.name}
              </span>
              <span style={{ fontSize: 9, color: getChargeColor(s.charge), fontWeight: 700 }}>⚡{s.charge}</span>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#555" : "#aaa", fontSize: 9, padding: "0 2px" }}
                title="Supprimer"
                onClick={e => { e.stopPropagation(); setPendingDeleteIdx(s._origIdx); }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Timeline 24h — remplit l'espace disponible, pas de scroll ── */}
      <div
        ref={timelineRef}
        style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}
      >
        {/* Lignes horaires */}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            style={{
              position: "absolute",
              top: minutesToPx(h * 60),
              left: 0, right: 0,
              display: "flex", alignItems: "flex-start",
              pointerEvents: "none",
            }}
          >
            <span style={{
              fontSize: 7,
              color: isDark ? "#3a4040" : "#bcb8b0",
              width: GUTTER_WIDTH, textAlign: "right", paddingRight: 4,
              lineHeight: 1, flexShrink: 0, userSelect: "none", marginTop: -1,
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

        {/* Lignes demi-heures (pointillées) */}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={`hh${h}`}
            style={{
              position: "absolute",
              top: minutesToPx(h * 60 + 30),
              left: GUTTER_WIDTH, right: 0,
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
            <div style={{
              position: "absolute", top: nowPx,
              left: GUTTER_WIDTH - 5, right: 0,
              zIndex: 10, pointerEvents: "none",
              display: "flex", alignItems: "center",
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
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
          const height = Math.max(minutesToPx(duration), 18);
          const isShort = height < 34;
          return (
            <div
              key={s._origIdx}
              style={{
                position: "absolute",
                top, left: GUTTER_WIDTH + 2, right: 3,
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
                padding: isShort ? "1px 4px" : "2px 4px",
                zIndex: 2,
              }}
              onClick={() => onOpenSession(s._origIdx)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!isShort && (
                    <span style={{ fontSize: 8, color: isDark ? "#5a7860" : "#7a9a80", fontWeight: 600, display: "block", lineHeight: 1.3 }}>
                      {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                    </span>
                  )}
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
                  {!isShort && s.blocks && s.blocks.length > 0 && (
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                      {s.blocks.slice(0, 3).map((bl, bi) => {
                        const cfg = BLOCK_TYPES[bl.type];
                        if (!cfg) return null;
                        return (
                          <span key={bi} style={{
                            fontSize: 8, padding: "0px 3px", borderRadius: 8,
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
                  <span style={{ fontSize: 9, color: getChargeColor(s.charge), fontWeight: 700, lineHeight: 1.2 }}>⚡{s.charge}</span>
                  {s.feedback && (
                    <span style={{ fontSize: 8 }} title="Feedback">{s.feedback.done ? "✓" : "✗"}</span>
                  )}
                  {pendingSuggestionsIds?.has(s.id) && (
                    <span style={{ fontSize: 8, background: "#f9731622", color: "#f97316", border: "1px solid #f9731655", borderRadius: 6, padding: "0 3px" }}>↔</span>
                  )}
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", color: isDark ? "#555" : "#aaa", fontSize: 9, padding: "1px 2px", marginTop: "auto" }}
                    title="Supprimer"
                    onClick={e => { e.stopPropagation(); setPendingDeleteIdx(s._origIdx); }}
                  >✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pied : note + bouton ajouter ── */}
      <div style={{ padding: "3px 6px 5px", flexShrink: 0, borderTop: `1px solid ${isDark ? "#1e221e" : "#e5e0da"}` }}>
        <div style={{ marginBottom: 3 }}>
          {noteOpen ? (
            <textarea
              ref={noteRef}
              style={noteAreaStyle}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Note du jour..."
            />
          ) : noteText ? (
            <div
              onClick={() => setNoteOpen(true)}
              style={{
                fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", lineHeight: 1.4,
                cursor: "text", padding: "3px 5px", borderRadius: 4,
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
              ＋ note
            </div>
          )}
        </div>
        <button style={styles.addBtn} onClick={onAddSession}>
          <span style={styles.addBtnIcon}>＋</span>
          <span style={styles.addBtnLabel}>Séance</span>
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

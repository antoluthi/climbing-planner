import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES, getMesoColor } from "../lib/constants.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

// ─── COMPOSANT JOUR ───────────────────────────────────────────────────────────

export function DayColumn({ dayLabel, dateLabel, sessions, isToday, weekMeta, onAddSession, onOpenSession, onRemove, isMobile, hasCreatine, note, onSaveNote, logWarning, onOpenLog, pendingSuggestionsIds, deadlines, onDeadlineClick }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note || "");
  const noteRef = useRef(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);

  // Sync external note changes when not editing
  useEffect(() => { if (!noteOpen) setNoteText(note || ""); }, [note, noteOpen]);
  useEffect(() => { if (noteOpen && noteRef.current) noteRef.current.focus(); }, [noteOpen]);

  const handleNoteBlur = () => {
    setNoteOpen(false);
    if (noteText !== (note || "")) onSaveNote?.(noteText);
  };

  const noteAreaStyle = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#1a1f1c" : "#e4dfd6",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4, color: isDark ? "#d8d4ce" : "#2a2218",
    fontSize: 10, fontFamily: "inherit", lineHeight: 1.45,
    padding: "5px 7px", resize: "none", height: 56, outline: "none",
  };

  return (
    <div style={{
      ...styles.dayCol,
      ...(isToday ? styles.dayColToday : {}),
      ...(isMobile ? styles.dayColMobile : {}),
    }}>
      <div style={isMobile ? styles.dayHeaderMobile : styles.dayHeader}>
        <div style={isMobile ? styles.dayHeaderMobileLeft : undefined}>
          <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>{dayLabel}</span>
          <span style={styles.dayDate}>{dateLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {hasCreatine && (
            <span style={{ fontSize: 7, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", lineHeight: 1 }} title="Créatine">▲</span>
          )}
          {totalCharge > 0 && (
            <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>
              ⚡{totalCharge}
            </span>
          )}
        </div>
      </div>

      {/* ── Deadline bands ── */}
      {deadlines && deadlines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
          {deadlines.map(dl => {
            const typeLabel = { competition: "Compét.", sortie: "Sortie", objectif: "Objectif" }[dl.type] || dl.type;
            const tooltipParts = [dl.label, dl.startDate, dl.endDate ? `→ ${dl.endDate}` : null, dl.note || null].filter(Boolean);
            return (
              <div
                key={dl.id}
                title={tooltipParts.join(" · ")}
                onClick={onDeadlineClick ? () => onDeadlineClick(dl) : undefined}
                style={{
                  background: dl.color + (dl.priority === "C" ? "22" : dl.priority === "B" ? "33" : "44"),
                  borderLeft: `${dl.priority === "A" ? 3 : 2}px solid ${dl.color}`,
                  borderRadius: "0 3px 3px 0",
                  padding: "3px 6px",
                  display: "flex", flexDirection: "column", gap: 1,
                  cursor: onDeadlineClick ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: dl.priority === "A" ? 700 : 600, color: dl.color, letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                  {dl.priority === "A" ? "🏆 " : dl.priority === "B" ? "◆ " : "○ "}{dl.label}
                </span>
                {dl.note && !isMobile && (
                  <span style={{ fontSize: 8, color: dl.color + "cc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2, fontStyle: "italic" }}>
                    {dl.note.length > 40 ? dl.note.slice(0, 40) + "…" : dl.note}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Journal bar ── */}
      {(() => {
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
              padding: isMobile ? "6px 2px" : "7px 10px",
              fontSize: isMobile ? 10 : 11, borderRadius: 6, lineHeight: 1, marginBottom: 6,
              ...btnStyle,
            }}
          >
            <span style={{ fontSize: warn ? 13 : 11 }}>{warn ? "⚠" : "≡"}</span>
            {!isMobile && (
              <span>{warn ? (isToday ? "Compléter le journal" : "Journal incomplet") : (isToday ? "Journal du jour ✓" : "Journal")}</span>
            )}
          </button>
        );
      })()}
      <div style={styles.sessionCards}>
        {sessions.map((s, i) => (
          <div
            key={i}
            style={{ ...styles.sessionCard, cursor: "pointer" }}
            onClick={() => onOpenSession(i)}
          >
            <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
            <div style={styles.sessionCardContent}>
              {s.startTime && (
                <span style={{ fontSize: 9, color: isDark ? "#5a7860" : "#7a9a80", fontWeight: 600, marginBottom: 1, display: "block" }}>
                  {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                </span>
              )}
              <span style={styles.sessionCardName}>{s.title || s.name}</span>
              {/* Blocs de la séance (nouveau format) */}
              {s.blocks && s.blocks.length > 0 && (
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
                  {s.blocks.map((bl, bi) => {
                    const cfg = BLOCK_TYPES[bl.type];
                    if (!cfg) return null;
                    return (
                      <span key={bi} title={bl.type + (bl.name ? ` — ${bl.name}` : "")} style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 10,
                        background: cfg.color + "22", color: cfg.color,
                        border: `1px solid ${cfg.color}44`, lineHeight: 1.6,
                      }}>
                        {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Badges ancienne séance */}
              {!s.blocks && s.isCustom && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  <span style={styles.customBadge}>perso</span>
                  {s.estimatedTime && <span style={{ ...styles.customBadge, background: "none", borderColor: "transparent", color: styles.dashText }}>{s.estimatedTime}min</span>}
                  {meso && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{meso}</span>}
                </div>
              )}
              {s.coachNote && (
                <div style={{ fontSize: 9, color: isDark ? "#a0b8a0" : "#4a7060", fontStyle: "italic", marginTop: 3, lineHeight: 1.4, borderLeft: `2px solid ${isDark ? "#3a6040" : "#a0c8a8"}`, paddingLeft: 5 }}>
                  {s.coachNote}
                </div>
              )}
              <div style={styles.sessionCardFooter}>
                <span style={{ ...styles.sessionCardCharge, color: getChargeColor(s.charge) }}>⚡{s.charge}</span>
                {s.estimatedTime && !s.blocks && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080" }}>{s.estimatedTime}min</span>}
                {s.blocks && s.estimatedTime && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080" }}>{s.estimatedTime}min</span>}
                {s.feedback && (
                  <span style={styles.feedbackDot} title="Feedback enregistré">
                    {s.feedback.done ? "✓" : "✗"}
                  </span>
                )}
                {pendingSuggestionsIds?.has(s.id) && (
                  <span title="Suggestion de déplacement en attente" style={{ fontSize: 9, background: "#f9731622", color: "#f97316", border: "1px solid #f9731655", borderRadius: 8, padding: "1px 5px", fontWeight: 700 }}>
                    ↔
                  </span>
                )}
              </div>
            </div>
            <div style={styles.sessionCardActions}>
              <button style={styles.actionBtn} title="Supprimer" onClick={e => { e.stopPropagation(); setPendingDeleteIdx(i); }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Note du jour ── */}
      {!isMobile && (
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          {noteOpen ? (
            <textarea ref={noteRef} style={noteAreaStyle} value={noteText}
              onChange={e => setNoteText(e.target.value)} onBlur={handleNoteBlur}
              placeholder="Note du jour..." />
          ) : noteText ? (
            <div onClick={() => setNoteOpen(true)} style={{
              fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", lineHeight: 1.4,
              cursor: "text", padding: "4px 6px", borderRadius: 4,
              borderLeft: `2px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
              background: isDark ? "#1a1f1c55" : "#e4dfd655",
              wordBreak: "break-word",
            }}>
              {noteText.length > 70 ? noteText.slice(0, 70) + "…" : noteText}
            </div>
          ) : (
            <div onClick={() => setNoteOpen(true)} style={{
              fontSize: 9, color: isDark ? "#303530" : "#ccc8c0",
              cursor: "text", padding: "2px 4px", letterSpacing: "0.03em",
            }}>
              ＋ note
            </div>
          )}
        </div>
      )}

      <button style={{ ...styles.addBtn, marginTop: noteOpen || noteText ? 6 : 0 }} onClick={onAddSession}>
        <span style={styles.addBtnIcon}>＋</span>
        <span style={styles.addBtnLabel}>Séance</span>
      </button>

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

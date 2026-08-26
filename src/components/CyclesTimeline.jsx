import { useState, useRef, useEffect, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { mesoEndDate, recomputeMesoDates } from "../lib/cycles.js";
import { ReminderModal } from "./ReminderModal.jsx";
import {
  getReminderCompletionRate,
  formatRecurrence,
  DAY_NAMES_SHORT,
} from "../lib/reminders.js";
import { colors } from "../theme/palette.js";
import { PageTitle, SecondaryButton } from "./ui/Ascent.jsx";
import { MesoDetailModal } from "./MesoDetailModal.jsx";

// ─── CYCLES TIMELINE ─────────────────────────────────────────────────────────

export function CyclesTimeline({
  mesocycles, customCycles, objectives, onEdit,
  reminders = [], reminderState = {},
  onAddReminder, onUpdateReminder, onDeleteReminder,
  canEditReminders = true,
  // Les rappels sont des habitudes personnelles, pas le plan : la vue publique
  // affiche les cycles sans eux.
  showReminders = true,
}) {
  const { styles, isDark } = useThemeCtx();
  // Le détail d'un bloc s'ouvre en modale : une bulle ne tenait ni l'objectif
  // du mésocycle ni ceux de ses microcycles.
  const [detail, setDetail] = useState(null); // { meso, microId }
  const [editingReminder, setEditingReminder] = useState(null); // null | {} | reminder

  // Measure actual container width to compute pixel-accurate text truncation
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Return how many chars of `label` fit in `px` pixels, or null if none
  const fitLabel = (label, px) => {
    const avail = px - 12; // subtract 6px left+right padding
    const charW = 5.5;     // ~5.5 px per char at font-size 9
    if (avail < charW) return null;
    const maxChars = Math.floor(avail / charW);
    if (maxChars >= label.length) return label;
    if (maxChars <= 1) return label.charAt(0);
    return label.slice(0, maxChars - 1) + "…";
  };

  // Les dates viennent de la même règle que l'éditeur : l'ancre, puis les
  // durées. Un plan partiellement daté s'affiche donc chaîné — sans que rien
  // ne soit réécrit dans les données.
  const chainedMesos = useMemo(() => recomputeMesoDates(mesocycles).map(meso => ({
    ...meso,
    computedStart: meso.startDate ? new Date(meso.startDate + "T00:00:00") : null,
    computedEnd: mesoEndDate(meso),
  })), [mesocycles]);

  const maxMesoWeeks = Math.max(...mesocycles.map(m => m.durationWeeks), 1);

  // Custom cycle duration in weeks
  const ccWithDuration = (customCycles || []).map(cc => {
    let weeks = 0;
    if (cc.isRepetitive) {
      weeks = (cc.onWeeks || 0) + (cc.offWeeks || 0);
    } else if (cc.startDate && cc.endDate) {
      const s = new Date(cc.startDate + "T00:00:00");
      const e = new Date(cc.endDate + "T00:00:00");
      weeks = Math.max(1, Math.round((e - s) / (7 * 24 * 3600 * 1000)));
    }
    return { ...cc, durationWeeks: weeks };
  });

  const fmtDate = d => d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;

  const openDetail = (e, meso, micro) => {
    e?.stopPropagation();
    setDetail({ meso, microId: micro?.id ?? null });
  };

  return (
    <div ref={containerRef} style={styles.timelineWrap}>
      {/* Titre de page — même facture que l'accueil et le calendrier */}
      <PageTitle
        isDark={isDark}
        style={{ marginBottom: 24 }}
        right={onEdit && (
          <SecondaryButton isDark={isDark} height={36} onClick={onEdit}
                           style={{ width: "auto", padding: "0 18px" }}>
            Modifier
          </SecondaryButton>
        )}
      >
        Cycles
      </PageTitle>

      {mesocycles.length > 0 && (
        <div style={{ fontSize: 12, color: colors(isDark).textMuted, marginTop: -14, marginBottom: 18 }}>
          Touchez un bloc pour lire son objectif et le détail de ses microcycles.
        </div>
      )}

      {/* Empty state */}
      {mesocycles.length === 0 && (
        <div style={{ color: colors(isDark).textMuted, fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
          {onEdit ? "Aucun mésocycle défini. Cliquez sur Modifier pour commencer." : "Aucun mésocycle défini."}
        </div>
      )}

      {/* Mésocycles */}
      {chainedMesos.map(meso => {
        const barPct = (meso.durationWeeks / maxMesoWeeks) * 100;
        const totalMicroWeeks = meso.microcycles.reduce((a, m) => a + m.durationWeeks, 0);
        const hasMicros = meso.microcycles.length > 0;
        // Pixel width of this meso's bar (label col = 148px)
        const barAreaPx = Math.max(0, containerWidth - 148);
        const barPx = barAreaPx * (barPct / 100);
        const startLabel = fmtDate(meso.computedStart);

        // Today indicator — position within this meso's bar
        let todayPct = null;
        if (meso.computedStart && meso.computedEnd) {
          const now = new Date(); now.setHours(0, 0, 0, 0);
          const s = new Date(meso.computedStart); s.setHours(0, 0, 0, 0);
          const e = new Date(meso.computedEnd); e.setHours(0, 0, 0, 0);
          if (now >= s && now < e) {
            const msPerDay = 864e5;
            todayPct = ((now - s) / msPerDay) / (meso.durationWeeks * 7) * 100;
          }
        }

        // Check if any objectives fall in this meso
        const hasObjectives = meso.computedStart && meso.computedEnd && (objectives || []).some(obj => {
          if (!obj.startDate) return false;
          const objDate = new Date(obj.startDate + "T00:00:00");
          const mesoS = new Date(meso.computedStart); mesoS.setHours(0,0,0,0);
          const mesoE = new Date(meso.computedEnd); mesoE.setHours(0,0,0,0);
          return objDate >= mesoS && objDate < mesoE;
        });

        return (
          <div
            key={meso.id}
            onClick={e => openDetail(e, meso, null)}
            title={`${meso.label} — voir le détail`}
            style={{ ...styles.timelineRow, marginBottom: hasObjectives ? 18 : undefined, cursor: "pointer" }}
          >
            {/* Label */}
            <div style={styles.timelineLabelCol}>
              <div style={styles.timelineLabelName}>
                <div style={{ ...styles.timelineLabelDot, background: meso.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meso.label}</span>
              </div>
              <div style={styles.timelineLabelMeta}>
                {meso.durationWeeks} sem.
                {startLabel && <span style={{ color: colors(isDark).borderStrong }}> · {startLabel}</span>}
              </div>
            </div>

            {/* Bar */}
            <div style={styles.timelineBarArea}>
              <div style={{
                ...styles.timelineBar,
                width: `${barPct}%`,
                background: meso.color + (isDark ? "18" : "12"),
                borderColor: meso.color + "55",
              }}>
                {/* Today line */}
                {todayPct !== null && (
                  <div style={{
                    position: "absolute", left: `${todayPct}%`,
                    top: -1, bottom: -1, width: 2,
                    background: colors(isDark).danger,
                    boxShadow: `0 0 4px ${colors(isDark).dangerBorder}`,
                    borderRadius: 1, zIndex: 5, pointerEvents: "none",
                  }} />
                )}

                {/* Objective markers on this meso bar */}
                {meso.computedStart && meso.computedEnd && (objectives || []).map(obj => {
                  if (!obj.startDate) return null;
                  const objDate = new Date(obj.startDate + "T00:00:00");
                  const mesoS = new Date(meso.computedStart); mesoS.setHours(0,0,0,0);
                  const mesoE = new Date(meso.computedEnd); mesoE.setHours(0,0,0,0);
                  if (objDate < mesoS || objDate >= mesoE) return null;
                  const msPerDay = 864e5;
                  const pct = ((objDate - mesoS) / msPerDay) / (meso.durationWeeks * 7) * 100;
                  const objColor = obj.color || colors(isDark).warn;
                  const objLabel = obj.name;
                  const fmtObj = objDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                  return (
                    <div key={obj.id} style={{ position: "absolute", left: `${pct}%`, top: -6, bottom: -6, zIndex: 6, pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center" }} title={`${objLabel} — ${fmtObj}`}>
                      <div style={{
                        width: 2, height: "100%", background: objColor, borderRadius: 1,
                      }} />
                      <div style={{
                        position: "absolute", bottom: -14,
                        fontSize: 7, fontWeight: 700, color: objColor, whiteSpace: "nowrap",
                        background: colors(isDark).bgScrim,
                        padding: "1px 4px", borderRadius: 3, border: `1px solid ${objColor}44`,
                        letterSpacing: "0.02em", lineHeight: 1.3,
                        transform: "translateX(-50%)",
                        maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {objLabel}
                      </div>
                    </div>
                  );
                })}
                {!hasMicros ? (
                  // No microcycles — single undivided block
                  <div
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
                    onClick={e => openDetail(e, meso, null)}
                  >
                    <span style={{ fontSize: 10, color: meso.color, opacity: 0.75, fontWeight: 500 }}>
                      {fitLabel(meso.description || `${meso.durationWeeks}s`, barPx) || `${meso.durationWeeks}s`}
                    </span>
                  </div>
                ) : (
                  meso.microcycles.map((micro, mi) => {
                    const ref = totalMicroWeeks > 0 ? totalMicroWeeks : meso.durationWeeks;
                    const microPct = (micro.durationWeeks / ref) * 100;
                    const isLast = mi === meso.microcycles.length - 1;
                    const segPx = barPx * (microPct / 100);
                    const isNarrow = segPx < 18;
                    const label = fitLabel(micro.label, segPx);
                    const showSub = segPx >= 28 && label;
                    return (
                      <div
                        key={micro.id}
                        title={`${micro.label} · ${micro.durationWeeks}s`}
                        style={{
                          ...styles.timelineMicroSeg,
                          width: `${microPct}%`,
                          borderRightColor: isLast ? "transparent" : meso.color + "44",
                        }}
                        onClick={e => openDetail(e, meso, micro)}
                      >
                        {isNarrow ? (
                          <div style={{ width: 3, height: 12, borderRadius: 2, background: meso.color, opacity: 0.5 }} />
                        ) : (
                          <div>
                            <div style={{ ...styles.timelineMicroLabel, color: meso.color }}>
                              {label}
                            </div>
                            {showSub && <div style={{ ...styles.timelineMicroSub, color: meso.color }}>{micro.durationWeeks}s</div>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Custom cycles */}
      {ccWithDuration.length > 0 && (
        <>
          <div style={styles.timelineSectionSep}>Cycles personnalisés</div>
          {ccWithDuration.map(cc => {
            const barPct = Math.min(100, (cc.durationWeeks / maxMesoWeeks) * 100);
            const label = cc.isRepetitive
              ? `Répétitif · ${cc.onWeeks}s ON / ${cc.offWeeks}s OFF`
              : `${cc.durationWeeks} sem.`;
            const ccBarPx = Math.max(0, containerWidth - 148) * Math.max(barPct, 4) / 100;
            const ccBarText = cc.isRepetitive ? `${cc.onWeeks}s ON / ${cc.offWeeks}s OFF` : `${cc.durationWeeks}s`;
            return (
              <div key={cc.id} style={styles.timelineCustomRow}>
                <div style={{ ...styles.timelineLabelCol }}>
                  <div style={styles.timelineLabelName}>
                    <div style={{ width: 9, height: 4, borderRadius: 2, background: cc.color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cc.name}</span>
                  </div>
                  <div style={styles.timelineLabelMeta}>{label}</div>
                </div>
                <div style={styles.timelineBarArea}>
                  <div style={{
                    ...styles.timelineCustomBar,
                    width: `${Math.max(barPct, 4)}%`,
                    background: cc.color + "25",
                    borderColor: cc.color + "60",
                  }}>
                    <span style={{ fontSize: 9, color: cc.color, fontWeight: 600, overflow: "hidden" }}>
                      {fitLabel(ccBarText, ccBarPx) || ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}


      {showReminders && (<>
        {/* ── Rappels journaliers (lecture + édition rapide) ── */}
        <div style={styles.timelineSectionSep}>Rappels journaliers</div>
        {reminders.length === 0 && (
          <div style={{ color: colors(isDark).textMuted, fontSize: 12, fontStyle: "italic", textAlign: "center", paddingTop: 8, paddingBottom: 8 }}>
            {canEditReminders
              ? "Aucun rappel. Tape « + Nouveau rappel » pour en créer un."
              : "Aucun rappel."}
          </div>
        )}
        {reminders.map(rem => (
          <TimelineReminderRow
            key={rem.id}
            reminder={rem}
            completionRate={getReminderCompletionRate(rem, reminderState, new Date())}
            isDark={isDark}
            disabled={!canEditReminders}
            onClick={() => canEditReminders && setEditingReminder(rem)}
          />
        ))}
        {canEditReminders && (
          <button
            style={{ ...styles.cycleAddMesoBtn, marginTop: 8 }}
            onClick={() => setEditingReminder({})}
          >＋ Nouveau rappel</button>
        )}
      </>)}

      {editingReminder && (
        <ReminderModal
          reminder={editingReminder.id ? editingReminder : null}
          onSave={r => {
            if (editingReminder.id) onUpdateReminder?.(r);
            else onAddReminder?.(r);
            setEditingReminder(null);
          }}
          onDelete={onDeleteReminder ? id => { onDeleteReminder(id); setEditingReminder(null); } : undefined}
          onClose={() => setEditingReminder(null)}
        />
      )}

      {detail && (
        <MesoDetailModal
          meso={detail.meso}
          focusMicroId={detail.microId}
          onClose={() => setDetail(null)}
        />
      )}

    </div>
  );
}

// ─── TimelineReminderRow ─────────────────────────────────────────────────────
function TimelineReminderRow({ reminder, completionRate, isDark, disabled, onClick }) {
  const text     = colors(isDark).text;
  const textMid  = colors(isDark).textCard;
  const textLight= colors(isDark).textMuted;
  const border   = colors(isDark).borderSubtle;
  const surface  = colors(isDark).card;
  const surface2 = colors(isDark).surface;
  const accent   = colors(isDark).accent;

  const isDaily = reminder.recurrence?.kind !== "weekdays";
  const activeDays = isDaily ? [0, 1, 2, 3, 4, 5, 6] : (reminder.recurrence?.days || []);
  const pct = Math.round((completionRate || 0) * 100);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        background: surface,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        textAlign: "left", width: "100%",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = accent + "88"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; }}
    >
      <div style={{ width: 6, height: 44, borderRadius: 3, background: reminder.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: text, lineHeight: 1.2 }}>
          {reminder.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => {
              const active = activeDays.includes(d);
              return (
                <span
                  key={d}
                  style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: active ? reminder.color + (isDark ? "" : "cc") : surface2,
                    color: active ? (colors(isDark).card) : textLight,
                    fontSize: 8, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >{DAY_NAMES_SHORT[d]}</span>
              );
            })}
          </div>
          <span style={{ fontSize: 11, color: textMid }}>{formatRecurrence(reminder.recurrence)}</span>
        </div>
        {(reminder.startDate || reminder.endDate) && (
          <div style={{ fontSize: 10, color: textLight, marginTop: 3 }}>
            {reminder.startDate ? `Du ${reminder.startDate}` : "Sans début"}
            {reminder.endDate   ? ` au ${reminder.endDate}` : reminder.startDate ? " · sans fin" : ""}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
        <span style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 17, fontWeight: 700, color: reminder.color,
          lineHeight: 1,
        }}>
          {pct}%
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, color: textLight,
          letterSpacing: "0.06em", textTransform: "uppercase",
          marginTop: 4,
        }}>
          30 derniers j.
        </span>
      </div>
    </button>
  );
}

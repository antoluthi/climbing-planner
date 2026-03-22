import { useState, useRef, useEffect, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { addDays } from "../lib/helpers.js";

// ─── CYCLES TIMELINE ─────────────────────────────────────────────────────────

export function CyclesTimeline({ mesocycles, customCycles, deadlines, onEdit }) {
  const { styles, isDark } = useThemeCtx();
  const [popover, setPopover] = useState(null); // { meso, micro, x, y }

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

  // Chain start dates: if a meso has no startDate, pick up from previous end
  const chainedMesos = useMemo(() => {
    let runningDate = null;
    return mesocycles.map(meso => {
      const start = meso.startDate ? new Date(meso.startDate + "T00:00:00") : runningDate;
      const end = start ? addDays(start, meso.durationWeeks * 7) : null;
      runningDate = end;
      return { ...meso, computedStart: start, computedEnd: end };
    });
  }, [mesocycles]);

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
  const accent = isDark ? "#c8906a" : "#8b4c20";

  const handleMicroClick = (e, meso, micro) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ meso, micro, x: rect.left, y: rect.bottom + 6 });
  };

  return (
    <div ref={containerRef} style={styles.timelineWrap} onClick={() => setPopover(null)}>
      {/* Top bar */}
      <div style={styles.timelineTopBar}>
        <span style={styles.timelineTitle}>Planification</span>
        {onEdit && <button style={styles.timelineEditBtn} onClick={onEdit}>Modifier</button>}
      </div>

      {/* Empty state */}
      {mesocycles.length === 0 && (
        <div style={{ color: isDark ? "#5a6060" : "#9a9890", fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
          {onEdit ? "Aucun mésocycle défini. Cliquez sur Modifier pour commencer." : "Aucun mésocycle défini."}
        </div>
      )}

      {/* ── Mésocycles ── */}
      {(() => {
        // Compute timeline span for positioning deadline markers
        const tStart = chainedMesos.map(m => m.computedStart).filter(Boolean).reduce((min, d) => d < min ? d : min, Infinity);
        const tEnd   = chainedMesos.map(m => m.computedEnd).filter(Boolean).reduce((max, d) => d > max ? d : max, -Infinity);
        const hasRange = isFinite(tStart) && isFinite(tEnd) && tEnd > tStart;
        const barAreaPx = Math.max(0, containerWidth - 148);

        // Deadline markers — position relative to the bar area (no label column offset)
        const dlMarkers = hasRange ? (deadlines || []).filter(dl => dl.startDate).map(dl => {
          const dlDate = new Date(dl.startDate + "T00:00:00");
          const pct = (dlDate - tStart) / (tEnd - tStart);
          if (pct < -0.05 || pct > 1.05) return null;
          const posX = barAreaPx * Math.max(0, Math.min(1, pct));
          return { ...dl, posX };
        }).filter(Boolean) : [];

        return (
          <>
            {/* Meso rows */}
            {chainedMesos.map((meso, idx) => {
        const barPct = (meso.durationWeeks / maxMesoWeeks) * 100;
        const totalMicroWeeks = meso.microcycles.reduce((a, m) => a + m.durationWeeks, 0);
        const hasMicros = meso.microcycles.length > 0;
        // Pixel width of this meso's bar (label col = 148px)
        const barAreaPx = Math.max(0, containerWidth - 148);
        const barPx = barAreaPx * (barPct / 100);
        const startLabel = fmtDate(meso.computedStart);
        const endLabel = fmtDate(meso.computedEnd);

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

        return (
          <div key={meso.id} style={styles.timelineRow}>
            {/* Label */}
            <div style={styles.timelineLabelCol}>
              <div style={styles.timelineLabelName}>
                <div style={{ ...styles.timelineLabelDot, background: meso.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meso.label}</span>
              </div>
              <div style={styles.timelineLabelMeta}>
                {meso.durationWeeks} sem.
                {startLabel && <span style={{ color: isDark ? "#4a5050" : "#b0a898" }}> · {startLabel}</span>}
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
                    background: "#ef4444",
                    boxShadow: "0 0 4px #ef444488",
                    borderRadius: 1, zIndex: 5, pointerEvents: "none",
                  }} />
                )}
                {!hasMicros ? (
                  // No microcycles — single undivided block
                  <div
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
                    onClick={e => handleMicroClick(e, meso, null)}
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
                        onClick={e => handleMicroClick(e, meso, micro)}
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

            {/* ── Dedicated Échéances row ── */}
            {dlMarkers.length > 0 && (
              <div style={{ ...styles.timelineRow, marginBottom: 8 }}>
                <div style={styles.timelineLabelCol}>
                  <div style={styles.timelineLabelName}>
                    <span style={{ fontSize: 10, color: isDark ? "#5a6060" : "#9a9890", letterSpacing: "0.05em", fontStyle: "italic" }}>Échéances</span>
                  </div>
                </div>
                <div style={{ ...styles.timelineBarArea, position: "relative", minHeight: 40, alignItems: "flex-start" }}>
                  {dlMarkers.map(dl => {
                    const lineW = dl.priority === "A" ? 2 : dl.priority === "B" ? 1.5 : 1;
                    const tip = [dl.label, dl.note].filter(Boolean).join(" · ");
                    return (
                      <div key={dl.id} title={tip} style={{
                        position: "absolute",
                        left: dl.posX,
                        top: 0, bottom: 0,
                        width: lineW,
                        background: dl.color + (dl.priority === "C" ? "88" : "cc"),
                        boxShadow: dl.priority === "A" ? `0 0 6px ${dl.color}66` : "none",
                        pointerEvents: "none",
                        display: "flex", flexDirection: "column", alignItems: "center",
                      }}>
                        <div style={{
                          width: dl.priority === "A" ? 8 : 6,
                          height: dl.priority === "A" ? 8 : 6,
                          background: dl.color,
                          transform: "rotate(45deg)",
                          flexShrink: 0,
                          marginTop: 2,
                          opacity: dl.priority === "C" ? 0.6 : 1,
                        }} />
                        <span style={{
                          position: "absolute",
                          top: 13,
                          left: 3,
                          fontSize: 8,
                          fontWeight: dl.priority === "A" ? 700 : 600,
                          color: dl.color,
                          writingMode: "vertical-lr",
                          textOrientation: "mixed",
                          whiteSpace: "nowrap",
                          letterSpacing: "0.04em",
                          lineHeight: 1,
                          opacity: dl.priority === "C" ? 0.75 : 1,
                          userSelect: "none",
                        }}>
                          {dl.priority === "A" ? "🏆 " : dl.priority === "B" ? "◆ " : "○ "}{dl.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        );
      })()}

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

      {/* Deadlines legend — liste compacte sous les cycles, les lignes verticales sont dans le bloc mesos */}
      {(deadlines || []).length > 0 && (
        <>
          <div style={styles.timelineSectionSep}>Échéances</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(deadlines || []).map(dl => {
              const fmtDl = d => d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : null;
              const dateLabel = dl.endDate ? `${fmtDl(dl.startDate)} → ${fmtDl(dl.endDate)}` : fmtDl(dl.startDate);
              const priorityLabel = dl.priority === "A" ? "🏆" : dl.priority === "B" ? "◆" : "○";
              return (
                <div key={dl.id} style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 1, background: dl.color, transform: "rotate(45deg)", flexShrink: 0, opacity: dl.priority === "C" ? 0.6 : 1 }} />
                  <span style={{ fontSize: 11, fontWeight: dl.priority === "A" ? 700 : 500, color: isDark ? "#c8c0b4" : "#3a3028" }}>
                    {priorityLabel} {dl.label}
                  </span>
                  <span style={{ fontSize: 10, color: isDark ? "#4a5050" : "#b0a898" }}>{dateLabel}</span>
                  {dl.note && <span style={{ fontSize: 10, color: isDark ? "#4a5050" : "#b0a898", fontStyle: "italic" }}>· {dl.note}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Popover */}
      {popover && (
        <div style={styles.timelinePopoverWrap} onClick={() => setPopover(null)}>
          <div
            style={{ ...styles.timelinePopover, left: Math.min(popover.x, window.innerWidth - 260), top: popover.y }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: popover.meso.color }} />
              <span style={styles.timelinePopoverTitle}>{popover.meso.label}</span>
            </div>
            {popover.micro ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#d0d8d0" : "#4a5050", marginBottom: 4 }}>
                  {popover.micro.label}
                </div>
                <div style={styles.timelinePopoverMeta}>{popover.micro.durationWeeks} semaine{popover.micro.durationWeeks > 1 ? "s" : ""}</div>
                {popover.micro.description && <div style={{ ...styles.timelinePopoverMeta, marginTop: 4, fontStyle: "italic" }}>{popover.micro.description}</div>}
              </>
            ) : (
              <>
                <div style={styles.timelinePopoverMeta}>{popover.meso.durationWeeks} semaines</div>
                {popover.meso.description && <div style={{ ...styles.timelinePopoverMeta, marginTop: 4, fontStyle: "italic" }}>{popover.meso.description}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

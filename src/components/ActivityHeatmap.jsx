import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getMondayOf, addDays, localDateStr } from "../lib/helpers.js";
import {
  getActiveRemindersForDate,
  isReminderCheckedOn,
  countMissedRemindersOn,
} from "../lib/reminders.js";

function hooperLabel(total) {
  if (total <= 10) return "Bien récupéré";
  if (total <= 14) return "Récupération normale";
  if (total <= 17) return "Attention fatigue";
  if (total <= 20) return "Fatigue élevée";
  return "Repos recommandé";
}

// ─── ACTIVITY HEATMAP (GitHub-style) ──────────────────────────────────────────

export function ActivityHeatmap({ data }) {
  const { styles, isDark } = useThemeCtx();
  const [metric, setMetric] = useState("charge"); // "charge" | "rpe" | "hooper" | "reminders"
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build per-day data from sessions
  const dayData = {};
  Object.entries(data.weeks || {}).forEach(([key, days]) => {
    const monday = new Date(key + "T12:00:00");
    (days || []).forEach((daySessions, idx) => {
      const d = addDays(monday, idx);
      const dateStr = d.toISOString().slice(0, 10);
      const sessions = (daySessions || []).filter(Boolean);
      const charge = sessions.reduce((s, se) => s + (se.charge || 0), 0);
      const done = sessions.filter(s => s.feedback?.done === true);
      const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
      const avgRpe = rpeVals.length ? rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length : null;
      dayData[dateStr] = { charge, avgRpe, sessionCount: sessions.length };
    });
  });
  (data.hooper || []).forEach(h => {
    if (!dayData[h.date]) dayData[h.date] = { charge: 0, avgRpe: null, sessionCount: 0 };
    dayData[h.date].hooper = h.total;
  });

  // 53 weeks ending with the week that contains today
  const endMonday = getMondayOf(today);
  const startMonday = getMondayOf(addDays(endMonday, -52 * 7));
  const WEEKS = 53;

  const reminders = data.reminders || [];
  const reminderState = data.reminderState || {};

  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    return Array.from({ length: 7 }, (_, d) => {
      const date = addDays(startMonday, w * 7 + d);
      const dateStr = localDateStr(date);
      const entry = dayData[dateStr] || { charge: 0, avgRpe: null, sessionCount: 0, hooper: null };
      // Rappels du jour (actifs ce jour-là)
      const active = getActiveRemindersForDate(reminders, date);
      const remindersActive = active.length;
      const remindersMissed = active.filter(r => !isReminderCheckedOn(reminderState, r.id, dateStr)).length;
      const remindersDetail = active.map(r => ({
        id: r.id, name: r.name, color: r.color,
        checked: isReminderCheckedOn(reminderState, r.id, dateStr),
      }));
      return {
        date, dateStr,
        isFuture: date > today,
        remindersActive, remindersMissed, remindersDetail,
        ...entry,
      };
    });
  });

  // Color per metric
  const getColor = (day) => {
    const empty = isDark ? "#1c2a22" : "#eaefec";
    const future = isDark ? "#161e1a" : "#f3f5f4";
    if (day.isFuture) return future;
    if (metric === "charge") {
      const v = day.charge || 0;
      if (v === 0) return empty;
      const lvls = isDark
        ? ["#3a1e0a", "#5a3010", "#8a5020", "#c8906a", "#e8c0a0"]
        : ["#e8d8c8", "#d0a878", "#b07840", "#8b4c20", "#5c3010"];
      if (v <= 5) return lvls[0];
      if (v <= 12) return lvls[1];
      if (v <= 20) return lvls[2];
      if (v <= 30) return lvls[3];
      return lvls[4];
    }
    if (metric === "rpe") {
      const v = day.avgRpe;
      if (v == null) return empty;
      const lvls = isDark
        ? ["#3a2010", "#6b3a10", "#b45309", "#f97316", "#fbbf24"]
        : ["#fde8c8", "#fbc87a", "#f97316", "#ea580c", "#c2410c"];
      if (v <= 4) return lvls[0];
      if (v <= 6) return lvls[1];
      if (v <= 7.5) return lvls[2];
      if (v <= 8.5) return lvls[3];
      return lvls[4];
    }
    if (metric === "hooper") {
      const v = day.hooper;
      if (v == null) return empty;
      // Hooper: low=good (green), high=bad (red)
      if (v <= 10) return isDark ? "#14532d" : "#bbf7d0";
      if (v <= 14) return isDark ? "#4ade80" : "#4abe80";
      if (v <= 17) return isDark ? "#ca8a04" : "#fbbf24";
      if (v <= 20) return isDark ? "#ea580c" : "#f97316";
      return isDark ? "#dc2626" : "#ef4444";
    }
    if (metric === "reminders") {
      // Aucun rappel actif ce jour-là → vide (rien à montrer)
      if (day.remindersActive === 0) return empty;
      const m = day.remindersMissed;
      if (m === 0) return isDark ? "#82c894" : "#bbf7d0";  // tout coché → vert
      if (m === 1) return isDark ? "#e6c46a" : "#fbbf24";  // 1 manqué → ambre
      if (m === 2) return isDark ? "#f0a060" : "#f97316";  // 2 manqués → orange
      return isDark ? "#f08070" : "#ef4444";               // 3+ → corail
    }
    return empty;
  };

  const CELL = 11;
  const GAP = 2;
  const DAY_LABELS = ["L", "", "M", "", "J", "", "D"];
  const DAY_COL_W = 14 + 4; // day-label column width + margin
  // Fit as many weeks as the container allows; always show the most recent ones
  const maxWeeks = containerWidth > 0
    ? Math.min(53, Math.max(4, Math.floor((containerWidth - DAY_COL_W) / (CELL + GAP))))
    : 53;

  // Legend colors per metric
  const legendColors = {
    charge: isDark
      ? ["#1c1612", "#3a1e0a", "#5a3010", "#8a5020", "#c8906a"]
      : ["#f0ebe2", "#e8d8c8", "#d0a878", "#b07840", "#8b4c20"],
    rpe: isDark
      ? ["#1c2a22", "#3a2010", "#6b3a10", "#b45309", "#f97316"]
      : ["#eaefec", "#fde8c8", "#fbc87a", "#f97316", "#ea580c"],
    hooper: isDark
      ? ["#1c2a22", "#14532d", "#4ade80", "#ca8a04", "#dc2626"]
      : ["#eaefec", "#bbf7d0", "#4abe80", "#fbbf24", "#ef4444"],
    reminders: isDark
      ? ["#2e2419", "#82c894", "#e6c46a", "#f0a060", "#f08070"]
      : ["#eaefec", "#bbf7d0", "#fbbf24", "#f97316", "#ef4444"],
  };

  const muted = isDark ? "#5a7a62" : "#8a9e90";

  const visibleWeeks = weeks.slice(-maxWeeks);
  // Recompute month labels for the visible slice
  const visibleMonthLabels = [];
  visibleWeeks.forEach((week, wi) => {
    const d = week[0].date;
    if (wi === 0 || d.getDate() <= 7) {
      const prev = visibleMonthLabels[visibleMonthLabels.length - 1];
      if (!prev || wi - prev.wi >= 3)
        visibleMonthLabels.push({ wi, label: d.toLocaleDateString("fr-FR", { month: "short" }) });
    }
  });

  return (
    <div style={styles.dashSection} ref={containerRef}>
      {/* Title */}
      <div style={styles.dashSectionTitle}>Activité</div>
      {/* Metric selector — own row, below title */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[["charge", "Charge"], ["rpe", "RPE"], ["hooper", "Hooper"], ["reminders", "Rappels"]].map(([k, l]) => (
          <button key={k} onClick={() => setMetric(k)}
            style={{ ...styles.viewToggleBtn, ...(metric === k ? styles.viewToggleBtnActive : {}), padding: "3px 9px", fontSize: 10 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Grid — no overflow, sized to container */}
      <div style={{ display: "flex", gap: 0 }}>
        {/* Day labels column */}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP, paddingTop: 18, marginRight: 4, flexShrink: 0 }}>
          {DAY_LABELS.map((l, i) => (
            <div key={i} style={{ width: 10, height: CELL, fontSize: 8, color: muted, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {l}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          {/* Month labels row */}
          <div style={{ position: "relative", height: 16, marginBottom: 2 }}>
            {visibleMonthLabels.map(({ wi, label }) => (
              <span key={wi} style={{
                position: "absolute",
                left: wi * (CELL + GAP),
                fontSize: 9,
                color: muted,
                whiteSpace: "nowrap",
                lineHeight: "16px",
              }}>{label}</span>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "flex", gap: GAP }}>
            {visibleWeeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      background: getColor(day),
                      cursor: day.isFuture ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                      if (day.isFuture) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ day, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 8, justifyContent: "flex-start", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: muted, marginRight: 2 }}>Moins</span>
        {legendColors[metric].map((c, i) => (
          <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: c, flexShrink: 0 }} />
        ))}
        <span style={{ fontSize: 9, color: muted, marginLeft: 2 }}>Plus</span>
      </div>

      {/* Tooltip (portal-style fixed) */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 14,
          top: tooltip.y - 10,
          background: isDark ? "#1e2820" : "#ffffff",
          border: `1px solid ${isDark ? "#2a3a2e" : "#d4e8db"}`,
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          color: isDark ? "#e2ead5" : "#1a2e1f",
          pointerEvents: "none",
          zIndex: 9999,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          whiteSpace: metric === "reminders" ? "normal" : "nowrap",
          maxWidth: metric === "reminders" ? 220 : undefined,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {tooltip.day.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
          {metric === "charge" && (
            <div>Charge : {tooltip.day.charge || 0}
              {tooltip.day.sessionCount > 0 && <span style={{ color: muted, marginLeft: 4 }}>({tooltip.day.sessionCount} séance{tooltip.day.sessionCount !== 1 ? "s" : ""})</span>}
            </div>
          )}
          {metric === "rpe" && (
            <div>RPE moyen : {tooltip.day.avgRpe != null ? tooltip.day.avgRpe.toFixed(1) : <span style={{ color: muted }}>aucune donnée</span>}</div>
          )}
          {metric === "hooper" && (
            <div>Hooper : {tooltip.day.hooper != null ? `${tooltip.day.hooper} — ${hooperLabel(tooltip.day.hooper)}` : <span style={{ color: muted }}>aucune donnée</span>}</div>
          )}
          {metric === "reminders" && (
            <div>
              {tooltip.day.remindersActive === 0 ? (
                <span style={{ color: muted }}>aucun rappel actif</span>
              ) : (
                <>
                  <div>
                    {tooltip.day.remindersActive} rappel{tooltip.day.remindersActive > 1 ? "s" : ""} actif{tooltip.day.remindersActive > 1 ? "s" : ""}
                    {tooltip.day.remindersMissed > 0 && <> · {tooltip.day.remindersMissed} manqué{tooltip.day.remindersMissed > 1 ? "s" : ""}</>}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {tooltip.day.remindersDetail.map(r => (
                      <div key={r.id} style={{ fontSize: 10 }}>
                        <span style={{ color: r.checked ? "#82c894" : "#f08070", marginRight: 4 }}>
                          {r.checked ? "✓" : "✗"}
                        </span>
                        {r.name}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

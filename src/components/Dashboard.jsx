import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { getMondayOf, addDays, weekKey, localDateStr, formatDate } from "../lib/helpers.js";
import { ActivityHeatmap } from "./ActivityHeatmap.jsx";
import { SleepSection } from "./SleepSection.jsx";
import { DashboardSkeleton } from "./ui/Skeleton.jsx";

// ─── Spline cubique monotone passant par chaque point ────────────────────────
// Recharts a déjà type='monotone' qui dessine une spline cubique
// monotone à travers TOUS les points non-null. Combiné à connectNulls,
// la courbe enjambe les jours sans mesure et passe exactement par
// chaque mesure réelle — comportement le plus naturel pour
// poids/RPE en présence de mesures espacées irrégulièrement.
//
// Pas de helper de calcul nécessaire : Recharts s'en charge. Cette
// section reste comme point d'ancrage si on veut ré-introduire un
// fit lissé plus tard.

function hooperLabel(total) {
  if (total <= 10) return "Bien récupéré";
  if (total <= 14) return "Récupération normale";
  if (total <= 17) return "Attention fatigue";
  if (total <= 20) return "Fatigue élevée";
  return "Repos recommandé";
}

function hooperColor(total, isDark) {
  if (total <= 10) return isDark ? "#4ade80" : "#16a34a";
  if (total <= 14) return isDark ? "#c8906a" : "#8b4c20";
  if (total <= 17) return isDark ? "#f97316" : "#ea580c";
  return isDark ? "#f87171" : "#dc2626";
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function getChartData(data, range, refDate) {
  const today = refDate || new Date();

  if (range === "jour") {
    const monday = getMondayOf(today);
    const key = weekKey(monday);
    const days = data.weeks[key] || [];
    const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    return Array.from({ length: 7 }, (_, i) => {
      const daySessions = (days[i] || []).filter(Boolean);
      const charge = daySessions.reduce((s, se) => s + se.charge, 0);
      const done = daySessions.filter(s => s.feedback?.done === true);
      const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
      const avgRpe = rpeVals.length ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10 : null;
      const d = addDays(monday, i);
      const isToday = localDateStr(d) === localDateStr(new Date());
      return { label: dayNames[i], charge, avgRpe, planned: daySessions.length, done: done.length, isToday };
    });
  }

  if (range === "an") {
    // Last 12 months grouped by month
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const targetYear = d.getFullYear();
      const targetMonth = d.getMonth();
      let totalCharge = 0, allRpe = [], allDone = 0, allPlanned = 0;
      Object.entries(data.weeks).forEach(([key, days]) => {
        const monday = new Date(key);
        if (monday.getFullYear() === targetYear && monday.getMonth() === targetMonth) {
          const sessions = days.flat().filter(Boolean);
          totalCharge += sessions.reduce((s, se) => s + se.charge, 0);
          const done = sessions.filter(s => s.feedback?.done === true);
          allRpe.push(...done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe));
          allDone += done.length; allPlanned += sessions.length;
        }
      });
      const avgRpe = allRpe.length ? Math.round(allRpe.reduce((a, b) => a + b, 0) / allRpe.length * 10) / 10 : null;
      const label = d.toLocaleDateString("fr-FR", { month: "short" });
      return { label, charge: totalCharge, avgRpe, done: allDone, planned: allPlanned };
    });
  }

  // "sem" = 8 weeks, "mois" = 13 weeks (~3 months)
  const nWeeks = range === "mois" ? 13 : 8;
  return Array.from({ length: nWeeks }, (_, i) => {
    const monday = getMondayOf(addDays(today, -(7 * (nWeeks - 1 - i))));
    const key = weekKey(monday);
    const days = data.weeks[key] || [];
    const sessions = days.flat().filter(Boolean);
    const charge = sessions.reduce((s, se) => s + se.charge, 0);
    const done = sessions.filter(s => s.feedback?.done === true);
    const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
    const avgRpe = rpeVals.length
      ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10
      : null;
    const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
    return { label, charge, avgRpe, planned: sessions.length, done: done.length };
  });
}

export function Dashboard(props) {
  if (props.isLoading) return <DashboardSkeleton />;
  return <DashboardBody {...props} />;
}

function DashboardBody({ data, onUpdateSleep }) {
  const { styles, isDark } = useThemeCtx();
  const [range, setRange] = useState("sem"); // "sem" | "mois" | "an"
  const [statsRefDate, setStatsRefDate] = useState(() => new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleStatsPrev = () => {
    if (range === "jour" || range === "sem") setStatsRefDate(d => addDays(d, -7));
    else if (range === "mois") setStatsRefDate(d => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
    else setStatsRefDate(d => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  };
  const handleStatsNext = () => {
    if (range === "jour" || range === "sem") setStatsRefDate(d => addDays(d, 7));
    else if (range === "mois") setStatsRefDate(d => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    else setStatsRefDate(d => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
  };

  // Is the statsRefDate within the current period?
  const isCurrentPeriod = (() => {
    const ref = new Date(statsRefDate); ref.setHours(0, 0, 0, 0);
    if (range === "jour" || range === "sem") {
      const refMonday = getMondayOf(ref); const todayMonday = getMondayOf(today);
      return refMonday.getTime() >= todayMonday.getTime();
    }
    if (range === "mois") return ref.getFullYear() > today.getFullYear() || (ref.getFullYear() === today.getFullYear() && ref.getMonth() >= today.getMonth());
    return ref.getFullYear() >= today.getFullYear();
  })();

  // Label for the current period
  const statsPeriodLabel = (() => {
    const ref = statsRefDate;
    if (range === "jour") {
      const monday = getMondayOf(ref);
      return `${formatDate(monday)} — ${formatDate(addDays(monday, 6))}`;
    }
    if (range === "sem") {
      const nWeeks = 8;
      const endMonday = getMondayOf(ref);
      const startMonday = getMondayOf(addDays(endMonday, -(7 * (nWeeks - 1))));
      return `${formatDate(startMonday)} — ${formatDate(addDays(endMonday, 6))}`;
    }
    if (range === "mois") {
      const nWeeks = 13;
      const endMonday = getMondayOf(ref);
      const startMonday = getMondayOf(addDays(endMonday, -(7 * (nWeeks - 1))));
      return `${formatDate(startMonday)} — ${formatDate(addDays(endMonday, 6))}`;
    }
    return ref.toLocaleDateString("fr-FR", { year: "numeric" });
  })();

  const chartData = getChartData(data, range, statsRefDate);

  // Weight chart data — scaffolded for the full period (null where no measure)
  const weightChartData = (() => {
    const weightMap = data.weight || {};
    if (range === "jour") {
      const monday = getMondayOf(statsRefDate);
      const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
      return Array.from({ length: 7 }, (_, i) => {
        const dateStr = localDateStr(addDays(monday, i));
        return { label: dayNames[i], kg: weightMap[dateStr] ?? null };
      });
    }
    if (range === "an") {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(statsRefDate.getFullYear(), statsRefDate.getMonth() - (11 - i), 1);
        const y = d.getFullYear(), m = d.getMonth();
        const vals = Object.entries(weightMap)
          .filter(([date, v]) => { if (v == null) return false; const dd = new Date(date + "T12:00:00"); return dd.getFullYear() === y && dd.getMonth() === m; })
          .map(([, v]) => v);
        return {
          label: d.toLocaleDateString("fr-FR", { month: "short" }),
          kg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null,
        };
      });
    }
    const nWeeks = range === "mois" ? 13 : 8;
    return Array.from({ length: nWeeks }, (_, i) => {
      const monday = getMondayOf(addDays(statsRefDate, -(7 * (nWeeks - 1 - i))));
      const start = weekKey(monday);
      const end = localDateStr(addDays(monday, 6));
      const vals = Object.entries(weightMap)
        .filter(([date, v]) => v != null && date >= start && date <= end)
        .map(([, v]) => v);
      const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
      return { label, kg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null };
    });
  })();

  // Hooper chart data — scaffolded for the full period (null where no measure)
  const hooperChartData = (() => {
    const hooperList = data.hooper || [];
    if (range === "jour") {
      const monday = getMondayOf(statsRefDate);
      const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
      return Array.from({ length: 7 }, (_, i) => {
        const dateStr = localDateStr(addDays(monday, i));
        const entry = hooperList.find(h => h.date === dateStr);
        return { label: dayNames[i], total: entry?.total ?? null };
      });
    }
    if (range === "an") {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(statsRefDate.getFullYear(), statsRefDate.getMonth() - (11 - i), 1);
        const y = d.getFullYear(), m = d.getMonth();
        const vals = hooperList
          .filter(h => { const hd = new Date(h.date + "T12:00:00"); return hd.getFullYear() === y && hd.getMonth() === m; })
          .map(h => h.total);
        return {
          label: d.toLocaleDateString("fr-FR", { month: "short" }),
          total: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
        };
      });
    }
    const nWeeks = range === "mois" ? 13 : 8;
    return Array.from({ length: nWeeks }, (_, i) => {
      const monday = getMondayOf(addDays(statsRefDate, -(7 * (nWeeks - 1 - i))));
      const start = weekKey(monday);
      const end = localDateStr(addDays(monday, 6));
      const vals = hooperList.filter(h => h.date >= start && h.date <= end).map(h => h.total);
      const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
      return { label, total: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
    });
  })();

  const nutritionChartData = (() => {
    const nutrMap = data.nutrition || {};
    const sumDay = dateStr => {
      const meals = nutrMap[dateStr] || [];
      if (meals.length === 0) return { cal: null, prot: null };
      return { cal: meals.reduce((s, m) => s + (m.calories || 0), 0), prot: meals.reduce((s, m) => s + (m.proteins || 0), 0) };
    };
    if (range === "jour") {
      const monday = getMondayOf(statsRefDate);
      const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
      return Array.from({ length: 7 }, (_, i) => {
        const dateStr = localDateStr(addDays(monday, i));
        const { cal, prot } = sumDay(dateStr);
        return { label: dayNames[i], cal, prot };
      });
    }
    if (range === "an") {
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(statsRefDate.getFullYear(), statsRefDate.getMonth() - (11 - i), 1);
        const y = d.getFullYear(), m = d.getMonth();
        const days = Object.keys(nutrMap).filter(dt => { const dd = new Date(dt + "T12:00:00"); return dd.getFullYear() === y && dd.getMonth() === m; });
        if (!days.length) return { label: d.toLocaleDateString("fr-FR", { month: "short" }), cal: null, prot: null };
        const cal = Math.round(days.reduce((s, dt) => s + (nutrMap[dt] || []).reduce((a, m) => a + (m.calories || 0), 0), 0) / days.length);
        const prot = Math.round(days.reduce((s, dt) => s + (nutrMap[dt] || []).reduce((a, m) => a + (m.proteins || 0), 0), 0) / days.length);
        return { label: d.toLocaleDateString("fr-FR", { month: "short" }), cal: cal || null, prot: prot || null };
      });
    }
    const nWeeks = range === "mois" ? 13 : 8;
    return Array.from({ length: nWeeks }, (_, i) => {
      const monday = getMondayOf(addDays(statsRefDate, -(7 * (nWeeks - 1 - i))));
      const days = Array.from({ length: 7 }, (__, d) => localDateStr(addDays(monday, d))).filter(dt => nutrMap[dt]);
      const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
      if (!days.length) return { label, cal: null, prot: null };
      const cal = Math.round(days.reduce((s, dt) => s + (nutrMap[dt] || []).reduce((a, m) => a + (m.calories || 0), 0), 0) / days.length);
      const prot = Math.round(days.reduce((s, dt) => s + (nutrMap[dt] || []).reduce((a, m) => a + (m.proteins || 0), 0), 0) / days.length);
      return { label, cal: cal || null, prot: prot || null };
    });
  })();

  const totalCharge4w = getChartData(data, "sem").slice(4).reduce((s, w) => s + w.charge, 0);
  const rpeVals = chartData.filter(w => w.avgRpe != null).map(w => w.avgRpe);
  const globalAvgRpe = rpeVals.length
    ? (rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)
    : "—";

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const rangeLabel = { jour: "cette semaine", sem: "8 semaines", mois: "3 mois", an: "12 mois" }[range];

  const RangeBtn = ({ r, label }) => (
    <button onClick={() => { setRange(r); setStatsRefDate(new Date()); }}
      style={{ ...styles.viewToggleBtn, ...(range === r ? styles.viewToggleBtnActive : {}), padding: "3px 9px", fontSize: 10 }}>
      {label}
    </button>
  );

  return (
    <div style={styles.dashboard}>
      {/* Activity heatmap */}
      <ActivityHeatmap data={data} />

      {/* Range selector row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 4 }}>
        <div style={{ ...styles.dashTitle, marginBottom: 0, flex: 1 }}>Statistiques</div>
        <RangeBtn r="jour" label="Jours" />
        <RangeBtn r="sem" label="Sem" />
        <RangeBtn r="mois" label="Mois" />
        <RangeBtn r="an" label="An" />
      </div>
      {/* Period navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, gap: 8 }}>
        <button style={styles.navBtn} onClick={handleStatsPrev}>←</button>
        <div
          style={{ textAlign: "center", minWidth: 190, cursor: isCurrentPeriod ? "default" : "pointer" }}
          onClick={isCurrentPeriod ? undefined : () => setStatsRefDate(new Date())}
          title={isCurrentPeriod ? undefined : "Aller à la période en cours"}
        >
          <div style={styles.weekRange}>{statsPeriodLabel}</div>
          {isCurrentPeriod && <div style={styles.weekCurrent}>Période actuelle</div>}
        </div>
        <button style={{ ...styles.navBtn, visibility: isCurrentPeriod ? "hidden" : "visible" }} onClick={handleStatsNext}>→</button>
      </div>

      <div style={{ ...styles.dashCards, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{totalCharge4w}</span>
          <span style={styles.dashCardLabel}>Charge 4 sem.</span>
        </div>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{globalAvgRpe}</span>
          <span style={styles.dashCardLabel}>RPE moyen</span>
        </div>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Charge — {rangeLabel}</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
            <YAxis tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
            <Bar dataKey="charge" name="Charge" fill={isDark ? "#c8906a" : "#8b4c20"} radius={[3, 3, 0, 0]} maxBarSize={36}>
              {range === "jour" && chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isToday ? (isDark ? "#facc15" : "#ca8a04") : (isDark ? "#c8906a" : "#8b4c20")} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>RPE moyen — {rangeLabel}</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
            <YAxis domain={[0, 10]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            {/* Spline cubique monotone : passe exactement par chaque point
                mesuré, enjambe les gaps via connectNulls */}
            <Line type="monotone" dataKey="avgRpe" name="RPE"
              stroke="#f97316" strokeWidth={2}
              dot={{ r: 3, fill: "#f97316" }} activeDot={{ r: 5 }}
              connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {weightChartData.some(d => d.kg != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Poids — {rangeLabel}</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weightChartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => v != null ? [`${v} kg`, "Poids"] : null} />
              {/* Spline cubique monotone : passe exactement par chaque
                  mesure, enjambe les jours sans valeur. */}
              <Line type="monotone" dataKey="kg" name="Poids"
                stroke={isDark ? "#60a5fa" : "#2563eb"} strokeWidth={2}
                dot={{ r: 3, fill: isDark ? "#60a5fa" : "#2563eb" }} activeDot={{ r: 5 }}
                connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hooperChartData.some(d => d.total != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Indice Hooper — {rangeLabel}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hooperChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis domain={[0, 28]} ticks={[0, 7, 14, 17, 20, 28]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => v != null ? [v + ` — ${hooperLabel(v)}`, "Hooper"] : null} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
              <ReferenceLine y={14} stroke={isDark ? "#c8906a33" : "#8b4c2033"} strokeDasharray="4 4" />
              <ReferenceLine y={17} stroke="#f9731633" strokeDasharray="4 4" />
              <ReferenceLine y={20} stroke="#f8717133" strokeDasharray="4 4" />
              <Bar dataKey="total" name="Hooper" radius={[3, 3, 0, 0]} maxBarSize={36}>
                {hooperChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.total != null ? hooperColor(entry.total, isDark) : "transparent"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {nutritionChartData.some(d => d.cal != null || d.prot != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Nutrition — {rangeLabel}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: isDark ? "#fb923c" : "#c2410c", fontWeight: 700 }}>■ Calories (kcal)</span>
            <span style={{ fontSize: 10, color: isDark ? "#34d399" : "#047857", fontWeight: 700 }}>■ Protéines (g)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={nutritionChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis yAxisId="cal" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="prot" orientation="right" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }}
                formatter={(v, name) => v != null ? [name === "cal" ? `${v} kcal` : `${v} g`, name === "cal" ? "Calories" : "Protéines"] : null} />
              <Bar yAxisId="cal" dataKey="cal" name="cal" fill={isDark ? "#fb923c" : "#f97316"} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar yAxisId="prot" dataKey="prot" name="prot" fill={isDark ? "#34d399" : "#10b981"} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <SleepSection sleepData={data.sleep || []} onImport={onUpdateSleep} range={range} />
    </div>
  );
}

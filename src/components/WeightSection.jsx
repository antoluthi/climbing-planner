import { useState, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { localDateStr } from "../lib/helpers.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── SUIVI DU POIDS ─────────────────────────────────────────────────────────

export function WeightSection({ weightData, onSave }) {
  const { styles, isDark } = useThemeCtx();
  const today = localDateStr(new Date());
  const [input, setInput] = useState(
    weightData[today] != null ? String(weightData[today]) : ""
  );

  // Sync if cloud loads fresh data
  useEffect(() => {
    if (weightData[today] != null) setInput(String(weightData[today]));
    else setInput("");
  }, [weightData[today]]);

  const commit = () => {
    const val = parseFloat(input.replace(",", "."));
    if (!isNaN(val) && val > 0) onSave(today, Math.round(val * 10) / 10);
    else if (input.trim() === "") onSave(today, null);
  };

  // Chart: last 30 valid entries
  const chartEntries = Object.entries(weightData)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30);
  const chartData = chartEntries.map(([date, kg]) => ({
    label: new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }),
    kg,
  }));

  // Recent entries (last 4, excluding today)
  const recent = Object.entries(weightData)
    .filter(([d, v]) => d !== today && v != null)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const todayKg = weightData[today];
  const accent = isDark ? "#60a5fa" : "#2563eb";
  const tooltipStyle = {
    background: isDark ? "#1a1f1b" : "#f0ebe2",
    border: "none", borderRadius: 6,
    color: isDark ? "#e8e4de" : "#2a2218", fontSize: 11,
  };

  return (
    <div style={styles.dashSection}>
      <div style={{ ...styles.dashSectionTitle, marginBottom: 8 }}>
        Poids
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginLeft: 8 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="number"
          step="0.1" min="20" max="300"
          placeholder="—"
          value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
          style={{
            background: isDark ? "#1e231f" : "#e8e3da",
            border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
            borderRadius: 6, color: isDark ? "#e8e4de" : "#2a2218",
            fontSize: 22, fontFamily: "inherit", fontWeight: 700,
            padding: "6px 10px", outline: "none", width: 90,
            textAlign: "center", MozAppearance: "textfield",
          }}
        />
        <span style={{ fontSize: 13, color: isDark ? "#9ca3af" : "#6b7280" }}>kg</span>
        {todayKg != null && (
          <span style={{ fontSize: 11, color: isDark ? "#c8906a" : "#8b4c20", fontWeight: 600 }}>✓ enregistré</span>
        )}
      </div>
      {chartData.length >= 2 && (
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v} kg`, "Poids"]} />
            <Line type="monotone" dataKey="kg" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: accent }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
      {recent.length > 0 && (
        <div style={{ marginTop: chartData.length >= 2 ? 8 : 0 }}>
          {recent.map(([d, kg]) => (
            <div key={d} style={{ marginBottom: 4, fontSize: 11, color: isDark ? "#9ca3af" : "#6b7280", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, color: isDark ? "#707870" : "#8a7060" }}>{fmtDate(d)}</span>
              <span style={{ fontWeight: 700, color: isDark ? "#cbd5e1" : "#374151" }}>{kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

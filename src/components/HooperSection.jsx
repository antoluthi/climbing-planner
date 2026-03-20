import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { localDateStr, weekKey, getMondayOf } from "../lib/helpers.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── HOOPER INDEX ─────────────────────────────────────────────────────────────

function hooperLabel(total) {
  if (total <= 14) return "Bien récupéré";
  if (total <= 17) return "Modérément fatigué";
  if (total <= 20) return "Très fatigué";
  return "Surmenage";
}

function hooperColor(total, isDark) {
  if (total <= 14) return isDark ? "#4ade80" : "#2a7d4f";
  if (total <= 17) return "#f97316";
  return "#f87171";
}

export function HooperSection({ hoopers, onAdd, range }) {
  const { styles, isDark } = useThemeCtx();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fatigue: null, stress: null, soreness: null, sleep: null });
  const [saved, setSaved] = useState(false);

  const today = localDateStr(new Date());
  const todayEntry = (hoopers || []).find(h => h.date === today);
  const allFilled = form.fatigue && form.stress && form.soreness && form.sleep;
  const total = allFilled ? form.fatigue + form.stress + form.soreness + form.sleep : null;

  const openForm = (editing = false) => {
    if (editing && todayEntry) {
      setForm({ fatigue: todayEntry.fatigue, stress: todayEntry.stress, soreness: todayEntry.soreness, sleep: todayEntry.sleep });
    } else {
      setForm({ fatigue: null, stress: null, soreness: null, sleep: null });
    }
    setOpen(o => !o);
  };

  const handleSave = () => {
    if (!allFilled) return;
    onAdd({
      id: todayEntry?.id || "h_" + Date.now().toString(36),
      date: today,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      ...form, total,
    });
    setForm({ fatigue: null, stress: null, soreness: null, sleep: null });
    setSaved(true); setOpen(false);
    setTimeout(() => setSaved(false), 3000);
  };

  // Build chart data based on range
  const sorted = [...(hoopers || [])].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = (() => {
    if (range === "an") {
      // Group by week, show weekly averages
      const byWeek = {};
      sorted.forEach(h => {
        const mon = getMondayOf(new Date(h.date + "T12:00:00"));
        const k = weekKey(mon);
        if (!byWeek[k]) byWeek[k] = [];
        byWeek[k].push(h.total);
      });
      return Object.entries(byWeek).slice(-52).map(([k, vals]) => {
        const d = new Date(k);
        return {
          date: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`,
          total: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        };
      });
    }
    const days = range === "mois" ? 91 : range === "jour" ? 14 : 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return sorted.filter(h => h.date >= cutoff).map(h => ({
      date: h.date.slice(5).replace("-", "/"),
      total: h.total, fatigue: h.fatigue, stress: h.stress, soreness: h.soreness, sleep: h.sleep,
    }));
  })();

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const CRITERIA = [
    { key: "fatigue",  label: "Fatigue",      sub: "épuisement général" },
    { key: "stress",   label: "Stress",        sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures",   sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",     sub: "1 = excellent · 7 = très mauvais" },
  ];

  const btnBase = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };

  return (
    <div style={styles.dashSection}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ ...styles.dashSectionTitle, marginBottom: 0, flex: 1 }}>Indice Hooper</div>
        {todayEntry && !open && (
          <span style={{ fontSize: 10, color: hooperColor(todayEntry.total, isDark) }}>
            {todayEntry.time} · {todayEntry.total} — {hooperLabel(todayEntry.total)}
          </span>
        )}
        <button
          onClick={() => open ? setOpen(false) : openForm(!todayEntry ? false : true)}
          style={styles.sleepImportBtn}
        >
          {open ? "✕ Fermer" : todayEntry ? "Modifier" : "+ Remplir"}
        </button>
      </div>

      {open && (
        <div style={{ marginBottom: 14, padding: "12px 14px", background: isDark ? "#1e231f" : "#e8e3da", borderRadius: 8 }}>
          {CRITERIA.map(({ key, label, sub }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 110, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 9, opacity: 0.55 }}>{sub}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 7].map(v => {
                  const active = form[key] === v;
                  const bg = active
                    ? (v <= 2 ? (isDark ? "#4ade80" : "#2a7d4f") : v <= 4 ? "#f97316" : "#f87171")
                    : (isDark ? "#2a2f2a" : "#d8d3ca");
                  return (
                    <button key={v} onClick={() => setForm(f => ({ ...f, [key]: v }))}
                      style={{ ...btnBase, background: bg, color: active ? "#fff" : styles.dashText, fontWeight: active ? 600 : 400 }}>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {total !== null && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(total, isDark) }}>
              Indice : {total} — {hooperLabel(total)}
            </div>
          )}
          <button onClick={handleSave} disabled={!allFilled}
            style={{ ...styles.sleepImportBtn, opacity: allFilled ? 1 : 0.4, cursor: allFilled ? "pointer" : "default" }}>
            Enregistrer
          </button>
        </div>
      )}

      {saved && <div style={{ fontSize: 11, color: "#c8906a", marginBottom: 8 }}>Indice enregistré ✓</div>}

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
            <YAxis domain={[4, 28]} ticks={[4, 10, 14, 17, 20, 28]} tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v, n) => [v, n === "total" ? "Hooper" : n]}
            />
            <ReferenceLine y={14} stroke={isDark ? "#c8906a33" : "#8b4c2033"} strokeDasharray="4 4" />
            <ReferenceLine y={17} stroke="#f9731633" strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke="#f8717133" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="total" name="Hooper" stroke={isDark ? "#c8906a" : "#8b4c20"}
              strokeWidth={2} dot={{ r: 3, fill: isDark ? "#c8906a" : "#8b4c20" }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={styles.sleepEmptyMsg}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Remplis ton premier indice pour voir l'évolution</div>
        </div>
      )}
    </div>
  );
}

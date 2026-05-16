import { useState, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { parseGarminSleepCSV } from "../lib/garmin-csv.js";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── SECTION SOMMEIL ──────────────────────────────────────────────────────────

export function SleepSection({ sleepData, onImport, range }) {
  const { styles, isDark } = useThemeCtx();
  const fileRef = useRef(null);
  const [importMsg, setImportMsg] = useState("");

  const sorted = [...(sleepData || [])].sort((a, b) => a.date.localeCompare(b.date));
  const days = range === "an" ? 365 : range === "mois" ? 91 : range === "jour" ? 14 : 45;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const filtered = sorted.filter(d => d.date >= cutoff);

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const fmt = min => `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`;

  const avgTotal = avg(filtered.map(d => d.total));
  const avgDeep  = avg(filtered.map(d => d.deep));
  const avgRem   = avg(filtered.map(d => d.rem));
  const scores   = filtered.filter(d => d.score != null).map(d => d.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const lastDate = filtered.length ? filtered[filtered.length - 1].date : null;

  const chartData = filtered.map(d => ({
    date:  d.date.slice(5).replace("-", "/"),
    deep:  d.deep, rem: d.rem, light: d.light, awake: d.awake, score: d.score,
  }));

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseGarminSleepCSV(ev.target.result);
      if (parsed.length > 0) { onImport(parsed); setImportMsg(`${parsed.length} nuits importées ✓`); }
      else setImportMsg("⚠ Aucune donnée reconnue dans ce fichier.");
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  return (
    <div style={styles.dashSection}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ ...styles.dashSectionTitle, marginBottom: 0, flex: 1 }}>Sommeil</div>
        <button style={styles.sleepImportBtn} onClick={() => fileRef.current?.click()}>
          ↑ Importer CSV Garmin
        </button>
        <input ref={fileRef} type="file" accept=".csv,.CSV" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {importMsg && (
        <div style={{ fontSize: 11, color: importMsg.startsWith("⚠") ? "#f08070" : "#e0a875", marginBottom: 8 }}>
          {importMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={styles.sleepEmptyMsg}>
          <div>Aucune donnée de sommeil</div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
            {"Importe un fichier CSV depuis Garmin Connect → Santé → Sommeil"}
          </div>
        </div>
      ) : (
        <>
          {lastDate && (
            <div style={{ fontSize: 10, color: isDark ? "#a89a82" : "#8a7060", marginBottom: 10 }}>
              Dernière nuit : {lastDate} · {filtered.length} nuits chargées
            </div>
          )}

          {/* Cartes résumé */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={styles.sleepCard}>
              <span style={{ ...styles.dashCardVal, fontSize: 17 }}>{fmt(avgTotal)}</span>
              <span style={styles.dashCardLabel}>Durée moy.</span>
            </div>
            <div style={styles.sleepCard}>
              <span style={{ ...styles.dashCardVal, fontSize: 17, color: "#6366f1" }}>{fmt(avgDeep)}</span>
              <span style={styles.dashCardLabel}>Profond moy.</span>
            </div>
            <div style={styles.sleepCard}>
              <span style={{ ...styles.dashCardVal, fontSize: 17, color: "#a855f7" }}>{fmt(avgRem)}</span>
              <span style={styles.dashCardLabel}>REM moy.</span>
            </div>
            {avgScore != null && (
              <div style={styles.sleepCard}>
                <span style={{ ...styles.dashCardVal, fontSize: 17, color: avgScore >= 80 ? "#82c894" : avgScore >= 60 ? "#e6c46a" : "#f08070" }}>{avgScore}</span>
                <span style={styles.dashCardLabel}>Score moy.</span>
              </div>
            )}
          </div>

          {/* Légende */}
          <div style={styles.sleepLegend}>
            {[["#6366f1","Profond"],["#a855f7","REM"],["#22d3ee","Léger"],["#f9731666","Éveil"]].map(([c,l]) => (
              <span key={l} style={{ fontSize: 10, color: isDark ? "#a89a82" : "#a89a82", display: "flex", alignItems: "center" }}>
                <span style={{ ...styles.sleepLegendDot, background: c }} />{l}
              </span>
            ))}
          </div>

          {/* Graphe barres empilées */}
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.floor(chartData.length / 6)} />
              <YAxis tickFormatter={v => `${Math.floor(v / 60)}h`} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmt(v), name]} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
              <Bar dataKey="deep"  name="Profond" stackId="s" fill="#6366f1" />
              <Bar dataKey="rem"   name="REM"     stackId="s" fill="#a855f7" />
              <Bar dataKey="light" name="Léger"   stackId="s" fill="#22d3ee" />
              <Bar dataKey="awake" name="Éveil"   stackId="s" fill="#f9731644" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Score de sommeil */}
          {scores.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...styles.dashSectionTitle, marginBottom: 6 }}>Score de sommeil</div>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.floor(chartData.length / 6)} />
                  <YAxis domain={[40, 100]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" name="Score" stroke={isDark ? "#e0a875" : "#8b4c20"} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

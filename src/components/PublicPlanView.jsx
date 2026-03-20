import { useState, useEffect, useContext } from "react";
import { ThemeContext, useThemeCtx } from "../theme/ThemeContext.jsx";
import { makeStyles } from "../theme/makeStyles.js";
import supabase from "../lib/supabase.js";
import { getMondayOf, addDays, formatDate, getDaySessions } from "../lib/helpers.js";
import { getChargeColor } from "../lib/charge.js";
import { useWindowWidth } from "../hooks/useWindowWidth.js";
import { MonthView } from "./MonthView.jsx";
import { YearView } from "./YearView.jsx";

const ANTO_USER_ID = "80f1690e-6fd2-45fa-9b02-c7b6edf1f112";
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function PublicWeekView({ data, currentDate }) {
  const { styles, isDark: themeIsDark } = useThemeCtx();
  const isMobile = useWindowWidth() < 768;
  const monday = getMondayOf(currentDate);
  const today = new Date();
  const accent = themeIsDark ? "#c8906a" : "#8b4c20";

  const days = DAYS_SHORT.map((dayLabel, di) => {
    const date = addDays(monday, di);
    const sessions = getDaySessions(data, date);
    const isToday = date.toDateString() === today.toDateString();
    const hasSessions = sessions.length > 0;
    return { dayLabel, date, sessions, isToday, hasSessions };
  });

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px" }}>
        {days.map(({ dayLabel, date, sessions, isToday, hasSessions }, di) => {
          const dateStr = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const capitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
          if (!hasSessions && !isToday) {
            return (
              <div key={di} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 12px",
                background: themeIsDark ? "#181e1a" : "#eee8dc",
                borderRadius: 8,
                border: `1px solid ${themeIsDark ? "#222826" : "#d8d0c4"}`,
                opacity: 0.55,
              }}>
                <div style={{ fontSize: 13, color: themeIsDark ? "#555a55" : "#aaa89e", flex: 1 }}>{capitalized}</div>
                <div style={{ fontSize: 12, color: themeIsDark ? "#2e332e" : "#ccc8be" }}>Repos</div>
              </div>
            );
          }
          return (
            <div key={di} style={{
              background: themeIsDark ? "#1f2421" : "#e8e2d8",
              borderRadius: 10,
              border: isToday ? `2px solid ${accent}` : `1px solid ${themeIsDark ? "#252b27" : "#ccc6b8"}`,
              overflow: "hidden",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px",
                background: isToday ? (themeIsDark ? "#1a2e1a" : "#d4edda") : "transparent",
                borderBottom: hasSessions ? `1px solid ${themeIsDark ? "#252b27" : "#d0c8bc"}` : "none",
              }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: isToday ? accent : (themeIsDark ? "#d0ccc6" : "#2a2218") }}>
                    {capitalized}
                  </span>
                  {isToday && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: accent, background: themeIsDark ? "#1f3a1f" : "#c8f0cc", borderRadius: 4, padding: "1px 6px" }}>
                      Aujourd'hui
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: themeIsDark ? "#5a7a5a" : "#8aaa8a", fontWeight: 600 }}>
                  {hasSessions ? `${sessions.length} séance${sessions.length > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              {hasSessions && (
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map((s, si) => (
                    <div key={si} style={{
                      background: themeIsDark ? "#161a17" : "#f4ede0",
                      borderRadius: 8, padding: "10px 12px",
                      borderLeft: `4px solid ${getChargeColor(s.charge)}`,
                    }}>
                      {s.startTime && (
                        <div style={{ fontSize: 12, color: themeIsDark ? "#5a9060" : "#5a8a60", fontWeight: 700, marginBottom: 3 }}>
                          {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                        </div>
                      )}
                      <div style={{ fontSize: 14, fontWeight: 600, color: themeIsDark ? "#d0ccc6" : "#2a2218", lineHeight: 1.3 }}>
                        {s.title || s.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop — horizontal columns
  return (
    <div style={{ display: "flex", gap: 8, padding: "16px", overflowX: "auto", alignItems: "flex-start" }}>
      {days.map(({ dayLabel, date, sessions, isToday }, di) => (
        <div key={di} style={{
          flex: 1, minWidth: 110,
          background: themeIsDark ? "#1f2421" : "#e8e2d8",
          borderRadius: 10, padding: "10px 8px",
          border: isToday ? `2px solid ${accent}` : `1px solid ${themeIsDark ? "#252b27" : "#ccc6b8"}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: themeIsDark ? "#9aaa9a" : "#7a7060", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {dayLabel}
          </div>
          <div style={{ fontSize: 11, color: themeIsDark ? "#555a55" : "#aaa89e", marginBottom: 8 }}>
            {formatDate(date)}
          </div>
          {sessions.length === 0
            ? <div style={{ fontSize: 10, color: themeIsDark ? "#2e332e" : "#ccc8be" }}>—</div>
            : sessions.map((s, si) => (
              <div key={si} style={{
                background: themeIsDark ? "#161a17" : "#f2ece0",
                borderRadius: 6, padding: "7px 8px", marginBottom: 5,
                borderLeft: `3px solid ${getChargeColor(s.charge)}`,
              }}>
                {s.startTime && (
                  <div style={{ fontSize: 9, color: themeIsDark ? "#5a7860" : "#7a9a80", fontWeight: 600, marginBottom: 2 }}>
                    {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                  </div>
                )}
                <div style={{ fontSize: 11, color: themeIsDark ? "#d0ccc6" : "#2a2218", lineHeight: 1.3 }}>
                  {s.title || s.name}
                </div>
              </div>
            ))
          }
        </div>
      ))}
    </div>
  );
}

export function PublicPlanView({ onBack }) {
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("week");
  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") === "dark");

  const toggleThemePub = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  const styles = makeStyles(isDark);
  const accent = isDark ? "#c8906a" : "#8b4c20";
  const mesocycles = planData?.mesocycles || [];

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase
      .from("climbing_plans")
      .select("data")
      .eq("user_id", ANTO_USER_ID)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setPlanData(data.data);
        setLoading(false);
      });
  }, []);

  const handlePrev = () => {
    if (viewMode === "week") setCurrentDate(d => addDays(d, -7));
    else if (viewMode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setCurrentDate(d => new Date(d.getFullYear() - 1, d.getMonth(), 1));
  };
  const handleNext = () => {
    if (viewMode === "week") setCurrentDate(d => addDays(d, 7));
    else if (viewMode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setCurrentDate(d => new Date(d.getFullYear() + 1, d.getMonth(), 1));
  };

  const periodLabel = viewMode === "week"
    ? (() => { const m = getMondayOf(currentDate); return `${formatDate(m)} – ${formatDate(addDays(m, 6))}`; })()
    : viewMode === "month"
    ? currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : String(currentDate.getFullYear());

  const tabBtn = (mode, label) => (
    <button
      onClick={() => setViewMode(mode)}
      style={{
        background: viewMode === mode ? accent : "none",
        border: `1px solid ${viewMode === mode ? accent : isDark ? "#2e342e" : "#ccc6b8"}`,
        color: viewMode === mode ? (isDark ? "#0f1a0f" : "#fff") : isDark ? "#9aaa9a" : "#6a6258",
        borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
      }}
    >
      {label}
    </button>
  );

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme: toggleThemePub, mesocycles }}>
      <div style={{ ...styles.app, overflowY: "auto", minHeight: "100vh" }}>
        {/* Header */}
        <div style={{ ...styles.header, justifyContent: "flex-start", gap: 16 }}>
          <button
            onClick={onBack}
            style={{ background: "none", border: `1px solid ${isDark ? "#2e342e" : "#ccc6b8"}`, borderRadius: 8, padding: "6px 14px", color: isDark ? "#9aaa9a" : "#6a6258", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
          >
            ← Retour
          </button>
          <div style={{ flex: 1 }}>
            <div style={styles.appTitle}>PLANNING D'ANTO</div>
            <div style={styles.appSub}>Lecture seule · Séances & horaires</div>
          </div>
          <button
            onClick={toggleThemePub}
            title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
            style={{ background: "none", border: `1px solid ${isDark ? "#2e342e" : "#ccc6b8"}`, borderRadius: 8, padding: "6px 12px", color: isDark ? "#9aaa9a" : "#6a6258", cursor: "pointer", fontFamily: "inherit", fontSize: 15 }}
          >
            {isDark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
        </div>

        {/* Nav bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${isDark ? "#252b27" : "#d8d3ca"}`, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {tabBtn("week", "Semaine")}
            {tabBtn("month", "Mois")}
            {tabBtn("year", "Année")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <button style={styles.navBtn} onClick={handlePrev}>←</button>
            <span style={{ ...styles.weekRange, minWidth: 160, textAlign: "center" }}>{periodLabel}</span>
            <button style={styles.navBtn} onClick={handleNext}>→</button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60, color: accent, fontSize: 24 }}>…</div>
        ) : !planData ? (
          <div style={{ padding: 40, textAlign: "center", color: isDark ? "#555" : "#aaa" }}>Planning non disponible.</div>
        ) : viewMode === "week" ? (
          <PublicWeekView data={planData} currentDate={currentDate} />
        ) : viewMode === "month" ? (
          <MonthView
            data={planData} currentDate={currentDate}
            onSelectWeek={m => { setCurrentDate(m); setViewMode("week"); }}
            isMobile={false} mesocycles={mesocycles}
            onSessionClick={null} creatine={{}} customCycles={[]}
          />
        ) : (
          <YearView
            data={planData} currentDate={currentDate}
            onSelectMonth={m => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setViewMode("month"); }}
            isMobile={false} creatine={{}} customCycles={[]}
          />
        )}
      </div>
    </ThemeContext.Provider>
  );
}

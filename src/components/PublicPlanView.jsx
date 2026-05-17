import { useState, useEffect } from "react";
import { ThemeContext, useThemeCtx } from "../theme/ThemeContext.jsx";
import { makeStyles } from "../theme/makeStyles.js";
import supabase from "../lib/supabase.js";
import { getMondayOf, addDays, formatDate, weekKey, getDaySessions } from "../lib/helpers.js";
import { getChargeColor } from "../lib/charge.js";
import { useWindowWidth } from "../hooks/useWindowWidth.js";
import { MonthView } from "./MonthView.jsx";
import { YearView } from "./YearView.jsx";
import { DayNightToggle } from "./DayNightToggle.jsx";
import { RichText } from "./RichText.jsx";

const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// ── Avatar circle ──────────────────────────────────────────────────────────────
function AvatarCircle({ url, firstName, lastName, size = 36, accent }) {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt={`${firstName} ${lastName}`}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", border: `2px solid ${accent}44`,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: accent + "33", border: `2px solid ${accent}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: accent,
      flexShrink: 0, fontFamily: "'Cormorant Garamond', Georgia, serif",
    }}>
      {initials}
    </div>
  );
}

// ── Session card (shared between mobile/desktop) ────────────────────────────
function SessionCard({ session, isDark, compact = false }) {
  const accent = isDark ? "#e0a875" : "#8b4c20";
  const chargeColor = getChargeColor(session.charge || 0);
  const textMain = isDark ? "#f0e6d0" : "#2a2218";
  const textMid = isDark ? "#c4b69c" : "#6a6258";
  const textLight = isDark ? "#8a7d68" : "#aaa89e";
  const cardBg = isDark ? "#15100b" : "#faf6f0";
  const description = session.description?.toString().trim();
  const location = session.location?.trim();
  const blocks = session.blocks || [];
  const blockCount = blocks.length;
  const charge = session.chargePlanned ?? (
    session.charge != null
      ? (session.charge > 10 ? Math.round(session.charge / 21.6) : session.charge)
      : null
  );

  return (
    <div style={{
      background: cardBg,
      borderRadius: compact ? 6 : 8,
      padding: compact ? "7px 8px" : "10px 12px",
      borderLeft: `3px solid ${chargeColor}`,
      display: "flex", flexDirection: "column", gap: compact ? 2 : 4,
    }}>
      {/* Time */}
      {session.startTime && (
        <div style={{ fontSize: compact ? 9 : 11, color: isDark ? "#82c894" : "#5a8a60", fontWeight: 700, lineHeight: 1 }}>
          {session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}
        </div>
      )}

      {/* Title */}
      <div style={{
        fontSize: compact ? 11 : 13,
        fontWeight: 700,
        color: textMain,
        lineHeight: 1.25,
      }}>
        {session.title || session.name}
      </div>

      {/* Charge + Duration */}
      {!compact && (charge != null || session.duration) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {charge != null && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: chargeColor,
              background: chargeColor + "22", borderRadius: 4, padding: "1px 6px",
            }}>
              ⚡ {charge}/10
            </span>
          )}
          {session.duration && (
            <span style={{ fontSize: 10, color: textLight }}>
              {session.duration} min
            </span>
          )}
        </div>
      )}

      {/* Location */}
      {location && (
        <div style={{ fontSize: compact ? 9 : 10, color: textMid, display: "flex", alignItems: "center", gap: 3 }}>
          <span>📍</span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{location}</span>
        </div>
      )}

      {/* Description */}
      {!compact && description && (
        <div style={{
          fontSize: 11, color: textLight, lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontStyle: "italic",
        }}>
          {description}
        </div>
      )}

      {/* Block count */}
      {!compact && blockCount > 0 && (
        <div style={{ fontSize: 10, color: textMid }}>
          {blockCount} exercice{blockCount > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ── Session detail modal ────────────────────────────────────────────────────
function SessionDetailModal({ session, isDark, onClose }) {
  const styles = makeStyles(isDark);
  const accent = isDark ? "#e0a875" : "#8b4c20";
  const textMain = isDark ? "#f0e6d0" : "#2a2218";
  const textMid = isDark ? "#c4b69c" : "#6a6258";
  const textLight = isDark ? "#8a7d68" : "#aaa89e";
  const bg = isDark ? "#1e1610" : "#fdf9f4";
  const border = isDark ? "#2e2419" : "#d8d0c4";
  const chargeColor = getChargeColor(session.charge || 0);
  const blocks = session.blocks || [];
  const description = session.description?.toString().trim();
  const location = session.location?.trim();
  const charge = session.chargePlanned ?? (
    session.charge != null
      ? (session.charge > 10 ? Math.round(session.charge / 21.6) : session.charge)
      : null
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: bg, borderRadius: 14, padding: "24px 20px",
          maxWidth: 440, width: "100%", maxHeight: "85vh",
          overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          border: `1px solid ${border}`,
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 20, fontWeight: 700, color: textMain, lineHeight: 1.2,
            }}>
              {session.title || session.name}
            </div>
            {session.startTime && (
              <div style={{ fontSize: 12, color: isDark ? "#82c894" : "#5a8a60", fontWeight: 600, marginTop: 4 }}>
                {session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: `1px solid ${border}`,
              borderRadius: 6, padding: "4px 10px",
              color: textMid, cursor: "pointer", fontSize: 14, fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>

        {/* Chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {charge != null && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: chargeColor,
              background: chargeColor + "22", border: `1px solid ${chargeColor}44`,
              borderRadius: 5, padding: "3px 8px",
            }}>
              ⚡ Charge {charge}/10
            </span>
          )}
          {session.duration && (
            <span style={{
              fontSize: 11, color: textMid,
              background: isDark ? "#2a2018" : "#e8e2d8",
              borderRadius: 5, padding: "3px 8px",
            }}>
              ⏱ {session.duration} min
            </span>
          )}
          {location && (
            <span style={{
              fontSize: 11, color: textMid,
              background: isDark ? "#2a2018" : "#e8e2d8",
              borderRadius: 5, padding: "3px 8px",
            }}>
              📍 {location}
            </span>
          )}
        </div>

        {/* Description */}
        {description && (
          <div style={{ fontSize: 13, color: textMid, lineHeight: 1.55, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <RichText text={description} />
          </div>
        )}

        {/* Blocks */}
        {blocks.length > 0 && (
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textLight, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Exercices
            </div>
            {blocks.map((bl, i) => (
              <div key={i} style={{
                background: isDark ? "#241b13" : "#f0ebe0",
                borderRadius: 8, padding: "10px 12px",
                borderLeft: `3px solid ${getChargeColor(bl.charge || 0)}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: textMain }}>{bl.name}</div>
                {bl.duration && (
                  <div style={{ fontSize: 11, color: textLight, marginTop: 2 }}>{bl.duration} min</div>
                )}
                {bl.description?.trim() && (
                  <div style={{ fontSize: 11, color: textMid, marginTop: 4, lineHeight: 1.4 }}>
                    <RichText text={bl.description} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Week view ───────────────────────────────────────────────────────────────
function PublicWeekView({ data, currentDate }) {
  const { isDark } = useThemeCtx();
  const isMobile = useWindowWidth() < 768;
  const [selectedSession, setSelectedSession] = useState(null);
  const monday = getMondayOf(currentDate);
  const today = new Date();
  const accent = isDark ? "#e0a875" : "#8b4c20";

  const days = DAYS_SHORT.map((dayLabel, di) => {
    const date = addDays(monday, di);
    const sessions = getDaySessions(data, date);
    const isToday = date.toDateString() === today.toDateString();
    return { dayLabel, date, sessions, isToday, hasSessions: sessions.length > 0 };
  });

  if (isMobile) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px" }}>
          {days.map(({ dayLabel, date, sessions, isToday, hasSessions }, di) => {
            const dateStr = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            const capitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            if (!hasSessions && !isToday) {
              return (
                <div key={di} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 12px",
                  background: isDark ? "#1a1410" : "#eee8dc",
                  borderRadius: 8,
                  border: `1px solid ${isDark ? "#2a2018" : "#d8d0c4"}`,
                  opacity: 0.55,
                }}>
                  <div style={{ fontSize: 13, color: isDark ? "#8a7d68" : "#aaa89e", flex: 1 }}>{capitalized}</div>
                  <div style={{ fontSize: 12, color: isDark ? "#3a2e22" : "#ccc8be" }}>Repos</div>
                </div>
              );
            }
            return (
              <div key={di} style={{
                background: isDark ? "#241b13" : "#e8e2d8",
                borderRadius: 10,
                border: isToday ? `2px solid ${accent}` : `1px solid ${isDark ? "#2e2419" : "#ccc6b8"}`,
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px",
                  background: isToday ? (isDark ? "#1f2a1f" : "#d4edda") : "transparent",
                  borderBottom: hasSessions ? `1px solid ${isDark ? "#2e2419" : "#d0c8bc"}` : "none",
                }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: isToday ? accent : (isDark ? "#f0e6d0" : "#2a2218") }}>
                      {capitalized}
                    </span>
                    {isToday && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: accent, background: isDark ? "#1f2a1f" : "#c8f0cc", borderRadius: 4, padding: "1px 6px" }}>
                        Aujourd'hui
                      </span>
                    )}
                  </div>
                  {hasSessions && (
                    <div style={{ fontSize: 12, color: isDark ? "#a89a82" : "#8aaa8a", fontWeight: 600 }}>
                      {sessions.length} séance{sessions.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                {hasSessions && (
                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {sessions.map((s, si) => (
                      <div key={si} onClick={() => setSelectedSession(s)} style={{ cursor: "pointer" }}>
                        <SessionCard session={s} isDark={isDark} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedSession && (
          <SessionDetailModal session={selectedSession} isDark={isDark} onClose={() => setSelectedSession(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, padding: "16px", overflowX: "auto", alignItems: "flex-start" }}>
        {days.map(({ dayLabel, date, sessions, isToday }, di) => (
          <div key={di} style={{
            flex: 1, minWidth: 120,
            background: isDark ? "#241b13" : "#e8e2d8",
            borderRadius: 10, padding: "10px 8px",
            border: isToday ? `2px solid ${accent}` : `1px solid ${isDark ? "#2e2419" : "#ccc6b8"}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#c4b69c" : "#7a7060", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {dayLabel}
            </div>
            <div style={{ fontSize: 11, color: isDark ? "#8a7d68" : "#aaa89e", marginBottom: 8 }}>
              {formatDate(date)}
            </div>
            {sessions.length === 0
              ? <div style={{ fontSize: 10, color: isDark ? "#3a2e22" : "#ccc8be" }}>—</div>
              : sessions.map((s, si) => (
                <div key={si} style={{ marginBottom: 5, cursor: "pointer" }} onClick={() => setSelectedSession(s)}>
                  <SessionCard session={s} isDark={isDark} compact />
                </div>
              ))
            }
          </div>
        ))}
      </div>
      {selectedSession && (
        <SessionDetailModal session={selectedSession} isDark={isDark} onClose={() => setSelectedSession(null)} />
      )}
    </>
  );
}

// ── Main exported component ─────────────────────────────────────────────────
export function PublicPlanView({ onBack, userId, firstName, lastName, avatarUrl }) {
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
  const accent = isDark ? "#e0a875" : "#8b4c20";
  const mesocycles = planData?.mesocycles || [];
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "Planning";

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return; }
    supabase
      .from("climbing_plans")
      .select("data")
      .eq("user_id", userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setPlanData(data.data);
        setLoading(false);
      });
  }, [userId]);

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
      key={mode}
      onClick={() => setViewMode(mode)}
      style={{
        background: viewMode === mode ? accent : "none",
        border: `1px solid ${viewMode === mode ? accent : isDark ? "#3a2e22" : "#ccc6b8"}`,
        color: viewMode === mode ? (isDark ? "#0f1a0f" : "#fff") : isDark ? "#c4b69c" : "#6a6258",
        borderRadius: 6, padding: "5px 14px", fontSize: 12,
        cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
      }}
    >
      {label}
    </button>
  );

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme: toggleThemePub, mesocycles }}>
      <div style={{ ...styles.app, overflowY: "auto", minHeight: "100vh" }}>
        {/* Header */}
        <div style={{ ...styles.header, gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              background: "none", border: `1px solid ${isDark ? "#3a2e22" : "#ccc6b8"}`,
              borderRadius: 8, padding: "6px 14px",
              color: isDark ? "#c4b69c" : "#6a6258",
              cursor: "pointer", fontFamily: "inherit", fontSize: 13, flexShrink: 0,
            }}
          >
            ← Retour
          </button>

          {/* Profile info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <AvatarCircle url={avatarUrl} firstName={firstName} lastName={lastName} size={34} accent={accent} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                ...styles.appTitle,
                fontSize: 15,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {displayName}
              </div>
              <div style={{ ...styles.appSub, fontSize: 11 }}>
                Planning · Lecture seule
              </div>
            </div>
          </div>

          <DayNightToggle
            isDark={isDark}
            onToggle={toggleThemePub}
            style={{ border: `1px solid ${isDark ? "#3a2e22" : "#ccc6b8"}`, borderRadius: 8 }}
          />
        </div>

        {/* Nav bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          borderBottom: `1px solid ${isDark ? "#2e2419" : "#d8d3ca"}`,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["week", "month", "year"].map((m, i) =>
              tabBtn(m, ["Semaine", "Mois", "Année"][i])
            )}
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
          <div style={{ padding: 40, textAlign: "center", color: isDark ? "#555" : "#aaa" }}>
            Planning non disponible.
          </div>
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

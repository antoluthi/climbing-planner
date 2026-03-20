import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { getMesoForDate } from "../lib/constants.js";
import { getCustomCyclesForDate } from "../lib/constants.js";
import { addDays, getMonthWeeks, getDaySessions, getDayCharge } from "../lib/helpers.js";

// ─── VUE ANNÉE ────────────────────────────────────────────────────────────────

export function YearView({ data, currentDate, onSelectMonth, isMobile, creatine, customCycles }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const year = currentDate.getFullYear();
  const today = new Date();

  return (
    <div style={{ ...styles.yearGrid, ...(isMobile ? styles.yearGridMobile : {}) }}>
      {Array.from({ length: 12 }, (_, month) => {
        const firstDay = new Date(year, month, 1);
        const lastDay  = new Date(year, month + 1, 0);
        const weeks    = getMonthWeeks(year, month);

        // Mesos present in this month (for the header dots)
        const monthMesos = [];
        for (const meso of (mesocycles || [])) {
          if (!meso.startDate) continue;
          const s = new Date(meso.startDate);
          const e = addDays(s, meso.durationWeeks * 7);
          if (s <= lastDay && e >= firstDay && !monthMesos.find(m => m.id === meso.id))
            monthMesos.push(meso);
        }

        const monthName = firstDay.toLocaleDateString("fr-FR", { month: isMobile ? "short" : "long" });
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        return (
          <div
            key={month}
            style={{ ...styles.yearMonthCard, ...(isCurrentMonth ? styles.yearMonthCardCurrent : {}) }}
            onClick={() => onSelectMonth(month)}
          >
            {/* Header: mois + dots mésocycles */}
            <div style={styles.yearMonthHeader}>
              <span style={{ ...styles.yearMonthName, ...(isCurrentMonth ? styles.yearMonthNameCurrent : {}) }}>
                {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
              </span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {monthMesos.map(m => (
                  <span key={m.id} style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, display: "inline-block", flexShrink: 0 }} title={m.label} />
                ))}
              </div>
            </div>

            {/* Heatmap: 1 ligne = 1 semaine, colorée par mésocycle/microcycle */}
            <div style={styles.yearHeatmap}>
              {weeks.map((wm, wi) => {
                const mesoInfo  = getMesoForDate(mesocycles, wm);
                const mesoColor = mesoInfo?.meso?.color;
                // Microcycle: check if micro changes mid-week vs previous week
                const prevMesoInfo = wi > 0 ? getMesoForDate(mesocycles, weeks[wi - 1]) : null;
                const microChanged = mesoInfo?.micro && prevMesoInfo?.micro && prevMesoInfo.micro.id !== mesoInfo.micro.id;

                return (
                  <div
                    key={wi}
                    style={{
                      ...styles.yearHeatmapRow,
                      borderLeft: mesoColor ? `2px solid ${mesoColor}99` : "2px solid transparent",
                      background: mesoColor
                        ? microChanged
                          ? mesoColor + "1e"   // micro transition: légèrement plus visible
                          : mesoColor + "12"
                        : "transparent",
                      borderRadius: 2,
                      gap: 1,
                    }}
                  >
                    {Array.from({ length: 7 }, (_, di) => {
                      const date     = addDays(wm, di);
                      const inMonth  = date.getMonth() === month;
                      const isToday  = date.toDateString() === today.toDateString();
                      const sessions = inMonth ? getDaySessions(data, date) : [];
                      const nSess    = sessions.length;
                      const dateISO  = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                      const hasCr    = inMonth && !!creatine?.[dateISO];
                      const activeCycles = inMonth ? getCustomCyclesForDate(customCycles, date) : [];

                      return (
                        <div
                          key={di}
                          style={{
                            ...styles.yearHeatmapCell,
                            background: "transparent",
                            outline: isToday ? `1px solid ${isDark ? "#c8906a" : "#8b4c20"}` : "none",
                            outlineOffset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {inMonth && nSess > 0 && (
                            <div style={{
                              width:        nSess > 1 ? 5 : 4,
                              height:       nSess > 1 ? 5 : 4,
                              borderRadius: "50%",
                              background:   getChargeColor(getDayCharge(data, date)),
                              opacity:      0.9,
                              flexShrink:   0,
                            }} />
                          )}
                          {hasCr && (
                            <span style={{ position: "absolute", top: 0, right: 0, fontSize: 4, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)", lineHeight: 1 }}>▲</span>
                          )}
                          {activeCycles.length > 0 && (
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", gap: 0, borderRadius: "0 0 2px 2px", overflow: "hidden" }}>
                              {activeCycles.slice(0, 2).map(cc => (
                                <div key={cc.id} title={cc.name} style={{ height: 2, background: cc.color, opacity: 0.8 }} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

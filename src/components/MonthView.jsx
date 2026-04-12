import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { DAYS, getCustomCyclesForDate, getMesoForDate } from "../lib/constants.js";
import { addDays, getMonthWeeks, getDaySessions } from "../lib/helpers.js";

// ─── VUE MOIS ─────────────────────────────────────────────────────────────────

export function MonthView({ data, currentDate, onSelectWeek, isMobile, mesocycles, onSessionClick, creatine, customCycles, objectives }) {
  const { styles, isDark } = useThemeCtx();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const weeks = getMonthWeeks(year, month);
  const today = new Date();

  return (
    <div style={styles.monthView}>
      <div style={styles.monthDayHeaders}>
        {DAYS.map(day => (
          <div key={day} style={styles.monthDayHeaderCell}>
            {isMobile ? day.slice(0, 1) : day}
          </div>
        ))}
      </div>
      {weeks.map((weekMonday, wi) => {
        const mesoInfo = getMesoForDate(mesocycles, weekMonday);
        const prevMesoInfo = wi > 0 ? getMesoForDate(mesocycles, weeks[wi - 1]) : null;
        const isNewMeso = mesoInfo && (!prevMesoInfo || prevMesoInfo.meso.id !== mesoInfo.meso.id);
        const isNewMicro = !isNewMeso && mesoInfo?.micro && prevMesoInfo?.micro && prevMesoInfo.micro.id !== mesoInfo.micro.id;
        const isFirstMicro = !isNewMeso && mesoInfo?.micro && !prevMesoInfo?.micro;
        return (
        <div key={wi}>
          {isNewMeso && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px 2px", borderLeft: `3px solid ${mesoInfo.meso.color}` }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: mesoInfo.meso.color, letterSpacing: "0.09em", textTransform: "uppercase" }}>{mesoInfo.meso.label}</span>
              {mesoInfo.micro && <span style={{ fontSize: 9, color: mesoInfo.meso.color + "bb", background: mesoInfo.meso.color + "22", padding: "0 5px", borderRadius: 8, border: `1px solid ${mesoInfo.meso.color}33` }}>{mesoInfo.micro.label}</span>}
            </div>
          )}
          {(isNewMicro || isFirstMicro) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 1px 14px", borderLeft: `3px solid ${mesoInfo.meso.color}44` }}>
              <span style={{ fontSize: 8, color: mesoInfo.meso.color + "bb", letterSpacing: "0.06em" }}>↳</span>
              <span style={{ fontSize: 9, color: mesoInfo.meso.color + "cc", background: mesoInfo.meso.color + "18", padding: "0 5px", borderRadius: 8, border: `1px solid ${mesoInfo.meso.color}28` }}>{mesoInfo.micro.label}</span>
            </div>
          )}
          <div style={{ ...styles.monthWeekRow, borderLeft: mesoInfo ? `3px solid ${mesoInfo.meso.color}55` : "3px solid transparent" }}>
          {Array.from({ length: 7 }, (_, di) => {
            const date = addDays(weekMonday, di);
            const inMonth = date.getMonth() === month;
            const isToday = date.toDateString() === today.toDateString();
            const sessions = inMonth ? getDaySessions(data, date) : [];
            const dateISO = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
            const hasCreatine = inMonth && !!creatine?.[dateISO];
            const activeCycles = inMonth ? getCustomCyclesForDate(customCycles, date) : [];
            const dayObjectives = inMonth ? (objectives || []).filter(o => {
              if (o.startDate === dateISO) return true;
              if (o.endDate && o.startDate <= dateISO && o.endDate >= dateISO) return true;
              return false;
            }) : [];

            return (
              <div
                key={di}
                style={{
                  ...styles.monthDayCell,
                  ...(isMobile ? styles.monthDayCellMobile : {}),
                  ...(inMonth ? {} : styles.monthDayCellOut),
                  ...(isToday ? styles.monthDayCellToday : {}),
                }}
                onClick={() => inMonth && onSelectWeek(weekMonday)}
              >
                <span style={{ ...styles.monthDayNum, ...(isToday ? styles.monthDayNumToday : {}) }}>
                  {date.getDate()}
                </span>
                {!isMobile && sessions.length > 0 && (
                  <div style={styles.monthDayContent}>
                    {sessions.slice(0, 2).map((s, si) => (
                      <div
                        key={si}
                        style={{
                          ...styles.monthSessionRow,
                          background: getChargeColor(s.charge, isDark) + (isDark ? "22" : "33"),
                          borderLeft: `2px solid ${getChargeColor(s.charge, isDark)}`,
                          cursor: "pointer",
                        }}
                        onClick={e => { e.stopPropagation(); onSessionClick && onSessionClick(date, si); }}
                      >
                        <span style={{ ...styles.monthSessionLabel, color: getChargeColor(s.charge, isDark) }}>
                          {s.name.length > 18 ? s.name.slice(0, 18) + "…" : s.name}
                        </span>
                      </div>
                    ))}
                    {sessions.length > 2 && (
                      <span style={styles.monthMoreLabel}>+{sessions.length - 2}</span>
                    )}
                  </div>
                )}
                {isMobile && sessions.length > 0 && (
                  <div style={styles.monthMobileDots}>
                    {sessions.slice(0, 3).map((s, si) => (
                      <div
                        key={si}
                        style={{ ...styles.monthMobileDot, background: getChargeColor(s.charge) }}
                      />
                    ))}
                  </div>
                )}
                {activeCycles.length > 0 && !isMobile && (
                  <div style={styles.customCycleBars}>
                    {activeCycles.slice(0, 4).map(cc => (
                      <div key={cc.id} title={cc.name} style={{ ...styles.customCycleBar, background: cc.color }} />
                    ))}
                  </div>
                )}
                {activeCycles.length > 0 && isMobile && (
                  <div style={styles.customCycleDots}>
                    {activeCycles.slice(0, 3).map(cc => (
                      <div key={cc.id} title={cc.name} style={{ ...styles.customCycleDot, background: cc.color }} />
                    ))}
                  </div>
                )}

                {dayObjectives.length > 0 && !isMobile && (
                  <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                    {dayObjectives.slice(0, 2).map(o => (
                      <div key={o.id} style={{
                        fontSize: 8, fontWeight: 700, color: o.color || "#f59e0b",
                        background: (o.color || "#f59e0b") + "18",
                        border: `1px solid ${(o.color || "#f59e0b")}33`,
                        borderRadius: 3, padding: "0 3px", lineHeight: "14px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                      }}>{o.name.length > 10 ? o.name.slice(0, 9) + "…" : o.name}</div>
                    ))}
                  </div>
                )}
                {dayObjectives.length > 0 && isMobile && (
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 1 }}>
                    {dayObjectives.slice(0, 2).map(o => (
                      <div key={o.id} style={{ width: 5, height: 5, borderRadius: "50%", background: o.color || "#f59e0b", border: `1px solid ${(o.color || "#f59e0b")}88` }} />
                    ))}
                  </div>
                )}
                {hasCreatine && (
                  <span style={{ position: "absolute", top: 2, right: 3, fontSize: 6, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", lineHeight: 1 }} title="Créatine">▲</span>
                )}
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

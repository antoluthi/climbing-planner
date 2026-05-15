import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { TodaySessionCard } from "./TodaySessionCard.jsx";
import { SessionCardSkeleton } from "./ui/Skeleton.jsx";
import { getChargeColor } from "../lib/charge.js";
import { DAYS, getMesoColor } from "../lib/constants.js";
import { addDays } from "../lib/helpers.js";

// ─── DAY LIST VIEW (mobile) ──────────────────────────────────────────────────
// Vue jour en liste de cards pour mobile, remplace la timeline 7 colonnes
// cramped. Permet 1-tap done, journal card, et CTA + Ajouter.

const timeKey = (t) => {
  if (!t || typeof t !== "string" || !t.includes(":")) return 9999;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function DayListView({
  monday,
  dayIndex,
  setDayIndex,
  sessions,
  weekSessions,        // [[Session, …], …] sur 7 jours — pour les dots
  weekQuickSessions,   // { dateISO: [QuickSession, …] } — events visibles dans le picker
  weekMeta,
  logWarning,
  onOpenSession,
  onOpenLog,
  onAddSession,
  onToggleSessionDone,
  quickSessions,
  onOpenQuickSession,
  isLoading,
}) {
  const { isDark, mesocycles } = useThemeCtx();

  const paper        = isDark ? "#1f2421" : "#fcf8ef";
  const paperDim     = isDark ? "#1a1f1c" : "#f7f1e2";
  const surfaceCard  = isDark ? "#1f2421" : "#ffffff";
  const border       = isDark ? "#2a302a" : "#e6dfd1";
  const text         = isDark ? "#e8e4de" : "#2a2218";
  const textMid      = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight    = isDark ? "#7a7570" : "#8a7f70";
  const accent       = isDark ? "#c8906a" : "#8b4c20";
  const inkPrimary   = isDark ? "#c8c0b4" : "#2a2218";

  const day = addDays(monday, dayIndex);
  const dayLabelFull = day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const totalCharge = sessions.reduce((s, x) => s + (x.charge || 0), 0);

  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  // Combine sessions + quick sessions, sort by time
  const sortedSessions = [...sessions]
    .map((s, i) => ({ s, _idx: i }))
    .sort((a, b) => timeKey(a.s.startTime) - timeKey(b.s.startTime));

  // Journal card state
  const journalState = logWarning?.hasWarning
    ? "warn"
    : logWarning?.isComplete
      ? "complete"
      : logWarning?.isFuture
        ? "future"
        : "empty";

  const journalText = (() => {
    if (journalState === "complete") return { title: "Journal complété", sub: "4/4 sections" };
    if (journalState === "warn") return { title: "Journal du jour à compléter", sub: logWarning?.warningText || "Manque des éléments" };
    if (journalState === "future") return { title: "Journal", sub: "à venir" };
    return { title: "Journal du jour", sub: "Ajouter une note, un poids…" };
  })();

  const journalColors = (() => {
    if (journalState === "warn")     return { bg: isDark ? "#2a1808" : "#fbecdc", border: isDark ? "#5a3a10" : "#f0c890", fg: isDark ? "#fbbf24" : "#8a4f10" };
    if (journalState === "complete") return { bg: isDark ? "#1c2d20" : "#e7f2e0", border: isDark ? "#3a5a3a" : "#a8d0a8", fg: isDark ? "#7ab890" : "#2e6b3f" };
    return { bg: surfaceCard, border: border, fg: accent };
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: paperDim }}>
      {/* Day picker tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "8px 12px 4px",
        background: paperDim, borderBottom: `1px solid ${border}`,
        overflowX: "auto",
      }}>
        {DAYS.map((d, i) => {
          const di = addDays(monday, i);
          const isI = di.toDateString() === new Date().toDateString();
          const active = dayIndex === i;
          // Compteur de séances pour ce jour : sessions planifiées +
          // événements (multi-jour inclus). Max 3 dots visibles, sinon
          // un "+N" en chiffre.
          const daySessionsCount = Array.isArray(weekSessions?.[i]) ? weekSessions[i].length : 0;
          const iso = `${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,'0')}-${String(di.getDate()).padStart(2,'0')}`;
          const dayQuickCount = (weekQuickSessions?.[iso]?.length) || 0;
          const totalCount = daySessionsCount + dayQuickCount;
          const dotColor = active ? "#fff" : (isI ? accent : textLight);
          return (
            <button
              key={i}
              onClick={() => setDayIndex(i)}
              style={{
                flex: 1, minWidth: 42,
                padding: "6px 4px 4px", borderRadius: 8,
                background: active ? accent : "transparent",
                color: active ? "#fff" : (isI ? accent : textMid),
                border: active ? "none" : `1px solid ${border}`,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: active ? 1 : 0.8 }}>
                {d.slice(0, 3)}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{di.getDate()}</span>
              {/* Dots : 1 point par séance, max 3 + "·+N" si plus */}
              <span style={{ display: "flex", alignItems: "center", gap: 2, height: 6, marginTop: 2 }}>
                {totalCount === 0 ? null : totalCount <= 3 ? (
                  Array.from({ length: totalCount }, (_, k) => (
                    <span
                      key={k}
                      style={{ width: 4, height: 4, borderRadius: "50%", background: dotColor }}
                    />
                  ))
                ) : (
                  <>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: dotColor }} />
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: dotColor }} />
                    <span style={{ fontSize: 8, fontWeight: 600, color: dotColor, lineHeight: 1, marginLeft: 1 }}>+{totalCount - 2}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Header day */}
      <div style={{
        padding: "16px 18px 12px",
        background: isDark
          ? `linear-gradient(180deg, ${paper}, ${paperDim})`
          : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
      }}>
        <div style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 22, fontWeight: 500, color: text,
          textTransform: "capitalize", lineHeight: 1.2,
        }}>
          {dayLabelFull}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 12, color: textLight }}>
          {totalCharge > 0 && (
            <span style={{
              background: getChargeColor(totalCharge) + "22",
              color: getChargeColor(totalCharge),
              borderRadius: 14, padding: "3px 10px",
              fontWeight: 700, fontSize: 11,
            }}>Charge · {totalCharge}</span>
          )}
          <span>{sessions.length} séance{sessions.length > 1 ? "s" : ""}</span>
          {meso && mesoColor && (
            <span style={{
              background: mesoColor + "22", color: mesoColor,
              borderRadius: 12, padding: "2px 9px",
              fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
            }}>{meso}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Journal card */}
        <button
          onClick={onOpenLog}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: journalColors.bg,
            border: `1px solid ${journalColors.border}`,
            borderRadius: 12, padding: "12px 14px",
            width: "100%", textAlign: "left", fontFamily: "inherit",
            cursor: "pointer", marginTop: 12,
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: journalState === "complete" ? "#2e6b3f" : journalState === "warn" ? "#f0c890" : accent + "22",
            color: journalState === "complete" ? "#fff" : journalState === "warn" ? "#8a4f10" : accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
            {journalState === "complete" ? "✓" : journalState === "warn" ? "!" : "✎"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{journalText.title}</div>
            <div style={{ fontSize: 11, color: textLight, marginTop: 1 }}>{journalText.sub}</div>
          </div>
          <span style={{ color: textLight, fontSize: 16 }}>›</span>
        </button>

        {/* Sessions list */}
        {isLoading ? (
          <SessionCardSkeleton count={3} />
        ) : sortedSessions.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "32px 16px",
            color: textLight, fontSize: 13,
            background: surfaceCard, border: `1px dashed ${border}`,
            borderRadius: 12,
          }}>
            Aucune séance prévue pour ce jour.
          </div>
        ) : (
          sortedSessions.map(({ s, _idx }) => (
            <TodaySessionCard
              key={`s${_idx}`}
              session={s}
              onTap={() => onOpenSession(_idx)}
              onToggleDone={() => onToggleSessionDone?.(_idx, s)}
            />
          ))
        )}

        {/* Quick sessions (lightweight events) */}
        {(quickSessions || []).map(qs => (
          <button
            key={qs.id}
            onClick={() => onOpenQuickSession?.(qs)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: surfaceCard, border: `1px solid ${border}`,
              borderLeft: `4px solid ${qs.color || accent}`,
              borderRadius: 10, padding: "10px 12px",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <div style={{ flex: 1 }}>
              {qs.startTime && (
                <div style={{ fontSize: 11, color: textLight, fontWeight: 500 }}>
                  {qs.startTime}{qs.allDay ? "" : (qs.endTime ? ` – ${qs.endTime}` : "")}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{qs.name}</div>
            </div>
            {qs.isObjective && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                background: (qs.color || accent) + "22", color: (qs.color || accent),
                borderRadius: 4, padding: "2px 6px",
              }}>OBJ</span>
            )}
          </button>
        ))}

        {/* Add CTA */}
        <button
          onClick={onAddSession}
          style={{
            background: inkPrimary,
            color: isDark ? paper : "#fff",
            border: "none", borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            letterSpacing: "0.02em",
            marginTop: 4,
          }}
        >+ Ajouter une séance</button>
      </div>
    </div>
  );
}

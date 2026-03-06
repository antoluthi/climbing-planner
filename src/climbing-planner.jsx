import { useState, useEffect, useRef } from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const SESSIONS = [
  { id: 1, type: "Exercice", name: "Récup active", charge: 0 },
  { id: 2, type: "Exercice", name: "Renfo antagoniste bas du corps", charge: 3 },
  { id: 3, type: "Exercice", name: "Renfo antagoniste haut du corps", charge: 3 },
  { id: 4, type: "Exercice", name: "Abdos au sol", charge: 6 },
  { id: 5, type: "Exercice", name: "Travail de dalle équilibre", charge: 6 },
  { id: 6, type: "Exercice", name: "Anneaux / TRX (force)", charge: 8 },
  { id: 7, type: "Exercice", name: "Force-endurance doigts", charge: 12 },
  { id: 8, type: "Exercice", name: "Gainage suspendu (force-endurance)", charge: 12 },
  { id: 9, type: "Exercice", name: "Gullich (force-endurance)", charge: 12 },
  { id: 10, type: "Exercice", name: "Tirage prise (force-endurance)", charge: 12 },
  { id: 11, type: "Exercice", name: "Gainage suspendu (force)", charge: 20 },
  { id: 12, type: "Exercice", name: "Gullich (force)", charge: 20 },
  { id: 13, type: "Exercice", name: "Tirage prise lestée (force)", charge: 20 },
  { id: 14, type: "Exercice", name: "Force max biceps", charge: 25 },
  { id: 15, type: "Exercice", name: "Force doigts", charge: 25 },
  { id: 16, type: "Séance", name: "Récup active / mobilité", charge: 0 },
  { id: 17, type: "Séance", name: "Bloc libre plaisir 2h max", charge: 16 },
  { id: 18, type: "Séance", name: "Voies qualitatif (4-5 essais)", charge: 16 },
  { id: 19, type: "Séance", name: "Journée en bloc extérieurs", charge: 18 },
  { id: 20, type: "Séance", name: "Endurance au seuil (doublettes etc)", charge: 20 },
  { id: 21, type: "Séance", name: "Journée en falaise diff", charge: 20 },
  { id: 22, type: "Séance", name: "Empilement de bloc / fartlek", charge: 24 },
  { id: 23, type: "Séance", name: "Travail de blocs très durs", charge: 24 },
  { id: 24, type: "Séance", name: "Grande voie (250-300m)", charge: 24 },
  { id: 25, type: "Séance", name: "Panneau : endurance de force / rési longue", charge: 24 },
  { id: 26, type: "Séance", name: "Muscu dans le geste / PPO (F-E)", charge: 27 },
  { id: 27, type: "Séance", name: "Panneau : force-endurance / rési courte", charge: 27 },
  { id: 28, type: "Séance", name: "Travail de coordination complexe", charge: 30 },
  { id: 29, type: "Séance", name: "Bloc sur panneau / Moon / Kilter", charge: 36 },
  { id: 30, type: "Séance", name: "Pletnev biceps", charge: 40 },
  { id: 31, type: "Séance", name: "Simulation compète", charge: 40 },
  { id: 32, type: "Séance", name: "Week-end de compétition", charge: 54 },
];

const MESOCYCLES = [
  { label: "Mise en condition", color: "#4ade80" },
  { label: "Base orientée", color: "#60a5fa" },
  { label: "Pré-comp", color: "#f97316" },
  { label: "Comp / Objectif", color: "#f43f5e" },
  { label: "Récupération", color: "#a78bfa" },
];

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getChargeColor(charge) {
  if (charge === 0) return "#4ade80";
  if (charge <= 12) return "#86efac";
  if (charge <= 20) return "#fbbf24";
  if (charge <= 30) return "#f97316";
  return "#f43f5e";
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function weekKey(monday) {
  return monday.toISOString().slice(0, 10);
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────

function loadData() {
  try {
    const raw = localStorage.getItem("climbing_planner_v1");
    return raw ? JSON.parse(raw) : { weeks: {}, weekMeta: {} };
  } catch {
    return { weeks: {}, weekMeta: {} };
  }
}

function saveData(data) {
  localStorage.setItem("climbing_planner_v1", JSON.stringify(data));
}

// ─── HELPERS ACCÈS PAR DATE ───────────────────────────────────────────────────

function getDaySessions(data, date) {
  const monday = getMondayOf(date);
  const wKey = weekKey(monday);
  const ws = data.weeks[wKey];
  if (!ws) return [];
  const day = date.getDay();
  const idx = day === 0 ? 6 : day - 1;
  return ws[idx] || [];
}

function getDayCharge(data, date) {
  return getDaySessions(data, date).reduce((a, s) => a + s.charge, 0);
}

function getMonthWeeks(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMondayOf(firstDay);
  const weeks = [];
  let d = new Date(startMonday);
  while (d <= lastDay) {
    weeks.push(new Date(d));
    d = addDays(d, 7);
  }
  return weeks;
}

// ─── HOOK LARGEUR FENÊTRE ─────────────────────────────────────────────────────

function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ─── EXPORT / IMPORT ─────────────────────────────────────────────────────────

function SyncButtons({ data, onImport, compact }) {
  const importRef = useRef(null);

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planif-escalade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.weeks !== undefined && parsed.weekMeta !== undefined) {
          onImport(parsed);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const btnStyle = compact ? styles.syncBtnCompact : styles.syncBtn;

  return (
    <div style={styles.syncBtns}>
      <button style={btnStyle} onClick={handleExport} title="Exporter les données">
        {compact ? "↓" : "↓ Exporter"}
      </button>
      <button style={btnStyle} onClick={() => importRef.current?.click()} title="Importer les données">
        {compact ? "↑" : "↑ Importer"}
      </button>
      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImport}
      />
    </div>
  );
}

// ─── MODAL: Ajouter une séance ────────────────────────────────────────────────

function SessionPicker({ onSelect, onClose }) {
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");

  const filtered = SESSIONS.filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Choisir une séance</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalFilters}>
          <input
            style={styles.searchInput}
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div style={styles.filterTabs}>
            {["Tous", "Séance", "Exercice"].map(f => (
              <button
                key={f}
                style={{ ...styles.filterTab, ...(filter === f ? styles.filterTabActive : {}) }}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.sessionList}>
          {filtered.map(s => (
            <div key={s.id} style={styles.sessionItem} onClick={() => onSelect(s)}>
              <div style={styles.sessionItemLeft}>
                <span style={{ ...styles.sessionTypeBadge, background: s.type === "Séance" ? "#1e3a5f" : "#1a2e1a" }}>
                  {s.type}
                </span>
                <span style={styles.sessionItemName}>{s.name}</span>
              </div>
              <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>
                {s.charge}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={styles.emptySearch}>Aucune séance trouvée</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: Feedback séance ───────────────────────────────────────────────────

function FeedbackModal({ session, dayLabel, onSave, onClose }) {
  const [rpe, setRpe] = useState(session.feedback?.rpe ?? 5);
  const [quality, setQuality] = useState(session.feedback?.quality ?? 3);
  const [notes, setNotes] = useState(session.feedback?.notes ?? "");
  const [done, setDone] = useState(session.feedback?.done ?? true);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <span style={styles.modalTitle}>Feedback</span>
            <div style={styles.feedbackSubtitle}>{dayLabel} · {session.name}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.feedbackBody}>
          <label style={styles.feedbackLabel}>
            <span>Séance réalisée ?</span>
            <div style={styles.doneToggle}>
              <button style={{ ...styles.doneBtn, ...(done ? styles.doneBtnActive : {}) }} onClick={() => setDone(true)}>Oui</button>
              <button style={{ ...styles.doneBtn, ...(!done ? styles.doneBtnActiveNeg : {}) }} onClick={() => setDone(false)}>Non</button>
            </div>
          </label>
          {done && <>
            <label style={styles.feedbackLabel}>
              <span>Fatigue RPE</span>
              <span style={{ ...styles.rpeValue, color: getChargeColor(rpe * 3) }}>{rpe} / 10</span>
            </label>
            <input type="range" min="1" max="10" value={rpe} onChange={e => setRpe(+e.target.value)} style={styles.slider} />
            <label style={styles.feedbackLabel}>
              <span>Qualité de séance</span>
              <div style={styles.stars}>
                {[1,2,3,4,5].map(i => (
                  <button key={i} style={{ ...styles.star, color: i <= quality ? "#fbbf24" : "#444" }} onClick={() => setQuality(i)}>★</button>
                ))}
              </div>
            </label>
            <label style={styles.feedbackLabel}><span>Notes</span></label>
            <textarea
              style={styles.textarea}
              placeholder="Sensations, observations, ajustements..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </>}
        </div>
        <div style={styles.feedbackFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button style={styles.saveBtn} onClick={() => onSave({ rpe, quality, notes, done })}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPOSANT JOUR ───────────────────────────────────────────────────────────

function DayColumn({ dayLabel, dateLabel, sessions, isToday, onAddSession, onFeedback, onRemove, isMobile }) {
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);

  return (
    <div style={{
      ...styles.dayCol,
      ...(isToday ? styles.dayColToday : {}),
      ...(isMobile ? styles.dayColMobile : {}),
    }}>
      <div style={isMobile ? styles.dayHeaderMobile : styles.dayHeader}>
        <div style={isMobile ? styles.dayHeaderMobileLeft : undefined}>
          <span style={{ ...styles.dayName, ...(isToday ? styles.dayNameToday : {}) }}>{dayLabel}</span>
          <span style={styles.dayDate}>{dateLabel}</span>
        </div>
        {totalCharge > 0 && (
          <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>
            ⚡{totalCharge}
          </span>
        )}
      </div>

      <div style={styles.sessionCards}>
        {sessions.map((s, i) => (
          <div key={i} style={styles.sessionCard}>
            <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
            <div style={styles.sessionCardContent}>
              <span style={styles.sessionCardName}>{s.name}</span>
              <div style={styles.sessionCardFooter}>
                <span style={{ ...styles.sessionCardCharge, color: getChargeColor(s.charge) }}>⚡{s.charge}</span>
                {s.feedback && (
                  <span style={styles.feedbackDot} title="Feedback enregistré">
                    {s.feedback.done ? "✓" : "✗"}
                  </span>
                )}
              </div>
            </div>
            <div style={styles.sessionCardActions}>
              <button style={styles.actionBtn} title="Feedback" onClick={() => onFeedback(i)}>
                {s.feedback ? "📋" : "＋"}
              </button>
              <button style={styles.actionBtn} title="Supprimer" onClick={() => onRemove(i)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <button style={styles.addBtn} onClick={onAddSession}>
        <span style={styles.addBtnIcon}>＋</span>
        <span style={styles.addBtnLabel}>Séance</span>
      </button>
    </div>
  );
}

// ─── VUE MOIS ─────────────────────────────────────────────────────────────────

function MonthView({ data, currentDate, onSelectWeek, isMobile }) {
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
      {weeks.map((weekMonday, wi) => (
        <div key={wi} style={styles.monthWeekRow}>
          {Array.from({ length: 7 }, (_, di) => {
            const date = addDays(weekMonday, di);
            const inMonth = date.getMonth() === month;
            const isToday = date.toDateString() === today.toDateString();
            const sessions = inMonth ? getDaySessions(data, date) : [];
            const charge = sessions.reduce((a, s) => a + s.charge, 0);

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
                          background: getChargeColor(s.charge) + "22",
                          borderLeft: `2px solid ${getChargeColor(s.charge)}`,
                        }}
                      >
                        <span style={{ ...styles.monthSessionLabel, color: getChargeColor(s.charge) }}>
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
                {charge > 0 && (
                  <div style={{ ...styles.monthDayChargeBar, background: getChargeColor(charge) }} />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── VUE ANNÉE ────────────────────────────────────────────────────────────────

function YearView({ data, currentDate, onSelectMonth, isMobile }) {
  const year = currentDate.getFullYear();
  const today = new Date();

  return (
    <div style={{ ...styles.yearGrid, ...(isMobile ? styles.yearGridMobile : {}) }}>
      {Array.from({ length: 12 }, (_, month) => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const weeks = getMonthWeeks(year, month);

        let totalCharge = 0;
        for (let d = new Date(firstDay); d <= lastDay; d = addDays(d, 1)) {
          totalCharge += getDayCharge(data, d);
        }

        const monthName = firstDay.toLocaleDateString("fr-FR", { month: isMobile ? "short" : "long" });
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        return (
          <div
            key={month}
            style={{ ...styles.yearMonthCard, ...(isCurrentMonth ? styles.yearMonthCardCurrent : {}) }}
            onClick={() => onSelectMonth(month)}
          >
            <div style={styles.yearMonthHeader}>
              <span style={{ ...styles.yearMonthName, ...(isCurrentMonth ? styles.yearMonthNameCurrent : {}) }}>
                {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
              </span>
              {totalCharge > 0 && (
                <span style={{ ...styles.yearMonthCharge, color: getChargeColor(totalCharge / 25) }}>
                  {totalCharge}
                </span>
              )}
            </div>
            <div style={styles.yearHeatmap}>
              {weeks.map((wm, wi) => (
                <div key={wi} style={styles.yearHeatmapRow}>
                  {Array.from({ length: 7 }, (_, di) => {
                    const date = addDays(wm, di);
                    const inMonth = date.getMonth() === month;
                    const charge = inMonth ? getDayCharge(data, date) : 0;
                    const isToday = date.toDateString() === today.toDateString();
                    return (
                      <div
                        key={di}
                        style={{
                          ...styles.yearHeatmapCell,
                          background: !inMonth ? "transparent" : charge === 0 ? "#1f2220" : getChargeColor(charge),
                          outline: isToday ? "1px solid #4ade80" : "none",
                          outlineOffset: 1,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function ClimbingPlanner() {
  const [data, setData] = useState(loadData);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("week");
  const [picker, setPicker] = useState(null);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [metaEditing, setMetaEditing] = useState(false);
  const [tempMeta, setTempMeta] = useState({});

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const monday = getMondayOf(currentDate);
  const wKey = weekKey(monday);
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const weekMeta = data.weekMeta[wKey] || { mesocycle: "", microcycle: "", note: "" };

  useEffect(() => { saveData(data); }, [data]);

  // ── Navigation ──
  const handlePrev = () => {
    if (viewMode === "week") setCurrentDate(d => addDays(d, -7));
    else if (viewMode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setCurrentDate(d => new Date(d.getFullYear() - 1, 0, 1));
  };

  const handleNext = () => {
    if (viewMode === "week") setCurrentDate(d => addDays(d, 7));
    else if (viewMode === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setCurrentDate(d => new Date(d.getFullYear() + 1, 0, 1));
  };

  // ── Label période ──
  const periodLabel = viewMode === "week"
    ? `${formatDate(monday)} — ${formatDate(addDays(monday, 6))}`
    : viewMode === "month"
    ? (() => {
        const s = currentDate.toLocaleDateString("fr-FR", {
          month: isMobile ? "short" : "long",
          year: "numeric",
        });
        return s.charAt(0).toUpperCase() + s.slice(1);
      })()
    : currentDate.getFullYear().toString();

  const isCurrentPeriod = viewMode === "week"
    ? weekKey(monday) === weekKey(getMondayOf(new Date()))
    : viewMode === "month"
    ? currentDate.getFullYear() === new Date().getFullYear() && currentDate.getMonth() === new Date().getMonth()
    : currentDate.getFullYear() === new Date().getFullYear();

  const periodCurrentLabel = viewMode === "week" ? "Semaine en cours" : viewMode === "month" ? "Mois en cours" : "Année en cours";

  // ── Charge totale période ──
  const totalPeriodCharge = (() => {
    if (viewMode === "week") return weekSessions.flat().reduce((a, s) => a + s.charge, 0);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = viewMode === "month" ? new Date(year, month, 1) : new Date(year, 0, 1);
    const lastDay = viewMode === "month" ? new Date(year, month + 1, 0) : new Date(year, 11, 31);
    let total = 0;
    for (let d = new Date(firstDay); d <= lastDay; d = addDays(d, 1)) {
      total += getDayCharge(data, d);
    }
    return total;
  })();

  // ── Handlers séances ──
  const updateWeekSessions = (newSessions) => {
    setData(d => ({ ...d, weeks: { ...d.weeks, [wKey]: newSessions } }));
  };

  const addSession = (dayIndex, session) => {
    const updated = weekSessions.map((d, i) => i === dayIndex ? [...d, { ...session, feedback: null }] : d);
    updateWeekSessions(updated);
  };

  const removeSession = (dayIndex, sessionIndex) => {
    const updated = weekSessions.map((d, i) => i === dayIndex ? d.filter((_, j) => j !== sessionIndex) : d);
    updateWeekSessions(updated);
  };

  const saveFeedback = (dayIndex, sessionIndex, feedback) => {
    const updated = weekSessions.map((d, i) => i === dayIndex
      ? d.map((s, j) => j === sessionIndex ? { ...s, feedback } : s)
      : d
    );
    updateWeekSessions(updated);
    setFeedbackTarget(null);
  };

  const saveMeta = () => {
    setData(d => ({ ...d, weekMeta: { ...d.weekMeta, [wKey]: tempMeta } }));
    setMetaEditing(false);
  };

  const viewToggle = (
    <div style={styles.viewToggle}>
      {[
        { mode: "week", label: "Sem" },
        { mode: "month", label: "Mois" },
        { mode: "year", label: "An" },
      ].map(({ mode, label }) => (
        <button
          key={mode}
          style={{ ...styles.viewToggleBtn, ...(viewMode === mode ? styles.viewToggleBtnActive : {}) }}
          onClick={() => setViewMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ ...styles.app, overflowY: isMobile ? "auto" : "hidden", overflowX: "hidden" }}>
      <div style={styles.grain} />

      {/* ── HEADER MOBILE ── */}
      {isMobile ? (
        <div style={styles.headerMobile}>
          <div style={styles.headerMobileRow1}>
            <div style={styles.headerLeft}>
              <span style={styles.logo}>⛰</span>
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
            </div>
            <div style={styles.headerMobileRight}>
              <div style={styles.totalChargeMobile}>
                <span style={styles.totalChargeNum}>{totalPeriodCharge}</span>
                <span style={styles.totalChargeLabel}>charge</span>
              </div>
            </div>
          </div>
          <div style={styles.headerMobileRow2}>
            {viewToggle}
            <SyncButtons data={data} onImport={setData} compact />
          </div>
          <div style={styles.weekNavMobile}>
            <button style={styles.navBtn} onClick={handlePrev}>←</button>
            <div style={styles.weekLabel}>
              <div style={styles.weekRange}>{periodLabel}</div>
              {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
            </div>
            <button style={styles.navBtn} onClick={handleNext}>→</button>
          </div>
        </div>
      ) : (
        /* ── HEADER DESKTOP ── */
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.logo}>⛰</span>
            <div>
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
              <div style={styles.appSub}>
                {viewMode === "week" ? "Vue semaine" : viewMode === "month" ? "Vue mois" : "Vue année"} · Bloc
              </div>
            </div>
          </div>
          <div style={styles.weekNav}>
            <button style={styles.navBtn} onClick={handlePrev}>←</button>
            <div style={styles.weekLabel}>
              <div style={styles.weekRange}>{periodLabel}</div>
              {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
            </div>
            <button style={styles.navBtn} onClick={handleNext}>→</button>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.headerRightTop}>
              {viewToggle}
              <SyncButtons data={data} onImport={setData} compact />
            </div>
            <div style={styles.totalCharge}>
              <span style={styles.totalChargeNum}>{totalPeriodCharge}</span>
              <span style={styles.totalChargeLabel}>
                charge {viewMode === "week" ? "semaine" : viewMode === "month" ? "mois" : "année"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Méta semaine — uniquement en vue semaine desktop ── */}
      {viewMode === "week" && !isMobile && (
        <div style={styles.metaBar}>
          {metaEditing ? (
            <div style={styles.metaForm}>
              <select style={styles.metaSelect} value={tempMeta.mesocycle || ""} onChange={e => setTempMeta(m => ({ ...m, mesocycle: e.target.value }))}>
                <option value="">— Mésocycle —</option>
                {MESOCYCLES.map(m => <option key={m.label} value={m.label}>{m.label}</option>)}
              </select>
              <input style={styles.metaInput} placeholder="Microcycle (ex: Développement)" value={tempMeta.microcycle || ""} onChange={e => setTempMeta(m => ({ ...m, microcycle: e.target.value }))} />
              <input style={styles.metaInput} placeholder="Note / thème de la semaine" value={tempMeta.note || ""} onChange={e => setTempMeta(m => ({ ...m, note: e.target.value }))} />
              <button style={styles.saveBtn} onClick={saveMeta}>OK</button>
              <button style={styles.cancelBtn} onClick={() => setMetaEditing(false)}>✕</button>
            </div>
          ) : (
            <div style={styles.metaDisplay} onClick={() => { setTempMeta(weekMeta); setMetaEditing(true); }}>
              {weekMeta.mesocycle ? (
                <>
                  <span style={{ ...styles.mesoTag, background: (MESOCYCLES.find(m => m.label === weekMeta.mesocycle)?.color || "#888") + "22", color: MESOCYCLES.find(m => m.label === weekMeta.mesocycle)?.color || "#888", borderColor: (MESOCYCLES.find(m => m.label === weekMeta.mesocycle)?.color || "#888") + "55" }}>
                    {weekMeta.mesocycle}
                  </span>
                  {weekMeta.microcycle && <span style={styles.microTag}>{weekMeta.microcycle}</span>}
                  {weekMeta.note && <span style={styles.noteTag}>"{weekMeta.note}"</span>}
                </>
              ) : (
                <span style={styles.metaPlaceholder}>＋ Définir mésocycle / thème semaine</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <>
          <div style={isMobile ? styles.gridMobile : styles.grid}>
            {DAYS.map((day, i) => {
              const date = addDays(monday, i);
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <DayColumn
                  key={i}
                  dayLabel={day}
                  dateLabel={formatDate(date)}
                  sessions={weekSessions[i] || []}
                  isToday={isToday}
                  onAddSession={() => setPicker({ dayIndex: i })}
                  onFeedback={(si) => setFeedbackTarget({ dayIndex: i, sessionIndex: si })}
                  onRemove={(si) => removeSession(i, si)}
                  isMobile={isMobile}
                />
              );
            })}
          </div>
          {!isMobile && (
            <div style={styles.chargeBar}>
              {DAYS.map((day, i) => {
                const dayCharge = (weekSessions[i] || []).reduce((a, s) => a + s.charge, 0);
                const pct = Math.min(dayCharge / 80 * 100, 100);
                return (
                  <div key={i} style={styles.chargeBarCol}>
                    <div style={styles.chargeBarTrack}>
                      <div style={{ ...styles.chargeBarFill, height: `${pct}%`, background: getChargeColor(dayCharge) }} />
                    </div>
                    <span style={{ ...styles.chargeBarLabel, color: dayCharge > 0 ? getChargeColor(dayCharge) : "#555" }}>{dayCharge || ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Vue mois ── */}
      {viewMode === "month" && (
        <MonthView
          data={data}
          currentDate={currentDate}
          isMobile={isMobile}
          onSelectWeek={(wm) => {
            setCurrentDate(wm);
            setViewMode("week");
          }}
        />
      )}

      {/* ── Vue année ── */}
      {viewMode === "year" && (
        <YearView
          data={data}
          currentDate={currentDate}
          isMobile={isMobile}
          onSelectMonth={(month) => {
            setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
            setViewMode("month");
          }}
        />
      )}

      {/* ── Modals ── */}
      {picker && (
        <SessionPicker
          onSelect={s => { addSession(picker.dayIndex, s); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {feedbackTarget && (
        <FeedbackModal
          session={(weekSessions[feedbackTarget.dayIndex] || [])[feedbackTarget.sessionIndex]}
          dayLabel={`${DAYS[feedbackTarget.dayIndex]} ${formatDate(addDays(monday, feedbackTarget.dayIndex))}`}
          onSave={(fb) => saveFeedback(feedbackTarget.dayIndex, feedbackTarget.sessionIndex, fb)}
          onClose={() => setFeedbackTarget(null)}
        />
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = {
  app: {
    minHeight: "100vh",
    background: "#0d0f0f",
    color: "#e8e4de",
    fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  },
  grain: {
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
    opacity: 0.4,
  },

  // ── Header desktop ──
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 24px 14px",
    borderBottom: "1px solid #1f2422",
    position: "relative", zIndex: 1,
    background: "linear-gradient(180deg, #111413 0%, #0d0f0f 100%)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { fontSize: 28 },
  appTitle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: "#c8c0b4" },
  appSub: { fontSize: 10, color: "#555", letterSpacing: "0.1em", marginTop: 2 },
  weekNav: { display: "flex", alignItems: "center", gap: 16 },
  navBtn: {
    background: "none", border: "1px solid #2a2e2b", color: "#8a9090", cursor: "pointer",
    width: 34, height: 34, borderRadius: 6, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s", flexShrink: 0,
  },
  weekLabel: { textAlign: "center", minWidth: 180 },
  weekRange: { fontSize: 13, color: "#c8c0b4", fontWeight: 600, letterSpacing: "0.05em" },
  weekCurrent: { fontSize: 10, color: "#4ade80", letterSpacing: "0.12em", marginTop: 3, textTransform: "uppercase" },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 },
  headerRightTop: { display: "flex", alignItems: "center", gap: 8 },
  totalCharge: { textAlign: "right" },
  totalChargeNum: { fontSize: 28, fontWeight: 700, color: "#e8e4de", lineHeight: 1 },
  totalChargeLabel: { display: "block", fontSize: 9, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 },

  // ── Header mobile ──
  headerMobile: {
    display: "flex", flexDirection: "column",
    borderBottom: "1px solid #1f2422",
    position: "relative", zIndex: 1,
    background: "linear-gradient(180deg, #111413 0%, #0d0f0f 100%)",
  },
  headerMobileRow1: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px 6px",
  },
  headerMobileRow2: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "4px 16px 8px",
  },
  headerMobileRight: { display: "flex", alignItems: "center", gap: 8 },
  weekNavMobile: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "6px 16px 10px",
    borderTop: "1px solid #181c1a",
  },
  totalChargeMobile: { textAlign: "right" },

  // ── View toggle ──
  viewToggle: { display: "flex", gap: 2 },
  viewToggleBtn: {
    background: "none", border: "1px solid #2a2e2b", color: "#6a7070",
    padding: "4px 12px", borderRadius: 4, cursor: "pointer",
    fontSize: 10, fontFamily: "inherit", letterSpacing: "0.08em",
    transition: "all 0.15s",
  },
  viewToggleBtnActive: { background: "#1f2820", border: "1px solid #4ade8066", color: "#4ade80" },

  // ── Sync buttons ──
  syncBtns: { display: "flex", gap: 4 },
  syncBtn: {
    background: "none", border: "1px solid #2a2e2b", color: "#6a7070",
    padding: "4px 10px", borderRadius: 4, cursor: "pointer",
    fontSize: 10, fontFamily: "inherit", letterSpacing: "0.06em",
    transition: "all 0.15s",
  },
  syncBtnCompact: {
    background: "none", border: "1px solid #2a2e2b", color: "#6a7070",
    width: 28, height: 28, borderRadius: 4, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },

  // ── Meta bar ──
  metaBar: {
    padding: "8px 24px",
    borderBottom: "1px solid #1a1d1b",
    minHeight: 42, display: "flex", alignItems: "center",
    position: "relative", zIndex: 1,
    background: "#0f1110",
  },
  metaDisplay: {
    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
    padding: "4px 0", width: "100%",
  },
  metaPlaceholder: { fontSize: 11, color: "#444", letterSpacing: "0.08em" },
  mesoTag: {
    fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid",
    fontWeight: 600, letterSpacing: "0.06em",
  },
  microTag: {
    fontSize: 11, color: "#8a9090", background: "#1a1d1b",
    padding: "3px 10px", borderRadius: 4,
  },
  noteTag: { fontSize: 11, color: "#5a6060", fontStyle: "italic" },
  metaForm: { display: "flex", gap: 8, alignItems: "center", width: "100%" },
  metaSelect: {
    background: "#1a1d1b", border: "1px solid #2a2e2b", color: "#c8c0b4",
    padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "inherit",
  },
  metaInput: {
    background: "#1a1d1b", border: "1px solid #2a2e2b", color: "#c8c0b4",
    padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "inherit", flex: 1,
  },

  // ── Grille semaine desktop ──
  grid: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    gap: 1, flex: 1, background: "#161918",
    position: "relative", zIndex: 1, minHeight: 420,
  },
  // ── Grille semaine mobile (empilée) ──
  gridMobile: {
    display: "flex", flexDirection: "column",
    background: "#161918", gap: 1,
    position: "relative", zIndex: 1,
  },
  dayCol: {
    background: "#0d0f0f",
    display: "flex", flexDirection: "column",
    padding: "10px 8px", minHeight: 200,
    position: "relative", transition: "background 0.15s",
  },
  dayColMobile: {
    minHeight: "auto", padding: "10px 16px",
    borderBottom: "1px solid #161918",
  },
  dayColToday: { background: "#0f1410", borderTop: "2px solid #4ade80" },
  dayHeader: {
    display: "flex", flexDirection: "column", gap: 1,
    marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #1a1d1b",
  },
  dayHeaderMobile: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #1a1d1b",
  },
  dayHeaderMobileLeft: { display: "flex", alignItems: "center", gap: 8 },
  dayName: { fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#6a7070", textTransform: "uppercase" },
  dayNameToday: { color: "#4ade80" },
  dayDate: { fontSize: 10, color: "#444" },
  dayCharge: { fontSize: 13, fontWeight: 700, marginTop: 2 },

  sessionCards: { display: "flex", flexDirection: "column", gap: 5, flex: 1 },
  sessionCard: {
    background: "#131615", border: "1px solid #1e2220",
    borderRadius: 5, display: "flex", alignItems: "stretch",
    overflow: "hidden", cursor: "default", transition: "border-color 0.15s",
  },
  sessionCardAccent: { width: 3, flexShrink: 0 },
  sessionCardContent: { flex: 1, padding: "5px 7px" },
  sessionCardName: { fontSize: 10, color: "#b0a898", display: "block", lineHeight: 1.4, letterSpacing: "0.02em" },
  sessionCardFooter: { display: "flex", alignItems: "center", gap: 6, marginTop: 3 },
  sessionCardCharge: { fontSize: 10, fontWeight: 700 },
  feedbackDot: { fontSize: 10, color: "#4ade80" },
  sessionCardActions: { display: "flex", flexDirection: "column" },
  actionBtn: {
    background: "none", border: "none", color: "#3a4040", cursor: "pointer",
    padding: "3px 5px", fontSize: 10, lineHeight: 1, transition: "color 0.1s", flex: 1,
  },
  addBtn: {
    marginTop: 8, background: "none", border: "1px dashed #1f2422",
    color: "#3a4040", cursor: "pointer", borderRadius: 5,
    padding: "6px 4px", display: "flex", alignItems: "center", justifyContent: "center",
    gap: 4, fontSize: 10, letterSpacing: "0.06em", transition: "all 0.15s", width: "100%",
  },
  addBtnIcon: { fontSize: 12, lineHeight: 1 },
  addBtnLabel: {},

  // ── Charge bar ──
  chargeBar: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    gap: 1, background: "#161918", padding: "8px 0 10px",
    position: "relative", zIndex: 1,
  },
  chargeBarCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  chargeBarTrack: {
    width: 6, height: 40, background: "#1a1d1b", borderRadius: 3,
    display: "flex", alignItems: "flex-end", overflow: "hidden",
  },
  chargeBarFill: { width: "100%", borderRadius: 3, transition: "height 0.3s, background 0.3s" },
  chargeBarLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" },

  // ── Vue mois ──
  monthView: {
    flex: 1, position: "relative", zIndex: 1,
    padding: "16px 24px", overflowY: "auto",
  },
  monthDayHeaders: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    gap: 2, marginBottom: 6,
  },
  monthDayHeaderCell: {
    textAlign: "center", fontSize: 10, color: "#555",
    letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 0",
  },
  monthWeekRow: {
    display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
    gap: 2, marginBottom: 2,
  },
  monthDayCell: {
    background: "#131615", border: "1px solid #1a1d1b",
    borderRadius: 5, padding: "7px 8px", minHeight: 86,
    cursor: "pointer", display: "flex", flexDirection: "column",
    transition: "border-color 0.15s", position: "relative", overflow: "hidden",
  },
  monthDayCellMobile: { minHeight: 52, padding: "5px 4px" },
  monthDayCellOut: { opacity: 0.25, cursor: "default" },
  monthDayCellToday: { borderColor: "#4ade8055", background: "#0f1410" },
  monthDayNum: { fontSize: 12, fontWeight: 600, color: "#6a7070", lineHeight: 1 },
  monthDayNumToday: { color: "#4ade80" },
  monthDayContent: { display: "flex", flexDirection: "column", gap: 2, marginTop: 5, flex: 1 },
  monthSessionRow: { borderRadius: 3, padding: "2px 5px" },
  monthSessionLabel: { fontSize: 9, display: "block", letterSpacing: "0.02em", lineHeight: 1.35 },
  monthMoreLabel: { fontSize: 9, color: "#555", letterSpacing: "0.04em", paddingLeft: 2 },
  monthDayChargeBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderRadius: "0 0 5px 5px",
  },
  // Mobile month: dots instead of names
  monthMobileDots: { display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" },
  monthMobileDot: { width: 5, height: 5, borderRadius: "50%" },

  // ── Vue année ──
  yearGrid: {
    flex: 1, position: "relative", zIndex: 1,
    padding: "16px 24px",
    display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8, alignContent: "start", overflowY: "auto",
  },
  yearGridMobile: {
    gridTemplateColumns: "repeat(2, 1fr)",
    padding: "12px 16px",
  },
  yearMonthCard: {
    background: "#131615", border: "1px solid #1a1d1b",
    borderRadius: 7, padding: "12px", cursor: "pointer", transition: "border-color 0.15s",
  },
  yearMonthCardCurrent: { borderColor: "#4ade8044", background: "#0f1410" },
  yearMonthHeader: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8,
  },
  yearMonthName: { fontSize: 11, fontWeight: 600, color: "#8a9090", letterSpacing: "0.04em" },
  yearMonthNameCurrent: { color: "#4ade80" },
  yearMonthCharge: { fontSize: 13, fontWeight: 700 },
  yearHeatmap: { display: "flex", flexDirection: "column", gap: 2 },
  yearHeatmapRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 },
  yearHeatmapCell: { height: 8, borderRadius: 2 },

  // ── Modal ──
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#111413", border: "1px solid #1f2422",
    borderRadius: 10, width: "90%", maxWidth: 520,
    maxHeight: "80vh", display: "flex", flexDirection: "column",
    overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
  },
  modalHeader: {
    padding: "16px 18px", borderBottom: "1px solid #1a1d1b",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  modalTitle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#c8c0b4" },
  closeBtn: { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 },
  modalFilters: { padding: "12px 16px", borderBottom: "1px solid #1a1d1b", display: "flex", flexDirection: "column", gap: 8 },
  searchInput: {
    background: "#1a1d1b", border: "1px solid #2a2e2b", color: "#c8c0b4",
    padding: "8px 12px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", outline: "none",
  },
  filterTabs: { display: "flex", gap: 6 },
  filterTab: {
    background: "none", border: "1px solid #2a2e2b", color: "#6a7070",
    padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
    letterSpacing: "0.06em",
  },
  filterTabActive: { background: "#1f2820", border: "1px solid #4ade8066", color: "#4ade80" },
  sessionList: { overflowY: "auto", flex: 1 },
  sessionItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #141614",
    transition: "background 0.1s",
  },
  sessionItemLeft: { display: "flex", alignItems: "center", gap: 10 },
  sessionTypeBadge: {
    fontSize: 9, padding: "2px 7px", borderRadius: 3,
    color: "#8a9898", letterSpacing: "0.08em", textTransform: "uppercase",
  },
  sessionItemName: { fontSize: 12, color: "#b0a898" },
  chargePill: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4 },
  emptySearch: { padding: 20, textAlign: "center", color: "#444", fontSize: 12 },

  // ── Feedback ──
  feedbackSubtitle: { fontSize: 10, color: "#555", marginTop: 4, letterSpacing: "0.06em" },
  feedbackBody: { padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 },
  feedbackLabel: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    fontSize: 11, color: "#8a9090", letterSpacing: "0.08em",
  },
  doneToggle: { display: "flex", gap: 4 },
  doneBtn: {
    background: "#1a1d1b", border: "1px solid #2a2e2b", color: "#555",
    padding: "4px 14px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
  },
  doneBtnActive: { background: "#1f2820", border: "1px solid #4ade8066", color: "#4ade80" },
  doneBtnActiveNeg: { background: "#2a1515", border: "1px solid #f43f5e66", color: "#f43f5e" },
  rpeValue: { fontSize: 16, fontWeight: 700 },
  slider: { width: "100%", accentColor: "#4ade80", cursor: "pointer" },
  stars: { display: "flex", gap: 4 },
  star: { background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 },
  textarea: {
    background: "#1a1d1b", border: "1px solid #2a2e2b", color: "#c8c0b4",
    padding: "8px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit",
    resize: "vertical", outline: "none",
  },
  feedbackFooter: {
    padding: "12px 18px", borderTop: "1px solid #1a1d1b",
    display: "flex", justifyContent: "flex-end", gap: 8,
  },
  cancelBtn: {
    background: "none", border: "1px solid #2a2e2b", color: "#6a7070",
    padding: "7px 16px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
  },
  saveBtn: {
    background: "#1f2820", border: "1px solid #4ade8066", color: "#4ade80",
    padding: "7px 18px", borderRadius: 5, cursor: "pointer", fontSize: 11,
    fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.06em",
  },
};

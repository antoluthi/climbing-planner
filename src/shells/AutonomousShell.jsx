import { useState, useEffect, useRef, lazy, Suspense } from "react";

// ── Lib ──
import supabase from "../lib/supabase.js";
import { DAYS, getDayLogWarning, getMesoColor, getMesoForDate } from "../lib/constants.js";
import { getMondayOf, addDays, formatDate, weekKey, localDateStr, calcEndTime, getDayCharge } from "../lib/helpers.js";
import { generateId } from "../lib/storage.js";

// ── Theme ──
import { ThemeContext } from "../theme/ThemeContext.jsx";

// ── Hooks & Context ──
import { useWindowWidth } from "../hooks/useWindowWidth.js";
import { useAuth } from "../context/AuthContext.js";
import { useData } from "../context/DataContext.js";

// ── Components ──
import { ClimbingPlannerLogo } from "../components/Logo.jsx";
import { SyncButtons } from "../components/SyncButtons.jsx";
import { RoleOnboardingModal } from "../components/RoleOnboardingModal.jsx";
import { OnboardingModal } from "../components/OnboardingModal.jsx";
import { SessionScheduleModal } from "../components/SessionScheduleModal.jsx";
import { ConfirmModal } from "../components/ConfirmModal.jsx";
import { CustomSessionModal } from "../components/CustomSessionModal.jsx";
import { SessionComposer } from "../components/SessionComposer.jsx";
import { SessionPicker } from "../components/SessionPicker.jsx";
import { SessionModal } from "../components/SessionModal.jsx";
import { CoachPickerModal } from "../components/CoachPickerModal.jsx";
import { DayColumn } from "../components/DayColumn.jsx";
import { MonthView } from "../components/MonthView.jsx";
import { YearView } from "../components/YearView.jsx";
import { CyclesView } from "../components/CyclesView.jsx";
// Dashboard (Recharts) chargé à la demande : allège le bundle initial,
// sensible surtout au démarrage de la WebView Android.
const Dashboard = lazy(() => import("../components/Dashboard.jsx").then(m => ({ default: m.Dashboard })));
import { DayLogModal } from "../components/DayLogModal.jsx";
import { TemplateEditorModal } from "../components/TemplateEditorModal.jsx";
import { ProfileView } from "../components/ProfileView.jsx";
import { CoachLibraryView } from "../components/CoachLibraryView.jsx";
import { AccueilView } from "../components/AccueilView.jsx";
import { QuickSessionModal } from "../components/QuickSessionModal.jsx";
import { ToastContainer } from "../components/ToastContainer.jsx";
import { UpdateBanner } from "../components/UpdateBanner.jsx";
import { BottomNav } from "../components/BottomNav.jsx";
import { CalendarView } from "../components/CalendarView.jsx";
import { toast } from "../lib/toast.js";
import { setRootBackHandler } from "../lib/native.js";
import { NotificationBell } from "../components/NotificationBell.jsx";
import { NotificationsPanel } from "../components/NotificationsPanel.jsx";
import { getSessionCharge } from "../lib/charge.js";
import { colors } from "../theme/palette.js";

export function AutonomousShell({ isDark, toggleTheme, styles }) {
  const { session, setSession, syncStatus } = useAuth();
  const {
    data, setData, cloudLoaded, roleResolved, viewingAthlete,
    accountRole, needsRoleChoice, chooseRole,
    switchToAthlete, switchBackToCoach, pullFromCloud,
    uploadNow,
    catalog, saveUserSession, deleteUserSession,
    dbBlocks, saveBlock,
    communitySessions, pushToCommunity,
    athletes, searchAthletes, removeAthlete, myCoaches, leaveCoach, refreshMyCoaches,
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest,
    addMesocycle, updateMesocycle, deleteMesocycle,
    addMicrocycle, updateMicrocycle, deleteMicrocycle,
    addCustomCycle, updateCustomCycle, deleteCustomCycle,
    addQuickSession, editQuickSession, removeQuickSession,
    syncPlannedSessions,
    addSessionBlock, editSessionBlock, deleteSessionBlock,
  } = useData();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("accueil");
  const [sessionBuilderDay, setSessionBuilderDay] = useState(null);
  // Édition d'une séance existante : remplace en place à (weekKey, dayIndex, sessionIndex).
  const [sessionEditCtx, setSessionEditCtx] = useState(null);
  const [picker, setPicker] = useState(null);
  const [customSessionForm, setCustomSessionForm] = useState(null);
  const [sessionComposerForm, setSessionComposerForm] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [sessionModal, setSessionModal] = useState(null);
  const [logDate, setLogDate] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickSessionForm, setQuickSessionForm] = useState(null);
  const [pendingSchedule, setPendingSchedule] = useState(null);

  const swipeRef = useRef(null);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const monday = getMondayOf(currentDate);
  const wKey = weekKey(monday);
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const weekMeta = data.weekMeta[wKey] || { mesocycle: "", microcycle: "", note: "" };

  // ── Reset view on sign-out ──
  useEffect(() => {
    if (!session) setViewMode("accueil"); // eslint-disable-line react-hooks/set-state-in-effect
  }, [session]);

  // ── Bouton retour Android (APK) ──
  // Quand aucune modale n'est ouverte : retour à l'accueil depuis n'importe
  // quelle vue, sinon on laisse l'app se minimiser. No-op sur le web.
  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => setRootBackHandler(() => {
    if (viewModeRef.current !== "accueil") {
      setViewMode("accueil");
      return true;
    }
    return false;
  }), []);

  // ── Navigation ──
  const handleDateGoToCurrent = () => setCurrentDate(new Date());

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
    if (viewMode === "week") return weekSessions.flat().reduce((a, s) => a + getSessionCharge(s), 0);
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

  // Mutation rapide : bascule "fait / non-fait" en 1 tap depuis la liste.
  const toggleSessionDone = (smKey, dayIndex, sessionIndex) => {
    let prevFb = null;
    setData(d => {
      const ws = (d.weeks[smKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      const s = ws[dayIndex]?.[sessionIndex];
      if (!s) return d;
      const fb = s.feedback;
      prevFb = fb;
      const wasDone = fb?.status === "done" || fb?.status === "adapted" || (fb && fb.done);
      const newFb = wasDone
        ? null
        : { status: "done", done: true, rpe: fb?.rpe ?? null, quality: fb?.quality ?? null, notes: fb?.notes ?? "", blockFeedbacks: fb?.blockFeedbacks ?? [] };
      ws[dayIndex] = ws[dayIndex].map((sx, j) => j === sessionIndex ? { ...sx, feedback: newFb } : sx);
      return { ...d, weeks: { ...d.weeks, [smKey]: ws } };
    });
    const willBeDone = !(prevFb?.status === "done" || prevFb?.status === "adapted" || (prevFb && prevFb.done));
    toast.success(willBeDone ? "Marquée faite" : "Statut retiré", {
      undo: () => setData(d => {
        const ws = (d.weeks[smKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
        ws[dayIndex] = ws[dayIndex].map((sx, j) => j === sessionIndex ? { ...sx, feedback: prevFb } : sx);
        return { ...d, weeks: { ...d.weeks, [smKey]: ws } };
      }),
    });
  };

  const saveSessionFeedback = (feedback) => {
    if (!sessionModal) return;
    const { weekKey: smKey, dayIndex, sessionIndex } = sessionModal;

    setData(d => ({
      ...d,
      weeks: {
        ...d.weeks,
        [smKey]: (d.weeks[smKey] || Array(7).fill(null).map(() => [])).map((day, i) =>
          i === dayIndex ? day.map((s, j) => j === sessionIndex ? { ...s, feedback } : s) : d.weeks[smKey][i]
        ),
      },
    }));

    if (supabase && session?.user?.id) {
      const smSession = (data.weeks[smKey] || [])[dayIndex]?.[sessionIndex];
      const mondayDate = new Date(smKey);
      const fDate = new Date(mondayDate);
      fDate.setDate(mondayDate.getDate() + dayIndex);
      const feedbackDate = fDate.toISOString().split("T")[0];
      const athleteName = [data.profile?.firstName, data.profile?.lastName].filter(Boolean).join(" ") || null;
      supabase.from("session_feedbacks").upsert({
        user_id: session.user.id,
        athlete_name: athleteName,
        session_id: smSession?.id ?? null,
        session_name: smSession?.name ?? "",
        feedback_date: feedbackDate,
        week_key: smKey,
        done: feedback.done,
        rpe: feedback.rpe ?? null,
        quality: feedback.quality ?? null,
        notes: feedback.notes || null,
        block_feedbacks: feedback.blockFeedbacks?.length ? feedback.blockFeedbacks : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,session_name,feedback_date" })
        .then(({ error }) => { if (error) console.error("[session_feedbacks] upsert error:", error); });
    }

    setSessionModal(null);
    toast.success("Ressenti enregistré");
  };

  const openSessionModal = (wKey, dayIndex, sessionIndex) => {
    setSessionModal({ weekKey: wKey, dayIndex, sessionIndex });
  };

  // ── Déplacer / suggestions ──
  const moveSession = (fromWKey, fromDi, fromSi, toWKey, toDi, newStartTime, newLocation) => {
    let snapshot = null;
    setData(d => {
      snapshot = d.weeks;
      const src = (d.weeks[fromWKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      const sess = src[fromDi]?.[fromSi];
      if (!sess) return d;
      const updated = { ...sess,
        startTime: newStartTime || sess.startTime || null,
        endTime: newStartTime ? calcEndTime(newStartTime, sess.estimatedTime) : sess.endTime ?? null,
        ...(newLocation !== undefined ? { location: newLocation || null } : {}),
      };
      src[fromDi] = src[fromDi].filter((_, j) => j !== fromSi);
      const tgt = fromWKey === toWKey ? src : (d.weeks[toWKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      tgt[toDi] = [...(tgt[toDi] || []), updated];
      const newWeeks = { ...d.weeks, [fromWKey]: src };
      if (fromWKey !== toWKey) newWeeks[toWKey] = tgt;
      return { ...d, weeks: newWeeks };
    });
    setSessionModal(null);
    if (fromWKey !== toWKey || fromDi !== toDi || newStartTime) {
      const targetDate = addDays(new Date(toWKey + "T00:00:00"), toDi + 1);
      const targetLabel = targetDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      toast.success(`Déplacée au ${targetLabel}`, {
        undo: () => snapshot && setData(d => ({ ...d, weeks: snapshot })),
      });
    }
  };

  const updateSessionTime = (wKey, di, si, newStartTime) => {
    setData(d => ({
      ...d,
      weeks: {
        ...d.weeks,
        [wKey]: (d.weeks[wKey] || Array(7).fill(null).map(() => [])).map((day, i) =>
          i === di ? day.map((s, j) => j === si
            ? { ...s, startTime: newStartTime || null, endTime: newStartTime ? calcEndTime(newStartTime, s.estimatedTime) : null }
            : s) : day
        ),
      },
    }));
  };

  const suggestMoveSession = (fromWKey, fromDi, fromSi, toWKey, toDi, note) => {
    const sess = (data.weeks[fromWKey] || [])[fromDi]?.[fromSi];
    if (!sess) return;
    const suggestion = {
      id: generateId(),
      sessionId: sess.id,
      sessionName: sess.name,
      fromWeekKey: fromWKey, fromDayIndex: fromDi,
      toWeekKey: toWKey, toDayIndex: toDi,
      note: note.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setData(d => ({ ...d, moveSuggestions: [...(d.moveSuggestions || []), suggestion] }));
  };

  const acceptMoveSuggestion = (id) => {
    const s = (data.moveSuggestions || []).find(x => x.id === id);
    if (!s) return;
    setData(d => {
      const src = (d.weeks[s.fromWeekKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      const sess = src[s.fromDayIndex]?.find(x => x.id === s.sessionId);
      if (!sess) return { ...d, moveSuggestions: d.moveSuggestions.filter(x => x.id !== id) };
      const fromSi = src[s.fromDayIndex].findIndex(x => x.id === s.sessionId);
      src[s.fromDayIndex] = src[s.fromDayIndex].filter((_, j) => j !== fromSi);
      const tgt = s.fromWeekKey === s.toWeekKey ? src : (d.weeks[s.toWeekKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      tgt[s.toDayIndex] = [...(tgt[s.toDayIndex] || []), sess];
      const newWeeks = { ...d.weeks, [s.fromWeekKey]: src };
      if (s.fromWeekKey !== s.toWeekKey) newWeeks[s.toWeekKey] = tgt;
      return { ...d, weeks: newWeeks, moveSuggestions: d.moveSuggestions.filter(x => x.id !== id) };
    });
    setSessionModal(null);
  };

  const rejectMoveSuggestion = (id) => {
    setData(d => ({ ...d, moveSuggestions: (d.moveSuggestions || []).filter(x => x.id !== id) }));
  };

  // ── Custom session handlers ──
  const saveCustomSession = (customSession, targetDayIndex) => {
    if (customSessionForm?.onSave) {
      customSessionForm.onSave(customSession);
      return;
    }
    saveUserSession(customSession);
    syncPlannedSessions(customSession);
    // Capture l'index d'insertion AVANT setData pour la modale schedule.
    let scheduleInfo = null;
    if (targetDayIndex !== undefined && targetDayIndex !== null) {
      const mon = getMondayOf(currentDate);
      const key = weekKey(mon);
      const currentLen = (data.weeks[key] || [])[targetDayIndex]?.length ?? 0;
      scheduleInfo = {
        weekKey: key, dayIndex: targetDayIndex, sessionIndex: currentLen,
        sessionName: customSession.name || customSession.title || "",
        defaultStartTime: customSession.startTime || "",
        defaultLocation: customSession.location || customSession.address || "",
        estimatedTime: customSession.estimatedTime ?? null,
      };
    }
    setData(d => {
      let weeks = d.weeks;
      if (targetDayIndex !== undefined && targetDayIndex !== null) {
        const mon = getMondayOf(currentDate);
        const key = weekKey(mon);
        const daySessions = (d.weeks[key] || Array(7).fill(null).map(() => []))[targetDayIndex];
        const newDay = [...daySessions, { ...customSession, feedback: null }];
        const ws = d.weeks[key] ? [...d.weeks[key]] : Array(7).fill(null).map(() => []);
        ws[targetDayIndex] = newDay;
        weeks = { ...d.weeks, [key]: ws };
      }
      if (customSession.date && targetDayIndex === undefined) {
        const d2 = new Date(customSession.date);
        if (!isNaN(d2.getTime())) {
          const mon = getMondayOf(d2);
          const key2 = weekKey(mon);
          const dayOfWeek = d2.getDay();
          const di = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const ws2 = weeks[key2] ? [...weeks[key2]] : Array(7).fill(null).map(() => []);
          const alreadyPlaced = ws2[di]?.some(s => s.id === customSession.id);
          if (!alreadyPlaced) {
            ws2[di] = [...(ws2[di] || []), { ...customSession, feedback: null }];
            weeks = { ...weeks, [key2]: ws2 };
          }
        }
      }
      return { ...d, weeks };
    });
    if (session?.user?.id && targetDayIndex != null) {
      pushToCommunity(customSession, session.user.id);
    }
    setCustomSessionForm(null);
    if (scheduleInfo) setPendingSchedule(scheduleInfo);
  };

  // ── Handler SessionBuilder ──
  const saveBuiltSession = (builtSession) => {
    const dayIndex = sessionBuilderDay && typeof sessionBuilderDay === "object"
      ? sessionBuilderDay.dayIndex
      : sessionBuilderDay;
    saveUserSession(builtSession);
    syncPlannedSessions(builtSession);
    const hasDay = dayIndex !== null && dayIndex !== undefined;
    const mon = getMondayOf(currentDate);
    const key = weekKey(mon);
    if (hasDay) {
      const currentLen = (data.weeks[key] || [])[dayIndex]?.length ?? 0;
      setData(d => {
        const ws = d.weeks[key] ? [...d.weeks[key]] : Array(7).fill(null).map(() => []);
        ws[dayIndex] = [...(ws[dayIndex] || []), { ...builtSession, feedback: null }];
        return { ...d, weeks: { ...d.weeks, [key]: ws } };
      });
      setPendingSchedule({
        weekKey: key,
        dayIndex,
        sessionIndex: currentLen,
        sessionName: builtSession.name || builtSession.title || "",
        defaultStartTime: builtSession.startTime || "",
        defaultLocation: builtSession.location || builtSession.address || "",
        estimatedTime: builtSession.estimatedTime ?? null,
      });
    }
    if (session?.user?.id) {
      pushToCommunity(builtSession, session.user.id);
    }
    setSessionBuilderDay(null);
  };

  const isCalendarMode = ["week", "month", "year"].includes(viewMode);
  // Permissions dérivées du rôle du COMPTE connecté (accountRole), jamais de
  // data.profile.role : en vue athlète, `data` est le blob de l'athlète et son
  // rôle ne doit pas restreindre le coach (cycles, bibliothèque, picker).
  const isCoach = accountRole === "coach";
  const isAuto = accountRole === "auto";
  const hasCoachFeatures = isCoach || isAuto;
  const actualUserRole = accountRole ?? null;
  const pendingSuggestionsIds = new Set((data.moveSuggestions || []).filter(s => s.status === "pending").map(s => s.sessionId));

  const calSubToggle = (
    <div style={{ display: "flex", gap: 2 }}>
      {[
        { mode: "week", label: "Sem" },
        { mode: "month", label: "Mois" },
        { mode: "year", label: "An" },
      ].map(({ mode, label }) => (
        <button
          key={mode}
          style={{ ...styles.viewToggleBtn, ...(viewMode === mode ? styles.viewToggleBtnActive : {}), padding: "2px 8px", fontSize: 9 }}
          onClick={() => setViewMode(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const viewToggle = (
    <div style={{ ...styles.viewToggle, flexWrap: "wrap" }}>
      {[
        { mode: "accueil", label: "Accueil" },
        { mode: "calendar", label: "Calendrier" },
        { mode: "dash", label: "Stats" },
        { mode: "cycles", label: "Cycles" },
        ...(hasCoachFeatures ? [{ mode: "library", label: "Séances" }] : []),
      ].map(({ mode, label }) => (
        <button
          key={mode}
          style={{ ...styles.viewToggleBtn, ...((mode === "calendar" ? isCalendarMode : viewMode === mode) ? styles.viewToggleBtnActive : {}) }}
          onClick={() => setViewMode(mode === "calendar" ? "week" : mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const notifBell = session ? (
    <NotificationBell
      unreadCount={unreadCount}
      isDark={isDark}
      active={notifOpen}
      onClick={() => setNotifOpen(true)}
    />
  ) : null;

  const profilePhoto = data.profile?.avatarUrl || data.profile?.avatarDataUrl || "";
  const profileBtn = (
    <button
      style={{ ...styles.profileBtn, ...(viewMode === "profil" ? { borderColor: colors(isDark).accent, background: colors(isDark).borderSubtle } : {}) }}
      onClick={() => setViewMode("profil")}
      title="Profil"
    >
      {profilePhoto
        ? <img src={profilePhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
        : <span style={{ fontSize: 11, color: colors(isDark).textMuted }}>—</span>
      }
    </button>
  );

  const syncDot = syncStatus === "saving"
    ? <span style={{ fontSize: 11, color: colors(isDark).textMuted }} title="Synchronisation…">⟳</span>
    : syncStatus === "saved" ? <span style={{ fontSize: 11, color: colors(isDark).accent }} title="Synchronisé">✓</span>
    : syncStatus === "offline" ? <span style={{ fontSize: 11, color: colors(isDark).warn }} title="Hors ligne">—</span>
    : null;

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: data.mesocycles || [] }}>
    <div style={{
      ...styles.app,
      height: viewMode === "week" && !isMobile ? "100dvh" : undefined,
      minHeight: "100dvh",
      overflowY: viewMode === "week" && !isMobile ? "hidden" : "auto",
      overflowX: "hidden",
      paddingBottom: isMobile ? "calc(56px + env(safe-area-inset-bottom))" : 0,
    }}>
      <div style={styles.grain} />

      {/* ── HEADER MOBILE ──
           L'accueil porte son propre en-tête (date, salutation, avatar) depuis
           la refonte « Ascent » : on masque celui du shell pour ne pas empiler
           deux barres. Les autres onglets gardent le leur en attendant d'être
           redessinés. */}
      {isMobile && (viewMode === "accueil" || viewMode === "profil" || ["week", "month", "year"].includes(viewMode)) ? null : isMobile ? (
        <div style={styles.headerMobile}>
          <div style={styles.headerMobileRow1}>
            <div style={styles.headerLeft}>
              <ClimbingPlannerLogo isDark={isDark} size={36} />
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
            </div>
            <div style={styles.headerMobileRight}>
              {syncDot && <span style={{ marginRight: 4 }}>{syncDot}</span>}
              {viewMode !== "profil" && (
                <div style={styles.totalChargeMobile}>
                  <span style={styles.totalChargeNum}>{totalPeriodCharge}</span>
                  <span style={styles.totalChargeLabel}>charge</span>
                </div>
              )}
            </div>
          </div>
          {/* Sur mobile la barre nav principale est en bas (BottomNav).
              On garde seulement le bouton profil dans l'entête. */}
          <div style={{ ...styles.headerMobileRow2, justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {notifBell}
              {profileBtn}
            </div>
          </div>
          {isCalendarMode && (
            <>
              <div style={{ display: "flex", justifyContent: "center", padding: "4px 16px 0", borderTop: `1px solid ${styles.subtleBorder}` }}>
                {calSubToggle}
              </div>
              <div style={styles.weekNavMobile}>
                <button style={styles.navBtn} onClick={handlePrev}>←</button>
                <div
                  style={{ ...styles.weekLabel, cursor: isCurrentPeriod ? "default" : "pointer" }}
                  onClick={isCurrentPeriod ? undefined : handleDateGoToCurrent}
                  title={isCurrentPeriod ? undefined : viewMode === "week" ? "Aller à la semaine en cours" : viewMode === "month" ? "Aller au mois en cours" : "Aller à l'année en cours"}
                >
                  <div style={styles.weekRange}>{periodLabel}</div>
                  {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
                </div>
                <button style={styles.navBtn} onClick={handleNext}>→</button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── HEADER DESKTOP ── */
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <ClimbingPlannerLogo isDark={isDark} size={36} />
            <div>
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
              <div style={styles.appSub}>
                {viewMode === "accueil" ? "Accueil" : viewMode === "week" ? "Calendrier — semaine" : viewMode === "month" ? "Calendrier — mois" : viewMode === "year" ? "Calendrier — année" : viewMode === "dash" ? "Statistiques" : viewMode === "cycles" ? "Cycles" : "Profil"} · Bloc
              </div>
            </div>
          </div>
          {isCalendarMode && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {calSubToggle}
              <div style={styles.weekNav}>
                <button style={styles.navBtn} onClick={handlePrev}>←</button>
                <div
                  style={{ ...styles.weekLabel, cursor: isCurrentPeriod ? "default" : "pointer" }}
                  onClick={isCurrentPeriod ? undefined : handleDateGoToCurrent}
                  title={isCurrentPeriod ? undefined : viewMode === "week" ? "Aller à la semaine en cours" : viewMode === "month" ? "Aller au mois en cours" : "Aller à l'année en cours"}
                >
                  <div style={styles.weekRange}>{periodLabel}</div>
                  {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
                </div>
                <button style={styles.navBtn} onClick={handleNext}>→</button>
              </div>
            </div>
          )}
          <div style={styles.headerRight}>
            <div style={styles.headerRightTop}>
              {viewToggle}
              {syncDot && <span style={{ fontSize: 12 }}>{syncDot}</span>}
              {notifBell}
              {profileBtn}
            </div>
            {viewMode !== "profil" && (
              <div style={styles.totalCharge}>
                <span style={styles.totalChargeNum}>{totalPeriodCharge}</span>
                <span style={styles.totalChargeLabel}>
                  charge {viewMode === "week" ? "semaine" : viewMode === "month" ? "mois" : viewMode === "year" ? "année" : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bandeau vue athlète ── */}
      {viewingAthlete && (
        <div style={{ background: colors(isDark).borderSubtle, borderBottom: `1px solid ${colors(isDark).borderStrong}`, padding: "7px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: colors(isDark).accent, fontWeight: 700, letterSpacing: "0.05em" }}>
            VUE ATHLÈTE
          </span>
          <span style={{ fontSize: 12, color: colors(isDark).accent, fontWeight: 600 }}>
            {viewingAthlete.firstName} {viewingAthlete.lastName}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={switchBackToCoach}
              style={{ background: colors(isDark).borderSubtle, border: `1px solid ${colors(isDark).accentBorder}`, borderRadius: 5, color: colors(isDark).accent, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}
            >
              ← Retour à ma vue
            </button>
          </div>
        </div>
      )}

      {/* ── Calendrier « Ascent » (mobile) ──
           Un seul écran pour Mois / Semaine / Année, avec son propre titre et
           sa navigation. Le bureau garde les vues historiques (grille semaine
           7 colonnes, vue mois, vue année), que le prototype ne couvre pas. */}
      {isMobile && ["week", "month", "year"].includes(viewMode) && (
        <CalendarView
          data={data}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onOpenSession={openSessionModal}
          onAddSession={(dayIdx) => setSessionBuilderDay(dayIdx)}
        />
      )}

      {/* ── Méta semaine — visible aussi sur mobile (TL;DR 10) ── */}
      {!isMobile && (viewMode === "week" || viewMode === "month") && (() => {
        const detected = getMesoForDate(data.mesocycles, monday);
        const color = detected?.meso?.color || (weekMeta.mesocycle ? getMesoColor(data.mesocycles, weekMeta.mesocycle) : null);
        if (!detected && !weekMeta.mesocycle) return null;
        // Index "semaine X / N" du microcycle dans le mésocycle
        const microIdx = detected?.meso && detected?.micro
          ? (detected.meso.microcycles || []).findIndex(m => m.id === detected.micro.id)
          : -1;
        const microTotal = detected?.meso?.microcycles?.length || 0;
        return (
          <div style={{
            background: (color || colors(isDark).textMuted) + "14",
            borderBottom: `1px solid ${color || colors(isDark).textMuted}28`,
            borderLeft: `3px solid ${color || colors(isDark).textMuted}`,
            padding: isMobile ? "6px 14px" : "5px 20px",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            flexShrink: 0,
          }}>
            {detected?.meso && (
              <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.09em", textTransform: "uppercase" }}>
                {detected.meso.label}
              </span>
            )}
            {detected?.micro && (
              <>
                <span style={{ fontSize: 10, color: color + "55" }}>›</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: color + "cc", letterSpacing: "0.06em", background: color + "22", padding: "1px 7px", borderRadius: 10, border: `1px solid ${color}44` }}>
                  {detected.micro.label}
                  {microIdx >= 0 && microTotal > 1 && (
                    <span style={{ marginLeft: 5, opacity: 0.8, fontWeight: 500 }}>· S{microIdx + 1}/{microTotal}</span>
                  )}
                </span>
              </>
            )}
            {weekMeta.note && <span style={{ fontSize: 10, fontStyle: "italic", color: colors(isDark).textMuted }}>"{weekMeta.note}"</span>}
          </div>
        );
      })()}

      {/* ── Accueil ── */}
      {viewMode === "accueil" && (
        <AccueilView
          data={data}
          isMobile={isMobile}
          isLoading={!!session && !cloudLoaded}
          onOpenAccount={() => setViewMode("profil")}
          onOpenSession={openSessionModal}
          onToggleReminder={(reminderId, dateStr) => setData(d => {
            const prev = d.reminderState || {};
            const forR = prev[reminderId] ? { ...prev[reminderId] } : {};
            if (forR[dateStr]) delete forR[dateStr]; else forR[dateStr] = true;
            return { ...d, reminderState: { ...prev, [reminderId]: forR } };
          })}
          onSaveWeight={(date, kg) => setData(d => {
            const w = { ...(d.weight || {}) };
            if (kg == null) delete w[date]; else w[date] = kg;
            return { ...d, weight: w };
          })}
          onAddHooper={entry => setData(d => {
            const existing = (d.hooper || []).filter(h => h.date !== entry.date);
            return { ...d, hooper: [...existing, entry].sort((a, b) => a.date.localeCompare(b.date)) };
          })}
          onAddNutrition={(dateISO, meal) => setData(d => {
            const dayMeals = [...(d.nutrition?.[dateISO] || []), meal];
            return { ...d, nutrition: { ...(d.nutrition || {}), [dateISO]: dayMeals } };
          })}
          onDeleteNutrition={(dateISO, mealId) => setData(d => {
            const dayMeals = (d.nutrition?.[dateISO] || []).filter(m => m.id !== mealId);
            const nutrition = { ...(d.nutrition || {}) };
            if (dayMeals.length === 0) delete nutrition[dateISO]; else nutrition[dateISO] = dayMeals;
            return { ...d, nutrition };
          })}
          onOpenLog={(dateISO) => setLogDate(dateISO || localDateStr(new Date()))}
          onAddSession={(dayIdxToday) => {
            // AccueilView est toujours « aujourd'hui ». S'assurer que la
            // semaine courante de la planification contient bien today
            // avant d'ouvrir le SessionComposer sur le bon jour.
            setCurrentDate(new Date());
            setSessionBuilderDay({ dayIndex: dayIdxToday });
          }}
          onToggleSessionDone={(wKeyArg, dayIdx, si) => toggleSessionDone(wKeyArg, dayIdx, si)}
        />
      )}

      {/* ── Vue semaine — mobile: liste 1 jour, desktop: 7 colonnes timeline ── */}

      {viewMode === "week" && !isMobile && (
        <div
          style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, touchAction: "pan-y" }}
        >
          <div style={styles.grid}>
            {DAYS.map((day, i) => {
              const date = addDays(monday, i);
              const isToday = date.toDateString() === new Date().toDateString();
              const dateISO = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
              const logWarning = getDayLogWarning(data, dateISO, date);
              return (
                <DayColumn
                  key={i}
                  dayLabel={day}
                  dateLabel={formatDate(date)}
                  sessions={weekSessions[i] || []}
                  isToday={isToday}
                  weekMeta={weekMeta}
                  onAddSession={() => setSessionBuilderDay({ dayIndex: i })}
                  quickSessions={(data.quickSessions || []).filter(qs => {
                    if (qs.startDate === dateISO) return true;
                    if (qs.endDate && qs.startDate <= dateISO && qs.endDate >= dateISO) return true;
                    return false;
                  })}
                  dateISO={dateISO}
                  onOpenQuickSession={qs => setSessionBuilderDay({ initial: { ...qs, mode: "event" } })}
                  onRemoveQuickSession={id => removeQuickSession(id)}
                  onOpenSession={(si) => openSessionModal(wKey, i, si)}
                  onRemove={(si) => removeSession(i, si)}
                  isMobile={isMobile}
                  colWidth={isMobile ? Math.floor(windowWidth / 7) : undefined}
                  hasCreatine={!!data.creatine?.[dateISO]}
                  note={data.notes?.[dateISO] || ""}
                  onSaveNote={text => setData(d => ({ ...d, notes: { ...(d.notes || {}), [dateISO]: text } }))}
                  logWarning={logWarning}
                  onOpenLog={() => setLogDate(dateISO)}
                  pendingSuggestionsIds={pendingSuggestionsIds}
                  timelineRange={data.profile?.timelineRange}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Vue mois ── */}
      {viewMode === "month" && !isMobile && (
        <div
          style={{ touchAction: "pan-y" }}
          onTouchStart={isMobile ? (e) => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } : undefined}
          onTouchEnd={isMobile ? (e) => {
            if (!swipeRef.current) return;
            const dx = e.changedTouches[0].clientX - swipeRef.current.x;
            const dy = e.changedTouches[0].clientY - swipeRef.current.y;
            swipeRef.current = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx > 0) handlePrev(); else handleNext();
            }
          } : undefined}
        >
        <MonthView
          data={data}
          currentDate={currentDate}
          isMobile={isMobile}
          mesocycles={data.mesocycles || []}
          creatine={data.creatine || {}}
          customCycles={data.customCycles || []}
          onSelectWeek={(wm) => { setCurrentDate(wm); setViewMode("week"); }}
          onSessionClick={(date, si) => {
            const wKey2 = weekKey(getMondayOf(date));
            const dow = date.getDay();
            const di = dow === 0 ? 6 : dow - 1;
            openSessionModal(wKey2, di, si);
          }}
          objectives={(data.quickSessions || []).filter(qs => qs.isObjective)}
        />
        </div>
      )}

      {/* ── Vue année ── */}
      {viewMode === "year" && !isMobile && (
        <div
          style={{ touchAction: "pan-y" }}
          onTouchStart={isMobile ? (e) => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } : undefined}
          onTouchEnd={isMobile ? (e) => {
            if (!swipeRef.current) return;
            const dx = e.changedTouches[0].clientX - swipeRef.current.x;
            const dy = e.changedTouches[0].clientY - swipeRef.current.y;
            swipeRef.current = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx > 0) handlePrev(); else handleNext();
            }
          } : undefined}
        >
        <YearView
          data={data}
          currentDate={currentDate}
          isMobile={isMobile}
          creatine={data.creatine || {}}
          customCycles={data.customCycles || []}
          onSelectMonth={(month) => {
            setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
            setViewMode("month");
          }}
        />
        </div>
      )}

      {/* ── Dashboard ── */}
      {viewMode === "dash" && (
        <Suspense fallback={<div style={{ padding: 40, textAlign: "center", opacity: 0.5 }}>…</div>}>
          <Dashboard
            data={data}
            isLoading={!!session && !cloudLoaded}
            onUpdateSleep={newRows => setData(d => {
              const map = Object.fromEntries((d.sleep || []).map(r => [r.date, r]));
              for (const r of newRows) map[r.date] = r;
              return { ...d, sleep: Object.values(map).sort((a, b) => a.date.localeCompare(b.date)) };
            })}
          />
        </Suspense>
      )}

      {/* ── Cycles ── */}
      {viewMode === "cycles" && (
        <CyclesView
          mesocycles={data.mesocycles || []}
          onAddMeso={addMesocycle}
          onUpdateMeso={updateMesocycle}
          onDeleteMeso={deleteMesocycle}
          onAddMicro={addMicrocycle}
          onUpdateMicro={updateMicrocycle}
          onDeleteMicro={deleteMicrocycle}
          customCycles={data.customCycles || []}
          onAddCustomCycle={addCustomCycle}
          onUpdateCustomCycle={updateCustomCycle}
          onDeleteCustomCycle={deleteCustomCycle}
          locked={!!data.cyclesLocked}
          onSetLocked={val => setData(d => ({ ...d, cyclesLocked: val }))}
          canEdit={accountRole !== "athlete"}
          objectives={(data.quickSessions || []).filter(qs => qs.isObjective)}
          reminders={data.reminders || []}
          reminderState={data.reminderState || {}}
          onAddReminder={r => setData(d => ({ ...d, reminders: [...(d.reminders || []), r] }))}
          onBack={() => setViewMode("accueil")}
          onUpdateReminder={r => setData(d => ({ ...d, reminders: (d.reminders || []).map(x => x.id === r.id ? r : x) }))}
          onDeleteReminder={id => setData(d => {
            const reminders = (d.reminders || []).filter(r => r.id !== id);
            const reminderState = { ...(d.reminderState || {}) };
            delete reminderState[id];
            return { ...d, reminders, reminderState };
          })}
        />
      )}

      {/* ── Bibliothèque coach ── */}
      {viewMode === "library" && (
        <CoachLibraryView
          catalog={catalog}
          onNew={() => setSessionComposerForm({})}
          onEdit={s => setSessionComposerForm({ initial: s })}
          onDelete={id => deleteUserSession(id)}
          blocks={dbBlocks}
          onNewBlock={addSessionBlock}
          onEditBlock={editSessionBlock}
          onDeleteBlock={deleteSessionBlock}
        />
      )}

      {/* ── Profil ── */}
      {viewMode === "profil" && (
        <ProfileView
          data={data}
          onUpdateProfile={profile => setData(d => ({ ...d, profile }))}
          session={session}
          onAuthChange={setSession}
          syncStatus={syncStatus}
          onUpload={session ? () => uploadNow(data, session.user.id) : null}
          onPull={session ? pullFromCloud : null}
          onImport={setData}
          toggleTheme={toggleTheme}
          isDark={isDark}
          athletes={athletes}
          onSearchAthletes={searchAthletes}
          onInviteAthlete={athleteUserId => {
            const fromName = [data.profile?.firstName, data.profile?.lastName].filter(Boolean).join(" ") || "Un coach";
            return sendCoachRequest(athleteUserId, fromName);
          }}
          sentInvites={sentInvites}
          onRemoveAthlete={removeAthlete}
          onUpdateReminder={r => setData(d => ({ ...d, reminders: (d.reminders || []).map(x => x.id === r.id ? r : x) }))}
          myCoaches={myCoaches}
          onLeaveCoach={leaveCoach}
          accountRole={accountRole}
          viewingAthlete={viewingAthlete}
          onToggleViewAthlete={a => { if (a) { switchToAthlete(a).then(() => setViewMode("week")); } else { switchBackToCoach(); } }}
        />
      )}

      {/* ── SessionComposer (unifié) ── */}
      {sessionBuilderDay !== null && (() => {
        const sbd = sessionBuilderDay;
        const dayIndex = sbd && typeof sbd === "object" ? sbd.dayIndex : sbd;
        const titlePrefill = sbd && typeof sbd === "object" ? sbd.titlePrefill : "";
        const initial = sbd && typeof sbd === "object" ? sbd.initial : null;
        const dDay = dayIndex !== null && dayIndex !== undefined ? addDays(monday, dayIndex) : null;
        const dayLabelStr = dDay ? `${DAYS[dayIndex]} ${formatDate(dDay)}` : null;
        const defaultDateISO = dDay
          ? `${dDay.getFullYear()}-${String(dDay.getMonth()+1).padStart(2,'0')}-${String(dDay.getDate()).padStart(2,'0')}`
          : localDateStr(new Date());
        return (
          <SessionComposer
            initial={initial}
            onSave={(payload) => {
              // Route selon le mode : event → quickSessions, sinon weeks.
              if (payload.mode === "event") {
                const qs = { ...payload };
                if (initial) editQuickSession(qs); else addQuickSession(qs);
                toast.success(initial ? "Événement modifié" : "Événement ajouté");
                setSessionBuilderDay(null);
              } else {
                // dayIndex doit être set (sinon save catalogue pur)
                saveBuiltSession(payload);
              }
            }}
            onClose={() => setSessionBuilderDay(null)}
            communitySessions={communitySessions}
            allSessions={catalog}
            availableBlocks={dbBlocks}
            onCreateCustom={(type) => setCustomSessionForm({ initial: { type }, targetDay: null })}
            onSaveBlock={saveBlock}
            titlePrefill={titlePrefill}
            dayLabel={dayLabelStr}
            defaultDate={defaultDateISO}
          />
        );
      })()}

      {/* ── SessionComposer en mode édition : remplace en place ── */}
      {sessionEditCtx && (() => {
        const { weekKey: ek, dayIndex: edi, sessionIndex: esi, initial } = sessionEditCtx;
        const emonday = new Date(ek + "T00:00:00");
        const eday = addDays(emonday, edi);
        const edayLabel = `${DAYS[edi]} ${formatDate(eday)}`;
        const edateISO = `${eday.getFullYear()}-${String(eday.getMonth()+1).padStart(2,'0')}-${String(eday.getDate()).padStart(2,'0')}`;
        return (
          <SessionComposer
            initial={initial}
            dayLabel={edayLabel}
            defaultDate={edateISO}
            communitySessions={communitySessions}
            allSessions={catalog}
            availableBlocks={dbBlocks}
            onCreateCustom={(type) => setCustomSessionForm({ initial: { type }, targetDay: null })}
            onSaveBlock={saveBlock}
            onClose={() => setSessionEditCtx(null)}
            onSave={(payload) => {
              // Event : route vers quickSessions (replace by id).
              if (payload.mode === "event") {
                editQuickSession(payload);
                toast.success("Événement modifié");
                setSessionEditCtx(null);
                return;
              }
              // Sinon : remplace en place dans data.weeks, préserve le feedback.
              setData(d => {
                const ws = (d.weeks[ek] || Array(7).fill(null).map(() => [])).map(day => [...day]);
                if (!ws[edi]) return d;
                const prev = ws[edi][esi];
                ws[edi] = ws[edi].map((sx, j) =>
                  j === esi
                    ? { ...payload, isCustom: true, feedback: prev?.feedback ?? null }
                    : sx
                );
                return { ...d, weeks: { ...d.weeks, [ek]: ws } };
              });
              // Si la séance est aussi dans le catalogue (saveAsTemplate), sync DB.
              if (payload.saveAsTemplate) {
                saveUserSession(payload);
              }
              toast.success("Séance modifiée");
              setSessionEditCtx(null);
            }}
          />
        );
      })()}
      {picker && hasCoachFeatures && (
        <CoachPickerModal
          sessions={catalog}
          blocks={dbBlocks}
          onSelect={s => { setTemplateEditor({ template: s, dayIndex: picker.dayIndex, startTime: s.startTime || "", address: s.address || "", coachNote: s.coachNote || "" }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && !hasCoachFeatures && (
        <SessionPicker
          onSelect={s => { setTemplateEditor({ template: s, dayIndex: picker.dayIndex, startTime: "", address: s.address || "", coachNote: "" }); setPicker(null); }}
          onClose={() => setPicker(null)}
          customSessions={catalog.filter(s => s.isCustom)}
          sessions={catalog.filter(s => !s.isCustom)}
          onCreateCustom={() => { setCustomSessionForm({ targetDay: picker.dayIndex }); setPicker(null); }}
        />
      )}
      {templateEditor && (
        <TemplateEditorModal
          template={templateEditor.template}
          startTime={templateEditor.startTime}
          address={templateEditor.address}
          coachNote={templateEditor.coachNote}
          onConfirm={s => { addSession(templateEditor.dayIndex, s); setTemplateEditor(null); }}
          onSaveAsTemplate={s => saveUserSession(s)}
          onSaveBlock={b => saveBlock(b)}
          onClose={() => setTemplateEditor(null)}
          allSessions={catalog}
          dbBlocks={dbBlocks}
          onCreateCustom={(type) => setCustomSessionForm({ initial: { type }, targetDay: null })}
        />
      )}
      {customSessionForm !== null && (
        <CustomSessionModal
          initial={customSessionForm.initial}
          data={data}
          onSave={cs => saveCustomSession(cs, customSessionForm.targetDay)}
          onClose={() => setCustomSessionForm(null)}
        />
      )}
      {sessionComposerForm !== null && (
        <SessionComposer
          initial={sessionComposerForm.initial}
          availableBlocks={dbBlocks}
          allSessions={catalog}
          communitySessions={communitySessions}
          onSaveBlock={saveBlock}
          onCreateCustom={(type) => setCustomSessionForm({ initial: { type }, targetDay: null })}
          onSave={s => { saveCustomSession(s, undefined); setSessionComposerForm(null); }}
          onClose={() => setSessionComposerForm(null)}
        />
      )}
      {logDate && (
        <DayLogModal
          initialDate={logDate}
          data={data}
          onClose={() => setLogDate(null)}
          onSaveNote={(date, text) => setData(d => ({ ...d, notes: { ...(d.notes || {}), [date]: text } }))}
          onToggleReminder={(reminderId, dateStr) => setData(d => {
            const prev = d.reminderState || {};
            const forR = prev[reminderId] ? { ...prev[reminderId] } : {};
            if (forR[dateStr]) delete forR[dateStr]; else forR[dateStr] = true;
            return { ...d, reminderState: { ...prev, [reminderId]: forR } };
          })}
          onSaveWeight={(date, kg) => setData(d => {
            const w = { ...(d.weight || {}) };
            if (kg == null) delete w[date]; else w[date] = kg;
            return { ...d, weight: w };
          })}
          onAddHooper={entry => setData(d => {
            const existing = (d.hooper || []).filter(h => h.date !== entry.date);
            return { ...d, hooper: [...existing, entry].sort((a, b) => a.date.localeCompare(b.date)) };
          })}
        />
      )}
      {/* ── Role Onboarding (1er login) ── */}
      {/* needsRoleChoice = colonne status NULL en DB : fiable même si la
          ligne vient d'être créée par le premier upload (plus de course). */}
      {session && cloudLoaded && roleResolved && needsRoleChoice && !viewingAthlete && (
        <RoleOnboardingModal onSelect={chooseRole} />
      )}

      {/* ── Onboarding 3 écrans (après le choix du rôle) ── */}
      {session && cloudLoaded && roleResolved
        && !needsRoleChoice
        && !data.profile?.onboarded
        && !viewingAthlete && (
        <OnboardingModal
          onComplete={() => setData(d => ({
            ...d,
            profile: { ...(d.profile || {}), onboarded: true },
          }))}
        />
      )}

      {/* ── Programmer la séance (heure + lieu après ajout) ── */}
      {pendingSchedule && (() => {
        const { weekKey: psKey, dayIndex: psDi, sessionIndex: psSi, sessionName: psName, defaultStartTime, defaultLocation, estimatedTime } = pendingSchedule;
        const psMonday = new Date(psKey + "T00:00:00");
        const psDate = addDays(psMonday, psDi);
        const psDayLabel = `${DAYS[psDi]} ${formatDate(psDate)}`;
        // Lieux déjà utilisés sur les 8 dernières semaines (uniques, par ordre de récence)
        const recentLocations = (() => {
          const all = [];
          Object.entries(data.weeks || {}).forEach(([wk, days]) => {
            (days || []).forEach(dayArr => {
              (dayArr || []).forEach(s => {
                const loc = s?.location || s?.address;
                if (loc && typeof loc === "string") all.push({ loc: loc.trim(), wk });
              });
            });
          });
          all.sort((a, b) => b.wk.localeCompare(a.wk));
          const seen = new Set();
          const out = [];
          for (const { loc } of all) {
            if (!seen.has(loc.toLowerCase())) {
              seen.add(loc.toLowerCase());
              out.push(loc);
            }
            if (out.length >= 8) break;
          }
          return out;
        })();
        return (
          <SessionScheduleModal
            sessionName={psName}
            dayLabel={psDayLabel}
            dayDate={psDate}
            defaultStartTime={defaultStartTime}
            defaultLocation={defaultLocation}
            estimatedTime={estimatedTime}
            recentLocations={recentLocations}
            onConfirm={({ startTime, endTime, location }) => {
              setData(d => {
                const ws = (d.weeks[psKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
                if (!ws[psDi] || !ws[psDi][psSi]) return d;
                ws[psDi] = ws[psDi].map((sx, j) => j === psSi
                  ? { ...sx, startTime, endTime: endTime || sx.endTime || null, location }
                  : sx);
                return { ...d, weeks: { ...d.weeks, [psKey]: ws } };
              });
              setPendingSchedule(null);
              toast.success("Séance programmée");
            }}
            onSkip={() => setPendingSchedule(null)}
          />
        );
      })()}

      {/* ── Session Modal ── */}
      {sessionModal && (() => {
        const { weekKey: smKey, dayIndex: smDi, sessionIndex: smSi } = sessionModal;
        const smSessions = (data.weeks[smKey] || Array(7).fill(null).map(() => []))[smDi] || [];
        const smSession = smSessions[smSi];
        const smMonday = new Date(smKey);
        const smDate = addDays(smMonday, smDi);
        const smDayLabel = `${DAYS[smDi]} ${formatDate(smDate)}`;
        const smWeekMeta = data.weekMeta[smKey] || {};
        if (!smSession) return null;
        return (
          <SessionModal
            session={smSession}
            dbBlocks={dbBlocks}
            dayLabel={smDayLabel}
            weekMeta={smWeekMeta}
            onClose={() => setSessionModal(null)}
            role={actualUserRole}
            smWeekKey={smKey}
            smDayIndex={smDi}
            smSessionIndex={smSi}
            onMoveSession={(toWKey, toDi, newTime, newLoc) => moveSession(smKey, smDi, smSi, toWKey, toDi, newTime, newLoc)}
            onUpdateStartTime={(newTime) => { updateSessionTime(smKey, smDi, smSi, newTime); }}
            onSuggestMove={(toWKey, toDi, note) => suggestMoveSession(smKey, smDi, smSi, toWKey, toDi, note)}
            moveSuggestions={data.moveSuggestions || []}
            onAcceptSuggestion={acceptMoveSuggestion}
            onRejectSuggestion={rejectMoveSuggestion}
            onDelete={() => {
              let snapshot = null;
              setData(d => {
                snapshot = d.weeks;
                const ws = (d.weeks[smKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
                if (ws[smDi]) ws[smDi] = ws[smDi].filter((_, j) => j !== smSi);
                return { ...d, weeks: { ...d.weeks, [smKey]: ws } };
              });
              setSessionModal(null);
              toast.success("Séance supprimée", {
                undo: () => snapshot && setData(d => ({ ...d, weeks: snapshot })),
              });
            }}
            onEdit={() => {
              // Réouvre SessionComposer avec la séance pré-chargée.
              // Le save remplace en place (préserve feedback).
              setSessionEditCtx({
                weekKey: smKey,
                dayIndex: smDi,
                sessionIndex: smSi,
                initial: { ...smSession, isCustom: true },
              });
              setSessionModal(null);
            }}
            onSave={saveSessionFeedback}
          />
        );
      })()}

      {/* ── QuickSessionModal ── */}
      {quickSessionForm && (
        <QuickSessionModal
          initial={quickSessionForm.initial}
          defaultDate={quickSessionForm.defaultDate}
          onSave={qs => { quickSessionForm.initial ? editQuickSession(qs) : addQuickSession(qs); setQuickSessionForm(null); }}
          onDelete={id => { removeQuickSession(id); setQuickSessionForm(null); }}
          onClose={() => setQuickSessionForm(null)}
        />
      )}

      {isMobile && (
        <BottomNav
          viewMode={viewMode}
          onChange={(k) => setViewMode(k)}
          extraTabs={hasCoachFeatures ? [{ key: "library", label: "Bibli", icon: "library" }] : []}
        />
      )}
      {/* ── Panneau de notifications (cloche) ── */}
      {notifOpen && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setNotifOpen(false)}
          onMarkInfosRead={markInfosRead}
          onRespondRequest={async (n, accept) => {
            const myName = [data.profile?.firstName, data.profile?.lastName].filter(Boolean).join(" ") || "Un athlète";
            const { error } = await respondCoachRequest(n, accept, myName);
            if (error) toast.error("Impossible d'enregistrer la réponse — réessaie.");
            else if (accept) {
              refreshMyCoaches();
              toast.success("Coach accepté — il peut maintenant gérer ton planning.");
            }
          }}
        />
      )}

      <ToastContainer isMobile={isMobile} />
      <UpdateBanner isMobile={isMobile} />
    </div>
    </ThemeContext.Provider>
  );
}

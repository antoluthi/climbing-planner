import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Lib ──
import supabase from "./lib/supabase.js";
import { MESOCYCLES, DEFAULT_MESOCYCLES, DAYS, BLOCK_TYPES, DEFAULT_SUSPENSION_CONFIG, GRIP_TYPES, CUSTOM_CYCLE_COLORS, isDateInCustomCycle, getCustomCyclesForDate, getDeadlinesForDate, getDayLogWarning, getMesoColor, getMesoForDate } from "./lib/constants.js";
import { getMondayOf, addDays, formatDate, weekKey, localDateStr, calcEndTime, migrateWeekKeys, getDaySessions, getDayCharge, getMonthWeeks } from "./lib/helpers.js";
import { getChargeColor, getNbMouvementsZone, VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES } from "./lib/charge.js";
import { generateId, loadData, saveData } from "./lib/storage.js";
import { parseGarminSleepCSV } from "./lib/garmin-csv.js";

// ── Theme ──
import { ThemeContext, useThemeCtx } from "./theme/ThemeContext.jsx";
import { makeStyles } from "./theme/makeStyles.js";

// ── Hooks ──
import { useWindowWidth } from "./hooks/useWindowWidth.js";
import { useSupabaseSync } from "./hooks/useSupabaseSync.js";
import { useCommunitySessionsSync } from "./hooks/useCommunitySessionsSync.js";
import { useSessionsCatalog } from "./hooks/useSessionsCatalog.js";
import { useSessionBlocks } from "./hooks/useSessionBlocks.js";
import { useCoachAthletes } from "./hooks/useCoachAthletes.js";

// ── Components ──
import { ClimbingPlannerLogo } from "./components/Logo.jsx";
import { SyncButtons } from "./components/SyncButtons.jsx";
import { AuthPanel } from "./components/AuthPanel.jsx";
import { RoleOnboardingModal } from "./components/RoleOnboardingModal.jsx";
import { ConfirmModal } from "./components/ConfirmModal.jsx";
import { CustomSessionModal } from "./components/CustomSessionModal.jsx";
import { SessionBuilder } from "./components/SessionBuilder.jsx";
import { SessionPicker } from "./components/SessionPicker.jsx";
import { SessionModal } from "./components/SessionModal.jsx";
import { CoachPickerModal } from "./components/CoachPickerModal.jsx";
import { DayColumn } from "./components/DayColumn.jsx";
import { MonthView } from "./components/MonthView.jsx";
import { YearView } from "./components/YearView.jsx";
import { CyclesView } from "./components/CyclesView.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { DayLogModal } from "./components/DayLogModal.jsx";
import { SessionComposerModal } from "./components/SessionComposerModal.jsx";
import { TemplateEditorModal } from "./components/TemplateEditorModal.jsx";
import { ProfileView } from "./components/ProfileView.jsx";
import { CoachLibraryView } from "./components/CoachLibraryView.jsx";
import { AccueilView } from "./components/AccueilView.jsx";
import { PublicPlanView } from "./components/PublicPlanView.jsx";

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function ClimbingPlanner() {
  const [data, setData] = useState(loadData);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("accueil");
  const [sessionBuilderDay, setSessionBuilderDay] = useState(null);
  const [picker, setPicker] = useState(null);
  const [metaEditing, setMetaEditing] = useState(false);
  const [tempMeta, setTempMeta] = useState({});
  const [customSessionForm, setCustomSessionForm] = useState(null);
  const [sessionComposerForm, setSessionComposerForm] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [sessionModal, setSessionModal] = useState(null);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") === "dark");
  const [logDate, setLogDate] = useState(null);
  const [showPublicPlan, setShowPublicPlan] = useState(false);

  const styles = makeStyles(isDark);
  const toggleTheme = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  const { session, setSession, authChecked, syncStatus, loadFromCloud, saveToCloud, uploadNow, writeStatus } = useSupabaseSync();
  const { communitySessions, pushToCommunity, deleteFromCommunity } = useCommunitySessionsSync(session);
  const { catalog, saveUserSession, deleteUserSession } = useSessionsCatalog(session?.user?.id);
  const { blocks: dbBlocks, saveBlock, deleteBlock } = useSessionBlocks(session?.user?.id);
  const { athletes, searchAthletes, addAthlete, removeAthlete } = useCoachAthletes(session?.user?.id);

  // ── Vue athlète (coach regarde les données d'un athlète) ──
  const coachDataRef = useRef(null);
  const [viewingAthlete, setViewingAthlete] = useState(null);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const monday = getMondayOf(currentDate);
  const wKey = weekKey(monday);
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const weekMeta = data.weekMeta[wKey] || { mesocycle: "", microcycle: "", note: "" };

  // Phase 1 : localStorage (sync, immédiat)
  // Phase 2 : cloud au premier login (données complètes)
  useEffect(() => {
    if (!session || cloudLoaded) return;
    loadFromCloud()
      .then(cloudData => {
        setCloudLoaded(true);
        if (cloudData) {
          const { _cloudUpdatedAt: _cua, ...cleanData } = cloudData;
          setData(cleanData);
          saveData(cleanData);
        } else {
          uploadNow(data, session.user.id);
        }
      })
      .catch(() => {});
  }, [session, cloudLoaded, loadFromCloud, uploadNow]);

  // Phase 2b : re-lire le status depuis la DB
  useEffect(() => {
    if (!session) { setCloudLoaded(false); setRoleResolved(false); setViewMode("accueil"); return; }
    if (!cloudLoaded) return;
    if (!supabase) { setRoleResolved(true); return; }
    supabase
      .from("climbing_plans")
      .select("status, first_name, last_name")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setData(d => {
            const p = { ...(d.profile ?? {}) };
            if ("status" in row) p.role = row.status;
            if (row.first_name != null) p.firstName = row.first_name;
            if (row.last_name != null) p.lastName = row.last_name;
            return { ...d, profile: p };
          });
        }
        setRoleResolved(true);
      })
      .catch(() => setRoleResolved(true));
  }, [session, cloudLoaded]);

  // ── Migration one-shot : customSessions locaux → sessions_catalog DB ──
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current) return;
    if (!session?.user?.id) return;
    const customs = data?.customSessions;
    if (!customs || customs.length === 0) return;
    migrationDoneRef.current = true;
    Promise.all(customs.map(s => saveUserSession(s))).then(() => {
      setData(d => ({ ...d, customSessions: [] }));
    });
  }, [session?.user?.id, data?.customSessions?.length, saveUserSession]);

  const pullFromCloud = async () => {
    const cloudData = await loadFromCloud();
    if (cloudData) { setData(cloudData); saveData(cloudData); }
  };

  useEffect(() => {
    if (viewingAthlete) {
      saveToCloud(data, viewingAthlete.userId);
    } else {
      saveData(data);
      saveToCloud(data, session?.user?.id);
    }
  }, [data]);

  const switchToAthlete = async (athlete) => {
    if (!supabase) return;
    coachDataRef.current = data;
    const { data: row } = await supabase
      .from("climbing_plans")
      .select("data")
      .eq("user_id", athlete.userId)
      .maybeSingle();
    const athleteData = row?.data ?? { weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES, sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, nutrition: {}, profile: {}, customCycles: [], cyclesLocked: false };
    setViewingAthlete(athlete);
    setData(athleteData);
    setViewMode("week");
  };

  const switchBackToCoach = () => {
    if (coachDataRef.current) {
      setData(coachDataRef.current);
      coachDataRef.current = null;
    }
    setViewingAthlete(null);
  };

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
  };

  const openSessionModal = (wKey, dayIndex, sessionIndex) => {
    setSessionModal({ weekKey: wKey, dayIndex, sessionIndex });
  };

  // ── Déplacer / suggestions ──
  const moveSession = (fromWKey, fromDi, fromSi, toWKey, toDi, newStartTime) => {
    setData(d => {
      const src = (d.weeks[fromWKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      const sess = src[fromDi]?.[fromSi];
      if (!sess) return d;
      const updated = { ...sess,
        startTime: newStartTime || sess.startTime || null,
        endTime: newStartTime ? calcEndTime(newStartTime, sess.estimatedTime) : sess.endTime ?? null,
      };
      src[fromDi] = src[fromDi].filter((_, j) => j !== fromSi);
      const tgt = fromWKey === toWKey ? src : (d.weeks[toWKey] || Array(7).fill(null).map(() => [])).map(day => [...day]);
      tgt[toDi] = [...(tgt[toDi] || []), updated];
      const newWeeks = { ...d.weeks, [fromWKey]: src };
      if (fromWKey !== toWKey) newWeeks[toWKey] = tgt;
      return { ...d, weeks: newWeeks };
    });
    setSessionModal(null);
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

  const saveMeta = () => {
    setData(d => ({ ...d, weekMeta: { ...d.weekMeta, [wKey]: tempMeta } }));
    setMetaEditing(false);
  };

  // ── Mesocycle CRUD ──
  const updateMesocycles = updater => setData(d => ({ ...d, mesocycles: updater(d.mesocycles || []) }));
  const addMesocycle = () => updateMesocycles(m => [...m, { id: generateId(), label: "Nouveau mésocycle", color: "#c8906a", durationWeeks: 4, startDate: "", description: "", microcycles: [] }]);
  const updateMesocycle = (id, changes) => updateMesocycles(m => m.map(x => x.id === id ? { ...x, ...changes } : x));
  const deleteMesocycle = id => updateMesocycles(m => m.filter(x => x.id !== id));
  const addMicrocycle = mesoId => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: [...x.microcycles, { id: generateId(), label: "Nouveau microcycle", durationWeeks: 1, description: "" }] } : x));
  const updateMicrocycle = (mesoId, microId, changes) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.map(mc => mc.id === microId ? { ...mc, ...changes } : mc) } : x));
  const deleteMicrocycle = (mesoId, microId) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.filter(mc => mc.id !== microId) } : x));

  // ── Custom cycle CRUD ──
  const updateCustomCycles = updater => setData(d => ({ ...d, customCycles: updater(d.customCycles || []) }));
  const addCustomCycle = cc => updateCustomCycles(list => [...list, cc]);
  const updateCustomCycle = (id, cc) => updateCustomCycles(list => list.map(x => x.id === id ? { ...x, ...cc } : x));
  const deleteCustomCycle = id => updateCustomCycles(list => list.filter(x => x.id !== id));

  // ── Deadline CRUD ──
  const updateDeadlines = updater => setData(d => ({ ...d, deadlines: updater(d.deadlines || []) }));
  const addDeadline = dl => updateDeadlines(list => [...list, dl]);
  const updateDeadline = (id, dl) => updateDeadlines(list => list.map(x => x.id === id ? { ...x, ...dl } : x));
  const deleteDeadline = id => updateDeadlines(list => list.filter(x => x.id !== id));

  // ── Sync planning futur ──
  const syncPlannedSessions = (updatedSession) => {
    if (!updatedSession?.id) return;
    const todayKey = weekKey(getMondayOf(new Date()));
    setData(d => {
      let changed = false;
      const newWeeks = Object.fromEntries(
        Object.entries(d.weeks).map(([key, weekData]) => {
          if (key < todayKey || !Array.isArray(weekData)) return [key, weekData];
          const newWeek = weekData.map(dayArr =>
            Array.isArray(dayArr)
              ? dayArr.map(s => {
                  if (s.id === updatedSession.id && !s.isBlock) {
                    changed = true;
                    return { ...updatedSession, feedback: s.feedback, startTime: s.startTime, endTime: s.endTime, coachNote: s.coachNote, date: s.date };
                  }
                  return s;
                })
              : dayArr
          );
          return [key, newWeek];
        })
      );
      return changed ? { ...d, weeks: newWeeks } : d;
    });
  };

  const syncPlannedBlocks = (updatedBlock) => {
    if (!updatedBlock?.id) return;
    const todayKey = weekKey(getMondayOf(new Date()));
    setData(d => {
      let changed = false;
      const newWeeks = Object.fromEntries(
        Object.entries(d.weeks).map(([key, weekData]) => {
          if (key < todayKey || !Array.isArray(weekData)) return [key, weekData];
          const newWeek = weekData.map(dayArr =>
            Array.isArray(dayArr)
              ? dayArr.map(s => {
                  if (s.id === updatedBlock.id && s.isBlock) {
                    changed = true;
                    return { ...updatedBlock, isBlock: true, feedback: s.feedback, startTime: s.startTime, endTime: s.endTime, coachNote: s.coachNote, date: s.date };
                  }
                  return s;
                })
              : dayArr
          );
          return [key, newWeek];
        })
      );
      return changed ? { ...d, weeks: newWeeks } : d;
    });
  };

  // ── Session blocks CRUD ──
  const addSessionBlock = b => saveBlock(b);
  const editSessionBlock = async (b) => {
    await saveBlock(b);
    const affectedSessions = catalog.filter(s => s.blocks?.some(bl => bl.id === b.id));
    for (const sess of affectedSessions) {
      const updatedBlocks = sess.blocks.map(bl => bl.id === b.id ? { ...bl, ...b } : bl);
      const updatedSession = { ...sess, blocks: updatedBlocks };
      saveUserSession(updatedSession);
      syncPlannedSessions(updatedSession);
    }
    syncPlannedBlocks(b);
  };
  const deleteSessionBlock = id => deleteBlock(id);

  // ── Custom session handlers ──
  const saveCustomSession = (customSession, targetDayIndex) => {
    if (customSessionForm?.onSave) {
      customSessionForm.onSave(customSession);
      return;
    }
    saveUserSession(customSession);
    syncPlannedSessions(customSession);
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
  };

  // ── Handler SessionBuilder ──
  const saveBuiltSession = (builtSession) => {
    const dayIndex = sessionBuilderDay;
    saveUserSession(builtSession);
    syncPlannedSessions(builtSession);
    setData(d => {
      let weeks = d.weeks;
      if (dayIndex !== null && dayIndex !== undefined) {
        const mon = getMondayOf(currentDate);
        const key = weekKey(mon);
        const ws = d.weeks[key] ? [...d.weeks[key]] : Array(7).fill(null).map(() => []);
        ws[dayIndex] = [...(ws[dayIndex] || []), { ...builtSession, feedback: null }];
        weeks = { ...d.weeks, [key]: ws };
      }
      return { ...d, weeks };
    });
    if (session?.user?.id) {
      pushToCommunity(builtSession, session.user.id);
    }
    setSessionBuilderDay(null);
  };

  const isCalendarMode = ["week", "month", "year"].includes(viewMode);
  const isCoach = data.profile?.role === "coach";
  const isAuto = data.profile?.role === "auto";
  const hasCoachFeatures = isCoach || isAuto;
  const actualUserRole = viewingAthlete ? "coach" : (data.profile?.role ?? null);
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

  const profilePhoto = data.profile?.avatarDataUrl || "";
  const profileBtn = (
    <button
      style={{ ...styles.profileBtn, ...(viewMode === "profil" ? { borderColor: isDark ? "#c8906a" : "#8b4c20", background: isDark ? "#2a1a10" : "#ecddd4" } : {}) }}
      onClick={() => setViewMode("profil")}
      title="Profil"
    >
      {profilePhoto
        ? <img src={profilePhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
        : <span style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70" }}>—</span>
      }
    </button>
  );

  const syncDot = syncStatus === "saving" ? <span style={{ fontSize: 11, color: "#888" }} title="Synchronisation…">⟳</span>
    : syncStatus === "saved" ? <span style={{ fontSize: 11, color: isDark ? "#c8906a" : "#8b4c20" }} title="Synchronisé">✓</span>
    : syncStatus === "offline" ? <span style={{ fontSize: 11, color: "#f97316" }} title="Hors ligne">—</span>
    : null;

  // ── Auth gate ──
  const accent = isDark ? "#c8906a" : "#8b4c20";
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "#0f0f0f" : "#f0f0f0" }}>
        <div style={{ color: accent, fontSize: 28, fontWeight: 300, letterSpacing: "0.1em" }}>…</div>
      </div>
    );
  }
  if (showPublicPlan) {
    return <PublicPlanView onBack={() => setShowPublicPlan(false)} />;
  }
  if (supabase && !session) {
    const loginBrown = isDark ? "#c8906a" : "#5c3317";
    const loginBrownMid = isDark ? "#a0601a" : "#8b4c20";
    const loginBrownBg = isDark ? "rgba(160,96,26,0.12)" : "rgba(139,76,32,0.08)";
    const loginBrownBorder = isDark ? "rgba(160,96,26,0.5)" : "rgba(139,76,32,0.4)";
    const loginStyles = {
      ...styles,
      authBtn: { ...styles.authBtn, background: loginBrownBg, border: `1px solid ${loginBrownBorder}`, color: loginBrown },
      authLogoutBtn: { ...styles.authLogoutBtn, color: isDark ? "#a08070" : "#8b6650" },
    };
    return (
      <ThemeContext.Provider value={{ styles: loginStyles, isDark, toggleTheme, mesocycles: [] }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, background: isDark ? "#18120c" : "#ede7de" }}>
          <div style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 22, fontWeight: 500, fontStyle: "italic",
            color: loginBrown, letterSpacing: "0.08em",
          }}>Climbing Planner</div>
          <div style={{
            background: isDark ? "#211810" : "#faf6f1",
            borderRadius: 12, padding: "28px 24px",
            boxShadow: `0 4px 28px rgba(92, 51, 23, ${isDark ? "0.35" : "0.10"})`,
            minWidth: 300, border: `1px solid ${isDark ? "#3d2510" : "#ddd0c2"}`,
          }}>
            <AuthPanel session={null} onAuthChange={setSession} fullWidth />
          </div>
          <button
            onClick={() => setShowPublicPlan(true)}
            style={{
              background: "none", border: `1.5px solid ${loginBrownMid}`,
              borderRadius: 8, padding: "12px 30px", color: loginBrown,
              cursor: "pointer", fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 16, fontStyle: "italic", fontWeight: 500, letterSpacing: "0.06em",
            }}
          >
            Planning d'Anto
          </button>
        </div>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: data.mesocycles || [] }}>
    <div style={{ ...styles.app, overflowY: isMobile ? "auto" : "hidden", overflowX: "hidden" }}>
      <div style={styles.grain} />

      {/* ── HEADER MOBILE ── */}
      {isMobile ? (
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
          <div style={styles.headerMobileRow2}>
            {viewToggle}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
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
        <div style={{ background: isDark ? "#2a1a10" : "#f0e4d8", borderBottom: `1px solid ${isDark ? "#4a2a14" : "#c8a080"}`, padding: "7px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: isDark ? "#c8906a" : "#8b4c20", fontWeight: 700, letterSpacing: "0.05em" }}>
            VUE ATHLÈTE
          </span>
          <span style={{ fontSize: 12, color: isDark ? "#e0c0a0" : "#5c3010", fontWeight: 600 }}>
            {viewingAthlete.firstName} {viewingAthlete.lastName}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={switchBackToCoach}
              style={{ background: isDark ? "#2a1a10" : "#ecddd4", border: `1px solid ${isDark ? "#c8906a66" : "#8b4c2066"}`, borderRadius: 5, color: isDark ? "#c8906a" : "#8b4c20", padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}
            >
              ← Retour à ma vue
            </button>
          </div>
        </div>
      )}

      {/* ── Méta semaine ── */}
      {viewMode === "week" && !isMobile && (() => {
        const detected = getMesoForDate(data.mesocycles, monday);
        const color = detected?.meso?.color || (weekMeta.mesocycle ? getMesoColor(data.mesocycles, weekMeta.mesocycle) : null);
        if (!detected && !weekMeta.mesocycle) return null;
        return (
          <div style={{ background: (color || "#888") + "14", borderBottom: `1px solid ${color || "#888"}28`, borderLeft: `3px solid ${color || "#888"}`, padding: "5px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {detected?.meso && <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.09em", textTransform: "uppercase" }}>{detected.meso.label}</span>}
            {detected?.micro && (
              <>
                <span style={{ fontSize: 10, color: color + "55" }}>›</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: color + "cc", letterSpacing: "0.06em", background: color + "22", padding: "1px 7px", borderRadius: 10, border: `1px solid ${color}44` }}>{detected.micro.label}</span>
              </>
            )}
            {weekMeta.note && <span style={{ fontSize: 10, fontStyle: "italic", color: isDark ? "#9ca3af" : "#6b7280" }}>"{weekMeta.note}"</span>}
          </div>
        );
      })()}

      {/* ── Accueil ── */}
      {viewMode === "accueil" && (
        <AccueilView
          data={data}
          isMobile={isMobile}
          onOpenSession={openSessionModal}
          onToggleCreatine={dateISO => setData(d => {
            const cr = { ...(d.creatine || {}) };
            if (cr[dateISO]) delete cr[dateISO]; else cr[dateISO] = true;
            return { ...d, creatine: cr };
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
        />
      )}

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <>
          {/* ── Countdown badge ── */}
          {(() => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const upcoming = (data.deadlines || [])
              .filter(dl => dl.startDate && (dl.priority === "A" || dl.priority === "B"))
              .map(dl => {
                const s = new Date(dl.startDate + "T00:00:00");
                const daysUntil = Math.round((s - today) / 864e5);
                return { ...dl, daysUntil };
              })
              .filter(dl => dl.daysUntil >= 0 && dl.daysUntil <= 30)
              .sort((a, b) => a.daysUntil - b.daysUntil);
            if (upcoming.length === 0) return null;
            const nearest = upcoming[0];
            const isA = nearest.priority === "A";
            const isImminent = nearest.daysUntil <= 3;
            const countdownText = nearest.daysUntil === 0 ? "Aujourd'hui !" : nearest.daysUntil === 1 ? "Demain" : `Dans ${nearest.daysUntil} jours`;
            const typeLabel = { competition: "Compétition", sortie: "Sortie", objectif: "Objectif" }[nearest.type] || nearest.type;

            return (
              <div style={{
                background: isA
                  ? (isDark ? nearest.color + "28" : nearest.color + "1a")
                  : (isDark ? nearest.color + "18" : nearest.color + "0f"),
                borderBottom: `1px solid ${nearest.color}${isA ? "66" : "33"}`,
                borderLeft: `${isA ? 4 : 2}px solid ${nearest.color}`,
                padding: isMobile ? "10px 14px" : "12px 20px",
                display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexWrap: "wrap",
                boxShadow: isA ? `inset 0 0 40px ${nearest.color}0a` : "none",
              }}>
                {/* Icône priorité */}
                <span style={{ fontSize: isA ? 22 : 16, lineHeight: 1, flexShrink: 0 }}>
                  {isA ? "🏆" : "◆"}
                </span>

                {/* Nom + type */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontSize: isA ? (isMobile ? 14 : 16) : (isMobile ? 12 : 14),
                    fontWeight: 700, color: nearest.color,
                    letterSpacing: "0.03em", lineHeight: 1.2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {nearest.label}
                  </span>
                  {!isMobile && (
                    <span style={{ fontSize: 10, color: nearest.color + "99", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {typeLabel} · priorité {nearest.priority}
                    </span>
                  )}
                  {nearest.note && !isMobile && (
                    <span style={{ fontSize: 10, color: nearest.color + "88", fontStyle: "italic", marginTop: 1 }}>
                      {nearest.note}
                    </span>
                  )}
                </div>

                {/* Compte à rebours */}
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0,
                  background: nearest.color + (isA ? "22" : "15"),
                  border: `1px solid ${nearest.color}${isA ? "55" : "33"}`,
                  borderRadius: 6, padding: isMobile ? "4px 10px" : "6px 14px",
                  boxShadow: isA && isImminent ? `0 0 10px ${nearest.color}44` : "none",
                }}>
                  <span style={{
                    fontSize: isA ? (isMobile ? 15 : 17) : (isMobile ? 12 : 14),
                    fontWeight: 800, color: nearest.color, lineHeight: 1, letterSpacing: "0.02em",
                  }}>
                    {countdownText}
                  </span>
                </div>

                {/* Autres échéances imminentes */}
                {upcoming.length > 1 && !isMobile && (
                  <span style={{ fontSize: 10, color: isDark ? "#606860" : "#9a9080" }}>
                    +{upcoming.length - 1} autre{upcoming.length > 2 ? "s" : ""}
                  </span>
                )}
              </div>
            );
          })()}
          <div style={isMobile ? styles.gridMobile : styles.grid}>
            {DAYS.map((day, i) => {
              const date = addDays(monday, i);
              const isToday = date.toDateString() === new Date().toDateString();
              const dateISO = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
              const logWarning = getDayLogWarning(data, dateISO, date);
              const dayDeadlines = getDeadlinesForDate(data.deadlines || [], date);
              return (
                <DayColumn
                  key={i}
                  dayLabel={day}
                  dateLabel={formatDate(date)}
                  sessions={weekSessions[i] || []}
                  isToday={isToday}
                  weekMeta={weekMeta}
                  onAddSession={() => setPicker({ dayIndex: i })}
                  onOpenSession={(si) => openSessionModal(wKey, i, si)}
                  onRemove={(si) => removeSession(i, si)}
                  isMobile={isMobile}
                  hasCreatine={!!data.creatine?.[dateISO]}
                  note={data.notes?.[dateISO] || ""}
                  onSaveNote={text => setData(d => ({ ...d, notes: { ...(d.notes || {}), [dateISO]: text } }))}
                  logWarning={logWarning}
                  onOpenLog={() => setLogDate(dateISO)}
                  pendingSuggestionsIds={pendingSuggestionsIds}
                  deadlines={dayDeadlines}
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
                    <span style={{ ...styles.chargeBarLabel, color: dayCharge > 0 ? getChargeColor(dayCharge) : styles.chargeBarLabelEmpty }}>{dayCharge || ""}</span>
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
          mesocycles={data.mesocycles || []}
          creatine={data.creatine || {}}
          customCycles={data.customCycles || []}
          deadlines={data.deadlines || []}
          onSelectWeek={(wm) => { setCurrentDate(wm); setViewMode("week"); }}
          onSessionClick={(date, si) => {
            const wKey2 = weekKey(getMondayOf(date));
            const dow = date.getDay();
            const di = dow === 0 ? 6 : dow - 1;
            openSessionModal(wKey2, di, si);
          }}
        />
      )}

      {/* ── Vue année ── */}
      {viewMode === "year" && (
        <YearView
          data={data}
          currentDate={currentDate}
          isMobile={isMobile}
          creatine={data.creatine || {}}
          customCycles={data.customCycles || []}
          deadlines={data.deadlines || []}
          onSelectMonth={(month) => {
            setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
            setViewMode("month");
          }}
        />
      )}

      {/* ── Dashboard ── */}
      {viewMode === "dash" && (
        <Dashboard
          data={data}
          onUpdateSleep={newRows => setData(d => {
            const map = Object.fromEntries((d.sleep || []).map(r => [r.date, r]));
            for (const r of newRows) map[r.date] = r;
            return { ...d, sleep: Object.values(map).sort((a, b) => a.date.localeCompare(b.date)) };
          })}
        />
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
          deadlines={data.deadlines || []}
          onAddDeadline={addDeadline}
          onUpdateDeadline={updateDeadline}
          onDeleteDeadline={deleteDeadline}
          locked={!!data.cyclesLocked}
          onSetLocked={val => setData(d => ({ ...d, cyclesLocked: val }))}
          canEdit={(data.profile?.role ?? null) !== "athlete"}
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
          onAddAthlete={addAthlete}
          onRemoveAthlete={removeAthlete}
          viewingAthlete={viewingAthlete}
          onToggleViewAthlete={a => a ? switchToAthlete(a) : switchBackToCoach()}
        />
      )}

      {/* ── Modals ── */}
      {sessionBuilderDay !== null && (
        <SessionBuilder
          onSave={saveBuiltSession}
          onClose={() => setSessionBuilderDay(null)}
          communitySessions={communitySessions}
          allSessions={catalog}
          onCreateCustom={(type) => setCustomSessionForm({ initial: { type }, targetDay: null })}
        />
      )}
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
        <SessionComposerModal
          initial={sessionComposerForm.initial}
          availableBlocks={dbBlocks}
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
          onToggleCreatine={date => setData(d => {
            const c = { ...(d.creatine || {}) };
            if (c[date]) delete c[date]; else c[date] = true;
            return { ...d, creatine: c };
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
      {/* ── Role Onboarding ── */}
      {session && cloudLoaded && roleResolved && !("role" in (data.profile || {})) && (
        <RoleOnboardingModal
          onSelect={role => {
            setData(d => ({ ...d, profile: { ...(d.profile || {}), role } }));
            writeStatus(session.user.id, role);
          }}
        />
      )}

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
            onMoveSession={(toWKey, toDi, newTime) => moveSession(smKey, smDi, smSi, toWKey, toDi, newTime)}
            onUpdateStartTime={(newTime) => { updateSessionTime(smKey, smDi, smSi, newTime); }}
            onSuggestMove={(toWKey, toDi, note) => suggestMoveSession(smKey, smDi, smSi, toWKey, toDi, note)}
            moveSuggestions={data.moveSuggestions || []}
            onAcceptSuggestion={acceptMoveSuggestion}
            onRejectSuggestion={rejectMoveSuggestion}
            onEdit={() => {
              if (smSession.isCustom) {
                setCustomSessionForm({ initial: smSession, targetDay: null });
              } else {
                setCustomSessionForm({
                  initial: { ...smSession, isCustom: true },
                  targetDay: null,
                  onSave: (edited) => {
                    setData(d => {
                      const ws = d.weeks[smKey] ? d.weeks[smKey].map(day => [...day]) : Array(7).fill(null).map(() => []);
                      ws[smDi] = [...(ws[smDi] || [])];
                      ws[smDi][smSi] = { ...edited, isCustom: true, feedback: ws[smDi][smSi]?.feedback ?? null };
                      return { ...d, weeks: { ...d.weeks, [smKey]: ws } };
                    });
                    setCustomSessionForm(null);
                  },
                });
              }
              setSessionModal(null);
            }}
            onSave={saveSessionFeedback}
          />
        );
      })()}
    </div>
    </ThemeContext.Provider>
  );
}

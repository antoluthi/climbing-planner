import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────

const supabase = import.meta.env.VITE_SUPABASE_URL
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "climbing-planner-auth",
      },
    })
  : null;

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

const DEFAULT_MESOCYCLES = MESOCYCLES.map((m, i) => ({
  id: `m_default_${i}`,
  label: m.label,
  color: m.color,
  durationWeeks: 4,
  startDate: "",
  description: "",
  microcycles: [],
}));

function getMesoColor(mesocycles, label) {
  const found = (mesocycles || []).find(m => m.label === label)?.color;
  return found || MESOCYCLES.find(m => m.label === label)?.color || "#888";
}

// Returns { meso, micro } for a given date based on cycle startDates, or null
function getMesoForDate(mesocycles, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (const meso of (mesocycles || [])) {
    if (!meso.startDate) continue;
    const start = new Date(meso.startDate);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, meso.durationWeeks * 7);
    if (d >= start && d < end) {
      let microStart = new Date(start);
      for (const micro of (meso.microcycles || [])) {
        const microEnd = addDays(microStart, micro.durationWeeks * 7);
        if (d >= microStart && d < microEnd) {
          return { meso, micro };
        }
        microStart = new Date(microEnd);
      }
      return { meso, micro: null };
    }
  }
  return null;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// ─── CHARGE CALCULATOR REFERENCE DATA ─────────────────────────────────────────

const VOLUME_ZONES = [
  { index: 1, label: "Spécifique",           range: "< 10 mouvements" },
  { index: 2, label: "Bloc intensif",         range: "10 – 25 mouvements" },
  { index: 3, label: "Endurance de puissance",range: "25 – 40 mouvements" },
  { index: 4, label: "Mixte",                 range: "40 – 60 mouvements" },
  { index: 5, label: "Contest / Volume",      range: "60 – 100 mouvements" },
  { index: 6, label: "Gros volume",           range: "> 100 mouvements" },
];

const INTENSITY_ZONES = [
  { index: 1, label: "Récupération active",    pct: "< 45 %",     effort: "Continu léger",    recovery: "< 30 s" },
  { index: 2, label: "Endurance de force",     pct: "45 – 60 %",  effort: "Continu modéré",   recovery: "1 – 2 min" },
  { index: 3, label: "Seuil de puissance",     pct: "60 – 75 %",  effort: "Intervalles",      recovery: "2 – 3 min" },
  { index: 4, label: "Sub-maximale",           pct: "75 – 90 %",  effort: "Intensité haute",  recovery: "3 – 5 min" },
  { index: 5, label: "Maximale",               pct: "90 – 100 %", effort: "Effort maximal",   recovery: "5 – 10 min" },
  { index: 6, label: "Supra-maximale",         pct: "> 100 %",    effort: "Effort explosif",  recovery: "> 10 min" },
];

const COMPLEXITY_ZONES = [
  { index: 1, label: "Familiarisation",        desc: "Geste simple déjà maîtrisé" },
  { index: 2, label: "Exercices simples",      desc: "Coordination simple" },
  { index: 3, label: "Exercices techniques",   desc: "Technique ciblée" },
  { index: 4, label: "Coordination normale",   desc: "Séquences variées" },
  { index: 5, label: "Coordination complexe",  desc: "Voies / Blocs techniques" },
  { index: 6, label: "Compétition",            desc: "Conditions de compétition" },
];

function getNbMouvementsZone(nb) {
  if (!nb || nb <= 0) return 1;
  if (nb < 10)  return 1;
  if (nb < 25)  return 2;
  if (nb < 40)  return 3;
  if (nb < 60)  return 4;
  if (nb < 100) return 5;
  return 6;
}

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

function generateId() {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadData() {
  try {
    const raw = localStorage.getItem("climbing_planner_v1");
    const parsed = raw ? JSON.parse(raw) : {};
    return { weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES, ...parsed };
  } catch {
    return { weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES };
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

// ─── THEME ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext(null);
const useThemeCtx = () => useContext(ThemeContext);

function makeStyles(isDark) {
  const D = isDark;
  const t = {
    bg:              D ? "#191e1b"   : "#f0ebe2",
    surface:         D ? "#1f2421"   : "#e8e2d8",
    surface2:        D ? "#252b27"   : "#ddd7cc",
    border:          D ? "#252b27"   : "#ccc6b8",
    border2:         D ? "#2a3028"   : "#c4beb0",
    headerGrad:      D ? "linear-gradient(180deg, #1c2220 0%, #191e1b 100%)" : "linear-gradient(180deg, #e0d9ce 0%, #eae4da 100%)",
    text:            D ? "#e8e4de"   : "#2a2218",
    textTitle:       D ? "#c8c0b4"   : "#3a3028",
    textMuted:       D ? "#707870"   : "#8a7f70",
    textDim:         D ? "#7a8480"   : "#7a7060",
    textCard:        D ? "#b0a898"   : "#4a3f32",
    accent:          D ? "#4ade80"   : "#2a7d4f",
    accentBg:        D ? "#263228"   : "#d4e8db",
    accentBorder:    D ? "#4ade8066" : "#2a7d4f66",
    accentFaint:     D ? "#4ade8044" : "#2a7d4f44",
    accentSolid:     D ? "#4ade8055" : "#2a7d4f55",
    btnBorder:       D ? "#2e3430"   : "#bfb9aa",
    navColor:        D ? "#909898"   : "#7a7060",
    gridGap:         D ? "#1f2421"   : "#d0c9bf",
    todayBg:         D ? "#1a2a1e"   : "#ddeee5",
    metabarBg:       D ? "#161b18"   : "#ece6dc",
    subtleBorder:    D ? "#222927"   : "#ccc6b8",
    modalBg:         D ? "#191e1b"   : "#ede8de",
    overlayBg:       D ? "rgba(0,0,0,0.70)" : "rgba(0,0,0,0.45)",
    actionColor:     D ? "#4a5450"   : "#8a7f70",
    dashedBorder:    D ? "#2a3028"   : "#c4beb0",
    sessionBorder:   D ? "#1e2421"   : "#d4cec4",
    negativeBg:      D ? "#301a1a"   : "#f8d8dc",
    negativeBorder:  D ? "#f43f5e66" : "#c0394e55",
    negativeColor:   D ? "#f43f5e"   : "#c0394e",
    inputBg:         D ? "#252b27"   : "#ddd7cc",
    starEmpty:       D ? "#555"      : "#bbb",
    badgeText:       D ? "#8a9898"   : "#5a6878",
    dayEmpty:        D ? "#252b27"   : "#ccc7bc",
  };

  return {
    app: {
      minHeight: "100vh", background: t.bg, color: t.text,
      fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
      position: "relative", display: "flex", flexDirection: "column",
    },
    grain: {
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
      opacity: D ? 0.4 : 0.15,
    },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 24px 14px", borderBottom: `1px solid ${t.border2}`,
      position: "relative", zIndex: 1, background: t.headerGrad,
    },
    headerLeft: { display: "flex", alignItems: "center", gap: 12 },
    logo: { fontSize: 28 },
    appTitle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: t.textTitle },
    appSub: { fontSize: 10, color: t.textMuted, letterSpacing: "0.1em", marginTop: 2 },
    weekNav: { display: "flex", alignItems: "center", gap: 16 },
    navBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.navColor, cursor: "pointer",
      width: 34, height: 34, borderRadius: 6, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s", flexShrink: 0,
    },
    weekLabel: { textAlign: "center", minWidth: 180 },
    weekRange: { fontSize: 13, color: t.textTitle, fontWeight: 600, letterSpacing: "0.05em" },
    weekCurrent: { fontSize: 10, color: t.accent, letterSpacing: "0.12em", marginTop: 3, textTransform: "uppercase" },
    headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 },
    headerRightTop: { display: "flex", alignItems: "center", gap: 8 },
    totalCharge: { textAlign: "right" },
    totalChargeNum: { fontSize: 28, fontWeight: 700, color: t.text, lineHeight: 1 },
    totalChargeLabel: { display: "block", fontSize: 9, color: t.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 },

    headerMobile: {
      display: "flex", flexDirection: "column",
      borderBottom: `1px solid ${t.border2}`, position: "relative", zIndex: 1, background: t.headerGrad,
    },
    headerMobileRow1: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 6px" },
    headerMobileRow2: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 8px" },
    headerMobileRight: { display: "flex", alignItems: "center", gap: 8 },
    weekNavMobile: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "6px 16px 10px", borderTop: `1px solid ${t.subtleBorder}`,
    },
    totalChargeMobile: { textAlign: "right" },

    viewToggle: { display: "flex", gap: 2 },
    viewToggleBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      padding: "4px 12px", borderRadius: 4, cursor: "pointer",
      fontSize: 10, fontFamily: "inherit", letterSpacing: "0.08em", transition: "all 0.15s",
    },
    viewToggleBtnActive: { background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent },

    themeBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      width: 28, height: 28, borderRadius: 4, cursor: "pointer",
      fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    },

    syncBtns: { display: "flex", gap: 4 },
    syncBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      padding: "4px 10px", borderRadius: 4, cursor: "pointer",
      fontSize: 10, fontFamily: "inherit", letterSpacing: "0.06em", transition: "all 0.15s",
    },
    syncBtnCompact: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      width: 28, height: 28, borderRadius: 4, cursor: "pointer",
      fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    },
    syncDot: { fontSize: 12, lineHeight: 1, transition: "color 0.3s" },

    authBar: { display: "flex", alignItems: "center", gap: 8, paddingTop: 4 },
    authInput: {
      background: t.inputBg, border: `1px solid ${t.btnBorder}`, color: t.textTitle,
      padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "inherit", width: 170, outline: "none",
    },
    authBtn: {
      background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent,
      padding: "5px 12px", borderRadius: 5, cursor: "pointer",
      fontSize: 11, fontFamily: "inherit", letterSpacing: "0.06em", transition: "all 0.15s",
    },
    authEmail: { fontSize: 10, color: t.textMuted, letterSpacing: "0.06em" },
    authLogoutBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit", letterSpacing: "0.06em",
    },
    authSentMsg: { fontSize: 11, color: t.accent, letterSpacing: "0.06em" },
    authErrorMsg: { fontSize: 11, color: "#f97316", letterSpacing: "0.04em" },
    headerMobileRow3: { padding: "4px 16px 10px", borderTop: `1px solid ${t.subtleBorder}` },

    metaBar: {
      padding: "8px 24px", borderBottom: `1px solid ${t.surface2}`,
      minHeight: 42, display: "flex", alignItems: "center", position: "relative", zIndex: 1, background: t.metabarBg,
    },
    metaDisplay: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0", width: "100%" },
    metaPlaceholder: { fontSize: 11, color: t.textMuted, letterSpacing: "0.08em" },
    mesoTag: { fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid", fontWeight: 600, letterSpacing: "0.06em" },
    microTag: { fontSize: 11, color: t.navColor, background: t.surface2, padding: "3px 10px", borderRadius: 4 },
    noteTag: { fontSize: 11, color: t.textDim, fontStyle: "italic" },
    metaForm: { display: "flex", gap: 8, alignItems: "center", width: "100%" },
    metaSelect: {
      background: t.inputBg, border: `1px solid ${t.btnBorder}`, color: t.textTitle,
      padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "inherit",
    },
    metaInput: {
      background: t.inputBg, border: `1px solid ${t.btnBorder}`, color: t.textTitle,
      padding: "5px 10px", borderRadius: 5, fontSize: 11, fontFamily: "inherit", flex: 1,
    },

    grid: {
      display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
      gap: 1, flex: 1, background: t.gridGap, position: "relative", zIndex: 1, minHeight: 420,
    },
    gridMobile: { display: "flex", flexDirection: "column", background: t.gridGap, gap: 1, position: "relative", zIndex: 1 },
    dayCol: {
      background: t.bg, display: "flex", flexDirection: "column",
      padding: "10px 8px", minHeight: 200, position: "relative", transition: "background 0.15s",
    },
    dayColMobile: { minHeight: "auto", padding: "10px 16px", borderBottom: `1px solid ${t.gridGap}` },
    dayColToday: { background: t.todayBg, borderTop: `2px solid ${t.accent}` },
    dayHeader: { display: "flex", flexDirection: "column", gap: 1, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${t.border}` },
    dayHeaderMobile: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${t.border}` },
    dayHeaderMobileLeft: { display: "flex", alignItems: "center", gap: 8 },
    dayName: { fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: t.textDim, textTransform: "uppercase" },
    dayNameToday: { color: t.accent },
    dayDate: { fontSize: 10, color: t.textMuted },
    dayCharge: { fontSize: 13, fontWeight: 700, marginTop: 2 },

    sessionCards: { display: "flex", flexDirection: "column", gap: 5, flex: 1 },
    sessionCard: {
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 5, display: "flex", alignItems: "stretch",
      overflow: "hidden", cursor: "default", transition: "border-color 0.15s",
    },
    sessionCardAccent: { width: 3, flexShrink: 0 },
    sessionCardContent: { flex: 1, padding: "5px 7px" },
    sessionCardName: { fontSize: 10, color: t.textCard, display: "block", lineHeight: 1.4, letterSpacing: "0.02em" },
    sessionCardFooter: { display: "flex", alignItems: "center", gap: 6, marginTop: 3 },
    sessionCardCharge: { fontSize: 10, fontWeight: 700 },
    feedbackDot: { fontSize: 10, color: t.accent },
    sessionCardActions: { display: "flex", flexDirection: "column" },
    actionBtn: {
      background: "none", border: "none", color: t.actionColor, cursor: "pointer",
      padding: "3px 5px", fontSize: 10, lineHeight: 1, transition: "color 0.1s", flex: 1,
    },
    addBtn: {
      marginTop: 8, background: "none", border: `1px dashed ${t.dashedBorder}`,
      color: t.actionColor, cursor: "pointer", borderRadius: 5,
      padding: "6px 4px", display: "flex", alignItems: "center", justifyContent: "center",
      gap: 4, fontSize: 10, letterSpacing: "0.06em", transition: "all 0.15s", width: "100%",
    },
    addBtnIcon: { fontSize: 12, lineHeight: 1 },
    addBtnLabel: {},

    chargeBar: {
      display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
      gap: 1, background: t.gridGap, padding: "8px 0 10px", position: "relative", zIndex: 1,
    },
    chargeBarCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
    chargeBarTrack: {
      width: 6, height: 40, background: t.surface2, borderRadius: 3,
      display: "flex", alignItems: "flex-end", overflow: "hidden",
    },
    chargeBarFill: { width: "100%", borderRadius: 3, transition: "height 0.3s, background 0.3s" },
    chargeBarLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" },
    chargeBarLabelEmpty: t.textMuted,

    monthView: { flex: 1, position: "relative", zIndex: 1, padding: "16px 24px", overflowY: "auto" },
    monthDayHeaders: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 },
    monthDayHeaderCell: { textAlign: "center", fontSize: 10, color: t.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 0" },
    monthWeekRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 },
    monthDayCell: {
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 5, padding: "7px 8px", minHeight: 86,
      cursor: "pointer", display: "flex", flexDirection: "column",
      transition: "border-color 0.15s", position: "relative", overflow: "hidden",
    },
    monthDayCellMobile: { minHeight: 52, padding: "5px 4px" },
    monthDayCellOut: { opacity: 0.25, cursor: "default" },
    monthDayCellToday: { borderColor: t.accentSolid, background: t.todayBg },
    monthDayNum: { fontSize: 12, fontWeight: 600, color: t.textDim, lineHeight: 1 },
    monthDayNumToday: { color: t.accent },
    monthDayContent: { display: "flex", flexDirection: "column", gap: 2, marginTop: 5, flex: 1 },
    monthSessionRow: { borderRadius: 3, padding: "2px 5px" },
    monthSessionLabel: { fontSize: 9, display: "block", letterSpacing: "0.02em", lineHeight: 1.35 },
    monthMoreLabel: { fontSize: 9, color: t.textMuted, letterSpacing: "0.04em", paddingLeft: 2 },
    monthDayChargeBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderRadius: "0 0 5px 5px" },
    monthMobileDots: { display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" },
    monthMobileDot: { width: 5, height: 5, borderRadius: "50%" },

    yearGrid: {
      flex: 1, position: "relative", zIndex: 1, padding: "16px 24px",
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8, alignContent: "start", overflowY: "auto",
    },
    yearGridMobile: { gridTemplateColumns: "repeat(2, 1fr)", padding: "12px 16px" },
    yearMonthCard: {
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 7, padding: "12px", cursor: "pointer", transition: "border-color 0.15s",
    },
    yearMonthCardCurrent: { borderColor: t.accentFaint, background: t.todayBg },
    yearMonthHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
    yearMonthName: { fontSize: 11, fontWeight: 600, color: t.navColor, letterSpacing: "0.04em" },
    yearMonthNameCurrent: { color: t.accent },
    yearMonthCharge: { fontSize: 13, fontWeight: 700 },
    yearHeatmap: { display: "flex", flexDirection: "column", gap: 2 },
    yearHeatmapRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 },
    yearHeatmapCell: { height: 8, borderRadius: 2 },
    yearDayEmpty: t.dayEmpty,

    dashboard: { padding: "20px 24px", overflowY: "auto", flex: 1 },
    dashTitle: { fontSize: 11, fontWeight: 700, color: t.navColor, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 },
    dashCards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 },
    dashCard: {
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4,
    },
    dashCardVal: { fontSize: 24, fontWeight: 700, color: t.text, lineHeight: 1 },
    dashCardLabel: { fontSize: 10, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" },
    dashSection: { marginBottom: 28 },
    dashSectionTitle: { fontSize: 11, fontWeight: 600, color: t.navColor, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 },
    dashChartBg: t.surface,
    dashGrid: t.border,
    dashText: t.textMuted,
    dashTooltipBg: t.surface,
    dashTooltipText: t.text,

    // ── Cycles view ──
    cyclesView: { padding: "20px 24px", overflowY: "auto", flex: 1 },
    cyclesHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    cyclesTitle: { fontSize: 11, fontWeight: 700, color: t.navColor, letterSpacing: "0.1em", textTransform: "uppercase" },
    cycleCard: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 12, overflow: "hidden" },
    cycleMesoRow: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexWrap: "wrap" },
    cycleColorInput: { width: 28, height: 28, borderRadius: 4, border: `1px solid ${t.border}`, padding: 0, cursor: "pointer", background: "none" },
    cycleLabelInput: { flex: "1 1 160px", background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "5px 9px", color: t.text, fontSize: 13, fontFamily: "inherit", fontWeight: 600 },
    cycleDurInput: { width: 52, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "5px 7px", color: t.text, fontSize: 12, fontFamily: "inherit", textAlign: "center" },
    cycleDescInput: { flex: "2 1 200px", background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "5px 9px", color: t.textDim, fontSize: 11, fontFamily: "inherit" },
    cycleMicroList: { borderTop: `1px solid ${t.border}`, padding: "8px 14px 12px" },
    cycleMicroRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
    cycleMicroDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
    cycleMicroLabelInput: { flex: "1 1 140px", background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "4px 8px", color: t.text, fontSize: 12, fontFamily: "inherit" },
    cycleMicroDurInput: { width: 44, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "4px 6px", color: t.textDim, fontSize: 11, fontFamily: "inherit", textAlign: "center" },
    cycleDeleteBtn: { background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 4 },
    cycleAddMicroBtn: { fontSize: 11, color: t.accent, background: t.accentFaint, border: `1px dashed ${t.accentBorder}`, borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", marginTop: 4 },
    cycleAddMesoBtn: { fontSize: 11, color: t.accent, background: t.accentFaint, border: `1px dashed ${t.accentBorder}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" },
    cycleDurLabel: { fontSize: 10, color: t.textMuted },
    cycleDateInput: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "4px 8px", color: t.text, fontSize: 11, fontFamily: "inherit", colorScheme: D ? "dark" : "light" },
    cycleDateEnd: { fontSize: 10, color: t.textMuted, whiteSpace: "nowrap", flexShrink: 0 },
    cycleMicroDate: { fontSize: 10, color: t.textDim, whiteSpace: "nowrap", flexShrink: 0, minWidth: 52 },
    // ── Custom session form ──
    customFormOverlay: { position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" },
    customForm: { background: t.modalBg, border: `1px solid ${t.border2}`, borderRadius: 10, width: "min(680px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: D ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.15)" },
    customFormBody: { overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1 },
    customFormRow: { display: "flex", gap: 10, alignItems: "center" },
    customFormField: { display: "flex", flexDirection: "column", gap: 5 },
    customFormLabel: { fontSize: 10, color: t.textMuted, letterSpacing: "0.07em", textTransform: "uppercase" },
    customFormInput: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "7px 10px", color: t.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" },
    customFormSelect: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "7px 10px", color: t.text, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" },
    customFormTextarea: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "8px 10px", color: t.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", resize: "vertical", lineHeight: 1.6 },
    customFormHint: { fontSize: 10, color: t.textMuted, letterSpacing: "0.04em", fontStyle: "italic" },
    customFormSectionTabs: { display: "flex", gap: 6, borderBottom: `1px solid ${t.border}`, paddingBottom: 8, marginBottom: 8 },
    customFormSectionTab: { fontSize: 11, padding: "4px 10px", borderRadius: 4, border: `1px solid ${t.border}`, background: "none", color: t.textDim, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" },
    customFormSectionTabActive: { background: t.accentBg, borderColor: t.accentBorder, color: t.accent },
    customFormChargeRow: { display: "flex", alignItems: "center", gap: 12 },
    customFormChargeVal: { fontSize: 18, fontWeight: 700, minWidth: 32 },
    customFormSlider: { flex: 1, accentColor: t.accent },
    mesoHint: { fontSize: 10, color: t.navColor, letterSpacing: "0.04em", padding: "4px 8px", background: t.accentFaint, borderRadius: 4, display: "inline-flex", gap: 6 },
    // ── Charge calculator ──
    calcBtn: { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid ${t.border2}`, background: t.accentFaint, color: t.accent, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em", whiteSpace: "nowrap" },
    calcPanel: { background: t.surface2, border: `1px solid ${t.border2}`, borderRadius: 7, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 },
    calcRow: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" },
    calcField: { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 100px" },
    calcLabel: { fontSize: 10, color: t.textMuted, letterSpacing: "0.07em", textTransform: "uppercase" },
    calcSelect: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "6px 8px", color: t.text, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" },
    calcInput: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: "6px 8px", color: t.text, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%" },
    calcResultRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    calcResultVal: { fontSize: 20, fontWeight: 700 },
    calcApplyBtn: { fontSize: 12, padding: "5px 14px", borderRadius: 5, border: "none", background: t.accent, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    calcVolumeHint: { fontSize: 10, color: t.textDim, fontStyle: "italic" },
    // ── Info panel (reference tables) ──
    infoOverlay: { position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(4px)" },
    infoPanel: { background: t.modalBg, border: `1px solid ${t.border2}`, borderRadius: 10, width: "min(720px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: D ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.15)" },
    infoPanelBody: { overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 },
    infoTableTitle: { fontSize: 11, fontWeight: 700, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 },
    infoTable: { width: "100%", borderCollapse: "collapse", fontSize: 11 },
    infoTh: { padding: "5px 8px", background: t.surface2, color: t.textMuted, fontWeight: 600, letterSpacing: "0.05em", textAlign: "left", borderBottom: `1px solid ${t.border}`, fontSize: 10 },
    infoTd: { padding: "5px 8px", color: t.text, borderBottom: `1px solid ${t.border}`, verticalAlign: "top" },
    infoIndexBadge: { display: "inline-block", minWidth: 20, textAlign: "center", fontWeight: 700, borderRadius: 3, padding: "1px 4px", fontSize: 11 },
    // ── Rich text ──
    richText: { fontSize: 12, color: t.text, lineHeight: 1.7, padding: "8px 0" },
    richUl: { paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 },
    richLi: { display: "flex", gap: 6, alignItems: "flex-start" },
    richBullet: { color: t.accent, flexShrink: 0, marginTop: 3 },
    richCheckbox: { width: 13, height: 13, borderRadius: 3, border: `1px solid ${t.border2}`, background: "none", flexShrink: 0, marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
    richCheckboxDone: { background: t.accent, borderColor: t.accent },
    richImg: { maxWidth: "100%", borderRadius: 6, marginTop: 4 },
    richLink: { color: t.accent, textDecoration: "none" },
    // ── Detail modal ──
    detailModal: { background: t.modalBg, border: `1px solid ${t.border2}`, borderRadius: 10, width: "min(600px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: D ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.15)" },
    detailBody: { overflowY: "auto", padding: "16px 20px", flex: 1 },
    detailSection: { marginBottom: 16 },
    detailSectionTitle: { fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${t.border}` },
    detailMeta: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 },
    detailMetaChip: { fontSize: 11, color: t.textCard, background: t.surface2, padding: "3px 10px", borderRadius: 12 },
    detailMesoBar: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
    // ── Session card extras ──
    sessionCardMeso: { fontSize: 9, letterSpacing: "0.05em", padding: "1px 6px", borderRadius: 3, fontWeight: 600, marginTop: 2, alignSelf: "flex-start" },
    sessionCardDetailBtn: { fontSize: 11, background: "none", border: "none", color: t.textMuted, cursor: "pointer", padding: "2px 4px" },
    customBadge: { fontSize: 9, background: t.accentFaint, color: t.accent, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em", border: `1px solid ${t.accentBorder}`, alignSelf: "flex-start" },
    // ── Custom session in picker ──
    customPickerSection: { padding: "10px 16px 4px", borderTop: `1px solid ${t.border}` },
    customPickerLabel: { fontSize: 10, color: t.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 },
    createCustomBtn: { width: "100%", padding: "10px 14px", background: t.accentFaint, border: `1px dashed ${t.accentBorder}`, borderRadius: 6, color: t.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em", textAlign: "left" },

    overlay: {
      position: "fixed", inset: 0, background: t.overlayBg,
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, backdropFilter: "blur(4px)",
    },
    modal: {
      background: t.modalBg, border: `1px solid ${t.border2}`,
      borderRadius: 10, width: "90%", maxWidth: 520,
      maxHeight: "80vh", display: "flex", flexDirection: "column",
      overflow: "hidden", boxShadow: D ? "0 24px 80px rgba(0,0,0,0.6)" : "0 24px 80px rgba(0,0,0,0.15)",
    },
    modalHeader: { padding: "16px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
    modalTitle: { fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: t.textTitle },
    closeBtn: { background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 16 },
    modalFilters: { padding: "12px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 8 },
    searchInput: {
      background: t.inputBg, border: `1px solid ${t.btnBorder}`, color: t.textTitle,
      padding: "8px 12px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", outline: "none",
    },
    filterTabs: { display: "flex", gap: 6 },
    filterTab: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.06em",
    },
    filterTabActive: { background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent },
    sessionList: { overflowY: "auto", flex: 1 },
    sessionItem: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${t.sessionBorder}`, transition: "background 0.1s",
    },
    sessionItemLeft: { display: "flex", alignItems: "center", gap: 10 },
    sessionTypeBadge: { fontSize: 9, padding: "2px 7px", borderRadius: 3, color: t.badgeText, letterSpacing: "0.08em", textTransform: "uppercase" },
    seanceBadgeBg: D ? "#1e3a5f" : "#c4d8ee",
    exerciceBadgeBg: D ? "#1a2e1a" : "#c4e0c8",
    sessionItemName: { fontSize: 12, color: t.textCard },
    chargePill: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4 },
    emptySearch: { padding: 20, textAlign: "center", color: t.textMuted, fontSize: 12 },

    feedbackSubtitle: { fontSize: 10, color: t.textMuted, marginTop: 4, letterSpacing: "0.06em" },
    feedbackBody: { padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 },
    feedbackLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: t.navColor, letterSpacing: "0.08em" },
    doneToggle: { display: "flex", gap: 4 },
    doneBtn: {
      background: t.surface2, border: `1px solid ${t.btnBorder}`, color: t.textMuted,
      padding: "4px 14px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
    },
    doneBtnActive: { background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent },
    doneBtnActiveNeg: { background: t.negativeBg, border: `1px solid ${t.negativeBorder}`, color: t.negativeColor },
    rpeValue: { fontSize: 16, fontWeight: 700 },
    slider: { width: "100%", accentColor: t.accent, cursor: "pointer" },
    stars: { display: "flex", gap: 4 },
    star: { background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 },
    starEmpty: t.starEmpty,
    textarea: {
      background: t.inputBg, border: `1px solid ${t.btnBorder}`, color: t.textTitle,
      padding: "8px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", resize: "vertical", outline: "none",
    },
    feedbackFooter: { padding: "12px 18px", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "flex-end", gap: 8 },
    cancelBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      padding: "7px 16px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
    },
    saveBtn: {
      background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent,
      padding: "7px 18px", borderRadius: 5, cursor: "pointer", fontSize: 11,
      fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.06em",
    },
  };
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

function SyncButtons({ data, onImport, compact, syncStatus, session, onUpload, onPull }) {
  const { styles } = useThemeCtx();
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

  const syncIcon = syncStatus === "saving" ? "⟳"
    : syncStatus === "saved" ? "✓"
    : syncStatus === "offline" ? "⚡"
    : null;
  const syncColor = syncStatus === "saved" ? "#4ade80"
    : syncStatus === "offline" ? "#f97316"
    : "#555";

  return (
    <div style={styles.syncBtns}>
      {syncIcon && (
        <span style={{ ...styles.syncDot, color: syncColor }} title={
          syncStatus === "saving" ? "Synchronisation…"
          : syncStatus === "saved" ? "Synchronisé"
          : "Hors ligne — données sauvées localement"
        }>{syncIcon}</span>
      )}
      {session && onUpload && (
        <button style={{ ...btnStyle, color: "#4ade80" }} onClick={onUpload} title="Envoyer mes données vers le cloud (écraser)">
          ☁↑
        </button>
      )}
      {session && onPull && (
        <button style={{ ...btnStyle, color: "#60a5fa" }} onClick={onPull} title="Charger les données depuis le cloud (écraser local)">
          ☁↓
        </button>
      )}
      {!compact && (
        <>
          <button style={btnStyle} onClick={handleExport} title="Exporter en JSON">↓ Export</button>
          <button style={btnStyle} onClick={() => importRef.current?.click()} title="Importer un JSON">↑ Import</button>
        </>
      )}
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

// ─── HOOK: SYNC SUPABASE ─────────────────────────────────────────────────────

function useSupabaseSync() {
  const [session, setSession] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle"|"saving"|"saved"|"offline"
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale/invalid token in storage → wipe it cleanly
        supabase.auth.signOut().catch(() => {});
        setSession(null);
      } else {
        setSession(session);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // TOKEN_REFRESHED failure emits SIGNED_OUT — nothing extra needed,
      // but if we still have stale keys we force-clear them here.
      if (event === "SIGNED_OUT" && !session) {
        try { Object.keys(localStorage).filter(k => k.includes("supabase")).forEach(k => localStorage.removeItem(k)); } catch {}
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadFromCloud = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("climbing_plans")
      .select("data")
      .maybeSingle();
    if (error) return null;
    return data?.data ?? null;
  }, []);

  const saveToCloud = useCallback((planData, userId) => {
    if (!supabase || !userId) return;
    clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("climbing_plans")
          .upsert({ user_id: userId, data: planData }, { onConflict: "user_id" });
        setSyncStatus(error ? "offline" : "saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("offline");
      }
    }, 1500);
  }, []);

  // Immediate upload (no debounce) — used for force-sync & first-login push
  const uploadNow = useCallback(async (planData, userId) => {
    if (!supabase || !userId) return;
    setSyncStatus("saving");
    try {
      const { error } = await supabase
        .from("climbing_plans")
        .upsert({ user_id: userId, data: planData }, { onConflict: "user_id" });
      setSyncStatus(error ? "offline" : "saved");
      setTimeout(() => setSyncStatus("idle"), 2500);
    } catch {
      setSyncStatus("offline");
    }
  }, []);

  return { session, setSession, syncStatus, loadFromCloud, saveToCloud, uploadNow };
}

// ─── AUTH PANEL ───────────────────────────────────────────────────────────────

function AuthPanel({ session, onAuthChange }) {
  const { styles } = useThemeCtx();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState("password"); // "password" | "magiclink" | "setpw" | "pwdone"
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [authError, setAuthError] = useState("");

  const reset = () => { setAuthError(""); setSent(false); setSending(false); };
  const go = m => { setMode(m); reset(); setPassword(""); };

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password.trim() || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: password.trim(),
    });
    setSending(false);
    if (error) setAuthError("Email ou mot de passe incorrect");
  };

  const handleMagicLink = async () => {
    if (!email.trim() || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      setAuthError(error.status === 429 ? "Trop d'essais — attendez quelques minutes" : error.message);
    } else { setSent(true); }
  };

  const handleSetPassword = async () => {
    if (password.trim().length < 6 || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.updateUser({ password: password.trim() });
    setSending(false);
    if (error) { setAuthError(error.message); }
    else { setMode("pwdone"); setPassword(""); }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch {}
    onAuthChange(null);
  };

  if (!supabase) return null;

  /* ── Connecté ── */
  if (session) {
    if (mode === "setpw") return (
      <div style={styles.authBar}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <input
          style={{ ...styles.authInput, width: 150 }}
          type="password"
          placeholder="Nouveau mot de passe (6+ car.)"
          value={password}
          autoFocus
          onChange={e => { setPassword(e.target.value); setAuthError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSetPassword()}
        />
        <button style={styles.authBtn} onClick={handleSetPassword} disabled={sending || password.length < 6}>
          {sending ? "…" : "Enregistrer"}
        </button>
        <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>✕</button>
        {authError && <span style={styles.authErrorMsg}>{authError}</span>}
      </div>
    );

    if (mode === "pwdone") return (
      <div style={styles.authBar}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <span style={styles.authSentMsg}>✓ Mot de passe défini</span>
        <button style={styles.authLogoutBtn} onClick={() => go("password")}>✕</button>
        <button style={styles.authLogoutBtn} onClick={handleLogout}>Déco</button>
      </div>
    );

    return (
      <div style={styles.authBar}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <button
          style={{ ...styles.authBtn, fontSize: 10, padding: "3px 8px", opacity: 0.75 }}
          onClick={() => go("setpw")}
          title="Définir un mot de passe pour se connecter sans magic link"
        >🔑 MDP</button>
        <button style={styles.authLogoutBtn} onClick={handleLogout}>Déco</button>
      </div>
    );
  }

  /* ── Magic link ── */
  if (mode === "magiclink") return (
    <div style={styles.authBar}>
      {sent ? (
        <span style={styles.authSentMsg}>📧 Lien envoyé — vérifiez vos mails</span>
      ) : (
        <>
          <input
            style={styles.authInput}
            type="email"
            placeholder="votre@email.com"
            value={email}
            autoFocus
            onChange={e => { setEmail(e.target.value); setAuthError(""); }}
            onKeyDown={e => e.key === "Enter" && handleMagicLink()}
          />
          <button style={styles.authBtn} onClick={handleMagicLink} disabled={sending}>
            {sending ? "…" : "Envoyer le lien"}
          </button>
        </>
      )}
      <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>← MDP</button>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );

  /* ── Mot de passe (défaut) ── */
  return (
    <div style={styles.authBar}>
      <input
        style={styles.authInput}
        type="email"
        placeholder="votre@email.com"
        value={email}
        onChange={e => { setEmail(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <input
        style={{ ...styles.authInput, width: 130 }}
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={e => { setPassword(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <button style={styles.authBtn} onClick={handlePasswordLogin} disabled={sending || !password.trim()}>
        {sending ? "…" : "Connexion"}
      </button>
      <button style={{ ...styles.authLogoutBtn, opacity: 0.6 }} onClick={() => go("magiclink")} title="Connexion par lien email">
        Lien →
      </button>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );
}

// ─── RICH TEXT ────────────────────────────────────────────────────────────────

function RichText({ text, onCheckToggle }) {
  const { styles } = useThemeCtx();
  if (!text?.trim()) return null;

  const lines = text.split("\n");

  return (
    <div style={styles.richText}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Checkbox
        const cbDone = trimmed.startsWith("[x] ") || trimmed.startsWith("[X] ");
        const cbOpen = trimmed.startsWith("[ ] ");
        if (cbDone || cbOpen) {
          const content = trimmed.slice(4);
          return (
            <div key={i} style={styles.richLi}>
              <div
                style={{ ...styles.richCheckbox, ...(cbDone ? styles.richCheckboxDone : {}) }}
                onClick={() => onCheckToggle?.(i, !cbDone)}
              >
                {cbDone && <span style={{ fontSize: 9, color: "#fff" }}>✓</span>}
              </div>
              <span style={cbDone ? { textDecoration: "line-through", opacity: 0.5 } : {}}>{renderInline(content, styles)}</span>
            </div>
          );
        }

        // Bullet
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          return (
            <div key={i} style={styles.richLi}>
              <span style={styles.richBullet}>•</span>
              <span>{renderInline(trimmed.slice(2), styles)}</span>
            </div>
          );
        }

        // Image
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={styles.richImg} />;
        }

        // Empty line → spacer
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;

        return <div key={i}>{renderInline(trimmed, styles)}</div>;
      })}
    </div>
  );
}

function renderInline(text, styles) {
  const parts = [];
  let rest = text;
  const patterns = [
    { re: /\*\*(.+?)\*\*/, render: (m, i) => <strong key={i}>{m[1]}</strong> },
    { re: /`(.+?)`/, render: (m, i) => <code key={i} style={{ background: "#ffffff15", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em" }}>{m[1]}</code> },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m, i) => <a key={i} href={m[2]} target="_blank" rel="noopener" style={styles.richLink}>{m[1]}</a> },
  ];
  let key = 0;
  while (rest) {
    let earliest = null, match = null, renderer = null;
    for (const { re, render } of patterns) {
      const m = rest.match(re);
      if (m && (earliest === null || m.index < earliest)) {
        earliest = m.index;
        match = m;
        renderer = render;
      }
    }
    if (match === null) { parts.push(rest); break; }
    if (match.index > 0) parts.push(rest.slice(0, match.index));
    parts.push(renderer(match, key++));
    rest = rest.slice(match.index + match[0].length);
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ─── MODAL: CRÉER / MODIFIER UNE SÉANCE PERSONNALISÉE ─────────────────────────

function CustomSessionModal({ initial, data, onSave, onClose }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "Séance");
  const [charge, setCharge] = useState(initial?.charge ?? 24);
  const [estimatedTime, setEstimatedTime] = useState(initial?.estimatedTime ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [minRecovery, setMinRecovery] = useState(initial?.minRecovery ?? "");
  const [warmup, setWarmup] = useState(initial?.warmup ?? "");
  const [main, setMain] = useState(initial?.main ?? "");
  const [cooldown, setCooldown] = useState(initial?.cooldown ?? "");
  const [section, setSection] = useState("main");
  const [preview, setPreview] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [nbMouvements, setNbMouvements] = useState("");
  const [calcZone, setCalcZone] = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);

  // Mesocycle/microcycle for selected date
  const dateMeta = (() => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const key = weekKey(getMondayOf(d));
    return data.weekMeta?.[key] || null;
  })();

  const currentText = section === "warmup" ? warmup : section === "main" ? main : cooldown;
  const setCurrentText = section === "warmup" ? setWarmup : section === "main" ? setMain : setCooldown;

  const handleSave = () => {
    if (!name.trim()) return;
    const session = {
      id: initial?.id ?? generateId(),
      type, name: name.trim(), charge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      location: location.trim() || null,
      date: date || null,
      minRecovery: minRecovery ? +minRecovery : null,
      warmup, main, cooldown,
      isCustom: true,
    };
    onSave(session);
  };

  const sectionLabels = { warmup: "Échauffement", main: "Cœur de séance", cooldown: "Retour au calme" };

  return (
    <div style={styles.customFormOverlay} onClick={onClose}>
      <div style={styles.customForm} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier la séance" : "Nouvelle séance personnalisée"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.customFormBody}>
          {/* Nom + type */}
          <div style={styles.customFormRow}>
            <select style={styles.customFormSelect} value={type} onChange={e => setType(e.target.value)}>
              <option>Séance</option>
              <option>Exercice</option>
            </select>
            <input style={{ ...styles.customFormInput, flex: 1 }} placeholder="Nom de la séance…" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Temps / Lieu / Date */}
          <div style={{ ...styles.customFormRow, flexWrap: "wrap" }}>
            <div style={{ ...styles.customFormField, flex: "1 1 100px" }}>
              <span style={styles.customFormLabel}>Temps estimé (min)</span>
              <input style={styles.customFormInput} type="number" min="0" placeholder="90" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} />
            </div>
            <div style={{ ...styles.customFormField, flex: "2 1 160px" }}>
              <span style={styles.customFormLabel}>Lieu</span>
              <input style={styles.customFormInput} placeholder="Salle, falaise…" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
            <div style={{ ...styles.customFormField, flex: "1 1 140px" }}>
              <span style={styles.customFormLabel}>Date</span>
              <input style={styles.customFormInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Meso hint */}
          {dateMeta?.mesocycle && (
            <div style={styles.mesoHint}>
              <span>📌</span>
              <span style={{ color: getMesoColor(mesocycles, dateMeta.mesocycle) }}>{dateMeta.mesocycle}</span>
              {dateMeta.microcycle && <span style={{ color: isDark ? "#8a9090" : "#7a7060" }}>· {dateMeta.microcycle}</span>}
            </div>
          )}

          {/* Charge + récup */}
          <div style={{ ...styles.customFormField }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={styles.customFormLabel}>Charge d'entraînement</span>
              <button style={styles.calcBtn} onClick={() => { setCalcOpen(o => !o); setInfoOpen(false); }}>
                🧮 Calculateur
              </button>
              <button style={{ ...styles.calcBtn, background: "none" }} onClick={() => { setInfoOpen(o => !o); setCalcOpen(false); }}>
                ℹ Infos
              </button>
            </div>
            <div style={styles.customFormChargeRow}>
              <span style={{ ...styles.customFormChargeVal, color: getChargeColor(charge) }}>{charge}</span>
              <input style={styles.customFormSlider} type="range" min="0" max="216" value={charge} onChange={e => setCharge(+e.target.value)} />
              <div style={{ ...styles.customFormField, flex: "0 0 120px" }}>
                <span style={styles.customFormLabel}>Récup. mini (h)</span>
                <input style={styles.customFormInput} type="number" min="0" placeholder="48" value={minRecovery} onChange={e => setMinRecovery(e.target.value)} />
              </div>
            </div>

            {/* ── Inline calculator ── */}
            {calcOpen && (() => {
              const volZone = getNbMouvementsZone(+nbMouvements);
              const volLabel = VOLUME_ZONES[volZone - 1].label;
              const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;
              return (
                <div style={styles.calcPanel}>
                  <div style={styles.calcRow}>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Nb de mouvements</span>
                      <input
                        style={styles.calcInput}
                        type="number" min="1" placeholder="ex: 40"
                        value={nbMouvements}
                        onChange={e => setNbMouvements(e.target.value)}
                      />
                      {nbMouvements && (
                        <span style={styles.calcVolumeHint}>
                          → Zone {volZone} · {volLabel} ({VOLUME_ZONES[volZone - 1].range})
                        </span>
                      )}
                    </div>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Zone d'intensité</span>
                      <select style={styles.calcSelect} value={calcZone} onChange={e => setCalcZone(+e.target.value)}>
                        {INTENSITY_ZONES.map(z => (
                          <option key={z.index} value={z.index}>{z.index} – {z.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Complexité</span>
                      <select style={styles.calcSelect} value={calcComplexity} onChange={e => setCalcComplexity(+e.target.value)}>
                        {COMPLEXITY_ZONES.map(z => (
                          <option key={z.index} value={z.index}>{z.index} – {z.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {computed !== null && (
                    <div style={styles.calcResultRow}>
                      <span style={{ ...styles.calcResultVal, color: getChargeColor(computed) }}>{computed}</span>
                      <span style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7060" }}>
                        = Zone vol.{volZone} × Int.{calcZone} × Compl.{calcComplexity}
                      </span>
                      <button style={styles.calcApplyBtn} onClick={() => { setCharge(computed); setCalcOpen(false); }}>
                        Appliquer →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Info modal (reference tables) ── */}
          {infoOpen && (
            <div style={styles.infoOverlay} onClick={() => setInfoOpen(false)}>
              <div style={styles.infoPanel} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <span style={styles.modalTitle}>Référence — Calcul de charge</span>
                  <button style={styles.closeBtn} onClick={() => setInfoOpen(false)}>✕</button>
                </div>
                <div style={styles.infoPanelBody}>

                  {/* Table 1 – Volume */}
                  <div>
                    <div style={styles.infoTableTitle}>1 · Volume (nb de mouvements → zone)</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Zone</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>Nb mouvements</th>
                        </tr>
                      </thead>
                      <tbody>
                        {VOLUME_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.range}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table 2 – Intensité */}
                  <div>
                    <div style={styles.infoTableTitle}>2 · Zone d'intensité</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Zone</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>% Perf max</th>
                          <th style={styles.infoTh}>Type d'effort</th>
                          <th style={styles.infoTh}>Récupération</th>
                        </tr>
                      </thead>
                      <tbody>
                        {INTENSITY_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.pct}</td>
                            <td style={styles.infoTd}>{z.effort}</td>
                            <td style={styles.infoTd}>{z.recovery}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table 3 – Complexité */}
                  <div>
                    <div style={styles.infoTableTitle}>3 · Index de complexité</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Index</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COMPLEXITY_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7060", fontStyle: "italic" }}>
                    Formule : Charge = Zone volume × Zone intensité × Index complexité (max 216)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section tabs */}
          <div>
            <div style={styles.customFormSectionTabs}>
              {["warmup", "main", "cooldown"].map(s => (
                <button key={s} style={{ ...styles.customFormSectionTab, ...(section === s ? styles.customFormSectionTabActive : {}) }} onClick={() => { setSection(s); setPreview(false); }}>
                  {sectionLabels[s]}
                </button>
              ))}
              <button style={{ ...styles.customFormSectionTab, marginLeft: "auto", ...(preview ? styles.customFormSectionTabActive : {}) }} onClick={() => setPreview(p => !p)}>
                {preview ? "✎ Éditer" : "👁 Aperçu"}
              </button>
            </div>
            {preview ? (
              <div style={{ ...styles.customFormInput, minHeight: 120, padding: "10px 12px" }}>
                <RichText text={currentText} />
              </div>
            ) : (
              <textarea
                style={{ ...styles.customFormTextarea, minHeight: 120 }}
                placeholder={`${sectionLabels[section]}…\n* bullet point\n[ ] checkbox\n**gras**  \`code\`  [lien](url)  ![img](url)`}
                value={currentText}
                onChange={e => setCurrentText(e.target.value)}
                rows={6}
              />
            )}
            <div style={styles.customFormHint}>
              Syntaxe : <code style={{ opacity: 0.8 }}>* puce</code> · <code style={{ opacity: 0.8 }}>[ ] checkbox</code> · <code style={{ opacity: 0.8 }}>[x]</code> · <code style={{ opacity: 0.8 }}>**gras**</code> · <code style={{ opacity: 0.8 }}>[texte](url)</code> · <code style={{ opacity: 0.8 }}>![alt](url)</code>
            </div>
          </div>
        </div>

        <div style={styles.feedbackFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button style={{ ...styles.saveBtn, opacity: name.trim() ? 1 : 0.4 }} onClick={handleSave} disabled={!name.trim()}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: Ajouter une séance ────────────────────────────────────────────────

function SessionPicker({ onSelect, onClose, customSessions, onCreateCustom }) {
  const { styles } = useThemeCtx();
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");

  const filtered = SESSIONS.filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const filteredCustom = (customSessions || []).filter(s => {
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
          {/* Custom sessions section */}
          {filteredCustom.length > 0 && (
            <>
              <div style={{ ...styles.customPickerLabel, padding: "6px 14px 2px", fontSize: 9 }}>MES SÉANCES</div>
              {filteredCustom.map(s => (
                <div key={s.id} style={{ ...styles.sessionItem, borderLeft: `2px solid ${getChargeColor(s.charge)}` }} onClick={() => onSelect(s)}>
                  <div style={styles.sessionItemLeft}>
                    <span style={{ ...styles.sessionTypeBadge, background: s.type === "Séance" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>{s.type}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={styles.sessionItemName}>{s.name}</span>
                      {(s.estimatedTime || s.location) && (
                        <span style={{ fontSize: 10, color: styles.dashText }}>
                          {s.estimatedTime ? `⏱${s.estimatedTime}min` : ""}{s.location ? `  📍${s.location}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>{s.charge}</span>
                </div>
              ))}
            </>
          )}
          {/* Predefined sessions */}
          {filtered.map(s => (
            <div key={s.id} style={styles.sessionItem} onClick={() => onSelect(s)}>
              <div style={styles.sessionItemLeft}>
                <span style={{ ...styles.sessionTypeBadge, background: s.type === "Séance" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
                  {s.type}
                </span>
                <span style={styles.sessionItemName}>{s.name}</span>
              </div>
              <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>
                {s.charge}
              </span>
            </div>
          ))}
          {filtered.length === 0 && filteredCustom.length === 0 && (
            <div style={styles.emptySearch}>Aucune séance trouvée</div>
          )}
        </div>
        {/* Create custom session button */}
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${styles.dashGrid}` }}>
          <button style={styles.createCustomBtn} onClick={onCreateCustom}>
            ＋ Créer une séance / exercice personnalisé
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: SESSION UNIFIÉE (Séance + Ressenti) ───────────────────────────────

function SessionModal({ session, dayLabel, weekMeta, onClose, onEdit, onSave }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const [tab, setTab] = useState("session");
  const hasWarmup = !!session.warmup?.trim();
  const hasMain   = !!session.main?.trim();
  const hasCooldown = !!session.cooldown?.trim();
  const hasContent = hasWarmup || hasMain || hasCooldown;

  const defaultContent = hasWarmup ? "warmup" : hasMain ? "main" : hasCooldown ? "cooldown" : "main";
  const [contentTab, setContentTab] = useState(defaultContent);

  const [done,    setDone]    = useState(session.feedback?.done    ?? false);
  const [rpe,     setRpe]     = useState(session.feedback?.rpe     ?? 5);
  const [quality, setQuality] = useState(session.feedback?.quality ?? null);
  const [notes,   setNotes]   = useState(session.feedback?.notes   ?? "");

  const mesoLabel = weekMeta?.mesocycle || session.dateMeta?.mesocycle;
  const mesoColor = getMesoColor(mesocycles, mesoLabel);
  const hasFeedback = !!session.feedback;

  const contentTabs = [
    hasWarmup   && { key: "warmup",   label: "Échauffement" },
    { key: "main", label: "Cœur de séance" },
    hasCooldown && { key: "cooldown", label: "Retour au calme" },
  ].filter(Boolean);

  // Tab bar style helpers
  const mainTabStyle = (t) => ({
    flex: 1, padding: "10px 4px", background: "none", border: "none", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: "0.07em", textTransform: "uppercase",
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? (isDark ? "#4ade80" : "#2a7d4f") : (isDark ? "#707870" : "#8a7f70"),
    borderBottom: `2px solid ${tab === t ? (isDark ? "#4ade80" : "#2a7d4f") : "transparent"}`,
    transition: "color 0.15s, border-color 0.15s",
  });

  const contentTabStyle = (k) => ({
    flex: 1, padding: "7px 4px", background: "none", border: "none", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: "0.04em",
    fontWeight: contentTab === k ? 600 : 400,
    color: contentTab === k ? (isDark ? "#e8e4de" : "#2a2218") : (isDark ? "#707870" : "#8a7f70"),
    borderBottom: `2px solid ${contentTab === k ? (isDark ? "#e8e4de" : "#2a2218") : "transparent"}`,
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 500, display: "flex", flexDirection: "column", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? "#e8e4de" : "#2a2218", lineHeight: 1.3, paddingRight: 8 }}>
              {session.name}
            </span>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {onEdit && (
                <button style={{ ...styles.actionBtn, fontSize: 14, opacity: 0.75 }} onClick={onEdit} title="Modifier la séance">⚙</button>
              )}
              <button style={styles.closeBtn} onClick={onClose}>✕</button>
            </div>
          </div>
          {/* Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <span style={{ ...styles.sessionTypeBadge, background: session.type === "Séance" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
              {session.type || "Séance"}
            </span>
            <span style={{ ...styles.chargePill, background: getChargeColor(session.charge) + "33", color: getChargeColor(session.charge), border: `1px solid ${getChargeColor(session.charge)}55` }}>
              ⚡{session.charge}
            </span>
            {session.estimatedTime && <span style={styles.detailMetaChip}>⏱ {session.estimatedTime} min</span>}
            {session.location      && <span style={styles.detailMetaChip}>📍 {session.location}</span>}
            {session.minRecovery   && <span style={styles.detailMetaChip}>⏳ {session.minRecovery}h récup</span>}
            {mesoLabel && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{mesoLabel}</span>}
            {weekMeta?.microcycle && <span style={styles.detailMetaChip}>{weekMeta.microcycle}</span>}
          </div>
          {dayLabel && (
            <div style={{ fontSize: 10, color: isDark ? "#707870" : "#8a7f70", marginTop: 6, letterSpacing: "0.05em" }}>{dayLabel}</div>
          )}
        </div>

        {/* ── Main tab bar ── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0, background: isDark ? "#1f2421" : "#e8e2d8" }}>
          <button style={mainTabStyle("session")} onClick={() => setTab("session")}>Séance</button>
          <button style={mainTabStyle("ressenti")} onClick={() => setTab("ressenti")}>
            Ressenti{hasFeedback ? " ✓" : ""}
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "session" ? (
            hasContent ? (
              <>
                {/* Content sub-tabs */}
                <div style={{ display: "flex", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, padding: "0 8px", background: isDark ? "#191e1b" : "#f0ebe2" }}>
                  {contentTabs.map(ct => (
                    <button key={ct.key} style={contentTabStyle(ct.key)} onClick={() => setContentTab(ct.key)}>
                      {ct.label}
                    </button>
                  ))}
                </div>
                <div style={{ padding: "14px 18px" }}>
                  {contentTab === "warmup"   && <RichText text={session.warmup} />}
                  {contentTab === "main"     && <RichText text={session.main} />}
                  {contentTab === "cooldown" && <RichText text={session.cooldown} />}
                </div>
              </>
            ) : (
              <div style={{ padding: "28px 18px", color: isDark ? "#707870" : "#8a7f70", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
                Pas de contenu détaillé pour cette séance.
              </div>
            )
          ) : (
            /* ── Ressenti ── */
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Done */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ ...styles.doneBtn, ...(done ? styles.doneBtnActive : {}), flex: 1 }}
                  onClick={() => setDone(true)}
                >✓ Réalisée</button>
                <button
                  style={{ ...styles.doneBtn, ...(!done ? styles.doneBtnActiveNeg : {}), flex: 1 }}
                  onClick={() => setDone(false)}
                >✗ Non réalisée</button>
              </div>

              {done && (
                <>
                  {/* RPE */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                      <span>Fatigue RPE</span>
                      <span style={{ color: getChargeColor(rpe * 3), fontWeight: 700 }}>{rpe}/10</span>
                    </div>
                    <input type="range" min={1} max={10} step={1} value={rpe}
                      onChange={e => setRpe(+e.target.value)} style={styles.slider} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: isDark ? "#707870" : "#8a7f70", marginTop: 2 }}>
                      <span>Facile</span><span>Modéré</span><span>Maximal</span>
                    </div>
                  </div>

                  {/* Quality */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Qualité de séance</div>
                    <div style={styles.stars}>
                      {[1,2,3,4,5].map(s => (
                        <button key={s}
                          style={{ ...styles.star, color: quality >= s ? "#fbbf24" : (isDark ? "#555" : "#bbb") }}
                          onClick={() => setQuality(s === quality ? null : s)}
                        >★</button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Notes</div>
                    <textarea style={{ ...styles.textarea, minHeight: 80 }}
                      placeholder="Sensations, observations, ajustements…"
                      value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    />
                  </div>
                </>
              )}

              <button style={styles.saveBtn} onClick={() => onSave({ done, rpe: done ? rpe : null, quality: done ? quality : null, notes })}>
                Enregistrer le ressenti
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPOSANT JOUR ───────────────────────────────────────────────────────────

function DayColumn({ dayLabel, dateLabel, sessions, isToday, weekMeta, onAddSession, onOpenSession, onRemove, isMobile }) {
  const { styles, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

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
          <div
            key={i}
            style={{ ...styles.sessionCard, cursor: "pointer" }}
            onClick={() => onOpenSession(i)}
          >
            <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
            <div style={styles.sessionCardContent}>
              <span style={styles.sessionCardName}>{s.name}</span>
              {s.isCustom && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  <span style={styles.customBadge}>✎ perso</span>
                  {s.estimatedTime && <span style={{ ...styles.customBadge, background: "none", borderColor: "transparent", color: styles.dashText }}>⏱{s.estimatedTime}min</span>}
                  {meso && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{meso}</span>}
                </div>
              )}
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
              <button style={styles.actionBtn} title="Supprimer" onClick={e => { e.stopPropagation(); onRemove(i); }}>✕</button>
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

function MonthView({ data, currentDate, onSelectWeek, isMobile, mesocycles, onSessionClick }) {
  const { styles } = useThemeCtx();
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
                          cursor: "pointer",
                        }}
                        onClick={e => { e.stopPropagation(); onSessionClick && onSessionClick(date, si); }}
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
        </div>
        );
      })}
    </div>
  );
}

// ─── VUE ANNÉE ────────────────────────────────────────────────────────────────

function YearView({ data, currentDate, onSelectMonth, isMobile }) {
  const { styles } = useThemeCtx();
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
                          background: !inMonth ? "transparent" : charge === 0 ? styles.yearDayEmpty : getChargeColor(charge),
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

// ─── CYCLES VIEW ─────────────────────────────────────────────────────────────

function CyclesView({ mesocycles, onAddMeso, onUpdateMeso, onDeleteMeso, onAddMicro, onUpdateMicro, onDeleteMicro }) {
  const { styles } = useThemeCtx();

  return (
    <div style={styles.cyclesView}>
      <div style={styles.cyclesHeader}>
        <span style={styles.cyclesTitle}>Cycles d'entraînement</span>
        <button style={styles.cycleAddMesoBtn} onClick={onAddMeso}>＋ Nouveau mésocycle</button>
      </div>

      {mesocycles.length === 0 && (
        <div style={{ color: styles.dashText, fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
          Aucun mésocycle défini. Créez-en un pour commencer.
        </div>
      )}

      {mesocycles.map(meso => {
        const mesoStart = meso.startDate ? new Date(meso.startDate) : null;
        const mesoEnd = mesoStart ? addDays(mesoStart, meso.durationWeeks * 7) : null;

        // Compute microcycle start dates
        let microStarts = [];
        if (mesoStart) {
          let cursor = new Date(mesoStart);
          for (const micro of (meso.microcycles || [])) {
            microStarts.push(new Date(cursor));
            cursor = addDays(cursor, micro.durationWeeks * 7);
          }
        }

        return (
          <div key={meso.id} style={styles.cycleCard}>
            {/* Meso row */}
            <div style={styles.cycleMesoRow}>
              <input
                type="color"
                style={styles.cycleColorInput}
                value={meso.color}
                onChange={e => onUpdateMeso(meso.id, { color: e.target.value })}
                title="Couleur"
              />
              <input
                style={styles.cycleLabelInput}
                value={meso.label}
                onChange={e => onUpdateMeso(meso.id, { label: e.target.value })}
                placeholder="Nom du mésocycle…"
              />
              <input
                style={styles.cycleDateInput}
                type="date"
                value={meso.startDate || ""}
                onChange={e => onUpdateMeso(meso.id, { startDate: e.target.value })}
                title="Date de début"
              />
              {mesoEnd && (
                <span style={styles.cycleDateEnd}>→ {mesoEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}</span>
              )}
              <input
                style={styles.cycleDurInput}
                type="number"
                min="1"
                max="24"
                value={meso.durationWeeks}
                onChange={e => onUpdateMeso(meso.id, { durationWeeks: +e.target.value })}
                title="Durée (semaines)"
              />
              <span style={styles.cycleDurLabel}>sem.</span>
              <input
                style={styles.cycleDescInput}
                value={meso.description}
                onChange={e => onUpdateMeso(meso.id, { description: e.target.value })}
                placeholder="Description / objectif du bloc…"
              />
              <button style={styles.cycleDeleteBtn} onClick={() => onDeleteMeso(meso.id)} title="Supprimer">✕</button>
            </div>

            {/* Microcycles */}
            <div style={styles.cycleMicroList}>
              <div style={{ fontSize: 10, color: styles.dashText, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Microcycles ({meso.microcycles.length})
              </div>
              {meso.microcycles.map((micro, mi) => (
                <div key={micro.id} style={styles.cycleMicroRow}>
                  <div style={{ ...styles.cycleMicroDot, background: meso.color }} />
                  <input
                    style={styles.cycleMicroLabelInput}
                    value={micro.label}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { label: e.target.value })}
                    placeholder="Nom du microcycle…"
                  />
                  {microStarts[mi] && (
                    <span style={styles.cycleMicroDate}>
                      {microStarts[mi].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <input
                    style={styles.cycleMicroDurInput}
                    type="number"
                    min="1"
                    max="8"
                    value={micro.durationWeeks}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { durationWeeks: +e.target.value })}
                    title="Durée (semaines)"
                  />
                  <span style={styles.cycleDurLabel}>sem.</span>
                  <input
                    style={{ ...styles.cycleDescInput, flex: "1 1 120px" }}
                    value={micro.description || ""}
                    onChange={e => onUpdateMicro(meso.id, micro.id, { description: e.target.value })}
                    placeholder="Contenu…"
                  />
                  <button style={styles.cycleDeleteBtn} onClick={() => onDeleteMicro(meso.id, micro.id)} title="Supprimer">✕</button>
                </div>
              ))}
              <button style={styles.cycleAddMicroBtn} onClick={() => onAddMicro(meso.id)}>
                ＋ Microcycle
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function getLast8WeeksData(data) {
  const today = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const monday = getMondayOf(addDays(today, -(7 * (7 - i))));
    const key = weekKey(monday);
    const days = data.weeks[key] || [];
    const sessions = days.flat().filter(Boolean);
    const charge = sessions.reduce((s, se) => s + se.charge, 0);
    const done = sessions.filter(s => s.feedback?.done === true);
    const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
    const avgRpe = rpeVals.length
      ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10
      : null;
    const completion = sessions.length > 0 ? Math.round(done.length / sessions.length * 100) : null;
    const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
    return { label, charge, avgRpe, completion, planned: sessions.length, done: done.length };
  });
}

function Dashboard({ data }) {
  const { styles, isDark } = useThemeCtx();
  const chartData = getLast8WeeksData(data);

  const totalCharge4w = chartData.slice(4).reduce((s, w) => s + w.charge, 0);
  const rpeVals = chartData.filter(w => w.avgRpe != null).map(w => w.avgRpe);
  const globalAvgRpe = rpeVals.length
    ? (rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)
    : "—";
  const compVals = chartData.filter(w => w.completion != null).map(w => w.completion);
  const globalComp = compVals.length
    ? Math.round(compVals.reduce((a, b) => a + b, 0) / compVals.length)
    : null;

  const tooltipStyle = {
    background: styles.dashTooltipBg, border: "none", borderRadius: 6,
    color: styles.dashTooltipText, fontSize: 11,
  };

  return (
    <div style={styles.dashboard}>
      <div style={styles.dashTitle}>Statistiques</div>

      <div style={styles.dashCards}>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{totalCharge4w}</span>
          <span style={styles.dashCardLabel}>Charge 4 sem.</span>
        </div>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{globalAvgRpe}</span>
          <span style={styles.dashCardLabel}>RPE moyen</span>
        </div>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{globalComp != null ? `${globalComp}%` : "—"}</span>
          <span style={styles.dashCardLabel}>Complétion</span>
        </div>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Charge hebdomadaire (8 semaines)</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
            <Bar dataKey="charge" name="Charge" fill={isDark ? "#4ade80" : "#2a7d4f"} radius={[3, 3, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>RPE moyen par semaine</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 10]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="avgRpe" name="RPE" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Taux de complétion (%)</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
            <Bar dataKey="completion" name="Complétion %" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function ClimbingPlanner() {
  const [data, setData] = useState(loadData);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("week");
  const [picker, setPicker] = useState(null);
  const [metaEditing, setMetaEditing] = useState(false);
  const [tempMeta, setTempMeta] = useState({});
  const [customSessionForm, setCustomSessionForm] = useState(null); // null | { initial?: session, targetDay?: number }
  const [sessionModal, setSessionModal] = useState(null); // null | { weekKey, dayIndex, sessionIndex }
  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") !== "light");

  const styles = makeStyles(isDark);
  const toggleTheme = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  const { session, setSession, syncStatus, loadFromCloud, saveToCloud, uploadNow } = useSupabaseSync();

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  const monday = getMondayOf(currentDate);
  const wKey = weekKey(monday);
  const weekSessions = data.weeks[wKey] || Array(7).fill(null).map(() => []);
  const weekMeta = data.weekMeta[wKey] || { mesocycle: "", microcycle: "", note: "" };

  // Phase 1 : localStorage (sync, immédiat)
  // Phase 2 : cloud au premier login
  useEffect(() => {
    if (!session || cloudLoaded) return;
    loadFromCloud().then(cloudData => {
      setCloudLoaded(true);
      if (cloudData) {
        // Cloud has data → merge: prefer cloud but keep local weeks not in cloud
        setData(cloudData);
        saveData(cloudData);
      } else {
        // Cloud empty (data created before login) → push local data up immediately
        uploadNow(data, session.user.id);
      }
    });
  }, [session, cloudLoaded, loadFromCloud, uploadNow]);

  // Réinitialiser cloudLoaded si l'utilisateur change de session
  useEffect(() => {
    if (!session) setCloudLoaded(false);
  }, [session]);

  const pullFromCloud = async () => {
    const cloudData = await loadFromCloud();
    if (cloudData) { setData(cloudData); saveData(cloudData); }
  };

  useEffect(() => {
    saveData(data);
    saveToCloud(data, session?.user?.id);
  }, [data]);

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
    setSessionModal(null);
  };

  const openSessionModal = (wKey, dayIndex, sessionIndex) => {
    setSessionModal({ weekKey: wKey, dayIndex, sessionIndex });
  };

  const saveMeta = () => {
    setData(d => ({ ...d, weekMeta: { ...d.weekMeta, [wKey]: tempMeta } }));
    setMetaEditing(false);
  };

  // ── Mesocycle CRUD ──
  const updateMesocycles = updater => setData(d => ({ ...d, mesocycles: updater(d.mesocycles || []) }));
  const addMesocycle = () => updateMesocycles(m => [...m, { id: generateId(), label: "Nouveau mésocycle", color: "#4ade80", durationWeeks: 4, startDate: "", description: "", microcycles: [] }]);
  const updateMesocycle = (id, changes) => updateMesocycles(m => m.map(x => x.id === id ? { ...x, ...changes } : x));
  const deleteMesocycle = id => updateMesocycles(m => m.filter(x => x.id !== id));
  const addMicrocycle = mesoId => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: [...x.microcycles, { id: generateId(), label: "Nouveau microcycle", durationWeeks: 1, description: "" }] } : x));
  const updateMicrocycle = (mesoId, microId, changes) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.map(mc => mc.id === microId ? { ...mc, ...changes } : mc) } : x));
  const deleteMicrocycle = (mesoId, microId) => updateMesocycles(m => m.map(x => x.id === mesoId ? { ...x, microcycles: x.microcycles.filter(mc => mc.id !== microId) } : x));

  // ── Custom session handlers ──
  const saveCustomSession = (customSession, targetDayIndex) => {
    // If the form has a custom onSave (e.g. editing a predefined instance), use it
    if (customSessionForm?.onSave) {
      customSessionForm.onSave(customSession);
      return;
    }
    setData(d => {
      const existing = d.customSessions || [];
      const idx = existing.findIndex(s => s.id === customSession.id);
      const updated = idx >= 0
        ? existing.map(s => s.id === customSession.id ? customSession : s)
        : [...existing, customSession];
      let weeks = d.weeks;
      // If targetDayIndex is set, also place in the planner day
      if (targetDayIndex !== undefined && targetDayIndex !== null) {
        const monday = getMondayOf(currentDate);
        const key = weekKey(monday);
        const daySessions = (d.weeks[key] || Array(7).fill(null).map(() => []))[targetDayIndex];
        const newDay = [...daySessions, { ...customSession, feedback: null }];
        const ws = d.weeks[key] ? [...d.weeks[key]] : Array(7).fill(null).map(() => []);
        ws[targetDayIndex] = newDay;
        weeks = { ...d.weeks, [key]: ws };
      }
      // If there's a date on the session, auto-place it there too
      if (customSession.date && targetDayIndex === undefined) {
        const d2 = new Date(customSession.date);
        if (!isNaN(d2.getTime())) {
          const mon = getMondayOf(d2);
          const key2 = weekKey(mon);
          const dayOfWeek = d2.getDay();
          const di = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const ws2 = weeks[key2] ? [...weeks[key2]] : Array(7).fill(null).map(() => []);
          // Only auto-place if not already there
          const alreadyPlaced = ws2[di]?.some(s => s.id === customSession.id);
          if (!alreadyPlaced) {
            ws2[di] = [...(ws2[di] || []), { ...customSession, feedback: null }];
            weeks = { ...weeks, [key2]: ws2 };
          }
        }
      }
      return { ...d, customSessions: updated, weeks };
    });
    setCustomSessionForm(null);
  };

  const viewToggle = (
    <div style={styles.viewToggle}>
      {[
        { mode: "week", label: "Sem" },
        { mode: "month", label: "Mois" },
        { mode: "year", label: "An" },
        { mode: "dash", label: "Stats" },
        { mode: "cycles", label: "Cycles" },
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

  const themeBtn = (
    <button style={styles.themeBtn} onClick={toggleTheme} title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}>
      {isDark ? "○" : "●"}
    </button>
  );

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: data.mesocycles || [] }}>
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
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {themeBtn}
              <SyncButtons data={data} onImport={setData} compact syncStatus={syncStatus} session={session} onUpload={() => uploadNow(data, session?.user?.id)} onPull={pullFromCloud} />
            </div>
          </div>
          {supabase && (
            <div style={styles.headerMobileRow3}>
              <AuthPanel session={session} onAuthChange={setSession} />
            </div>
          )}
          {viewMode !== "dash" && viewMode !== "cycles" && (
            <div style={styles.weekNavMobile}>
              <button style={styles.navBtn} onClick={handlePrev}>←</button>
              <div style={styles.weekLabel}>
                <div style={styles.weekRange}>{periodLabel}</div>
                {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
              </div>
              <button style={styles.navBtn} onClick={handleNext}>→</button>
            </div>
          )}
        </div>
      ) : (
        /* ── HEADER DESKTOP ── */
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.logo}>⛰</span>
            <div>
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
              <div style={styles.appSub}>
                {viewMode === "week" ? "Vue semaine" : viewMode === "month" ? "Vue mois" : viewMode === "year" ? "Vue année" : viewMode === "dash" ? "Statistiques" : "Cycles"} · Bloc
              </div>
            </div>
          </div>
          {viewMode !== "dash" && viewMode !== "cycles" && (
            <div style={styles.weekNav}>
              <button style={styles.navBtn} onClick={handlePrev}>←</button>
              <div style={styles.weekLabel}>
                <div style={styles.weekRange}>{periodLabel}</div>
                {isCurrentPeriod && <div style={styles.weekCurrent}>{periodCurrentLabel}</div>}
              </div>
              <button style={styles.navBtn} onClick={handleNext}>→</button>
            </div>
          )}
          <div style={styles.headerRight}>
            <div style={styles.headerRightTop}>
              {viewToggle}
              {themeBtn}
              <SyncButtons data={data} onImport={setData} compact syncStatus={syncStatus} session={session} onUpload={() => uploadNow(data, session?.user?.id)} onPull={pullFromCloud} />
            </div>
            <AuthPanel session={session} onAuthChange={setSession} />
            <div style={styles.totalCharge}>
              <span style={styles.totalChargeNum}>{totalPeriodCharge}</span>
              <span style={styles.totalChargeLabel}>
                charge {viewMode === "week" ? "semaine" : viewMode === "month" ? "mois" : viewMode === "year" ? "année" : ""}
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
              <select style={styles.metaSelect} value={tempMeta.mesocycle || ""} onChange={e => setTempMeta(m => ({ ...m, mesocycle: e.target.value, microcycle: "" }))}>
                <option value="">— Mésocycle —</option>
                {(data.mesocycles || []).map(m => <option key={m.id} value={m.label}>{m.label}</option>)}
              </select>
              {(() => {
                const selectedMeso = (data.mesocycles || []).find(m => m.label === tempMeta.mesocycle);
                if (selectedMeso?.microcycles?.length > 0) {
                  return (
                    <select style={styles.metaSelect} value={tempMeta.microcycle || ""} onChange={e => setTempMeta(m => ({ ...m, microcycle: e.target.value }))}>
                      <option value="">— Microcycle —</option>
                      {selectedMeso.microcycles.map(mc => <option key={mc.id} value={mc.label}>{mc.label}</option>)}
                    </select>
                  );
                }
                return <input style={styles.metaInput} placeholder="Microcycle (ex: Développement)" value={tempMeta.microcycle || ""} onChange={e => setTempMeta(m => ({ ...m, microcycle: e.target.value }))} />;
              })()}
              <input style={styles.metaInput} placeholder="Note / thème de la semaine" value={tempMeta.note || ""} onChange={e => setTempMeta(m => ({ ...m, note: e.target.value }))} />
              <button style={styles.saveBtn} onClick={saveMeta}>OK</button>
              <button style={styles.cancelBtn} onClick={() => setMetaEditing(false)}>✕</button>
            </div>
          ) : (
            <div style={styles.metaDisplay} onClick={() => { setTempMeta(weekMeta); setMetaEditing(true); }}>
              {weekMeta.mesocycle ? (
                <>
                  <span style={{ ...styles.mesoTag, background: getMesoColor(data.mesocycles, weekMeta.mesocycle) + "22", color: getMesoColor(data.mesocycles, weekMeta.mesocycle), borderColor: getMesoColor(data.mesocycles, weekMeta.mesocycle) + "55" }}>
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
          {(() => {
            const detected = getMesoForDate(data.mesocycles, monday);
            if (!detected) return null;
            const { meso, micro } = detected;
            return (
              <div style={{ background: meso.color + "14", borderBottom: `1px solid ${meso.color}28`, borderLeft: `3px solid ${meso.color}`, padding: "5px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: meso.color, letterSpacing: "0.09em", textTransform: "uppercase" }}>{meso.label}</span>
                {micro && (
                  <>
                    <span style={{ fontSize: 10, color: meso.color + "55" }}>›</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: meso.color + "cc", letterSpacing: "0.06em", background: meso.color + "22", padding: "1px 7px", borderRadius: 10, border: `1px solid ${meso.color}44` }}>{micro.label}</span>
                  </>
                )}
              </div>
            );
          })()}
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
                  weekMeta={weekMeta}
                  onAddSession={() => setPicker({ dayIndex: i })}
                  onOpenSession={(si) => openSessionModal(wKey, i, si)}
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
          onSelectWeek={(wm) => {
            setCurrentDate(wm);
            setViewMode("week");
          }}
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
          onSelectMonth={(month) => {
            setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
            setViewMode("month");
          }}
        />
      )}

      {/* ── Dashboard ── */}
      {viewMode === "dash" && <Dashboard data={data} />}

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
        />
      )}

      {/* ── Modals ── */}
      {picker && (
        <SessionPicker
          onSelect={s => { addSession(picker.dayIndex, s); setPicker(null); }}
          onClose={() => setPicker(null)}
          customSessions={data.customSessions || []}
          onCreateCustom={() => { setCustomSessionForm({ targetDay: picker.dayIndex }); setPicker(null); }}
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
            dayLabel={smDayLabel}
            weekMeta={smWeekMeta}
            onClose={() => setSessionModal(null)}
            onEdit={() => {
              if (smSession.isCustom) {
                // Edit the custom session template + all placements
                setCustomSessionForm({ initial: smSession, targetDay: null });
              } else {
                // Edit only this specific instance (predefined session override)
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


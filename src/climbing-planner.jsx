import { useState, useEffect, useRef, useCallback, useContext, createContext, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

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

const CUSTOM_CYCLE_COLORS = [
  "#4ade80", "#22d3ee", "#f59e0b", "#f87171",
  "#a78bfa", "#fb923c", "#34d399", "#60a5fa",
  "#e879f9", "#facc15", "#94a3b8", "#ff6b9d",
];

function isDateInCustomCycle(cycle, date) {
  if (!cycle.startDate) return false;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(cycle.startDate + "T00:00:00");
  const startNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (!cycle.isRepetitive) {
    if (!cycle.endDate) return false;
    const end = new Date(cycle.endDate + "T00:00:00");
    const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= startNorm && d <= endNorm;
  }
  if (d < startNorm) return false;
  const msPerDay = 24 * 3600 * 1000;
  const elapsed = Math.round((d - startNorm) / msPerDay);
  const onDays = (cycle.onWeeks || 4) * 7;
  const offDays = (cycle.offWeeks || 2) * 7;
  return (elapsed % (onDays + offDays)) < onDays;
}

function getCustomCyclesForDate(customCycles, date) {
  return (customCycles || []).filter(cc => isDateInCustomCycle(cc, date));
}

function getDayLogWarning(data, dateISO, dateObj) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateISO > today) return { hasWarning: false, hooperMissing: false, creatineMissing: false, isFuture: true };
  const hooperMissing = !(data.hooper || []).some(h => h.date === dateISO);
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));
  const creatineMissing = isInCreatineCycle && !data.creatine?.[dateISO];
  return { hasWarning: hooperMissing || creatineMissing, hooperMissing, creatineMissing };
}

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

function getChargeColor(charge, isDark = true) {
  if (isDark) {
    if (charge === 0) return "#4ade80";
    if (charge <= 12) return "#86efac";
    if (charge <= 20) return "#fbbf24";
    if (charge <= 30) return "#f97316";
    return "#f43f5e";
  }
  // Light theme: more saturated for contrast on light backgrounds
  if (charge === 0) return "#16a34a";
  if (charge <= 12) return "#15803d";
  if (charge <= 20) return "#b45309";
  if (charge <= 30) return "#c2410c";
  return "#b91c1c";
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
    const result = { weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES, sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, profile: {}, customCycles: [], cyclesLocked: false, ...parsed };
    // Migrate photo from legacy separate key → profile.avatarDataUrl
    if (!result.profile?.avatarDataUrl) {
      const legacy = localStorage.getItem("climbing_planner_photo");
      if (legacy) {
        result.profile = { ...(result.profile || {}), avatarDataUrl: legacy };
        localStorage.removeItem("climbing_planner_photo");
      }
    }
    return result;
  } catch {
    return { weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES, sleep: [], hooper: [], notes: {}, creatine: {}, profile: {}, customCycles: [], cyclesLocked: false };
  }
}

// ─── GARMIN SLEEP CSV PARSER ──────────────────────────────────────────────────

function parseGarminSleepCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect key-value format (Garmin single/multi-day "Score de sommeil X jour" export)
  // vs tabular format (header row + data rows)
  const isKV = lines.some(l => {
    const ci = l.indexOf(",");
    if (ci < 0) return false;
    return l.slice(0, ci).trim().toLowerCase() === "date" &&
           /^\d{4}-\d{2}-\d{2}$/.test(l.slice(ci + 1).trim());
  });

  if (isKV) {
    // Parse "Xh Ym" / "Xm" duration strings to minutes
    const parseHM = str => {
      if (!str) return 0;
      const hm = str.match(/(\d+)h\s*(\d+)m/);
      if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
      const h = str.match(/^(\d+)h$/);
      if (h) return parseInt(h[1]) * 60;
      const m = str.match(/^(\d+)m$/);
      if (m) return parseInt(m[1]);
      return 0;
    };
    // Build key→first-value map (skip empty values = section headers)
    const kv = {};
    for (const line of lines) {
      const ci = line.indexOf(",");
      if (ci < 0) continue;
      const key = line.slice(0, ci).trim().toLowerCase();
      const val = line.slice(ci + 1).trim();
      if (!val || val === "--") continue;
      if (!kv[key]) kv[key] = val;
    }
    const date = kv["date"] || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const total = parseHM(kv["durée du sommeil"]);
    if (!total) return [];
    return [{
      date, total,
      deep:  parseHM(kv["durée du sommeil profond"]),
      light: parseHM(kv["durée du sommeil léger"]),
      rem:   parseHM(kv["durée du sommeil paradoxal"]),
      awake: parseHM(kv["temps d'éveil"]),
      score: kv["score de sommeil"] ? (parseInt(kv["score de sommeil"]) || null) : null,
    }];
  }

  // Tabular format (header row + data rows, durations in seconds)
  const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
  const col = (...patterns) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const dateIdx  = col("date");
  const totalIdx = col("sleep time", "durée de sommeil");
  const deepIdx  = col("deep sleep", "sommeil profond");
  const lightIdx = col("light sleep", "sommeil léger");
  const remIdx   = col("rem sleep", "sommeil paradoxal");
  const awakeIdx = col("awake time", "durée d'éveil", "veil");
  const scoreIdx = col("sleep score", "score de sommeil");

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map(v => v.replace(/"/g, "").trim());
    if (!row[dateIdx]) continue;
    const toMin = idx => {
      if (idx < 0 || !row[idx]) return 0;
      const v = parseFloat(row[idx]);
      return isNaN(v) ? 0 : Math.round(v / 60);
    };
    const raw = row[dateIdx];
    let date = "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw))        date = raw.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) { const [d, m, y] = raw.split("/"); date = `${y}-${m}-${d}`; }
    else continue;
    const total = toMin(totalIdx);
    if (total === 0) continue;
    results.push({
      date, total,
      deep:  toMin(deepIdx),
      light: toMin(lightIdx),
      rem:   toMin(remIdx),
      awake: toMin(awakeIdx),
      score: scoreIdx >= 0 && row[scoreIdx] ? parseInt(row[scoreIdx]) || null : null,
    });
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
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
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
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
    profileBtn: {
      background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim,
      width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
      fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s", overflow: "hidden", padding: 0,
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
      borderRadius: 5, padding: "7px 8px", minHeight: 100,
      cursor: "pointer", display: "flex", flexDirection: "column",
      transition: "border-color 0.15s", position: "relative", overflow: "hidden",
    },
    monthDayCellMobile: { minHeight: 64, padding: "5px 4px" },
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
    yearHeatmapCell: { height: 14, borderRadius: 2 },
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
    // ── Sleep ──
    sleepImportBtn: { fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.border2}`, background: t.accentFaint, color: t.accent, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em", whiteSpace: "nowrap" },
    sleepEmptyMsg: { textAlign: "center", padding: "28px 0", color: t.textMuted, fontSize: 12 },
    sleepCard: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4, flex: "1 1 80px" },
    sleepLegend: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 },
    sleepLegendDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 4 },

    // ── Profile view ──
    profileView: { padding: "20px 24px", overflowY: "auto", flex: 1, maxWidth: 600, margin: "0 auto", width: "100%" },
    profileAvatar: { width: 96, height: 96, borderRadius: "50%", background: t.surface, border: `2px solid ${t.border2}`, overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color 0.15s" },
    profileAvatarHint: { fontSize: 10, color: t.accent, marginTop: 6, cursor: "pointer", letterSpacing: "0.05em" },
    profileNameInput: { background: t.inputBg, border: `1px solid ${t.btnBorder}`, borderRadius: 5, padding: "8px 12px", color: t.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" },
    profileSection: { marginBottom: 28 },
    profileSectionTitle: { fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${t.border}` },
    profileRow: { display: "flex", gap: 12, marginBottom: 10, alignItems: "center" },
    profileSaveBtn: { background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.accent, padding: "7px 18px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.06em" },
    profileCancelBtn: { background: "none", border: `1px solid ${t.btnBorder}`, color: t.textDim, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" },
    cropOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(6px)" },
    cropModal: { background: t.surface, border: `1px solid ${t.border2}`, borderRadius: 12, padding: "20px", width: "min(360px, 94vw)", boxShadow: "0 32px 96px rgba(0,0,0,0.5)" },

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
    confirmOverlay: { position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(4px)" },
    confirmModal: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "20px 24px", width: "min(300px, 90vw)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: 14 },
    confirmTitle: { fontSize: 14, fontWeight: 600, color: t.text, textAlign: "center" },
    confirmSub: { fontSize: 12, color: t.textDim, textAlign: "center", marginTop: -6 },
    confirmBtnRow: { display: "flex", gap: 8, justifyContent: "center" },
    confirmDeleteBtn: { background: "#b83030", border: "none", borderRadius: 6, color: "#fff", padding: "8px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    confirmCancelBtn: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, padding: "8px 22px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    cycleAddMicroBtn: { fontSize: 11, color: t.accent, background: t.accentFaint, border: `1px dashed ${t.accentBorder}`, borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", marginTop: 4 },
    cycleAddMesoBtn: { fontSize: 11, color: t.accent, background: t.accentFaint, border: `1px dashed ${t.accentBorder}`, borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" },
    cycleDurLabel: { fontSize: 10, color: t.textMuted },
    // ── Custom cycles section ──
    customCyclesSection: { marginTop: 32, borderTop: `1px solid ${t.border}`, paddingTop: 20 },
    customCyclesSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    customCyclesSectionTitle: { fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "0.04em" },
    customCycleRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: t.inputBg, borderRadius: 6, marginBottom: 6, border: `1px solid ${t.border}` },
    customCycleColorSwatch: { width: 12, height: 36, borderRadius: 3, flexShrink: 0 },
    customCycleInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    customCycleName: { fontSize: 13, fontWeight: 500, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    customCycleDate: { fontSize: 10, color: t.textDim },
    customCycleBars: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 1, paddingBottom: 5, paddingTop: 2 },
    customCycleBar: { height: 3, borderRadius: 1.5, opacity: 0.85 },
    customCycleDots: { display: "flex", gap: 2, paddingTop: 2, flexWrap: "wrap" },
    customCycleDot: { width: 5, height: 5, borderRadius: "50%", opacity: 0.9 },
    // ── Timeline ──
    timelineWrap: { padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" },
    timelineTopBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
    timelineTitle: { fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "0.06em", textTransform: "uppercase" },
    timelineEditBtn: { display: "flex", alignItems: "center", gap: 6, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textDim, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    timelineSaveBtn: { display: "flex", alignItems: "center", gap: 8, background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: 7, color: t.accent, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em", marginTop: 32, alignSelf: "center" },
    timelineRow: { display: "flex", alignItems: "stretch", marginBottom: 10, gap: 0 },
    timelineLabelCol: { width: 148, flexShrink: 0, paddingRight: 14, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 },
    timelineLabelName: { fontSize: 12, fontWeight: 600, color: t.text, display: "flex", alignItems: "center", gap: 7 },
    timelineLabelDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
    timelineLabelMeta: { fontSize: 10, color: t.textDim, paddingLeft: 16 },
    timelineBarArea: { flex: 1, display: "flex", alignItems: "center", minWidth: 0 },
    timelineBar: { height: 38, borderRadius: 6, display: "flex", overflow: "hidden", position: "relative", minWidth: 24, border: "1px solid" },
    timelineMicroSeg: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", cursor: "pointer", overflow: "hidden", flexShrink: 0, borderRight: "1px solid" },
    timelineMicroLabel: { fontSize: 9, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" },
    timelineMicroSub: { fontSize: 8, opacity: 0.65, textAlign: "center", lineHeight: 1 },
    timelineCustomRow: { display: "flex", alignItems: "center", marginBottom: 7, gap: 0 },
    timelineCustomBar: { height: 20, borderRadius: 4, display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden", border: "1px solid" },
    timelineSectionSep: { borderTop: `1px solid ${t.border}`, paddingTop: 16, marginTop: 20, marginBottom: 14, fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" },
    timelinePopoverWrap: { position: "fixed", inset: 0, zIndex: 300 },
    timelinePopover: { position: "fixed", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 16px", minWidth: 160, maxWidth: 240, boxShadow: "0 8px 28px rgba(0,0,0,0.35)", zIndex: 301 },
    timelinePopoverTitle: { fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 4 },
    timelinePopoverMeta: { fontSize: 11, color: t.textDim },
    cycleDateInput: { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "4px 8px", color: t.text, fontSize: 11, fontFamily: "inherit", colorScheme: D ? "dark" : "light" },
    cycleDateEnd: { fontSize: 10, color: t.textMuted, whiteSpace: "nowrap", flexShrink: 0 },
    cycleMicroDate: { fontSize: 10, color: t.textDim, whiteSpace: "nowrap", flexShrink: 0, minWidth: 52 },
    // ── Custom session form ──
    customFormOverlay: { position: "fixed", inset: 0, background: t.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250, backdropFilter: "blur(4px)" },
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
    : syncStatus === "offline" ? "—"
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
          ↑
        </button>
      )}
      {session && onPull && (
        <button style={{ ...btnStyle, color: "#60a5fa" }} onClick={onPull} title="Charger les données depuis le cloud (écraser local)">
          ↓
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

  // Build the flat columns synced alongside the JSONB blob.
  // status is NOT included — it is admin-only (set once at onboarding or via DB).
  const buildRow = useCallback((planData, userId) => ({
    user_id:    userId,
    data:       planData,
    first_name: planData?.profile?.firstName ?? null,
    last_name:  planData?.profile?.lastName  ?? null,
  }), []);

  const loadFromCloud = useCallback(async () => {
    if (!supabase) return null;
    // Try to read extra columns; fall back gracefully if they don't exist yet.
    let row = null;
    const { data: full, error: fullErr } = await supabase
      .from("climbing_plans")
      .select("data, first_name, last_name, status")
      .maybeSingle();
    if (!fullErr) {
      row = full;
    } else {
      // Columns likely not yet added — fall back to JSONB only
      const { data: slim } = await supabase
        .from("climbing_plans")
        .select("data")
        .maybeSingle();
      row = slim;
    }
    if (!row) return null;
    const blob = row.data ?? {};
    const profile = {
      ...(blob.profile ?? {}),
      ...(row.first_name != null ? { firstName: row.first_name } : {}),
      ...(row.last_name  != null ? { lastName:  row.last_name  } : {}),
      // status column is authoritative for role (overrides blob value)
      ...("status" in (row ?? {}) ? { role: row.status } : {}),
    };
    return { ...blob, profile };
  }, []);

  // Write status to its own column — called only from onboarding.
  const writeStatus = useCallback(async (userId, role) => {
    if (!supabase || !userId) return;
    await supabase
      .from("climbing_plans")
      .upsert({ user_id: userId, status: role }, { onConflict: "user_id" });
  }, []);

  const saveToCloud = useCallback((planData, userId) => {
    if (!supabase || !userId) return;
    clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("climbing_plans")
          .upsert(buildRow(planData, userId), { onConflict: "user_id" });
        setSyncStatus(error ? "offline" : "saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("offline");
      }
    }, 1500);
  }, [buildRow]);

  // Immediate upload (no debounce) — used for force-sync & first-login push
  const uploadNow = useCallback(async (planData, userId) => {
    if (!supabase || !userId) return;
    setSyncStatus("saving");
    try {
      const { error } = await supabase
        .from("climbing_plans")
        .upsert(buildRow(planData, userId), { onConflict: "user_id" });
      setSyncStatus(error ? "offline" : "saved");
      setTimeout(() => setSyncStatus("idle"), 2500);
    } catch {
      setSyncStatus("offline");
    }
  }, [buildRow]);

  return { session, setSession, syncStatus, loadFromCloud, saveToCloud, uploadNow, writeStatus };
}

// ─── COMMUNITY SESSIONS HOOK ──────────────────────────────────────────────────

function useCommunitySessionsSync(session) {
  const [communitySessions, setCommunitySessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCommunity = useCallback(async () => {
    if (!supabase || !session) { setCommunitySessions([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("community_sessions")
      .select("session, user_id")
      .order("updated_at", { ascending: false });
    if (data) setCommunitySessions(data.map(r => ({ ...r.session, _communityUserId: r.user_id })));
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  const pushToCommunity = useCallback(async (customSession, userId) => {
    if (!supabase || !userId) return;
    await supabase.from("community_sessions").upsert({
      user_id: userId,
      session_id: String(customSession.id),
      session: customSession,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,session_id" });
    await fetchCommunity();
  }, [fetchCommunity]);

  const deleteFromCommunity = useCallback(async (sessionId, userId) => {
    if (!supabase || !userId) return;
    await supabase.from("community_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", String(sessionId));
    await fetchCommunity();
  }, [fetchCommunity]);

  return { communitySessions, loading, pushToCommunity, deleteFromCommunity, fetchCommunity };
}

// ─── SESSIONS CATALOG HOOK ────────────────────────────────────────────────────

function useSessionsCatalog(userId) {
  const [catalog, setCatalog] = useState([]);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchCatalog = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("sessions_catalog")
      .select("id, type, name, charge, min_recovery, estimated_time, description, extra, user_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error || !data) return;
    setCatalog(data.map(r => ({
      id: r.id,
      type: r.type,
      name: r.name,
      charge: r.charge,
      minRecovery: r.min_recovery ?? undefined,
      estimatedTime: r.estimated_time ?? undefined,
      description: r.description ?? undefined,
      isCustom: r.user_id != null,
      ...(r.extra || {}),
    })));
  }, []);

  // Re-fetch when userId changes (e.g. Supabase auth session restored asynchronously)
  useEffect(() => { fetchCatalog(); }, [fetchCatalog, userId]);

  const saveUserSession = useCallback(async (session) => {
    const uid = userIdRef.current;
    if (!supabase || !uid) return null;
    const extra = {};
    if (session.warmup)   extra.warmup   = session.warmup;
    if (session.main)     extra.main     = session.main;
    if (session.cooldown) extra.cooldown = session.cooldown;
    if (session.location) extra.location = session.location;
    if (session.blocks?.length) extra.blocks = session.blocks;  // composition de blocs
    const row = {
      user_id: uid,
      type: session.type,
      name: session.name,
      charge: session.charge,
      min_recovery: session.minRecovery ?? null,
      estimated_time: session.estimatedTime ?? null,
      extra: Object.keys(extra).length ? extra : null,
      is_active: true,
      sort_order: 999,
    };
    if (session.isCustom && typeof session.id === "number") {
      await supabase.from("sessions_catalog").update(row).eq("id", session.id);
    } else {
      await supabase.from("sessions_catalog").insert(row);
    }
    fetchCatalog();
  }, [fetchCatalog]);

  const deleteUserSession = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from("sessions_catalog").delete().eq("id", id);
    fetchCatalog();
  }, [fetchCatalog]);

  return { catalog, saveUserSession, deleteUserSession };
}

// ─── HOOK : blocs de séance (table session_blocks) ────────────────────────────
function useSessionBlocks(userId) {
  const [blocks, setBlocks] = useState([]);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchBlocks = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("session_blocks")
      .select("id, block_type, name, duration, charge, description")
      .eq("is_active", true)
      .order("block_type", { ascending: true })
      .order("name",       { ascending: true });
    if (error || !data) return;
    setBlocks(data.map(r => ({
      id: r.id,
      blockType: r.block_type,
      name: r.name,
      duration: r.duration ?? undefined,
      charge: r.charge ?? 0,
      description: r.description ?? "",
    })));
  }, []);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks, userId]);

  const saveBlock = useCallback(async (block) => {
    const uid = userIdRef.current;
    if (!supabase || !uid) return;
    const row = {
      block_type: block.blockType,
      name: block.name,
      duration: block.duration ?? null,
      charge: block.charge ?? 0,
      description: block.description || null,
      is_active: true,
    };
    if (block.id && typeof block.id === "number") {
      await supabase.from("session_blocks").update(row).eq("id", block.id);
    } else {
      await supabase.from("session_blocks").insert({ ...row, created_by: uid });
    }
    fetchBlocks();
  }, [fetchBlocks]);

  const deleteBlock = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from("session_blocks").delete().eq("id", id);
    fetchBlocks();
  }, [fetchBlocks]);

  return { blocks, saveBlock, deleteBlock };
}

// ─── AUTH PANEL ───────────────────────────────────────────────────────────────

function AuthPanel({ session, onAuthChange, fullWidth }) {
  const { styles, isDark } = useThemeCtx();
  const wideInput = fullWidth ? { ...styles.authInput, width: "100%", maxWidth: 280, boxSizing: "border-box" } : styles.authInput;
  const barStyle = fullWidth ? { ...styles.authBar, flexDirection: "column", alignItems: "flex-start", gap: 10 } : styles.authBar;
  /* eslint-disable no-unused-vars */
  void isDark; // theme available if needed
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
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <input
          style={{ ...wideInput, width: fullWidth ? undefined : 150 }}
          type="password"
          placeholder="Nouveau mot de passe (6+ car.)"
          value={password}
          autoFocus
          onChange={e => { setPassword(e.target.value); setAuthError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSetPassword()}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.authBtn} onClick={handleSetPassword} disabled={sending || password.length < 6}>
            {sending ? "…" : "Enregistrer"}
          </button>
          <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>✕</button>
        </div>
        {authError && <span style={styles.authErrorMsg}>{authError}</span>}
      </div>
    );

    if (mode === "pwdone") return (
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <span style={styles.authSentMsg}>✓ Mot de passe défini</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.authLogoutBtn} onClick={() => go("password")}>✕</button>
          <button style={styles.authLogoutBtn} onClick={handleLogout}>Déco</button>
        </div>
      </div>
    );

    return (
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...styles.authBtn, fontSize: 10, padding: "3px 8px", opacity: 0.75 }}
            onClick={() => go("setpw")}
            title="Définir un mot de passe pour se connecter sans magic link"
          >Définir MDP</button>
          <button style={styles.authLogoutBtn} onClick={handleLogout}>Déconnexion</button>
        </div>
      </div>
    );
  }

  /* ── Magic link ── */
  if (mode === "magiclink") return (
    <div style={barStyle}>
      {sent ? (
        <span style={styles.authSentMsg}>Lien envoyé — vérifiez vos mails</span>
      ) : (
        <>
          <input
            style={wideInput}
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
      <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>← Connexion MDP</button>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );

  /* ── Mot de passe (défaut) ── */
  return (
    <div style={barStyle}>
      <input
        style={wideInput}
        type="email"
        placeholder="votre@email.com"
        value={email}
        onChange={e => { setEmail(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <input
        style={{ ...wideInput, width: fullWidth ? undefined : 130 }}
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={e => { setPassword(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={styles.authBtn} onClick={handlePasswordLogin} disabled={sending || !password.trim()}>
          {sending ? "…" : "Connexion"}
        </button>
        <button style={{ ...styles.authLogoutBtn, opacity: 0.6 }} onClick={() => go("magiclink")} title="Connexion par lien email">
          Lien →
        </button>
      </div>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );
}

// ─── ROLE ONBOARDING MODAL ────────────────────────────────────────────────────

function RoleOnboardingModal({ onSelect }) {
  const { isDark } = useThemeCtx();
  const bg       = isDark ? "#181f1b" : "#f6f9f7";
  const surface  = isDark ? "#1e2820" : "#ffffff";
  const border   = isDark ? "#2a3a2e" : "#d4e8db";
  const text     = isDark ? "#e2ead5" : "#1a2e1f";
  const muted    = isDark ? "#7a9880" : "#6b8c72";
  const accent   = "#4caf72";
  const [selected, setSelected] = useState(null);

  const roles = [
    {
      value: null,
      label: "Athlète solo",
      icon: "🧗",
      desc: "Vous gérez votre planning vous-même.",
    },
    {
      value: "coach",
      label: "Coach",
      icon: "📋",
      desc: "Vous créez et modifiez les cycles de vos athlètes.",
    },
    {
      value: "athlete",
      label: "Athlète suivi",
      icon: "🤝",
      desc: "Votre coach gère vos cycles. Vos cycles sont en lecture seule.",
    },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderRadius: 14, padding: "32px 28px", maxWidth: 420, width: "100%",
        boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: muted, textTransform: "uppercase", marginBottom: 8 }}>
          Bienvenue
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: text, marginBottom: 6 }}>
          Quel est votre rôle ?
        </div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 24, lineHeight: 1.5 }}>
          Ce choix est permanent. Contactez votre administrateur pour le modifier.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {roles.map(opt => {
            const active = selected === opt.value || (selected === undefined && opt.value === null && false);
            const isSelected = selected !== null ? selected === opt.value : opt.value === selected;
            return (
              <button
                key={String(opt.value)}
                onClick={() => setSelected(opt.value)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: isSelected ? (isDark ? "#1f3327" : "#e8f5ed") : bg,
                  border: `1.5px solid ${isSelected ? accent : border}`,
                  borderRadius: 9, padding: "14px 16px",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? accent : text, marginBottom: 3 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          disabled={selected === undefined}
          onClick={() => selected !== undefined && onSelect(selected)}
          style={{
            width: "100%",
            background: selected !== undefined ? accent : (isDark ? "#2a3a2e" : "#e0ebe3"),
            border: "none", borderRadius: 8,
            color: selected !== undefined ? "#fff" : muted,
            padding: "12px 20px",
            cursor: selected !== undefined ? "pointer" : "default",
            fontSize: 13, fontFamily: "inherit", fontWeight: 700,
            letterSpacing: "0.04em",
            opacity: selected !== undefined ? 1 : 0.5,
          }}
        >
          Confirmer
        </button>
      </div>
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
  const [type, setType] = useState(initial?.type ?? "Grimpe");
  const [charge, setCharge] = useState(initial?.charge ?? 24);
  const [estimatedTime, setEstimatedTime] = useState(initial?.estimatedTime ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");

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



  const currentText = section === "warmup" ? warmup : section === "main" ? main : cooldown;
  const setCurrentText = section === "warmup" ? setWarmup : section === "main" ? setMain : setCooldown;

  const handleSave = () => {
    if (!name.trim()) return;
    const session = {
      id: initial?.id ?? generateId(),
      type, name: name.trim(), charge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      location: location.trim() || null,
      minRecovery: minRecovery ? +minRecovery : null,
      warmup, main, cooldown,
      isCustom: true,
    };
    onSave(session);
  };

  const sectionLabels = { warmup: "Échauffement", main: "Cœur de séance", cooldown: "Retour au calme" };

  return (
    <div style={styles.customFormOverlay}>
      <div style={styles.customForm}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier la séance" : "Nouvelle séance personnalisée"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.customFormBody}>
          {/* Nom + type */}
          <div style={styles.customFormRow}>
            <select style={styles.customFormSelect} value={type} onChange={e => setType(e.target.value)}>
              <option>Grimpe</option>
              <option>Exercice</option>
            </select>
            <input style={{ ...styles.customFormInput, flex: 1 }} placeholder="Nom de la séance…" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Temps / Lieu */}
          <div style={{ ...styles.customFormRow, flexWrap: "wrap" }}>
            <div style={{ ...styles.customFormField, flex: "1 1 100px" }}>
              <span style={styles.customFormLabel}>Temps estimé (min)</span>
              <input style={styles.customFormInput} type="number" min="0" placeholder="90" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} />
            </div>
            <div style={{ ...styles.customFormField, flex: "2 1 160px" }}>
              <span style={styles.customFormLabel}>Lieu</span>
              <input style={styles.customFormInput} placeholder="Salle, falaise…" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </div>



          {/* Charge + récup */}
          <div style={{ ...styles.customFormField }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={styles.customFormLabel}>Charge d'entraînement</span>
              <button style={styles.calcBtn} onClick={() => { setCalcOpen(o => !o); setInfoOpen(false); }}>
                Calculateur
              </button>
              <button style={{ ...styles.calcBtn, background: "none" }} onClick={() => { setInfoOpen(o => !o); setCalcOpen(false); }}>
                Infos
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
                {preview ? "Éditer" : "Aperçu"}
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

// ─── BLOCK TYPE CONFIG ────────────────────────────────────────────────────────

const BLOCK_TYPES = {
  "Échauffement":    { color: "#f97316", defaultCharge: 5,  defaultDuration: 15, hasCharge: false },
  "Grimpe":          { color: "#4ade80", defaultCharge: 24, defaultDuration: 90, hasCharge: true  },
  "Exercices":       { color: "#60a5fa", defaultCharge: 12, defaultDuration: 20, hasCharge: true  },
  "Suspension":      { color: "#a78bfa", defaultCharge: 0,  defaultDuration: 15, hasCharge: false },
  "Étirements":      { color: "#f0abfc", defaultCharge: 2,  defaultDuration: 10, hasCharge: false },
  "Retour au calme": { color: "#94a3b8", defaultCharge: 3,  defaultDuration: 10, hasCharge: false },
};

// ─── COMPOSANT: Éditeur de bloc ───────────────────────────────────────────────

function BlockEditor({ block, onUpdate, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown, allSessions, onCreateCustom }) {
  const { styles, isDark } = useThemeCtx();
  const cfg = BLOCK_TYPES[block.type] || BLOCK_TYPES["Grimpe"];
  const [open, setOpen] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  const [nbMouvements, setNbMouvements] = useState("");
  const [calcZone, setCalcZone] = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);

  const hasCharge = block.type === "Grimpe" || block.type === "Exercices";
  const grimpePresets = allSessions.filter(s => s.type === "Grimpe");
  const exercicePresets = allSessions.filter(s => s.type === "Exercice");

  const inputStyle = {
    background: isDark ? "#181d1a" : "#f5f0e8",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4, color: isDark ? "#d8d4ce" : "#2a2218",
    fontSize: 11, fontFamily: "inherit", padding: "3px 6px", outline: "none",
  };
  const labelStyle = { fontSize: 9, color: isDark ? "#606860" : "#9a9080", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 };

  return (
    <div style={{
      border: `1px solid ${cfg.color}44`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 6,
      background: isDark ? `${cfg.color}08` : `${cfg.color}06`,
      marginBottom: 6,
    }}>
      {/* Header du bloc */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, flex: 1 }}>{block.type}</span>
        {block.type === "Grimpe" && block.presetName && (
          <span style={{ fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", fontStyle: "italic" }}>{block.presetName}</span>
        )}
        {block.type === "Exercices" && block.name && (
          <span style={{ fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", fontStyle: "italic" }}>{block.name}</span>
        )}
        {hasCharge && (
          <span style={{ fontSize: 10, color: getChargeColor(block.charge || 0), fontWeight: 700 }}>⚡{block.charge || 0}</span>
        )}
        <span style={{ fontSize: 10, color: isDark ? "#555" : "#aaa" }}>{open ? "▲" : "▼"}</span>
        <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
          <button style={{ background: "none", border: "none", cursor: canMoveUp ? "pointer" : "default", opacity: canMoveUp ? 0.7 : 0.2, fontSize: 11, color: isDark ? "#aaa" : "#666", padding: "0 2px" }} onClick={onMoveUp} disabled={!canMoveUp}>↑</button>
          <button style={{ background: "none", border: "none", cursor: canMoveDown ? "pointer" : "default", opacity: canMoveDown ? 0.7 : 0.2, fontSize: 11, color: isDark ? "#aaa" : "#666", padding: "0 2px" }} onClick={onMoveDown} disabled={!canMoveDown}>↓</button>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: isDark ? "#f87171" : "#dc2626", padding: "0 4px" }} onClick={onRemove}>✕</button>
        </div>
      </div>

      {/* Corps du bloc */}
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Preset picker pour Grimpe */}
          {block.type === "Grimpe" && (
            <div>
              <div style={labelStyle}>Modèle de grimpe (optionnel)</div>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={{ ...inputStyle, flex: 1 }}
                  value={block.presetId ?? ""}
                  onChange={e => {
                    const preset = grimpePresets.find(s => String(s.id) === e.target.value);
                    if (preset) onUpdate({ presetId: preset.id, presetName: preset.name, charge: preset.charge });
                    else onUpdate({ presetId: null, presetName: null });
                  }}
                >
                  <option value="">— Libre (sans modèle) —</option>
                  {grimpePresets.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (⚡{s.charge})</option>
                  ))}
                </select>
                {onCreateCustom && (
                  <button style={styles.calcBtn} onClick={() => onCreateCustom("Grimpe")}>＋ Créer</button>
                )}
              </div>
            </div>
          )}

          {/* Exercice picker */}
          {block.type === "Exercices" && (
            <div>
              <div style={labelStyle}>Exercice</div>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={{ ...inputStyle, flex: 1 }}
                  value={block.exerciseId ?? ""}
                  onChange={e => {
                    const ex = exercicePresets.find(s => String(s.id) === e.target.value);
                    if (ex) onUpdate({ exerciseId: ex.id, name: ex.name, charge: ex.charge });
                    else onUpdate({ exerciseId: null, name: null });
                  }}
                >
                  <option value="">— Choisir un exercice —</option>
                  {exercicePresets.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (⚡{s.charge})</option>
                  ))}
                </select>
                {onCreateCustom && (
                  <button style={styles.calcBtn} onClick={() => onCreateCustom("Exercice")}>＋ Créer</button>
                )}
              </div>
            </div>
          )}

          {/* Suspension : vide pour l'instant */}
          {block.type === "Suspension" && (
            <div style={{ fontSize: 10, color: isDark ? "#606860" : "#9a9080", fontStyle: "italic" }}>
              Module Suspension — à compléter prochainement
            </div>
          )}

          {/* Charge + calculateur (Grimpe et Exercices seulement) */}
          {hasCharge && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={labelStyle}>Charge ⚡</span>
                <button style={styles.calcBtn} onClick={() => setCalcOpen(o => !o)}>
                  {calcOpen ? "Fermer calc." : "Calculateur"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: getChargeColor(block.charge || 0), minWidth: 28 }}>{block.charge || 0}</span>
                <input type="range" min="0" max="216" style={styles.customFormSlider}
                  value={block.charge ?? 0} onChange={e => onUpdate({ charge: +e.target.value })} />
                <input type="number" min="0" max="216" style={{ ...inputStyle, width: 52, textAlign: "center" }}
                  value={block.charge ?? ""} onChange={e => onUpdate({ charge: +e.target.value })} />
              </div>

              {calcOpen && (() => {
                const volZone = getNbMouvementsZone(+nbMouvements);
                const volLabel = VOLUME_ZONES[volZone - 1].label;
                const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;
                return (
                  <div style={{ ...styles.calcPanel, marginTop: 6 }}>
                    <div style={styles.calcRow}>
                      <div style={styles.calcField}>
                        <span style={styles.calcLabel}>Nb de mouvements</span>
                        <input style={styles.calcInput} type="number" min="1" placeholder="ex: 40"
                          value={nbMouvements} onChange={e => setNbMouvements(e.target.value)} />
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
                          = Vol.{volZone} × Int.{calcZone} × Compl.{calcComplexity}
                        </span>
                        <button style={styles.calcApplyBtn} onClick={() => { onUpdate({ charge: computed }); setCalcOpen(false); setNbMouvements(""); }}>
                          Appliquer →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Durée + Lieu (sauf Suspension) */}
          {block.type !== "Suspension" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 80px" }}>
                <div style={labelStyle}>Durée (min)</div>
                <input type="number" min="0" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  value={block.duration ?? ""} onChange={e => onUpdate({ duration: +e.target.value })} />
              </div>
              {block.type !== "Exercices" && (
                <div style={{ flex: "2 1 120px" }}>
                  <div style={labelStyle}>Lieu</div>
                  <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    placeholder="Salle, falaise…" value={block.location ?? ""}
                    onChange={e => onUpdate({ location: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {/* Notes (sauf Suspension) */}
          {block.type !== "Suspension" && (
            <div>
              <div style={labelStyle}>Notes</div>
              <textarea style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 48, lineHeight: 1.4 }}
                placeholder="Description, objectifs, consignes…"
                value={block.notes ?? ""}
                onChange={e => onUpdate({ notes: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MODAL: Créer / construire une séance ─────────────────────────────────────

function SessionBuilder({ onSave, onClose, communitySessions, allSessions, onCreateCustom }) {
  const { styles, isDark } = useThemeCtx();
  const [title, setTitle] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [note, setNote] = useState("");
  const [blocks, setBlocks] = useState(() => [
    { id: generateId(), type: "Échauffement", charge: 5, duration: 15, location: "", notes: "" },
    { id: generateId(), type: "Retour au calme", charge: 3, duration: 10, location: "", notes: "" },
  ]);
  const [addingType, setAddingType] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);

  const totalCharge = blocks.filter(b => b.type === "Grimpe" || b.type === "Exercices").reduce((s, b) => s + (b.charge || 0), 0);

  const addBlock = (type) => {
    const cfg = BLOCK_TYPES[type];
    const newBlock = { id: generateId(), type, charge: cfg.defaultCharge, duration: cfg.defaultDuration, location: "", notes: "" };
    // Insert before the last block (Retour au calme) if it exists, otherwise at end
    const insertIdx = blocks.length > 0 && blocks[blocks.length - 1].type === "Retour au calme"
      ? blocks.length - 1
      : blocks.length;
    setBlocks(b => [...b.slice(0, insertIdx), newBlock, ...b.slice(insertIdx)]);
    setAddingType(false);
  };

  const updateBlock = (id, changes) => setBlocks(b => b.map(bl => bl.id === id ? { ...bl, ...changes } : bl));
  const removeBlock = (id) => setBlocks(b => b.filter(bl => bl.id !== id));
  const moveBlock = (id, dir) => setBlocks(b => {
    const i = b.findIndex(bl => bl.id === id);
    if (i + dir < 0 || i + dir >= b.length) return b;
    const arr = [...b];
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
    return arr;
  });

  const loadFromCommunity = (cs) => {
    if (cs.title) setTitle(cs.title);
    else if (cs.name) setTitle(cs.name);
    if (cs.estimatedTime) setEstimatedTime(String(cs.estimatedTime));
    if (cs.note) setNote(cs.note);
    if (cs.blocks) setBlocks(cs.blocks.map(b => ({ ...b, id: generateId() })));
    setCommunityOpen(false);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: generateId(),
      title: title.trim(),
      name: title.trim(),
      estimatedTime: estimatedTime ? +estimatedTime : null,
      note: note.trim() || null,
      charge: totalCharge,
      blocks,
      isCustom: true,
      type: "Grimpe",
    });
  };

  const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  const modalStyle = { ...styles.modal, maxWidth: 520, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" };
  const inputStyle = { ...styles.customFormInput, width: "100%", boxSizing: "border-box" };
  const labelStyle = { fontSize: 9, color: isDark ? "#606860" : "#9a9080", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Nouvelle séance</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Modèle communauté */}
          {communitySessions.length > 0 && (
            <div>
              <button
                style={{ ...styles.createCustomBtn, marginBottom: 0 }}
                onClick={() => setCommunityOpen(o => !o)}
              >
                Charger un modèle communauté {communityOpen ? "▲" : "▼"}
              </button>
              {communityOpen && (
                <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto", border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`, borderRadius: 6 }}>
                  {communitySessions.map((cs, i) => (
                    <div
                      key={i}
                      style={{ ...styles.sessionItem, cursor: "pointer" }}
                      onClick={() => loadFromCommunity(cs)}
                    >
                      <div style={styles.sessionItemLeft}>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{cs.title || cs.name}</span>
                        {cs.blocks && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080", marginLeft: 6 }}>{cs.blocks.length} blocs</span>}
                      </div>
                      <span style={{ ...styles.chargePill, background: getChargeColor(cs.charge) + "33", color: getChargeColor(cs.charge), border: `1px solid ${getChargeColor(cs.charge)}55` }}>⚡{cs.charge}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Infos de la séance */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: isDark ? "#141918" : "#f5f0e8", borderRadius: 8, border: `1px solid ${isDark ? "#222927" : "#ccc6b8"}` }}>
            <div>
              <div style={labelStyle}>Titre de la séance *</div>
              <input
                style={inputStyle}
                placeholder="Ex: Bloc panneau force, Falaise Buoux…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: "1 1 100px" }}>
                <div style={labelStyle}>Durée estimée (min)</div>
                <input type="number" min="0" style={{ ...inputStyle }} placeholder="90" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} />
              </div>
              <div style={{ flex: "3 1 200px" }}>
                <div style={labelStyle}>Note rapide</div>
                <input style={inputStyle} placeholder="Objectif, contexte…" value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Blocs */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#9ca3af" : "#6b7280", letterSpacing: "0.07em", textTransform: "uppercase" }}>Blocs de séance</span>
              <span style={{ fontSize: 11, color: getChargeColor(totalCharge), fontWeight: 700 }}>⚡{totalCharge} total</span>
            </div>

            {blocks.map((bl, i) => (
              <BlockEditor
                key={bl.id}
                block={bl}
                onUpdate={changes => updateBlock(bl.id, changes)}
                onRemove={() => removeBlock(bl.id)}
                canMoveUp={i > 0}
                canMoveDown={i < blocks.length - 1}
                onMoveUp={() => moveBlock(bl.id, -1)}
                onMoveDown={() => moveBlock(bl.id, 1)}
                allSessions={allSessions}
                onCreateCustom={onCreateCustom}
              />
            ))}

            {/* Bouton ajouter bloc */}
            {!addingType ? (
              <button
                style={{ ...styles.createCustomBtn, width: "100%", textAlign: "center" }}
                onClick={() => setAddingType(true)}
              >
                ＋ Ajouter un bloc
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Grimpe", "Exercices", "Suspension"].map(type => {
                  const cfg = BLOCK_TYPES[type];
                  return (
                    <button
                      key={type}
                      style={{
                        flex: "1 1 80px", padding: "7px 10px",
                        background: cfg.color + "18", border: `1px solid ${cfg.color}55`,
                        borderRadius: 6, color: cfg.color, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                      }}
                      onClick={() => addBlock(type)}
                    >
                      {type}
                    </button>
                  );
                })}
                <button
                  style={{ padding: "7px 10px", background: "none", border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`, borderRadius: 6, color: isDark ? "#666" : "#aaa", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}
                  onClick={() => setAddingType(false)}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${isDark ? "#222927" : "#ccc6b8"}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button
            style={{ ...styles.saveBtn, opacity: title.trim() ? 1 : 0.4, cursor: title.trim() ? "pointer" : "not-allowed" }}
            onClick={handleSave}
            disabled={!title.trim()}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: Ajouter une séance ────────────────────────────────────────────────

function SessionPicker({ onSelect, onClose, customSessions, onCreateCustom, sessions, createLabel }) {
  const { styles } = useThemeCtx();
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");
  const catalogSessions = sessions || [];

  const filtered = catalogSessions.filter(s => {
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
    <div style={styles.overlay}>
      <div style={styles.modal}>
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
            {["Tous", "Grimpe", "Exercice"].map(f => (
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
                    <span style={{ ...styles.sessionTypeBadge, background: s.type === "Grimpe" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>{s.type}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={styles.sessionItemName}>{s.name}</span>
                      {(s.estimatedTime || s.location) && (
                        <span style={{ fontSize: 10, color: styles.dashText }}>
                          {s.estimatedTime ? `${s.estimatedTime}min` : ""}{s.location ? `  ${s.location}` : ""}
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
                <span style={{ ...styles.sessionTypeBadge, background: s.type === "Grimpe" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
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
        {/* Create / library button */}
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${styles.dashGrid}` }}>
          <button style={styles.createCustomBtn} onClick={onCreateCustom}>
            {createLabel ?? "＋ Créer une séance / exercice personnalisé"}
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
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, maxWidth: 500, display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* ── Main tab bar — en haut ── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0, background: isDark ? "#1f2421" : "#e8e2d8", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
          <button style={mainTabStyle("session")} onClick={() => setTab("session")}>Séance</button>
          <button style={mainTabStyle("ressenti")} onClick={() => setTab("ressenti")}>
            Ressenti{hasFeedback ? " ✓" : ""}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 2, padding: "0 8px", alignItems: "center" }}>
            {onEdit && (
              <button style={{ ...styles.actionBtn, fontSize: 11, opacity: 0.65 }} onClick={onEdit} title="Modifier la séance">Modifier</button>
            )}
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Résumé statique ── */}
        <div style={{ padding: "12px 18px 10px", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? "#e8e4de" : "#2a2218", lineHeight: 1.3, marginBottom: 8 }}>
            {session.name}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <span style={{ ...styles.sessionTypeBadge, background: session.type === "Séance" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
              {session.type || "Séance"}
            </span>
            <span style={{ ...styles.chargePill, background: getChargeColor(session.charge) + "33", color: getChargeColor(session.charge), border: `1px solid ${getChargeColor(session.charge)}55` }}>
              ⚡{session.charge}
            </span>
            {session.estimatedTime && <span style={styles.detailMetaChip}>{session.estimatedTime} min</span>}
            {session.location      && <span style={styles.detailMetaChip}>{session.location}</span>}
            {session.minRecovery   && <span style={styles.detailMetaChip}>{session.minRecovery}h récup</span>}
            {mesoLabel && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{mesoLabel}</span>}
            {weekMeta?.microcycle && <span style={styles.detailMetaChip}>{weekMeta.microcycle}</span>}
          </div>
          {dayLabel && (
            <div style={{ fontSize: 10, color: isDark ? "#707870" : "#8a7f70", marginTop: 5, letterSpacing: "0.05em" }}>{dayLabel}</div>
          )}
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

// ─── CONFIRM DELETE MODAL ─────────────────────────────────────────────────────

function ConfirmModal({ title, sub, onConfirm, onClose }) {
  const { styles } = useThemeCtx();
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmModal}>
        <div style={styles.confirmTitle}>{title}</div>
        {sub && <div style={styles.confirmSub}>{sub}</div>}
        <div style={styles.confirmBtnRow}>
          <button style={styles.confirmCancelBtn} onClick={onClose}>Annuler</button>
          <button style={styles.confirmDeleteBtn} onClick={() => { onConfirm(); onClose(); }}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

// ─── COACH PICKER MODAL ───────────────────────────────────────────────────────

function CoachPickerModal({ sessions, blocks, onSelect, onClose }) {
  const { isDark } = useThemeCtx();
  const [tab,        setTab]        = useState("sessions");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [selected,   setSelected]   = useState(null); // { type, item }
  const [startTime,  setStartTime]  = useState("09:00");

  const surface = isDark ? "#1c2820" : "#ffffff";
  const bg2     = isDark ? "#141a16" : "#f3f7f4";
  const border  = isDark ? "#263228" : "#daeade";
  const text    = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted   = isDark ? "#6a8870" : "#6b8c72";
  const accent  = "#4caf72";

  const isSessionTab = tab === "sessions";

  const filteredSessions = sessions.filter(s =>
    (typeFilter === "Tous" || s.type === typeFilter) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredBlocks = blocks.filter(b =>
    (typeFilter === "Tous" || b.blockType === typeFilter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const sessionTypes  = [...new Set(sessions.map(s => s.type).filter(Boolean))];
  const filterOptions = isSessionTab
    ? ["Tous", ...sessionTypes]
    : ["Tous", ...Object.keys(BLOCK_TYPES)];

  const getEndTime = (start, duration) => {
    if (!start || !duration) return null;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + Number(duration);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const handleAdd = () => {
    if (!selected) return;
    const duration = selected.type === "session"
      ? selected.item.estimatedTime
      : selected.item.duration;
    onSelect({
      ...selected.item,
      startTime,
      endTime: getEndTime(startTime, duration) ?? undefined,
      isBlock: selected.type === "block",
    });
  };

  const inputBase = { background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 11px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none" };

  const ItemRow = ({ item, type }) => {
    const isSel = selected?.item.id === item.id && selected?.type === type;
    const cfg   = type === "block" ? (BLOCK_TYPES[item.blockType] || {}) : null;
    const color = type === "block" ? (cfg?.color || "#888") : getChargeColor(item.charge);
    const dur   = type === "session" ? item.estimatedTime : item.duration;
    return (
      <div
        onClick={() => setSelected({ type, item })}
        style={{
          padding: "10px 14px", cursor: "pointer",
          background: isSel ? (isDark ? "#1b3026" : "#e2f5e8") : "transparent",
          borderLeft: `3px solid ${isSel ? accent : "transparent"}`,
          borderBottom: `1px solid ${border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        {cfg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0, display: "inline-block" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 400, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.name}
          </div>
          <div style={{ fontSize: 10, color: muted, display: "flex", gap: 8, marginTop: 2 }}>
            {type === "session" && item.type && <span>{item.type}</span>}
            {type === "block"   && <span style={{ color }}>{item.blockType}</span>}
            {dur && <span>⏱ {dur} min</span>}
            {type === "session" && <span style={{ color: getChargeColor(item.charge) }}>⚡{item.charge}</span>}
            {type === "block" && cfg?.hasCharge && item.charge > 0 && <span style={{ color: getChargeColor(item.charge) }}>⚡{item.charge}</span>}
          </div>
        </div>
        {type === "session" && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: color + "28", color, border: `1px solid ${color}55`, flexShrink: 0 }}>
            ⚡{item.charge}
          </span>
        )}
        {isSel && <span style={{ color: accent, fontSize: 16, flexShrink: 0 }}>✓</span>}
      </div>
    );
  };

  const selDuration = selected
    ? (selected.type === "session" ? selected.item.estimatedTime : selected.item.duration)
    : null;
  const endTime = selected ? getEndTime(startTime, selDuration) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 420, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px #0009", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>Ajouter au calendrier</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${border}` }}>
          {[{ key: "sessions", label: "Séances" }, { key: "blocks", label: "Blocs" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSearch(""); setTypeFilter("Tous"); setSelected(null); }}
              style={{
                flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: tab === key ? 700 : 400,
                color: tab === key ? accent : muted,
                borderBottom: `2px solid ${tab === key ? accent : "transparent"}`,
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Search + filter */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: 7 }}>
          <input
            style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {filterOptions.map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                style={{
                  padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                  fontFamily: "inherit",
                  border: `1px solid ${typeFilter === f ? accent + "88" : border}`,
                  background: typeFilter === f ? (isDark ? "#263228" : "#d4e8db") : "none",
                  color: typeFilter === f ? accent : muted,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSessionTab
            ? (filteredSessions.length === 0
                ? <div style={{ padding: "30px", textAlign: "center", color: muted, fontSize: 12 }}>Aucune séance</div>
                : filteredSessions.map(s => <ItemRow key={s.id} item={s} type="session" />))
            : (filteredBlocks.length === 0
                ? <div style={{ padding: "30px", textAlign: "center", color: muted, fontSize: 12 }}>Aucun bloc</div>
                : filteredBlocks.map(b => <ItemRow key={b.id} item={b} type="block" />))
          }
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Heure de départ</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{ ...inputBase, padding: "5px 9px", fontSize: 13 }}
                  />
                </div>
                {endTime && selDuration && (
                  <div style={{ fontSize: 10, color: muted, marginTop: 13 }}>
                    → {endTime}<br />
                    <span style={{ color: accent }}>{selDuration} min</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleAdd}
                style={{ background: accent, border: "none", borderRadius: 7, color: "#fff", padding: "9px 20px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, boxShadow: `0 2px 8px ${accent}44`, flexShrink: 0 }}
              >Ajouter</button>
            </>
          ) : (
            <div style={{ color: muted, fontSize: 12, flex: 1 }}>Sélectionnez une séance ou un bloc…</div>
          )}
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 7, color: muted, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPOSANT JOUR ───────────────────────────────────────────────────────────

function DayColumn({ dayLabel, dateLabel, sessions, isToday, weekMeta, onAddSession, onOpenSession, onRemove, isMobile, hasCreatine, note, onSaveNote, logWarning, onOpenLog }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const totalCharge = sessions.reduce((acc, s) => acc + s.charge, 0);
  const meso = weekMeta?.mesocycle;
  const mesoColor = meso ? getMesoColor(mesocycles, meso) : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note || "");
  const noteRef = useRef(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState(null);

  // Sync external note changes when not editing
  useEffect(() => { if (!noteOpen) setNoteText(note || ""); }, [note, noteOpen]);
  useEffect(() => { if (noteOpen && noteRef.current) noteRef.current.focus(); }, [noteOpen]);

  const handleNoteBlur = () => {
    setNoteOpen(false);
    if (noteText !== (note || "")) onSaveNote?.(noteText);
  };

  const noteAreaStyle = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#1a1f1c" : "#e4dfd6",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4, color: isDark ? "#d8d4ce" : "#2a2218",
    fontSize: 10, fontFamily: "inherit", lineHeight: 1.45,
    padding: "5px 7px", resize: "none", height: 56, outline: "none",
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {hasCreatine && (
            <span style={{ fontSize: 7, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)", lineHeight: 1 }} title="Créatine">▲</span>
          )}
          {totalCharge > 0 && (
            <span style={{ ...styles.dayCharge, color: getChargeColor(totalCharge) }}>
              ⚡{totalCharge}
            </span>
          )}
        </div>
      </div>

      {/* ── Journal bar ── */}
      {(() => {
        const warn = logWarning?.hasWarning;
        const future = logWarning?.isFuture;
        const btnStyle = warn
          ? (isToday
              ? { background: "#ef444418", border: "2px solid #ef4444", color: "#ef4444", fontWeight: 700 }
              : { background: "#f9731618", border: "2px solid #f97316", color: "#f97316", fontWeight: 700 })
          : future
            ? { background: "transparent", border: `1px solid ${isDark ? "#1e221e" : "#e5e0d8"}`, color: isDark ? "#252a25" : "#ccc8c0", fontWeight: 400 }
            : isToday
              ? { background: isDark ? "#1a2a1a" : "#eaf5ea", border: `1px solid ${isDark ? "#2a4a2a" : "#9ecb9e"}`, color: isDark ? "#4ade80" : "#2a7d4f", fontWeight: 600 }
              : { background: "transparent", border: `1px solid ${isDark ? "#252a25" : "#d8d3ca"}`, color: isDark ? "#333833" : "#c0bbb2", fontWeight: 400 };
        return (
          <button
            onClick={() => onOpenLog?.()}
            style={{
              width: "100%", cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: isMobile ? "6px 2px" : "7px 10px",
              fontSize: isMobile ? 10 : 11, borderRadius: 6, lineHeight: 1, marginBottom: 6,
              ...btnStyle,
            }}
          >
            <span style={{ fontSize: warn ? 13 : 11 }}>{warn ? "⚠" : "≡"}</span>
            {!isMobile && (
              <span>{warn ? (isToday ? "Compléter le journal" : "Journal incomplet") : (isToday ? "Journal du jour ✓" : "Journal")}</span>
            )}
          </button>
        );
      })()}
      <div style={styles.sessionCards}>
        {sessions.map((s, i) => (
          <div
            key={i}
            style={{ ...styles.sessionCard, cursor: "pointer" }}
            onClick={() => onOpenSession(i)}
          >
            <div style={{ ...styles.sessionCardAccent, background: getChargeColor(s.charge) }} />
            <div style={styles.sessionCardContent}>
              {s.startTime && (
                <span style={{ fontSize: 9, color: isDark ? "#5a7860" : "#7a9a80", fontWeight: 600, marginBottom: 1, display: "block" }}>
                  {s.startTime}{s.endTime ? ` – ${s.endTime}` : ""}
                </span>
              )}
              <span style={styles.sessionCardName}>{s.title || s.name}</span>
              {/* Blocs de la séance (nouveau format) */}
              {s.blocks && s.blocks.length > 0 && (
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
                  {s.blocks.map((bl, bi) => {
                    const cfg = BLOCK_TYPES[bl.type];
                    if (!cfg) return null;
                    return (
                      <span key={bi} title={bl.type + (bl.name ? ` — ${bl.name}` : "")} style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 10,
                        background: cfg.color + "22", color: cfg.color,
                        border: `1px solid ${cfg.color}44`, lineHeight: 1.6,
                      }}>
                        {bl.type === "Exercices" && bl.name ? bl.name.split(" ").slice(0, 2).join(" ") : bl.type}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Badges ancienne séance */}
              {!s.blocks && s.isCustom && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  <span style={styles.customBadge}>perso</span>
                  {s.estimatedTime && <span style={{ ...styles.customBadge, background: "none", borderColor: "transparent", color: styles.dashText }}>{s.estimatedTime}min</span>}
                  {meso && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{meso}</span>}
                </div>
              )}
              <div style={styles.sessionCardFooter}>
                <span style={{ ...styles.sessionCardCharge, color: getChargeColor(s.charge) }}>⚡{s.charge}</span>
                {s.estimatedTime && !s.blocks && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080" }}>{s.estimatedTime}min</span>}
                {s.blocks && s.estimatedTime && <span style={{ fontSize: 9, color: isDark ? "#606860" : "#9a9080" }}>{s.estimatedTime}min</span>}
                {s.feedback && (
                  <span style={styles.feedbackDot} title="Feedback enregistré">
                    {s.feedback.done ? "✓" : "✗"}
                  </span>
                )}
              </div>
            </div>
            <div style={styles.sessionCardActions}>
              <button style={styles.actionBtn} title="Supprimer" onClick={e => { e.stopPropagation(); setPendingDeleteIdx(i); }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Note du jour ── */}
      {!isMobile && (
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          {noteOpen ? (
            <textarea ref={noteRef} style={noteAreaStyle} value={noteText}
              onChange={e => setNoteText(e.target.value)} onBlur={handleNoteBlur}
              placeholder="Note du jour..." />
          ) : noteText ? (
            <div onClick={() => setNoteOpen(true)} style={{
              fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", lineHeight: 1.4,
              cursor: "text", padding: "4px 6px", borderRadius: 4,
              borderLeft: `2px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
              background: isDark ? "#1a1f1c55" : "#e4dfd655",
              wordBreak: "break-word",
            }}>
              {noteText.length > 70 ? noteText.slice(0, 70) + "…" : noteText}
            </div>
          ) : (
            <div onClick={() => setNoteOpen(true)} style={{
              fontSize: 9, color: isDark ? "#303530" : "#ccc8c0",
              cursor: "text", padding: "2px 4px", letterSpacing: "0.03em",
            }}>
              ＋ note
            </div>
          )}
        </div>
      )}

      <button style={{ ...styles.addBtn, marginTop: noteOpen || noteText ? 6 : 0 }} onClick={onAddSession}>
        <span style={styles.addBtnIcon}>＋</span>
        <span style={styles.addBtnLabel}>Séance</span>
      </button>

      {pendingDeleteIdx !== null && (
        <ConfirmModal
          title="Supprimer cette séance ?"
          sub={sessions[pendingDeleteIdx]?.name}
          onConfirm={() => onRemove(pendingDeleteIdx)}
          onClose={() => setPendingDeleteIdx(null)}
        />
      )}
    </div>
  );
}

// ─── VUE MOIS ─────────────────────────────────────────────────────────────────

function MonthView({ data, currentDate, onSelectWeek, isMobile, mesocycles, onSessionClick, creatine, customCycles }) {
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

// ─── VUE ANNÉE ────────────────────────────────────────────────────────────────

function YearView({ data, currentDate, onSelectMonth, isMobile, creatine, customCycles }) {
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
                            outline: isToday ? `1px solid ${isDark ? "#4ade80" : "#2a7d4f"}` : "none",
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

// ─── CUSTOM CYCLE MODAL ───────────────────────────────────────────────────────

function CustomCycleModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || CUSTOM_CYCLE_COLORS[0]);
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [isRepetitive, setIsRepetitive] = useState(initial?.isRepetitive || false);
  const [onWeeks, setOnWeeks] = useState(initial?.onWeeks || 8);
  const [offWeeks, setOffWeeks] = useState(initial?.offWeeks || 4);

  const canSave = name.trim() && startDate && (isRepetitive || endDate);

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id || generateId(),
      name: name.trim(),
      color,
      startDate,
      endDate: isRepetitive ? "" : endDate,
      description: description.trim(),
      isRepetitive,
      onWeeks: +onWeeks,
      offWeeks: +offWeeks,
    });
  };

  const inputStyle = { ...styles.customFormInput, width: "100%", boxSizing: "border-box" };
  const fieldStyle = { ...styles.customFormField, flex: 1 };
  const labelColor = isDark ? "#8a9090" : "#6b7060";

  return (
    <div style={styles.confirmOverlay}>
      <div style={{ ...styles.confirmModal, width: "min(400px, 96vw)", gap: 14, padding: "20px 22px" }}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier le cycle" : "Nouveau cycle personnalisé"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Nom */}
        <input style={inputStyle} placeholder="Nom du cycle… (ex: Créatine, Décharge)" value={name} onChange={e => setName(e.target.value)} />

        {/* Palette couleurs */}
        <div>
          <div style={{ fontSize: 10, color: labelColor, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.1em" }}>Couleur</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {CUSTOM_CYCLE_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{
                width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                border: color === c ? "3px solid #fff" : "3px solid transparent",
                boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        {/* Répétitif */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: labelColor, cursor: "pointer" }}>
          <input type="checkbox" checked={isRepetitive} onChange={e => setIsRepetitive(e.target.checked)} style={{ accentColor: color }} />
          Cycle répétitif (alterne ON / OFF depuis la date de début)
        </label>

        {/* Dates */}
        {!isRepetitive ? (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={fieldStyle}>
              <span style={styles.customFormLabel}>Date de début</span>
              <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <span style={styles.customFormLabel}>Date de fin</span>
              <input style={inputStyle} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ ...fieldStyle, flex: "2 1 140px" }}>
              <span style={styles.customFormLabel}>Date de début</span>
              <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={{ ...fieldStyle, flex: "0 0 80px" }}>
              <span style={styles.customFormLabel}>ON (sem.)</span>
              <input style={inputStyle} type="number" min="1" max="52" value={onWeeks} onChange={e => setOnWeeks(e.target.value)} />
            </div>
            <div style={{ ...fieldStyle, flex: "0 0 80px" }}>
              <span style={styles.customFormLabel}>OFF (sem.)</span>
              <input style={inputStyle} type="number" min="1" max="52" value={offWeeks} onChange={e => setOffWeeks(e.target.value)} />
            </div>
          </div>
        )}

        {/* Description */}
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 52, fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}
          placeholder="Notes… (optionnel)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        {/* Boutons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={styles.confirmCancelBtn} onClick={onClose}>Annuler</button>
          <button
            style={{ ...styles.confirmDeleteBtn, background: canSave ? color : (isDark ? "#333" : "#ccc"), cursor: canSave ? "pointer" : "default" }}
            onClick={handleSave}
            disabled={!canSave}
          >
            {initial ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CYCLES TIMELINE ─────────────────────────────────────────────────────────

function CyclesTimeline({ mesocycles, customCycles, onEdit }) {
  const { styles, isDark } = useThemeCtx();
  const [popover, setPopover] = useState(null); // { meso, micro, x, y }

  // Measure actual container width to compute pixel-accurate text truncation
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Return how many chars of `label` fit in `px` pixels, or null if none
  const fitLabel = (label, px) => {
    const avail = px - 12; // subtract 6px left+right padding
    const charW = 5.5;     // ~5.5 px per char at font-size 9
    if (avail < charW) return null;
    const maxChars = Math.floor(avail / charW);
    if (maxChars >= label.length) return label;
    if (maxChars <= 1) return label.charAt(0);
    return label.slice(0, maxChars - 1) + "…";
  };

  // Chain start dates: if a meso has no startDate, pick up from previous end
  const chainedMesos = useMemo(() => {
    let runningDate = null;
    return mesocycles.map(meso => {
      const start = meso.startDate ? new Date(meso.startDate + "T00:00:00") : runningDate;
      const end = start ? addDays(start, meso.durationWeeks * 7) : null;
      runningDate = end;
      return { ...meso, computedStart: start, computedEnd: end };
    });
  }, [mesocycles]);

  const maxMesoWeeks = Math.max(...mesocycles.map(m => m.durationWeeks), 1);

  // Custom cycle duration in weeks
  const ccWithDuration = (customCycles || []).map(cc => {
    let weeks = 0;
    if (cc.isRepetitive) {
      weeks = (cc.onWeeks || 0) + (cc.offWeeks || 0);
    } else if (cc.startDate && cc.endDate) {
      const s = new Date(cc.startDate + "T00:00:00");
      const e = new Date(cc.endDate + "T00:00:00");
      weeks = Math.max(1, Math.round((e - s) / (7 * 24 * 3600 * 1000)));
    }
    return { ...cc, durationWeeks: weeks };
  });

  const fmtDate = d => d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
  const accent = isDark ? "#4ade80" : "#2a7d4f";

  const handleMicroClick = (e, meso, micro) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ meso, micro, x: rect.left, y: rect.bottom + 6 });
  };

  return (
    <div ref={containerRef} style={styles.timelineWrap} onClick={() => setPopover(null)}>
      {/* Top bar */}
      <div style={styles.timelineTopBar}>
        <span style={styles.timelineTitle}>Planification</span>
        {onEdit && <button style={styles.timelineEditBtn} onClick={onEdit}>Modifier</button>}
      </div>

      {/* Empty state */}
      {mesocycles.length === 0 && (
        <div style={{ color: isDark ? "#5a6060" : "#9a9890", fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
          {onEdit ? "Aucun mésocycle défini. Cliquez sur Modifier pour commencer." : "Aucun mésocycle défini."}
        </div>
      )}

      {/* Mésocycles */}
      {chainedMesos.map((meso, idx) => {
        const barPct = (meso.durationWeeks / maxMesoWeeks) * 100;
        const totalMicroWeeks = meso.microcycles.reduce((a, m) => a + m.durationWeeks, 0);
        const hasMicros = meso.microcycles.length > 0;
        // Pixel width of this meso's bar (label col = 148px)
        const barAreaPx = Math.max(0, containerWidth - 148);
        const barPx = barAreaPx * (barPct / 100);
        const startLabel = fmtDate(meso.computedStart);
        const endLabel = fmtDate(meso.computedEnd);

        // Today indicator — position within this meso's bar
        let todayPct = null;
        if (meso.computedStart && meso.computedEnd) {
          const now = new Date(); now.setHours(0, 0, 0, 0);
          const s = new Date(meso.computedStart); s.setHours(0, 0, 0, 0);
          const e = new Date(meso.computedEnd); e.setHours(0, 0, 0, 0);
          if (now >= s && now < e) {
            const msPerDay = 864e5;
            todayPct = ((now - s) / msPerDay) / (meso.durationWeeks * 7) * 100;
          }
        }

        return (
          <div key={meso.id} style={styles.timelineRow}>
            {/* Label */}
            <div style={styles.timelineLabelCol}>
              <div style={styles.timelineLabelName}>
                <div style={{ ...styles.timelineLabelDot, background: meso.color }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meso.label}</span>
              </div>
              <div style={styles.timelineLabelMeta}>
                {meso.durationWeeks} sem.
                {startLabel && <span style={{ color: isDark ? "#4a5050" : "#b0a898" }}> · {startLabel}</span>}
              </div>
            </div>

            {/* Bar */}
            <div style={styles.timelineBarArea}>
              <div style={{
                ...styles.timelineBar,
                width: `${barPct}%`,
                background: meso.color + (isDark ? "18" : "12"),
                borderColor: meso.color + "55",
              }}>
                {/* Today line */}
                {todayPct !== null && (
                  <div style={{
                    position: "absolute", left: `${todayPct}%`,
                    top: -1, bottom: -1, width: 2,
                    background: "#ef4444",
                    boxShadow: "0 0 4px #ef444488",
                    borderRadius: 1, zIndex: 5, pointerEvents: "none",
                  }} />
                )}
                {!hasMicros ? (
                  // No microcycles — single undivided block
                  <div
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
                    onClick={e => handleMicroClick(e, meso, null)}
                  >
                    <span style={{ fontSize: 10, color: meso.color, opacity: 0.75, fontWeight: 500 }}>
                      {fitLabel(meso.description || `${meso.durationWeeks}s`, barPx) || `${meso.durationWeeks}s`}
                    </span>
                  </div>
                ) : (
                  meso.microcycles.map((micro, mi) => {
                    const ref = totalMicroWeeks > 0 ? totalMicroWeeks : meso.durationWeeks;
                    const microPct = (micro.durationWeeks / ref) * 100;
                    const isLast = mi === meso.microcycles.length - 1;
                    const segPx = barPx * (microPct / 100);
                    const isNarrow = segPx < 18;
                    const label = fitLabel(micro.label, segPx);
                    const showSub = segPx >= 28 && label;
                    return (
                      <div
                        key={micro.id}
                        title={`${micro.label} · ${micro.durationWeeks}s`}
                        style={{
                          ...styles.timelineMicroSeg,
                          width: `${microPct}%`,
                          borderRightColor: isLast ? "transparent" : meso.color + "44",
                        }}
                        onClick={e => handleMicroClick(e, meso, micro)}
                      >
                        {isNarrow ? (
                          <div style={{ width: 3, height: 12, borderRadius: 2, background: meso.color, opacity: 0.5 }} />
                        ) : (
                          <div>
                            <div style={{ ...styles.timelineMicroLabel, color: meso.color }}>
                              {label}
                            </div>
                            {showSub && <div style={{ ...styles.timelineMicroSub, color: meso.color }}>{micro.durationWeeks}s</div>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Custom cycles */}
      {ccWithDuration.length > 0 && (
        <>
          <div style={styles.timelineSectionSep}>Cycles personnalisés</div>
          {ccWithDuration.map(cc => {
            const barPct = Math.min(100, (cc.durationWeeks / maxMesoWeeks) * 100);
            const label = cc.isRepetitive
              ? `Répétitif · ${cc.onWeeks}s ON / ${cc.offWeeks}s OFF`
              : `${cc.durationWeeks} sem.`;
            const ccBarPx = Math.max(0, containerWidth - 148) * Math.max(barPct, 4) / 100;
            const ccBarText = cc.isRepetitive ? `${cc.onWeeks}s ON / ${cc.offWeeks}s OFF` : `${cc.durationWeeks}s`;
            return (
              <div key={cc.id} style={styles.timelineCustomRow}>
                <div style={{ ...styles.timelineLabelCol }}>
                  <div style={styles.timelineLabelName}>
                    <div style={{ width: 9, height: 4, borderRadius: 2, background: cc.color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cc.name}</span>
                  </div>
                  <div style={styles.timelineLabelMeta}>{label}</div>
                </div>
                <div style={styles.timelineBarArea}>
                  <div style={{
                    ...styles.timelineCustomBar,
                    width: `${Math.max(barPct, 4)}%`,
                    background: cc.color + "25",
                    borderColor: cc.color + "60",
                  }}>
                    <span style={{ fontSize: 9, color: cc.color, fontWeight: 600, overflow: "hidden" }}>
                      {fitLabel(ccBarText, ccBarPx) || ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Popover */}
      {popover && (
        <div style={styles.timelinePopoverWrap} onClick={() => setPopover(null)}>
          <div
            style={{ ...styles.timelinePopover, left: Math.min(popover.x, window.innerWidth - 260), top: popover.y }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: popover.meso.color }} />
              <span style={styles.timelinePopoverTitle}>{popover.meso.label}</span>
            </div>
            {popover.micro ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#d0d8d0" : "#4a5050", marginBottom: 4 }}>
                  {popover.micro.label}
                </div>
                <div style={styles.timelinePopoverMeta}>{popover.micro.durationWeeks} semaine{popover.micro.durationWeeks > 1 ? "s" : ""}</div>
                {popover.micro.description && <div style={{ ...styles.timelinePopoverMeta, marginTop: 4, fontStyle: "italic" }}>{popover.micro.description}</div>}
              </>
            ) : (
              <>
                <div style={styles.timelinePopoverMeta}>{popover.meso.durationWeeks} semaines</div>
                {popover.meso.description && <div style={{ ...styles.timelinePopoverMeta, marginTop: 4, fontStyle: "italic" }}>{popover.meso.description}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CYCLES VIEW ─────────────────────────────────────────────────────────────

function CyclesView({ mesocycles, onAddMeso, onUpdateMeso, onDeleteMeso, onAddMicro, onUpdateMicro, onDeleteMicro, customCycles, onAddCustomCycle, onUpdateCustomCycle, onDeleteCustomCycle, locked, onSetLocked, canEdit }) {
  const { styles, isDark } = useThemeCtx();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showCustomCycleForm, setShowCustomCycleForm] = useState(false);
  const [editingCustomCycle, setEditingCustomCycle] = useState(null);

  // ── Timeline mode (locked, or athlete who can't edit) ──
  if (locked || canEdit === false) {
    return (
      <CyclesTimeline
        mesocycles={mesocycles}
        customCycles={customCycles || []}
        onEdit={canEdit === false ? null : () => onSetLocked(false)}
      />
    );
  }

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
              <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "meso", id: meso.id, label: meso.label })} title="Supprimer">✕</button>
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
                  <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "micro", mesoId: meso.id, microId: micro.id, label: micro.label })} title="Supprimer">✕</button>
                </div>
              ))}
              <button style={styles.cycleAddMicroBtn} onClick={() => onAddMicro(meso.id)}>
                ＋ Microcycle
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Cycles personnalisés ── */}
      <div style={styles.customCyclesSection}>
        <div style={styles.customCyclesSectionHeader}>
          <span style={styles.customCyclesSectionTitle}>Cycles personnalisés</span>
          <button style={styles.cycleAddMesoBtn} onClick={() => { setShowCustomCycleForm(true); setEditingCustomCycle(null); }}>
            ＋ Nouveau cycle
          </button>
        </div>

        {(customCycles || []).length === 0 && (
          <div style={{ color: isDark ? "#5a6060" : "#9a9890", fontSize: 12, fontStyle: "italic", textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            Aucun cycle personnalisé. Ex : créatine, décharge, compétition…
          </div>
        )}

        {(customCycles || []).map(cc => {
          const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
          const dateInfo = cc.isRepetitive
            ? `Rép. ${cc.onWeeks}s ON / ${cc.offWeeks}s OFF · depuis le ${fmtDate(cc.startDate)}`
            : `${fmtDate(cc.startDate)} → ${fmtDate(cc.endDate)}`;
          return (
            <div key={cc.id} style={styles.customCycleRow}>
              <div style={{ ...styles.customCycleColorSwatch, background: cc.color }} />
              <div style={styles.customCycleInfo}>
                <span style={styles.customCycleName}>{cc.name}</span>
                <span style={styles.customCycleDate}>{dateInfo}</span>
                {cc.description && <span style={{ ...styles.customCycleDate, fontStyle: "italic", marginTop: 1 }}>{cc.description}</span>}
              </div>
              <button style={styles.cycleDeleteBtn} onClick={() => { setEditingCustomCycle(cc); setShowCustomCycleForm(false); }} title="Modifier">Mod.</button>
              <button style={styles.cycleDeleteBtn} onClick={() => setPendingDelete({ type: "customCycle", id: cc.id, label: cc.name })} title="Supprimer">✕</button>
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={
            pendingDelete.type === "meso" ? "Supprimer ce mésocycle ?" :
            pendingDelete.type === "micro" ? "Supprimer ce microcycle ?" :
            "Supprimer ce cycle personnalisé ?"
          }
          sub={pendingDelete.label}
          onConfirm={() => {
            if (pendingDelete.type === "meso") onDeleteMeso(pendingDelete.id);
            else if (pendingDelete.type === "micro") onDeleteMicro(pendingDelete.mesoId, pendingDelete.microId);
            else onDeleteCustomCycle(pendingDelete.id);
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {(showCustomCycleForm || editingCustomCycle) && (
        <CustomCycleModal
          initial={editingCustomCycle}
          onSave={cc => {
            if (editingCustomCycle) onUpdateCustomCycle(cc.id, cc);
            else onAddCustomCycle(cc);
            setShowCustomCycleForm(false);
            setEditingCustomCycle(null);
          }}
          onClose={() => { setShowCustomCycleForm(false); setEditingCustomCycle(null); }}
        />
      )}

      {/* Save button */}
      {mesocycles.length > 0 && (
        <button style={styles.timelineSaveBtn} onClick={() => onSetLocked(true)}>
          ✓ Enregistrer la planification
        </button>
      )}
    </div>
  );
}

// ─── SECTION SOMMEIL ──────────────────────────────────────────────────────────

function SleepSection({ sleepData, onImport, range }) {
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
        <div style={{ fontSize: 11, color: importMsg.startsWith("⚠") ? "#f87171" : "#4ade80", marginBottom: 8 }}>
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
            <div style={{ fontSize: 10, color: isDark ? "#707870" : "#8a7060", marginBottom: 10 }}>
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
                <span style={{ ...styles.dashCardVal, fontSize: 17, color: avgScore >= 80 ? "#4ade80" : avgScore >= 60 ? "#fbbf24" : "#f87171" }}>{avgScore}</span>
                <span style={styles.dashCardLabel}>Score moy.</span>
              </div>
            )}
          </div>

          {/* Légende */}
          <div style={styles.sleepLegend}>
            {[["#6366f1","Profond"],["#a855f7","REM"],["#22d3ee","Léger"],["#f9731666","Éveil"]].map(([c,l]) => (
              <span key={l} style={{ fontSize: 10, color: isDark ? "#9ca3af" : "#6b7280", display: "flex", alignItems: "center" }}>
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
                  <Line type="monotone" dataKey="score" name="Score" stroke={isDark ? "#4ade80" : "#2a7d4f"} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── NOTES JOURNALIÈRES ──────────────────────────────────────────────────────

function DailyNotesSection({ notes, onSave, creatine, onToggleCreatine }) {
  const { styles, isDark } = useThemeCtx();
  const today = new Date().toISOString().slice(0, 10);
  const [text, setText] = useState(notes[today] || "");

  // Sync if today's note changes externally
  const savedText = notes[today] || "";
  const [lastSaved, setLastSaved] = useState(savedText);

  const handleBlur = () => {
    if (text !== lastSaved) {
      onSave(today, text);
      setLastSaved(text);
    }
  };

  // Recent entries (last 5, excluding today if empty)
  const recent = Object.entries(notes)
    .filter(([d, t]) => d !== today && t?.trim())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const taStyle = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#1e231f" : "#e8e3da",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 6, color: isDark ? "#e8e4de" : "#2a2218",
    fontSize: 12, fontFamily: "inherit", lineHeight: 1.5,
    padding: "10px 12px", resize: "vertical", minHeight: 72,
    outline: "none", transition: "border-color 0.15s",
  };

  return (
    <div style={styles.dashSection}>
      <div style={{ ...styles.dashSectionTitle, marginBottom: 8 }}>
        Notes du jour
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginLeft: 8 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>
      <textarea
        style={taStyle}
        placeholder="Comment tu te sens ? Observations, intentions du jour..."
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={!!creatine?.[today]}
            onChange={() => onToggleCreatine?.(today)}
            style={{ cursor: "pointer", width: 14, height: 14, accentColor: isDark ? "#4ade80" : "#2a7d4f" }}
          />
          <span style={{ fontSize: 12, color: isDark ? "#9ca3af" : "#6b7280" }}>
            Créatine prise
            {creatine?.[today] && <span style={{ marginLeft: 6, fontSize: 10, color: isDark ? "#4ade80" : "#2a7d4f" }}>▲</span>}
          </span>
        </label>
      {recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {recent.map(([d, t]) => (
            <div key={d} style={{ marginBottom: 6, fontSize: 11, color: isDark ? "#9ca3af" : "#6b7280" }}>
              <span style={{ fontWeight: 600, marginRight: 6, color: isDark ? "#707870" : "#8a7060" }}>{fmtDate(d)}</span>
              {t.length > 100 ? t.slice(0, 100) + "…" : t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUIVI DU POIDS ─────────────────────────────────────────────────────────

function WeightSection({ weightData, onSave }) {
  const { styles, isDark } = useThemeCtx();
  const today = new Date().toISOString().slice(0, 10);
  const [input, setInput] = useState(
    weightData[today] != null ? String(weightData[today]) : ""
  );

  // Sync if cloud loads fresh data
  useEffect(() => {
    if (weightData[today] != null) setInput(String(weightData[today]));
    else setInput("");
  }, [weightData[today]]);

  const commit = () => {
    const val = parseFloat(input.replace(",", "."));
    if (!isNaN(val) && val > 0) onSave(today, Math.round(val * 10) / 10);
    else if (input.trim() === "") onSave(today, null);
  };

  // Chart: last 30 valid entries
  const chartEntries = Object.entries(weightData)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30);
  const chartData = chartEntries.map(([date, kg]) => ({
    label: new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }),
    kg,
  }));

  // Recent entries (last 4, excluding today)
  const recent = Object.entries(weightData)
    .filter(([d, v]) => d !== today && v != null)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const todayKg = weightData[today];
  const accent = isDark ? "#60a5fa" : "#2563eb";
  const tooltipStyle = {
    background: isDark ? "#1a1f1b" : "#f0ebe2",
    border: "none", borderRadius: 6,
    color: isDark ? "#e8e4de" : "#2a2218", fontSize: 11,
  };

  return (
    <div style={styles.dashSection}>
      <div style={{ ...styles.dashSectionTitle, marginBottom: 8 }}>
        Poids
        <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginLeft: 8 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="number"
          step="0.1" min="20" max="300"
          placeholder="—"
          value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
          style={{
            background: isDark ? "#1e231f" : "#e8e3da",
            border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
            borderRadius: 6, color: isDark ? "#e8e4de" : "#2a2218",
            fontSize: 22, fontFamily: "inherit", fontWeight: 700,
            padding: "6px 10px", outline: "none", width: 90,
            textAlign: "center", MozAppearance: "textfield",
          }}
        />
        <span style={{ fontSize: 13, color: isDark ? "#9ca3af" : "#6b7280" }}>kg</span>
        {todayKg != null && (
          <span style={{ fontSize: 11, color: isDark ? "#4ade80" : "#2a7d4f", fontWeight: 600 }}>✓ enregistré</span>
        )}
      </div>
      {chartData.length >= 2 && (
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v} kg`, "Poids"]} />
            <Line type="monotone" dataKey="kg" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: accent }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
      {recent.length > 0 && (
        <div style={{ marginTop: chartData.length >= 2 ? 8 : 0 }}>
          {recent.map(([d, kg]) => (
            <div key={d} style={{ marginBottom: 4, fontSize: 11, color: isDark ? "#9ca3af" : "#6b7280", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, color: isDark ? "#707870" : "#8a7060" }}>{fmtDate(d)}</span>
              <span style={{ fontWeight: 700, color: isDark ? "#cbd5e1" : "#374151" }}>{kg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HOOPER INDEX ─────────────────────────────────────────────────────────────

function hooperLabel(total) {
  if (total <= 14) return "Bien récupéré";
  if (total <= 17) return "Modérément fatigué";
  if (total <= 20) return "Très fatigué";
  return "Surmenage";
}

function hooperColor(total, isDark) {
  if (total <= 14) return isDark ? "#4ade80" : "#2a7d4f";
  if (total <= 17) return "#f97316";
  return "#f87171";
}

function HooperSection({ hoopers, onAdd, range }) {
  const { styles, isDark } = useThemeCtx();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fatigue: null, stress: null, soreness: null, sleep: null });
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = (hoopers || []).find(h => h.date === today);
  const allFilled = form.fatigue && form.stress && form.soreness && form.sleep;
  const total = allFilled ? form.fatigue + form.stress + form.soreness + form.sleep : null;

  const openForm = (editing = false) => {
    if (editing && todayEntry) {
      setForm({ fatigue: todayEntry.fatigue, stress: todayEntry.stress, soreness: todayEntry.soreness, sleep: todayEntry.sleep });
    } else {
      setForm({ fatigue: null, stress: null, soreness: null, sleep: null });
    }
    setOpen(o => !o);
  };

  const handleSave = () => {
    if (!allFilled) return;
    onAdd({
      id: todayEntry?.id || "h_" + Date.now().toString(36),
      date: today,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      ...form, total,
    });
    setForm({ fatigue: null, stress: null, soreness: null, sleep: null });
    setSaved(true); setOpen(false);
    setTimeout(() => setSaved(false), 3000);
  };

  // Build chart data based on range
  const sorted = [...(hoopers || [])].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = (() => {
    if (range === "an") {
      // Group by week, show weekly averages
      const byWeek = {};
      sorted.forEach(h => {
        const mon = getMondayOf(new Date(h.date + "T12:00:00"));
        const k = weekKey(mon);
        if (!byWeek[k]) byWeek[k] = [];
        byWeek[k].push(h.total);
      });
      return Object.entries(byWeek).slice(-52).map(([k, vals]) => {
        const d = new Date(k);
        return {
          date: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`,
          total: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        };
      });
    }
    const days = range === "mois" ? 91 : range === "jour" ? 14 : 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return sorted.filter(h => h.date >= cutoff).map(h => ({
      date: h.date.slice(5).replace("-", "/"),
      total: h.total, fatigue: h.fatigue, stress: h.stress, soreness: h.soreness, sleep: h.sleep,
    }));
  })();

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const CRITERIA = [
    { key: "fatigue",  label: "Fatigue",      sub: "épuisement général" },
    { key: "stress",   label: "Stress",        sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures",   sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",     sub: "1 = excellent · 7 = très mauvais" },
  ];

  const btnBase = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };

  return (
    <div style={styles.dashSection}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ ...styles.dashSectionTitle, marginBottom: 0, flex: 1 }}>Indice Hooper</div>
        {todayEntry && !open && (
          <span style={{ fontSize: 10, color: hooperColor(todayEntry.total, isDark) }}>
            {todayEntry.time} · {todayEntry.total} — {hooperLabel(todayEntry.total)}
          </span>
        )}
        <button
          onClick={() => open ? setOpen(false) : openForm(!todayEntry ? false : true)}
          style={styles.sleepImportBtn}
        >
          {open ? "✕ Fermer" : todayEntry ? "Modifier" : "+ Remplir"}
        </button>
      </div>

      {open && (
        <div style={{ marginBottom: 14, padding: "12px 14px", background: isDark ? "#1e231f" : "#e8e3da", borderRadius: 8 }}>
          {CRITERIA.map(({ key, label, sub }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 110, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 9, opacity: 0.55 }}>{sub}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 7].map(v => {
                  const active = form[key] === v;
                  const bg = active
                    ? (v <= 2 ? (isDark ? "#4ade80" : "#2a7d4f") : v <= 4 ? "#f97316" : "#f87171")
                    : (isDark ? "#2a2f2a" : "#d8d3ca");
                  return (
                    <button key={v} onClick={() => setForm(f => ({ ...f, [key]: v }))}
                      style={{ ...btnBase, background: bg, color: active ? "#fff" : styles.dashText, fontWeight: active ? 600 : 400 }}>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {total !== null && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(total, isDark) }}>
              Indice : {total} — {hooperLabel(total)}
            </div>
          )}
          <button onClick={handleSave} disabled={!allFilled}
            style={{ ...styles.sleepImportBtn, opacity: allFilled ? 1 : 0.4, cursor: allFilled ? "pointer" : "default" }}>
            Enregistrer
          </button>
        </div>
      )}

      {saved && <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 8 }}>Indice enregistré ✓</div>}

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
            <YAxis domain={[4, 28]} ticks={[4, 10, 14, 17, 20, 28]} tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v, n) => [v, n === "total" ? "Hooper" : n]}
            />
            <ReferenceLine y={14} stroke={isDark ? "#4ade8033" : "#2a7d4f33"} strokeDasharray="4 4" />
            <ReferenceLine y={17} stroke="#f9731633" strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke="#f8717133" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="total" name="Hooper" stroke={isDark ? "#4ade80" : "#2a7d4f"}
              strokeWidth={2} dot={{ r: 3, fill: isDark ? "#4ade80" : "#2a7d4f" }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={styles.sleepEmptyMsg}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Remplis ton premier indice pour voir l'évolution</div>
        </div>
      )}
    </div>
  );
}

// ─── PHOTO CROP MODAL ─────────────────────────────────────────────────────────

function PhotoCropModal({ onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const SIZE = 260;
  const OUTPUT = 240;

  const [imgSrc, setImgSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const naturalRef = useRef({ w: 1, h: 1 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const fileRef = useRef(null);
  const cropAreaRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const img = new Image();
      img.onload = () => {
        naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        const fit = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight) * 1.05;
        setScale(fit);
        setPos({ x: 0, y: 0 });
      };
      img.src = src;
      setImgSrc(src);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const getImgStyle = () => {
    const nat = naturalRef.current;
    const w = nat.w * scale;
    const h = nat.h * scale;
    return {
      position: "absolute",
      left: SIZE / 2 + pos.x - w / 2,
      top: SIZE / 2 + pos.y - h / 2,
      width: w, height: h,
      pointerEvents: "none", userSelect: "none", draggable: false,
    };
  };

  const handleMouseDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
  };
  const handleMouseMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, posX, posY } = dragRef.current;
    setPos({ x: posX + (e.clientX - startX), y: posY + (e.clientY - startY) });
  };
  const handleMouseUp = () => { dragRef.current = null; };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setScale(s => Math.max(0.1, Math.min(s * delta, 20)));
  }, []);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, posX: pos.x, posY: pos.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    }
  };
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const { startX, startY, posX, posY } = dragRef.current;
      setPos({ x: posX + (e.touches[0].clientX - startX), y: posY + (e.touches[0].clientY - startY) });
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const ratio = newDist / pinchRef.current.dist;
      setScale(Math.max(0.1, Math.min(pinchRef.current.scale * ratio, 20)));
    }
  }, []);
  const handleTouchEnd = () => { dragRef.current = null; pinchRef.current = null; };

  // Attach wheel + touchmove as non-passive so preventDefault() works
  useEffect(() => {
    const el = cropAreaRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [imgSrc, handleWheel, handleTouchMove]); // re-attach when image loads (el becomes visible)

  const handleConfirm = () => {
    if (!imgSrc) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();
    const img = new Image();
    img.onload = () => {
      const ratio = OUTPUT / SIZE;
      const nat = naturalRef.current;
      const w = nat.w * scale * ratio;
      const h = nat.h * scale * ratio;
      const x = OUTPUT / 2 + pos.x * ratio - w / 2;
      const y = OUTPUT / 2 + pos.y * ratio - h / 2;
      ctx.drawImage(img, x, y, w, h);
      onSave(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = imgSrc;
  };

  const accent = isDark ? "#4ade80" : "#2a7d4f";
  const mutedColor = isDark ? "#707870" : "#8a7f70";
  const textColor = isDark ? "#e8e4de" : "#2a2218";

  return (
    <div style={styles.cropOverlay}>
      <div style={styles.cropModal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: textColor, letterSpacing: "0.08em" }}>RECADRER LA PHOTO</span>
          <button style={{ background: "none", border: "none", color: mutedColor, cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        {!imgSrc ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 14, marginBottom: 12, color: isDark ? "#555" : "#aaa" }}>Photo</div>
            <button
              style={{ background: "none", border: `1px solid ${accent}55`, color: accent, padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
              onClick={() => fileRef.current?.click()}
            >Choisir une photo</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          </div>
        ) : (
          <>
            {/* Crop area — wheel + touchmove attached via useEffect (passive:false) */}
            <div
              ref={cropAreaRef}
              style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto", borderRadius: "50%", overflow: "hidden", cursor: dragRef.current ? "grabbing" : "grab", background: "#000", userSelect: "none" }}
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            >
              <img src={imgSrc} style={getImgStyle()} alt="" />
              {/* Radial gradient to show circle edge */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(circle at center, transparent ${SIZE / 2 - 5}px, rgba(0,0,0,0.55) ${SIZE / 2 - 4}px)` }} />
              {/* SVG circle border — inside the crop div so it never blocks pointer events */}
              <svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} fill="none" stroke={accent} strokeWidth="1.5" />
              </svg>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: mutedColor }}>Glisser · Molette ou pincer pour zoomer</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                style={{ flex: 1, background: "none", border: `1px solid ${isDark ? "#2e3430" : "#bfb9aa"}`, color: mutedColor, padding: "8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={() => fileRef.current?.click()}
              >Changer</button>
              <button
                style={{ flex: 2, background: isDark ? "#263228" : "#d4e8db", border: `1px solid ${accent}66`, color: accent, padding: "8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}
                onClick={handleConfirm}
              >Confirmer</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────

function ProfileView({ data, onUpdateProfile, session, onAuthChange, syncStatus, onUpload, onPull, onImport, toggleTheme, isDark }) {
  const { styles } = useThemeCtx();
  const profile = data.profile || {};

  const [showCrop, setShowCrop] = useState(false);
  const [editName, setEditName] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const importRef = useRef(null);

  // Photo stored in data.profile.avatarDataUrl — syncs via Supabase automatically
  const photoUrl = profile.avatarDataUrl || "";

  const handleSavePhoto = (dataUrl) => {
    onUpdateProfile({ ...profile, avatarDataUrl: dataUrl });
    setShowCrop(false);
  };

  const handleSaveName = () => {
    onUpdateProfile({ ...profile, firstName, lastName });
    setEditName(false);
  };

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planif-escalade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.weeks !== undefined && parsed.weekMeta !== undefined) onImport(parsed);
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const accent = isDark ? "#4ade80" : "#2a7d4f";
  const mutedColor = isDark ? "#707870" : "#8a7f70";
  const textColor = isDark ? "#e8e4de" : "#2a2218";
  const surfaceBg = isDark ? "#1f2421" : "#e8e2d8";
  const borderColor = isDark ? "#252b27" : "#ccc6b8";
  const inputBg = isDark ? "#252b27" : "#ddd7cc";
  const btnBorder = isDark ? "#2e3430" : "#bfb9aa";

  const syncIcon = syncStatus === "saving" ? "⟳" : syncStatus === "saved" ? "✓" : syncStatus === "offline" ? "⚡" : null;
  const syncColor = syncStatus === "saved" ? accent : syncStatus === "offline" ? "#f97316" : mutedColor;

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;

  return (
    <div style={styles.profileView}>
      {/* ── Photo + identité ── */}
      <div style={{ ...styles.profileSection }}>
        <div style={styles.profileSectionTitle}>Profil</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...styles.profileAvatar, borderColor: accent + "55" }} onClick={() => setShowCrop(true)}>
              {photoUrl
                ? <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ fontSize: 28, color: mutedColor }}>?</span>
              }
            </div>
            <span style={styles.profileAvatarHint} onClick={() => setShowCrop(true)}>
              {photoUrl ? "Modifier" : "Ajouter une photo"}
            </span>
          </div>

          {/* Nom */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {editName ? (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                    value={firstName} onChange={e => setFirstName(e.target.value)}
                    placeholder="Prénom" autoFocus
                    onKeyDown={e => e.key === "Enter" && handleSaveName()}
                  />
                  <input
                    style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                    value={lastName} onChange={e => setLastName(e.target.value)}
                    placeholder="Nom de famille"
                    onKeyDown={e => e.key === "Enter" && handleSaveName()}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.profileSaveBtn} onClick={handleSaveName}>Enregistrer</button>
                  <button style={styles.profileCancelBtn} onClick={() => { setFirstName(profile.firstName || ""); setLastName(profile.lastName || ""); setEditName(false); }}>Annuler</button>
                </div>
              </>
            ) : (
              <div
                style={{ cursor: "pointer", padding: "10px 0" }}
                onClick={() => setEditName(true)}
              >
                <div style={{ fontSize: displayName ? 20 : 13, fontWeight: 600, color: displayName ? textColor : mutedColor, letterSpacing: displayName ? "0.02em" : "0.04em" }}>
                  {displayName || "Ajouter un nom"}
                </div>
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>{session?.user?.email || "Non connecté"}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Rôle (lecture seule) ── */}
      {"role" in profile && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Rôle</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: isDark ? "#263228" : "#d4e8db",
              border: `1px solid ${accent}88`,
              color: accent,
              padding: "7px 16px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}>
              {profile.role === "coach" ? "Coach" : profile.role === "athlete" ? "Athlète suivi" : "Athlète solo"}
            </span>
            <span style={{ fontSize: 11, color: mutedColor, fontStyle: "italic" }}>
              {profile.role === "athlete" && "Vos cycles sont en lecture seule. Votre coach les modifie pour vous."}
              {profile.role === "coach" && "Vous pouvez créer et modifier les cycles de vos athlètes."}
              {(profile.role == null) && "Vous gérez votre planning en autonomie."}
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: mutedColor, opacity: 0.7 }}>
            Pour modifier votre rôle, contactez votre administrateur.
          </div>
        </div>
      )}

      {/* ── Connexion ── */}
      {supabase && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Connexion</div>
          <AuthPanel session={session} onAuthChange={onAuthChange} fullWidth />
        </div>
      )}

      {/* ── Apparence ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Apparence</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: textColor }}>Thème</span>
          <button
            onClick={toggleTheme}
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "6px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.06em" }}
          >
            {isDark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
      </div>


      {/* ── Données ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Données</div>
        {/* Cloud sync */}
        {session && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            {syncIcon && <span style={{ fontSize: 12, color: syncColor }}>{syncIcon}</span>}
            {onUpload && (
              <button
                style={{ background: "none", border: `1px solid ${btnBorder}`, color: accent, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={onUpload} title="Envoyer mes données vers le cloud (écraser)"
              >↑ Envoyer vers le cloud</button>
            )}
            {onPull && (
              <button
                style={{ background: "none", border: `1px solid ${btnBorder}`, color: isDark ? "#60a5fa" : "#2563eb", padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={onPull} title="Charger les données depuis le cloud (écraser local)"
              >↓ Charger depuis le cloud</button>
            )}
          </div>
        )}
        {/* Local import/export */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
            onClick={handleExport}
          >↓ Exporter JSON</button>
          <button
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
            onClick={() => importRef.current?.click()}
          >↑ Importer JSON</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
      </div>

      {showCrop && <PhotoCropModal onSave={handleSavePhoto} onClose={() => setShowCrop(false)} />}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function getChartData(data, range, refDate) {
  const today = refDate || new Date();

  if (range === "jour") {
    const monday = getMondayOf(today);
    const key = weekKey(monday);
    const days = data.weeks[key] || [];
    const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    return Array.from({ length: 7 }, (_, i) => {
      const daySessions = (days[i] || []).filter(Boolean);
      const charge = daySessions.reduce((s, se) => s + se.charge, 0);
      const done = daySessions.filter(s => s.feedback?.done === true);
      const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
      const avgRpe = rpeVals.length ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10 : null;
      const d = addDays(monday, i);
      const isToday = d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
      return { label: dayNames[i], charge, avgRpe, planned: daySessions.length, done: done.length, isToday };
    });
  }

  if (range === "an") {
    // Last 12 months grouped by month
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const targetYear = d.getFullYear();
      const targetMonth = d.getMonth();
      let totalCharge = 0, allRpe = [], allDone = 0, allPlanned = 0;
      Object.entries(data.weeks).forEach(([key, days]) => {
        const monday = new Date(key);
        if (monday.getFullYear() === targetYear && monday.getMonth() === targetMonth) {
          const sessions = days.flat().filter(Boolean);
          totalCharge += sessions.reduce((s, se) => s + se.charge, 0);
          const done = sessions.filter(s => s.feedback?.done === true);
          allRpe.push(...done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe));
          allDone += done.length; allPlanned += sessions.length;
        }
      });
      const avgRpe = allRpe.length ? Math.round(allRpe.reduce((a, b) => a + b, 0) / allRpe.length * 10) / 10 : null;
      const label = d.toLocaleDateString("fr-FR", { month: "short" });
      return { label, charge: totalCharge, avgRpe, done: allDone, planned: allPlanned };
    });
  }

  // "sem" = 8 weeks, "mois" = 13 weeks (~3 months)
  const nWeeks = range === "mois" ? 13 : 8;
  return Array.from({ length: nWeeks }, (_, i) => {
    const monday = getMondayOf(addDays(today, -(7 * (nWeeks - 1 - i))));
    const key = weekKey(monday);
    const days = data.weeks[key] || [];
    const sessions = days.flat().filter(Boolean);
    const charge = sessions.reduce((s, se) => s + se.charge, 0);
    const done = sessions.filter(s => s.feedback?.done === true);
    const rpeVals = done.filter(s => s.feedback?.rpe != null).map(s => s.feedback.rpe);
    const avgRpe = rpeVals.length
      ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10
      : null;
    const label = `${monday.getDate().toString().padStart(2, "0")}/${(monday.getMonth() + 1).toString().padStart(2, "0")}`;
    return { label, charge, avgRpe, planned: sessions.length, done: done.length };
  });
}

function Dashboard({ data, onUpdateSleep }) {
  const { styles, isDark } = useThemeCtx();
  const [range, setRange] = useState("sem"); // "sem" | "mois" | "an"
  const [statsRefDate, setStatsRefDate] = useState(() => new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleStatsPrev = () => {
    if (range === "jour" || range === "sem") setStatsRefDate(d => addDays(d, -7));
    else if (range === "mois") setStatsRefDate(d => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
    else setStatsRefDate(d => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  };
  const handleStatsNext = () => {
    if (range === "jour" || range === "sem") setStatsRefDate(d => addDays(d, 7));
    else if (range === "mois") setStatsRefDate(d => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    else setStatsRefDate(d => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
  };

  // Is the statsRefDate within the current period?
  const isCurrentPeriod = (() => {
    const ref = new Date(statsRefDate); ref.setHours(0, 0, 0, 0);
    if (range === "jour" || range === "sem") {
      const refMonday = getMondayOf(ref); const todayMonday = getMondayOf(today);
      return refMonday.getTime() >= todayMonday.getTime();
    }
    if (range === "mois") return ref.getFullYear() > today.getFullYear() || (ref.getFullYear() === today.getFullYear() && ref.getMonth() >= today.getMonth());
    return ref.getFullYear() >= today.getFullYear();
  })();

  // Label for the current period
  const statsPeriodLabel = (() => {
    const ref = statsRefDate;
    if (range === "jour") {
      const monday = getMondayOf(ref);
      return `${formatDate(monday)} — ${formatDate(addDays(monday, 6))}`;
    }
    if (range === "sem") {
      const nWeeks = 8;
      const endMonday = getMondayOf(ref);
      const startMonday = getMondayOf(addDays(endMonday, -(7 * (nWeeks - 1))));
      return `${formatDate(startMonday)} — ${formatDate(addDays(endMonday, 6))}`;
    }
    if (range === "mois") {
      const nWeeks = 13;
      const endMonday = getMondayOf(ref);
      const startMonday = getMondayOf(addDays(endMonday, -(7 * (nWeeks - 1))));
      return `${formatDate(startMonday)} — ${formatDate(addDays(endMonday, 6))}`;
    }
    return ref.toLocaleDateString("fr-FR", { year: "numeric" });
  })();

  const chartData = getChartData(data, range, statsRefDate);

  const totalCharge4w = getChartData(data, "sem").slice(4).reduce((s, w) => s + w.charge, 0);
  const rpeVals = chartData.filter(w => w.avgRpe != null).map(w => w.avgRpe);
  const globalAvgRpe = rpeVals.length
    ? (rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)
    : "—";

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const rangeLabel = { jour: "cette semaine", sem: "8 semaines", mois: "3 mois", an: "12 mois" }[range];

  const RangeBtn = ({ r, label }) => (
    <button onClick={() => { setRange(r); setStatsRefDate(new Date()); }}
      style={{ ...styles.viewToggleBtn, ...(range === r ? styles.viewToggleBtnActive : {}), padding: "3px 9px", fontSize: 10 }}>
      {label}
    </button>
  );

  return (
    <div style={styles.dashboard}>
      {/* Range selector row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 4 }}>
        <div style={{ ...styles.dashTitle, marginBottom: 0, flex: 1 }}>Statistiques</div>
        <RangeBtn r="jour" label="Jours" />
        <RangeBtn r="sem" label="Sem" />
        <RangeBtn r="mois" label="Mois" />
        <RangeBtn r="an" label="An" />
      </div>
      {/* Period navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, gap: 8 }}>
        <button style={styles.navBtn} onClick={handleStatsPrev}>←</button>
        <div
          style={{ textAlign: "center", minWidth: 190, cursor: isCurrentPeriod ? "default" : "pointer" }}
          onClick={isCurrentPeriod ? undefined : () => setStatsRefDate(new Date())}
          title={isCurrentPeriod ? undefined : "Aller à la période en cours"}
        >
          <div style={styles.weekRange}>{statsPeriodLabel}</div>
          {isCurrentPeriod && <div style={styles.weekCurrent}>Période actuelle</div>}
        </div>
        <button style={{ ...styles.navBtn, visibility: isCurrentPeriod ? "hidden" : "visible" }} onClick={handleStatsNext}>→</button>
      </div>

      <div style={{ ...styles.dashCards, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{totalCharge4w}</span>
          <span style={styles.dashCardLabel}>Charge 4 sem.</span>
        </div>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{globalAvgRpe}</span>
          <span style={styles.dashCardLabel}>RPE moyen</span>
        </div>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Charge — {rangeLabel}</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
            <YAxis tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "#ffffff08" : "#00000008" }} />
            <Bar dataKey="charge" name="Charge" fill={isDark ? "#4ade80" : "#2a7d4f"} radius={[3, 3, 0, 0]} maxBarSize={36}>
              {range === "jour" && chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isToday ? (isDark ? "#facc15" : "#ca8a04") : (isDark ? "#4ade80" : "#2a7d4f")} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>RPE moyen — {rangeLabel}</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
            <YAxis domain={[0, 10]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="avgRpe" name="RPE" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SleepSection sleepData={data.sleep || []} onImport={onUpdateSleep} range={range} />
    </div>
  );
}

// ─── JOURNAL QUOTIDIEN ──────────────────────────────────────────────────────

function DayLogModal({ initialDate, data, onClose, onSaveNote, onToggleCreatine, onSaveWeight, onAddHooper }) {
  const { isDark } = useThemeCtx();
  const today = new Date().toISOString().slice(0, 10);
  const [dateISO, setDateISO] = useState(initialDate);
  const dateObj = new Date(dateISO + "T12:00:00");
  const isToday = dateISO === today;
  const isFutureDay = dateISO > today;

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Notes
  const [noteText, setNoteText] = useState(data.notes?.[dateISO] || "");
  const [noteSaved, setNoteSaved] = useState(data.notes?.[dateISO] || "");
  useEffect(() => {
    setNoteText(data.notes?.[dateISO] || "");
    setNoteSaved(data.notes?.[dateISO] || "");
  }, [dateISO]);
  const noteDirty = noteText !== noteSaved;

  // Weight
  const [weightInput, setWeightInput] = useState(
    data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : ""
  );
  useEffect(() => {
    setWeightInput(data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "");
  }, [dateISO]);
  const weightSavedStr = data.weight?.[dateISO] != null ? String(data.weight[dateISO]) : "";
  const weightDirty = weightInput.trim() !== weightSavedStr;

  // Creatine
  const hasCreatine = !!data.creatine?.[dateISO];
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));

  // Hooper
  const HCRIT = [
    { key: "fatigue",  label: "Fatigue",    sub: "épuisement général" },
    { key: "stress",   label: "Stress",      sub: "mental / émotionnel" },
    { key: "soreness", label: "Courbatures", sub: "douleurs musculaires" },
    { key: "sleep",    label: "Sommeil ↓",   sub: "1 = excellent · 7 = très mauvais" },
  ];
  const existingH = (data.hooper || []).find(h => h.date === dateISO);
  const [hForm, setHForm] = useState(
    existingH
      ? { fatigue: existingH.fatigue, stress: existingH.stress, soreness: existingH.soreness, sleep: existingH.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
  );
  useEffect(() => {
    const h = (data.hooper || []).find(e => e.date === dateISO);
    setHForm(h
      ? { fatigue: h.fatigue, stress: h.stress, soreness: h.soreness, sleep: h.sleep }
      : { fatigue: null, stress: null, soreness: null, sleep: null }
    );
  }, [dateISO]);
  const hAllFilled = hForm.fatigue && hForm.stress && hForm.soreness && hForm.sleep;
  const hTotal = hAllFilled ? hForm.fatigue + hForm.stress + hForm.soreness + hForm.sleep : null;
  const hFormDirty = existingH
    ? (hForm.fatigue !== existingH.fatigue || hForm.stress !== existingH.stress ||
       hForm.soreness !== existingH.soreness || hForm.sleep !== existingH.sleep)
    : hAllFilled;
  const hCanSave = hAllFilled && (!existingH || hFormDirty);

  // Unified save
  const [savedAnim, setSavedAnim] = useState(false);
  const anyDirty = noteDirty || weightDirty || hCanSave;
  const handleSaveAll = () => {
    if (!anyDirty) return;
    if (noteDirty) { onSaveNote(dateISO, noteText); setNoteSaved(noteText); }
    if (weightDirty) {
      const val = parseFloat(weightInput.replace(",", "."));
      if (!isNaN(val) && val > 0) onSaveWeight(dateISO, Math.round(val * 10) / 10);
      else if (weightInput.trim() === "") onSaveWeight(dateISO, null);
    }
    if (hCanSave) {
      onAddHooper({ date: dateISO, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), ...hForm, total: hTotal });
    }
    setSavedAnim(true);
    setTimeout(() => onClose(), 700);
  };

  const bg = isDark ? "#161b17" : "#f5f0e8";
  const border = isDark ? "#2a2f2a" : "#d4cfc7";
  const sectionBg = isDark ? "#1e231f" : "#e8e3da";
  const textMain = isDark ? "#e8e4de" : "#2a2218";
  const textMuted = isDark ? "#9ca3af" : "#6b7280";
  const accentGreen = isDark ? "#4ade80" : "#2a7d4f";
  const borderStyle = `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`;
  const sLabel = { fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, display: "block" };
  const btnNum = { width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "all 0.12s" };
  const dateFull = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, backdropFilter: "blur(4px)", padding: "20px 12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>

        {/* Header navigation */}
        <div style={{ position: "sticky", top: 0, background: bg, borderBottom: `1px solid ${border}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, zIndex: 1 }}>
          <button
            onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), -1).toISOString().slice(0, 10))}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 22, padding: "0 6px", lineHeight: 1, fontFamily: "inherit" }}
          >‹</button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: textMain, textTransform: "capitalize" }}>{dateFull}</div>
            {isToday && <div style={{ fontSize: 10, color: accentGreen, letterSpacing: "0.06em" }}>{"AUJOURD'HUI"}</div>}
            {isFutureDay && <div style={{ fontSize: 10, color: textMuted, letterSpacing: "0.06em" }}>{"À VENIR"}</div>}
          </div>
          <button
            onClick={() => setDateISO(prev => addDays(new Date(prev + "T12:00:00"), 1).toISOString().slice(0, 10))}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 22, padding: "0 6px", lineHeight: 1, fontFamily: "inherit" }}
          >›</button>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 18, padding: "0 6px", marginLeft: 4, lineHeight: 1, fontFamily: "inherit" }}
          >✕</button>
        </div>

        <div style={{ padding: "18px 18px 24px" }}>

          {/* Notes */}
          <div style={{ marginBottom: 22 }}>
            <span style={sLabel}>Notes</span>
            <textarea
              style={{ width: "100%", boxSizing: "border-box", background: sectionBg, border: borderStyle, borderRadius: 8, color: textMain, fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, padding: "10px 12px", resize: "vertical", minHeight: 80, outline: "none" }}
              placeholder="Comment tu te sens ? Observations..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
          </div>

          {/* Poids */}
          <div style={{ marginBottom: 22 }}>
            <span style={sLabel}>Poids</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="number" step="0.1" min="20" max="300" placeholder="—"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                style={{ background: sectionBg, border: borderStyle, borderRadius: 8, color: textMain, fontSize: 22, fontFamily: "inherit", fontWeight: 700, padding: "6px 12px", outline: "none", width: 100, textAlign: "center" }}
              />
              <span style={{ fontSize: 14, color: textMuted }}>kg</span>
            </div>
          </div>

          {/* Créatine */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ ...sLabel, marginBottom: 0 }}>Créatine</span>
              {isInCreatineCycle && !hasCreatine && (
                <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 600 }}>⚠ cycle actif — non prise</span>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={hasCreatine} onChange={() => onToggleCreatine(dateISO)}
                style={{ cursor: "pointer", width: 16, height: 16, accentColor: accentGreen }} />
              <span style={{ fontSize: 14, color: textMain }}>
                Créatine prise
                {hasCreatine && <span style={{ marginLeft: 8, fontSize: 11, color: accentGreen }}>▲</span>}
              </span>
            </label>
          </div>

          {/* Hooper */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ ...sLabel, marginBottom: 0 }}>Indice Hooper</span>
              {existingH && (
                <span style={{ fontSize: 11, color: hooperColor(existingH.total, isDark) }}>
                  {existingH.total} — {hooperLabel(existingH.total)}
                </span>
              )}
            </div>
            {HCRIT.map(({ key, label, sub }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 100, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: textMain }}>{label}</div>
                  <div style={{ fontSize: 9, color: textMuted }}>{sub}</div>
                </div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5, 6, 7].map(v => {
                    const active = hForm[key] === v;
                    const btnBg = active ? (v <= 2 ? accentGreen : v <= 4 ? "#f97316" : "#f87171") : sectionBg;
                    return (
                      <button key={v} onClick={() => setHForm(f => ({ ...f, [key]: v }))}
                        style={{ ...btnNum, background: btnBg, color: active ? "#fff" : textMain, fontWeight: active ? 600 : 400 }}>
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {hTotal !== null && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: hooperColor(hTotal, isDark) }}>
                Indice : {hTotal} — {hooperLabel(hTotal)}
              </div>
            )}
          </div>

        </div>

        {/* ── Sticky save button ── */}
        <div style={{ position: "sticky", bottom: 0, background: bg, borderTop: `1px solid ${border}`, padding: "14px 18px" }}>
          <button
            onClick={handleSaveAll}
            disabled={!anyDirty || savedAnim}
            style={{
              width: "100%",
              background: savedAnim ? (isDark ? "#166534" : "#15803d") : anyDirty ? accentGreen : sectionBg,
              border: "none", borderRadius: 8,
              color: savedAnim ? "#86efac" : anyDirty ? "#fff" : textMuted,
              padding: "12px 20px",
              cursor: anyDirty && !savedAnim ? "pointer" : "default",
              fontSize: savedAnim ? 14 : 13, fontFamily: "inherit", fontWeight: 700,
              opacity: anyDirty || savedAnim ? 1 : 0.45,
              boxShadow: savedAnim ? `0 0 0 2px ${accentGreen}88` : anyDirty ? `0 2px 12px ${accentGreen}44` : "inset 0 1px 3px rgba(0,0,0,0.25)",
              transform: savedAnim ? "scale(1.02)" : anyDirty ? "none" : "translateY(1px)",
              transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
              letterSpacing: savedAnim ? "0.04em" : "0",
            }}
          >
            {savedAnim ? "Enregistré ✓" : "Enregistrer"}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── COACH : COMPOSITEUR DE SÉANCE ───────────────────────────────────────────

function SessionComposerModal({ initial, availableBlocks, onSave, onClose }) {
  const { isDark } = useThemeCtx();

  // initial?.blocks = array de blocs déjà enregistrés
  const [name,    setName]   = useState(initial?.name ?? "");
  const [composition, setComposition] = useState(() =>
    (initial?.blocks ?? []).map((b, i) => ({ ...b, _key: i }))
  );
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("Tous");

  const surface = isDark ? "#1c2820" : "#ffffff";
  const bg      = isDark ? "#141a16" : "#f3f7f4";
  const border  = isDark ? "#263228" : "#daeade";
  const text    = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted   = isDark ? "#6a8870" : "#6b8c72";
  const accent  = "#4caf72";

  const totalCharge   = composition.reduce((a, b) => a + (b.charge   || 0), 0);
  const totalDuration = composition.reduce((a, b) => a + (b.duration || 0), 0);

  const addBlock = (block) =>
    setComposition(prev => [...prev, { ...block, _key: Date.now() + Math.random() }]);

  const removeBlock = (key) =>
    setComposition(prev => prev.filter(b => b._key !== key));

  const moveBlock = (idx, dir) => {
    setComposition(prev => {
      if (idx + dir < 0 || idx + dir >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim() || composition.length === 0) return;
    const cleanBlocks = composition.map(({ _key, ...b }) => b);
    // Dérive le type depuis le premier bloc Grimpe trouvé, sinon "Exercice"
    const mainType = cleanBlocks.find(b => b.blockType === "Grimpe") ? "Grimpe" : "Exercice";
    onSave({
      ...(initial ?? {}),
      id: initial?.id,
      name: name.trim(),
      type: mainType,
      charge: totalCharge,
      estimatedTime: totalDuration || null,
      blocks: cleanBlocks,
      isCustom: true,
    });
  };

  const canSave = name.trim().length > 0 && composition.length > 0;

  const filteredAvailable = availableBlocks.filter(b =>
    (filter === "Tous" || b.blockType === filter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle = { background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 11px", color: text, fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 50px #0009", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{initial ? "Modifier la séance" : "Nouvelle séance"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Nom ── */}
        <div style={{ padding: "14px 20px 10px", borderBottom: `1px solid ${border}` }}>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 14, fontWeight: 600 }}
            placeholder="Nom de la séance…"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── Composition ── */}
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Composition — {composition.length} bloc{composition.length !== 1 ? "s" : ""}
              </span>
              {composition.length > 0 && (
                <span style={{ fontSize: 11, color: muted }}>
                  {totalDuration > 0 && <span>⏱ {totalDuration} min  </span>}
                  {totalCharge > 0 && <span style={{ color: getChargeColor(totalCharge) }}>⚡{totalCharge}</span>}
                </span>
              )}
            </div>

            {composition.length === 0 ? (
              <div style={{ textAlign: "center", padding: "18px 0", color: muted, fontSize: 12, border: `1px dashed ${border}`, borderRadius: 8 }}>
                Sélectionnez des blocs ci-dessous pour construire la séance
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {composition.map((b, idx) => {
                  const cfg = BLOCK_TYPES[b.blockType] || {};
                  return (
                    <div key={b._key} style={{ display: "flex", alignItems: "center", gap: 8, background: bg, border: `1px solid ${border}`, borderLeft: `3px solid ${cfg.color || "#888"}`, borderRadius: 6, padding: "7px 10px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color || "#888", flexShrink: 0, display: "inline-block" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                        <div style={{ fontSize: 10, color: muted }}>
                          {b.blockType}
                          {b.duration && <span>  ·  {b.duration} min</span>}
                          {cfg.hasCharge && b.charge > 0 && <span style={{ color: getChargeColor(b.charge) }}>  ·  ⚡{b.charge}</span>}
                        </div>
                      </div>
                      {/* Ordre */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                        <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? border : muted, cursor: idx === 0 ? "default" : "pointer", fontSize: 10, lineHeight: 1, padding: "1px 4px" }}>▲</button>
                        <button onClick={() => moveBlock(idx, 1)} disabled={idx === composition.length - 1} style={{ background: "none", border: "none", color: idx === composition.length - 1 ? border : muted, cursor: idx === composition.length - 1 ? "default" : "pointer", fontSize: 10, lineHeight: 1, padding: "1px 4px" }}>▼</button>
                      </div>
                      <button onClick={() => removeBlock(b._key)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 4, color: isDark ? "#f87171" : "#dc2626", padding: "3px 7px", cursor: "pointer", fontSize: 12, lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Séparateur ── */}
          <div style={{ margin: "12px 20px 0", borderTop: `1px solid ${border}` }} />

          {/* ── Bibliothèque de blocs ── */}
          <div style={{ padding: "10px 20px 6px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Ajouter un bloc
            </div>
            <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                placeholder="Rechercher…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {["Tous", ...Object.keys(BLOCK_TYPES)].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit",
                  border: `1px solid ${filter === f ? accent + "88" : border}`,
                  background: filter === f ? (isDark ? "#263228" : "#d4e8db") : "none",
                  color: filter === f ? accent : muted,
                }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* ── Liste de blocs disponibles ── */}
          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
            {availableBlocks.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: muted, fontSize: 12 }}>
                Aucun bloc en bibliothèque — créez-en dans l'onglet Blocs.
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div style={{ padding: "16px 20px", textAlign: "center", color: muted, fontSize: 12 }}>Aucun résultat</div>
            ) : (
              filteredAvailable.map(b => {
                const cfg = BLOCK_TYPES[b.blockType] || {};
                return (
                  <div
                    key={b.id}
                    onClick={() => addBlock(b)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", cursor: "pointer", borderBottom: `1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? "#1a2c22" : "#f0faf4"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color || "#888", flexShrink: 0, display: "inline-block" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                      <div style={{ fontSize: 10, color: muted }}>
                        {b.blockType}
                        {b.duration && <span>  ·  {b.duration} min</span>}
                        {cfg.hasCharge && b.charge > 0 && <span style={{ color: getChargeColor(b.charge) }}>  ·  ⚡{b.charge}</span>}
                      </div>
                    </div>
                    <span style={{ color: accent, fontSize: 18, fontWeight: 300, flexShrink: 0, lineHeight: 1 }}>＋</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 20px", borderTop: `1px solid ${border}` }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 7, color: muted, padding: "9px 18px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{ background: canSave ? accent : (isDark ? "#1e2b22" : "#c8e6d4"), border: "none", borderRadius: 7, color: canSave ? "#fff" : muted, padding: "9px 22px", cursor: canSave ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}
          >
            {initial ? "Enregistrer" : "Créer la séance"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COACH : BIBLIOTHÈQUE DE SÉANCES ─────────────────────────────────────────

// ── Modal formulaire de bloc ──────────────────────────────────────────────────
function BlockFormModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const blockTypeKeys = Object.keys(BLOCK_TYPES);

  const [blockType,      setBlockType]      = useState(initial?.blockType ?? "Grimpe");
  const [name,           setName]           = useState(initial?.name      ?? "");
  const [duration,       setDuration]       = useState(initial?.duration  ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultDuration);
  const [charge,         setCharge]         = useState(initial?.charge    ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultCharge);
  const [desc,           setDesc]           = useState(initial?.description ?? "");
  const [preview,        setPreview]        = useState(false);

  // Calculateur de charge
  const [calcOpen,       setCalcOpen]       = useState(false);
  const [infoOpen,       setInfoOpen]       = useState(false);
  const [nbMouvements,   setNbMouvements]   = useState("");
  const [calcZone,       setCalcZone]       = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);

  const cfg    = BLOCK_TYPES[blockType] || BLOCK_TYPES["Grimpe"];
  const bg     = isDark ? "#141a16" : "#f3f7f4";
  const surface= isDark ? "#1c2820" : "#ffffff";
  const border = isDark ? "#263228" : "#daeade";
  const text   = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted  = isDark ? "#6a8870" : "#6b8c72";

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? ("blk_" + Math.random().toString(36).slice(2) + Date.now()),
      blockType,
      name: name.trim(),
      duration: duration ? +duration : null,
      charge: cfg.hasCharge ? +charge : 0,
      description: desc.trim() || "",
    });
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", color: text, fontSize: 13, fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, display: "block" };

  const volZone  = getNbMouvementsZone(+nbMouvements);
  const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 50px #0009", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{initial ? "Modifier le bloc" : "Nouveau bloc"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Corps scrollable ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Type */}
          <div>
            <span style={labelStyle}>Type de bloc</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {blockTypeKeys.map(t => {
                const c = BLOCK_TYPES[t].color;
                const active = blockType === t;
                return (
                  <button key={t} onClick={() => { setBlockType(t); if (!initial) { setDuration(BLOCK_TYPES[t].defaultDuration); setCharge(BLOCK_TYPES[t].defaultCharge); } }}
                    style={{ padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: active ? 700 : 400, border: `1px solid ${active ? c : border}`, background: active ? c + "28" : "none", color: active ? c : muted }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nom */}
          <div>
            <span style={labelStyle}>Nom du bloc</span>
            <input style={inputStyle} placeholder="Ex : Campus board 4×5 mouvements…" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          {/* Durée */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={labelStyle}>Durée (min)</span>
              <input style={inputStyle} type="number" min="1" max="240" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
          </div>

          {/* ── Charge (only for hasCharge types) ── */}
          {cfg.hasCharge && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ ...labelStyle, marginBottom: 0 }}>Charge d'entraînement</span>
                <button style={styles.calcBtn} onClick={() => { setCalcOpen(o => !o); setInfoOpen(false); }}>Calculateur</button>
                <button style={{ ...styles.calcBtn, background: "none" }} onClick={() => { setInfoOpen(o => !o); setCalcOpen(false); }}>Infos</button>
              </div>

              <div style={styles.customFormChargeRow}>
                <span style={{ ...styles.customFormChargeVal, color: getChargeColor(charge) }}>{charge}</span>
                <input style={styles.customFormSlider} type="range" min="0" max="216" value={charge} onChange={e => setCharge(+e.target.value)} />
              </div>

              {/* Calculateur inline */}
              {calcOpen && (
                <div style={styles.calcPanel}>
                  <div style={styles.calcRow}>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Nb de mouvements</span>
                      <input style={styles.calcInput} type="number" min="1" placeholder="ex: 40" value={nbMouvements} onChange={e => setNbMouvements(e.target.value)} />
                      {nbMouvements && (
                        <span style={styles.calcVolumeHint}>→ Zone {volZone} · {VOLUME_ZONES[volZone - 1].label} ({VOLUME_ZONES[volZone - 1].range})</span>
                      )}
                    </div>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Zone d'intensité</span>
                      <select style={styles.calcSelect} value={calcZone} onChange={e => setCalcZone(+e.target.value)}>
                        {INTENSITY_ZONES.map(z => <option key={z.index} value={z.index}>{z.index} – {z.label}</option>)}
                      </select>
                    </div>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Complexité</span>
                      <select style={styles.calcSelect} value={calcComplexity} onChange={e => setCalcComplexity(+e.target.value)}>
                        {COMPLEXITY_ZONES.map(z => <option key={z.index} value={z.index}>{z.index} – {z.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {computed !== null && (
                    <div style={styles.calcResultRow}>
                      <span style={{ ...styles.calcResultVal, color: getChargeColor(computed) }}>{computed}</span>
                      <span style={{ fontSize: 11, color: muted }}>= Zone vol.{volZone} × Int.{calcZone} × Compl.{calcComplexity}</span>
                      <button style={styles.calcApplyBtn} onClick={() => { setCharge(computed); setCalcOpen(false); }}>Appliquer →</button>
                    </div>
                  )}
                </div>
              )}

              {/* Tables de référence */}
              {infoOpen && (
                <div style={styles.infoOverlay} onClick={() => setInfoOpen(false)}>
                  <div style={styles.infoPanel} onClick={e => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                      <span style={styles.modalTitle}>Référence — Calcul de charge</span>
                      <button style={styles.closeBtn} onClick={() => setInfoOpen(false)}>✕</button>
                    </div>
                    <div style={styles.infoPanelBody}>
                      <div>
                        <div style={styles.infoTableTitle}>1 · Volume (nb de mouvements → zone)</div>
                        <table style={styles.infoTable}>
                          <thead><tr><th style={styles.infoTh}>Zone</th><th style={styles.infoTh}>Catégorie</th><th style={styles.infoTh}>Nb mouvements</th></tr></thead>
                          <tbody>
                            {VOLUME_ZONES.map(z => (
                              <tr key={z.index}>
                                <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span></td>
                                <td style={styles.infoTd}>{z.label}</td>
                                <td style={styles.infoTd}>{z.range}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <div style={styles.infoTableTitle}>2 · Intensité</div>
                        <table style={styles.infoTable}>
                          <thead><tr><th style={styles.infoTh}>Zone</th><th style={styles.infoTh}>Intensité</th><th style={styles.infoTh}>Description</th></tr></thead>
                          <tbody>
                            {INTENSITY_ZONES.map(z => (
                              <tr key={z.index}>
                                <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span></td>
                                <td style={styles.infoTd}>{z.label}</td>
                                <td style={styles.infoTd}>{z.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <div style={styles.infoTableTitle}>3 · Complexité</div>
                        <table style={styles.infoTable}>
                          <thead><tr><th style={styles.infoTh}>Zone</th><th style={styles.infoTh}>Complexité</th><th style={styles.infoTh}>Description</th></tr></thead>
                          <tbody>
                            {COMPLEXITY_ZONES.map(z => (
                              <tr key={z.index}>
                                <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span></td>
                                <td style={styles.infoTd}>{z.label}</td>
                                <td style={styles.infoTd}>{z.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: 11, color: muted, fontStyle: "italic" }}>Formule : Charge = Zone volume × Zone intensité × Index complexité (max 216)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Consignes (markdown) ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Consignes</span>
              <button onClick={() => setPreview(p => !p)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 4, color: preview ? text : muted, padding: "3px 10px", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>
                {preview ? "Éditer" : "Aperçu"}
              </button>
            </div>
            {preview ? (
              <div style={{ ...inputStyle, minHeight: 120, padding: "10px 12px", lineHeight: 1.6 }}>
                <RichText text={desc} />
              </div>
            ) : (
              <textarea
                style={{ ...inputStyle, minHeight: 120, resize: "vertical", lineHeight: 1.6 }}
                placeholder={"Protocole, répétitions, intensité cible…\n\n* puce\n**gras**\n[ ] checkbox\n[x] checkbox coché"}
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            )}
            <div style={{ fontSize: 10, color: muted, marginTop: 5 }}>
              Syntaxe : <code style={{ opacity: 0.8 }}>* puce</code> · <code style={{ opacity: 0.8 }}>**gras**</code> · <code style={{ opacity: 0.8 }}>[ ] checkbox</code> · <code style={{ opacity: 0.8 }}>`code`</code>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 20px", borderTop: `1px solid ${border}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, color: muted, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
          <button onClick={handleSave} disabled={!name.trim()}
            style={{ background: name.trim() ? cfg.color : (isDark ? "#1e2b22" : "#c8e6d4"), border: "none", borderRadius: 6, color: name.trim() ? "#fff" : muted, padding: "8px 20px", cursor: name.trim() ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>
            {initial ? "Enregistrer" : "Créer le bloc"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vue bibliothèque coach ────────────────────────────────────────────────────
function CoachLibraryView({ catalog, onNew, onEdit, onDelete, blocks, onNewBlock, onEditBlock, onDeleteBlock }) {
  const { isDark } = useThemeCtx();
  const [subTab,     setSubTab]     = useState("sessions"); // "sessions" | "blocks"
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("Tous");
  const [confirmId,  setConfirmId]  = useState(null);
  const [blockForm,  setBlockForm]  = useState(null); // null | { initial? }

  const bg      = isDark ? "#141a16" : "#f3f7f4";
  const surface = isDark ? "#1a2320" : "#ffffff";
  const border  = isDark ? "#263228" : "#daeade";
  const text    = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted   = isDark ? "#6a8870" : "#6b8c72";
  const accent  = "#4caf72";
  const danger  = isDark ? "#f87171" : "#dc2626";

  // ── Shared item row ──
  const ItemActions = ({ id, onEdit: doEdit, onDel }) => confirmId === id ? (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <button onClick={() => { onDel(id); setConfirmId(null); }} style={{ background: danger, border: "none", borderRadius: 5, color: "#fff", padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>Supprimer</button>
      <button onClick={() => setConfirmId(null)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: muted, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Annuler</button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button onClick={doEdit} title="Modifier" style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: muted, padding: "5px 9px", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✎</button>
      <button onClick={() => setConfirmId(id)} title="Supprimer" style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: danger + "bb", padding: "5px 9px", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
    </div>
  );

  // ── Séances tab — toutes les séances (communautaires) ──
  const allSessions = catalog; // plus de filtre isCustom
  const filteredSessions = allSessions.filter(s => {
    const matchType   = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });
  const byType = {};
  filteredSessions.forEach(s => { (byType[s.type] = byType[s.type] || []).push(s); });

  // ── Blocs tab ──
  const filteredBlocks = (blocks || []).filter(b =>
    (filter === "Tous" || b.blockType === filter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  );
  const byBlockType = {};
  filteredBlocks.forEach(b => { (byBlockType[b.blockType] = byBlockType[b.blockType] || []).push(b); });

  const isSessionTab = subTab === "sessions";
  const filterOptions = isSessionTab ? ["Tous", "Grimpe", "Exercice"] : ["Tous", ...Object.keys(BLOCK_TYPES)];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: bg, padding: "20px 16px" }}>
      <div style={{ maxWidth: 660, margin: "0 auto" }}>

        {/* ── Sub-tabs ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 22, background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: 3 }}>
          {[{ key: "sessions", label: "Séances" }, { key: "blocks", label: "Blocs" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSubTab(key); setSearch(""); setFilter("Tous"); setConfirmId(null); }}
              style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: subTab === key ? (isDark ? "#263228" : "#d4e8db") : "none",
                color: subTab === key ? accent : muted,
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── Header : titre + bouton ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>
              {isSessionTab ? "Mes séances" : "Mes blocs"}
            </div>
            <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>
              {isSessionTab
                ? `${allSessions.length} séance${allSessions.length !== 1 ? "s" : ""}`
                : `${(blocks || []).length} bloc${(blocks || []).length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button
            onClick={isSessionTab ? onNew : () => setBlockForm({})}
            style={{ background: accent, border: "none", borderRadius: 7, color: "#fff", padding: "9px 16px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.03em", boxShadow: `0 2px 10px ${accent}44` }}
          >
            ＋ {isSessionTab ? "Nouvelle séance" : "Nouveau bloc"}
          </button>
        </div>

        {/* ── Recherche + filtres ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <input
            style={{ flex: 1, minWidth: 160, background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 12px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none" }}
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {filterOptions.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                  fontWeight: filter === f ? 600 : 400,
                  background: filter === f ? (isDark ? "#263228" : "#d4e8db") : "none",
                  border: `1px solid ${filter === f ? accent + "88" : border}`,
                  color: filter === f ? accent : muted,
                }}
              >{f}</button>
            ))}
          </div>
        </div>

        {/* ══ SÉANCES ══ */}
        {isSessionTab && (
          allSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: muted }}>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: text }}>Aucune séance</div>
              <div style={{ fontSize: 12 }}>Créez vos premières séances pour les retrouver dans le calendrier.</div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: muted, fontSize: 12 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byType).map(([type, sessions]) => (
              <div key={type} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${border}` }}>{type}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map(s => (
                    <div key={s.id} style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${getChargeColor(s.charge)}`, borderRadius: 7, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: muted, display: "flex", gap: 10 }}>
                          {s.estimatedTime && <span>{s.estimatedTime} min</span>}
                          {s.location     && <span>{s.location}</span>}
                          {s.minRecovery  && <span>↺ {s.minRecovery}h récup</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 4, flexShrink: 0, background: getChargeColor(s.charge) + "28", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>⚡{s.charge}</span>
                      <ItemActions id={s.id} onEdit={() => onEdit(s)} onDel={onDelete} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        )}

        {/* ══ BLOCS ══ */}
        {!isSessionTab && (
          (blocks || []).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: muted }}>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: text }}>Aucun bloc</div>
              <div style={{ fontSize: 12 }}>Créez des blocs réutilisables (exercices, protocoles) à assembler dans vos séances.</div>
            </div>
          ) : filteredBlocks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: muted, fontSize: 12 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byBlockType).map(([btype, blist]) => {
              const cfg = BLOCK_TYPES[btype] || {};
              return (
                <div key={btype} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: cfg.color || muted, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${border}` }}>
                    {btype}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {blist.map(b => (
                      <div key={b.id} style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${cfg.color || "#888"}`, borderRadius: 7, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                          <div style={{ fontSize: 10, color: muted, display: "flex", gap: 10 }}>
                            {b.duration    && <span>⏱ {b.duration} min</span>}
                            {cfg.hasCharge && b.charge > 0 && <span style={{ color: getChargeColor(b.charge) }}>⚡{b.charge}</span>}
                            {b.description && <span style={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.description}</span>}
                          </div>
                        </div>
                        <ItemActions id={b.id} onEdit={() => setBlockForm({ initial: b })} onDel={onDeleteBlock} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* ── Modal bloc ── */}
      {blockForm !== null && (
        <BlockFormModal
          initial={blockForm.initial}
          onSave={b => { (blockForm.initial ? onEditBlock : onNewBlock)(b); setBlockForm(null); }}
          onClose={() => setBlockForm(null)}
        />
      )}
    </div>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function ClimbingPlanner() {
  const [data, setData] = useState(loadData);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("week");
  const [sessionBuilderDay, setSessionBuilderDay] = useState(null); // null | dayIndex
  const [picker, setPicker] = useState(null);
  const [metaEditing, setMetaEditing] = useState(false);
  const [tempMeta, setTempMeta] = useState({});
  const [customSessionForm,   setCustomSessionForm]   = useState(null); // null | { initial?, targetDay? }
  const [sessionComposerForm, setSessionComposerForm] = useState(null); // null | { initial? }  — coach only
  const [sessionModal, setSessionModal] = useState(null); // null | { weekKey, dayIndex, sessionIndex }
  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") !== "light");
  const [logDate, setLogDate] = useState(null); // ISO string of day log modal

  const styles = makeStyles(isDark);
  const toggleTheme = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  const { session, setSession, syncStatus, loadFromCloud, saveToCloud, uploadNow, writeStatus } = useSupabaseSync();
  const { communitySessions, pushToCommunity, deleteFromCommunity } = useCommunitySessionsSync(session);
  const { catalog, saveUserSession, deleteUserSession } = useSessionsCatalog(session?.user?.id);
  const { blocks: dbBlocks, saveBlock, deleteBlock } = useSessionBlocks(session?.user?.id);

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
    loadFromCloud().then(cloudData => {
      setCloudLoaded(true);
      if (cloudData) {
        setData(cloudData);
        saveData(cloudData);
      } else {
        // Cloud empty → push local data up immediately
        uploadNow(data, session.user.id);
      }
    });
  }, [session, cloudLoaded, loadFromCloud, uploadNow]);

  // Phase 2b : re-lire le status depuis la DB à chaque changement de session
  // (sans écraser toutes les données locales)
  useEffect(() => {
    if (!session) { setCloudLoaded(false); return; }
    if (!cloudLoaded) return; // la Phase 2 s'en charge
    supabase && supabase
      .from("climbing_plans")
      .select("status, first_name, last_name")
      .maybeSingle()
      .then(({ data: row }) => {
        if (!row) return;
        setData(d => {
          const p = { ...(d.profile ?? {}) };
          if ("status" in row)         p.role      = row.status;
          if (row.first_name != null)  p.firstName = row.first_name;
          if (row.last_name  != null)  p.lastName  = row.last_name;
          return { ...d, profile: p };
        });
      });
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
    saveData(data);
    saveToCloud(data, session?.user?.id);
  }, [data]);

  // ── Navigation ──
  const handleDateGoToCurrent = () => {
    setCurrentDate(new Date());
  };

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

  // ── Custom cycle CRUD ──
  const updateCustomCycles = updater => setData(d => ({ ...d, customCycles: updater(d.customCycles || []) }));
  const addCustomCycle = cc => updateCustomCycles(list => [...list, cc]);
  const updateCustomCycle = (id, cc) => updateCustomCycles(list => list.map(x => x.id === id ? { ...x, ...cc } : x));
  const deleteCustomCycle = id => updateCustomCycles(list => list.filter(x => x.id !== id));

  // ── Session blocks CRUD (table session_blocks en DB) ──
  const addSessionBlock    = b  => saveBlock(b);
  const editSessionBlock   = b  => saveBlock(b);
  const deleteSessionBlock = id => deleteBlock(id);

  // ── Custom session handlers ──
  const saveCustomSession = (customSession, targetDayIndex) => {
    // If the form has a custom onSave (e.g. editing a predefined instance), use it
    if (customSessionForm?.onSave) {
      customSessionForm.onSave(customSession);
      return;
    }
    // Save to DB catalog (fire-and-forget)
    saveUserSession(customSession);
    setData(d => {
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
      return { ...d, weeks };
    });
    // Push to community only when placing a session on the calendar (not from library)
    if (session?.user?.id && targetDayIndex != null) {
      pushToCommunity(customSession, session.user.id);
    }
    setCustomSessionForm(null);
  };

  // ── Handler SessionBuilder ──
  const saveBuiltSession = (builtSession) => {
    const dayIndex = sessionBuilderDay;
    saveUserSession(builtSession);
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
        { mode: "calendar", label: "Calendrier" },
        { mode: "dash", label: "Stats" },
        { mode: "cycles", label: "Cycles" },
        ...(isCoach ? [{ mode: "library", label: "Séances" }] : []),
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

  // Profile avatar button (shows photo or default icon, goes to profile page)
  const profilePhoto = data.profile?.avatarDataUrl || "";
  const profileBtn = (
    <button
      style={{ ...styles.profileBtn, ...(viewMode === "profil" ? { borderColor: isDark ? "#4ade80" : "#2a7d4f", background: isDark ? "#263228" : "#d4e8db" } : {}) }}
      onClick={() => setViewMode("profil")}
      title="Profil"
    >
      {profilePhoto
        ? <img src={profilePhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
        : <span style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70" }}>—</span>
      }
    </button>
  );

  // Small sync status indicator for header
  const syncDot = syncStatus === "saving" ? <span style={{ fontSize: 11, color: "#888" }} title="Synchronisation…">⟳</span>
    : syncStatus === "saved" ? <span style={{ fontSize: 11, color: isDark ? "#4ade80" : "#2a7d4f" }} title="Synchronisé">✓</span>
    : syncStatus === "offline" ? <span style={{ fontSize: 11, color: "#f97316" }} title="Hors ligne">—</span>
    : null;

  return (
    <ThemeContext.Provider value={{ styles, isDark, toggleTheme, mesocycles: data.mesocycles || [] }}>
    <div style={{ ...styles.app, overflowY: isMobile ? "auto" : "hidden", overflowX: "hidden" }}>
      <div style={styles.grain} />

      {/* ── HEADER MOBILE ── */}
      {isMobile ? (
        <div style={styles.headerMobile}>
          <div style={styles.headerMobileRow1}>
            <div style={styles.headerLeft}>
              <span style={styles.logo}>P</span>
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
            <span style={styles.logo}>P</span>
            <div>
              <div style={styles.appTitle}>PLANIF ESCALADE</div>
              <div style={styles.appSub}>
                {viewMode === "week" ? "Calendrier — semaine" : viewMode === "month" ? "Calendrier — mois" : viewMode === "year" ? "Calendrier — année" : viewMode === "dash" ? "Statistiques" : viewMode === "cycles" ? "Cycles" : "Profil"} · Bloc
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

      {/* ── Méta semaine — barre unique fusionnant mésocycle daté + meta manuelle ── */}
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

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <>
          {null}
          <div style={isMobile ? styles.gridMobile : styles.grid}>
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
                  onAddSession={() => setSessionBuilderDay(i)}
                  onOpenSession={(si) => openSessionModal(wKey, i, si)}
                  onRemove={(si) => removeSession(i, si)}
                  isMobile={isMobile}
                  hasCreatine={!!data.creatine?.[dateISO]}
                  note={data.notes?.[dateISO] || ""}
                  onSaveNote={text => setData(d => ({ ...d, notes: { ...(d.notes || {}), [dateISO]: text } }))}
                  logWarning={logWarning}
                  onOpenLog={() => setLogDate(dateISO)}
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
          creatine={data.creatine || {}}
          customCycles={data.customCycles || []}
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
      {picker && isCoach && (
        <CoachPickerModal
          sessions={catalog}
          blocks={dbBlocks}
          onSelect={s => { addSession(picker.dayIndex, s); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && !isCoach && (
        <SessionPicker
          onSelect={s => { addSession(picker.dayIndex, s); setPicker(null); }}
          onClose={() => setPicker(null)}
          customSessions={catalog.filter(s => s.isCustom)}
          sessions={catalog.filter(s => !s.isCustom)}
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
      {session && cloudLoaded && !("role" in (data.profile || {})) && (
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


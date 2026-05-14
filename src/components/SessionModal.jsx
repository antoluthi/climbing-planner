import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { DAYS, BLOCK_TYPES, DEFAULT_SUSPENSION_CONFIG, getMesoColor } from "../lib/constants.js";
import { getChargeColor } from "../lib/charge.js";
import { getMondayOf, addDays, weekKey } from "../lib/helpers.js";
import { RichText } from "./RichText.jsx";
import { SuspensionInfoCard } from "./SuspensionInfoCard.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { Z } from "../theme/makeStyles.js";

// ─── SESSION MODAL — refonte sans onglets ─────────────────────────────────────
// Le ressenti est la vue par défaut (le moment le plus fréquent d'ouverture).
// Le détail technique devient un accordéon en bas. "Déplacer" est dans un kebab.

const RPE_LABELS = {
  1: "Très facile — récupération.",
  2: "Facile — échauffement.",
  3: "Modéré — confortable.",
  4: "Un peu difficile.",
  5: "Difficile.",
  6: "Difficile, soutenu.",
  7: "Difficile mais soutenable.",
  8: "Très difficile.",
  9: "Maximal — limite.",
  10: "Maximum absolu.",
};

const STATUS_OPTIONS = [
  { key: "done",     label: "Fait",      icon: "✓" },
  { key: "adapted",  label: "Adaptée",   icon: "~" },
  { key: "not_done", label: "Manquée",   icon: "✗" },
];

export function SessionModal({
  session, dayLabel, weekMeta, onClose, onEdit, onDelete, onSave, dbBlocks,
  role, smWeekKey, smDayIndex,
  onMoveSession, onUpdateStartTime, onSuggestMove, moveSuggestions,
  onAcceptSuggestion, onRejectSuggestion,
}) {
  const { isDark, mesocycles } = useThemeCtx();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!session.feedback?.notes);
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabRef = useRef(null);
  const rpeGridRef = useRef(null);

  // ── Move tab state ──
  const [newStartTime, setNewStartTime] = useState(session.startTime || "");
  const [newLocation, setNewLocation] = useState(session.location || "");
  const [targetWeekKey, setTargetWeekKey] = useState(smWeekKey || "");
  const [targetDayIndex, setTargetDayIndex] = useState(smDayIndex ?? 0);
  const [suggestionNote, setSuggestionNote] = useState("");
  const [timeSaved, setTimeSaved] = useState(false);

  const isAthleteUser = role === "athlete";

  // ── Effective blocks ──
  const enrichConfig = (bl) => ({
    ...bl,
    config: bl.config ?? dbBlocks?.find(b => b.id === bl.id)?.config ?? null,
  });
  const effectiveBlocks = (
    session.isBlock && !session.blocks?.length
      ? [{ id: session.id, blockType: session.blockType, name: session.name, duration: session.duration, charge: session.charge, description: session.description, config: session.config ?? null }]
      : (session.blocks ?? [])
  ).map(enrichConfig);
  const hasBlocks   = effectiveBlocks.length > 0;
  const hasWarmup   = !!session.warmup?.trim();
  const hasMain     = !!session.main?.trim();
  const hasCooldown = !!session.cooldown?.trim();
  const hasContent  = hasWarmup || hasMain || hasCooldown;

  // ── Feedback state ──
  const initStatus = () => {
    const fb = session.feedback;
    if (!fb) return null;
    if (fb.status) return fb.status;
    return fb.done ? "done" : "not_done";
  };
  const [status,         setStatus]         = useState(initStatus);
  const [adaptedCharge,  setAdaptedCharge]  = useState(session.feedback?.adaptedCharge ?? session.charge ?? 24);
  const [rpe,            setRpe]            = useState(session.feedback?.rpe ?? null);
  const [quality,        setQuality]        = useState(session.feedback?.quality ?? null);
  const [notes,          setNotes]          = useState(session.feedback?.notes ?? "");
  const [blockFeedbacks, setBlockFeedbacks] = useState(session.feedback?.blockFeedbacks ?? []);

  const sessionDone = status === "done" || status === "adapted";
  const sessionMissed = status === "not_done";

  // ── Move helpers ──
  const targetMonday = targetWeekKey ? getMondayOf(addDays(new Date(targetWeekKey + "T00:00:00"), 1)) : null;
  const prevWeekKey = targetMonday ? weekKey(getMondayOf(addDays(targetMonday, -7))) : smWeekKey;
  const nextWeekKey = targetMonday ? weekKey(getMondayOf(addDays(targetMonday, 7))) : smWeekKey;
  const weekLabel = targetMonday
    ? `Sem. du ${targetMonday.getDate()} ${targetMonday.toLocaleDateString("fr-FR", { month: "short" })} ${targetMonday.getFullYear()}`
    : "";
  const dayChanged = targetWeekKey !== smWeekKey || targetDayIndex !== smDayIndex;
  const timeChanged = newStartTime !== (session.startTime || "");
  const locationChanged = newLocation !== (session.location || "");
  const pendingSuggestions = (moveSuggestions || []).filter(s => s.sessionId === session.id && s.status === "pending");
  const formatSuggTarget = (toWKey, toDi) => {
    if (!toWKey) return "";
    const d = addDays(new Date(toWKey + "T00:00:00"), toDi);
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  // ── Tokens visuels ──
  const paper        = isDark ? "#1f2421" : "#fcf8ef";
  const paperDim     = isDark ? "#1a1f1c" : "#f7f1e2";
  const surfaceCard  = isDark ? "#1f2421" : "#ffffff";
  const surfaceMuted = isDark ? "#222a23" : "#f0ebde";
  const border       = isDark ? "#2a302a" : "#e6dfd1";
  const borderStrong = isDark ? "#3a4035" : "#d8d0bf";
  const text         = isDark ? "#e8e4de" : "#2a2218";
  const textMid      = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight    = isDark ? "#7a7570" : "#8a7f70";
  const accent       = isDark ? "#c8906a" : "#8b4c20";
  const inkPrimary   = isDark ? "#c8c0b4" : "#2a2218";
  const statusColors = {
    done:     { bg: isDark ? "#1c2d20" : "#e3f0e5", fg: isDark ? "#7ab890" : "#2e6b3f" },
    adapted:  { bg: isDark ? "#2a2410" : "#fef2dc", fg: isDark ? "#d4a843" : "#b8881a" },
    not_done: { bg: isDark ? "#2a1313" : "#fbecec", fg: isDark ? "#e87878" : "#b83030" },
  };

  // Close kebab on outside click
  useEffect(() => {
    const h = e => {
      if (!kebabRef.current) return;
      if (!kebabRef.current.contains(e.target)) setKebabOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Escape closes
  const handleSaveRef = useRef(null);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") { if (showMove) setShowMove(false); else onClose(); }
      if ((e.key === "Enter") && (e.metaKey || e.ctrlKey)) handleSaveRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const handleSave = () => {
    onSave({
      status,
      done: sessionDone,
      adaptedCharge: status === "adapted" ? adaptedCharge : null,
      rpe: sessionDone ? rpe : null,
      quality: sessionDone ? quality : null,
      notes,
      blockFeedbacks: sessionDone ? blockFeedbacks : [],
    });
  };
  // Garde la dernière version de handleSave accessible depuis les listeners clavier
  useEffect(() => { handleSaveRef.current = handleSave; });

  const mesoLabel = weekMeta?.mesocycle || session.dateMeta?.mesocycle;
  const mesoColor = getMesoColor(mesocycles, mesoLabel);

  // ── Sub-components ──
  const chip = (label, color, bg) => (
    <span style={{
      background: bg || surfaceMuted,
      color: color || textMid,
      borderRadius: 14,
      padding: "3px 10px",
      fontSize: 11,
      fontWeight: 500,
      border: color ? `1px solid ${color}55` : `1px solid ${border}`,
    }}>{label}</span>
  );

  const chargeColors = (() => {
    const c = getChargeColor(session.charge || 0);
    return { fg: c, bg: c + "22" };
  })();

  // RPE keyboard navigation
  const handleRpeKey = (e) => {
    if (e.key === "ArrowRight" && rpe < 10) { setRpe((rpe || 0) + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft" && rpe > 1)  { setRpe(rpe - 1); e.preventDefault(); }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        zIndex: Z.modal,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Séance — ${session.name}`}
        style={{
          background: paper,
          borderRadius: 16,
          border: `1px solid ${borderStrong}`,
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
        }}
      >
        {/* ── Header sticky avec gradient ─────────────────────────── */}
        <div style={{
          padding: "14px 18px 12px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          {/* Top row: date + actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {dayLabel || ""}
              {session.startTime && <span style={{ marginLeft: 6, color: textMid, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}</span>}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", position: "relative" }} ref={kebabRef}>
              <button
                onClick={() => setKebabOpen(v => !v)}
                aria-label="Plus d'actions"
                style={{
                  background: "none", border: `1px solid ${border}`, borderRadius: 6,
                  color: textLight, padding: "2px 8px", cursor: "pointer", fontSize: 14,
                  fontFamily: "inherit", lineHeight: 1,
                }}
              >⋯</button>
              {kebabOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  background: surfaceCard, border: `1px solid ${borderStrong}`,
                  borderRadius: 8, padding: 4, zIndex: 12, minWidth: 180,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                }}>
                  <button
                    onClick={() => { setShowMove(true); setKebabOpen(false); }}
                    style={kebabItemStyle({ color: textMid })}
                  >
                    {isAthleteUser ? "Suggérer un déplacement…" : "Déplacer la séance…"}
                    {pendingSuggestions.length > 0 && <span style={{ marginLeft: 6, width: 7, height: 7, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />}
                  </button>
                  {!isAthleteUser && onEdit && (
                    <button
                      onClick={() => { setKebabOpen(false); onEdit(); }}
                      style={kebabItemStyle({ color: textMid })}
                    >Modifier la séance…</button>
                  )}
                  {!isAthleteUser && onDelete && (
                    <button
                      onClick={() => { setKebabOpen(false); setConfirmDelete(true); }}
                      style={kebabItemStyle({ color: isDark ? "#e87878" : "#b83030" })}
                    >Supprimer la séance</button>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                aria-label="Fermer"
                style={{ background: "none", border: "none", color: textLight, cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1, fontFamily: "inherit" }}
              >✕</button>
            </div>
          </div>
          {/* Title serif */}
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 500, color: text, lineHeight: 1.2, marginBottom: 8 }}>
            {session.name || session.title}
          </div>
          {/* Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {session.estimatedTime ? chip(`${session.estimatedTime} min`) : null}
            {hasBlocks ? chip(`${effectiveBlocks.length} bloc${effectiveBlocks.length > 1 ? "s" : ""}`) : null}
            {/* Charge planifiée vs ressentie */}
            {(() => {
              const planned = session.chargePlanned != null
                ? session.chargePlanned
                : (session.charge != null
                  ? (session.charge > 10 ? Math.round(session.charge / 21.6) : session.charge)
                  : null);
              const felt = session.feedback?.rpe ?? null;
              if (planned == null && felt == null) return null;
              const items = [];
              if (planned != null) items.push(chip(`Planifiée ${planned}/10`, chargeColors.fg, chargeColors.bg));
              if (felt != null) {
                const diff = planned != null ? felt - planned : 0;
                const arrow = diff > 2 ? " ↑" : diff < -2 ? " ↓" : "";
                items.push(chip(`Ressentie ${felt}/10${arrow}`, chargeColors.fg, chargeColors.bg + "55"));
              }
              return items;
            })()}
            {session.location && chip(session.location)}
            {mesoLabel && chip(mesoLabel, mesoColor, mesoColor + "22")}
            {weekMeta?.microcycle && chip(weekMeta.microcycle)}
          </div>
          {/* Coach note */}
          {session.coachNote && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: accent + "16", borderRadius: 6, borderLeft: `3px solid ${accent}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Mot de l'entraîneur</div>
              <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>{session.coachNote}</div>
            </div>
          )}
        </div>

        {/* ── Body scrollable ─────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {showMove ? (
            renderMovePanel({
              isAthleteUser, isDark, paperDim, surfaceCard, border, borderStrong, text, textMid, textLight, accent,
              newStartTime, setNewStartTime, newLocation, setNewLocation,
              targetWeekKey, setTargetWeekKey, targetDayIndex, setTargetDayIndex,
              prevWeekKey, nextWeekKey, weekLabel, targetMonday,
              smDayIndex, smWeekKey, session, dayChanged, timeChanged, locationChanged,
              timeSaved, setTimeSaved,
              onUpdateStartTime, onMoveSession, onSuggestMove,
              suggestionNote, setSuggestionNote,
              pendingSuggestions, formatSuggTarget,
              onAcceptSuggestion, onRejectSuggestion,
              onBack: () => setShowMove(false),
            })
          ) : (
            <div style={{ padding: "14px 18px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Segmented control STATUT */}
              <div
                role="radiogroup"
                aria-label="Statut de la séance"
                style={{
                  display: "flex", gap: 4,
                  background: surfaceMuted, borderRadius: 12, padding: 4,
                }}
              >
                {STATUS_OPTIONS.map(opt => {
                  const active = status === opt.key;
                  const c = statusColors[opt.key];
                  return (
                    <button
                      key={opt.key}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStatus(opt.key)}
                      style={{
                        flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600,
                        textAlign: "center", borderRadius: 9, border: "none",
                        background: active ? surfaceCard : "transparent",
                        color: active ? c.fg : textLight,
                        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "color 0.12s, background 0.12s",
                      }}
                    >
                      <span style={{ marginRight: 4 }}>{opt.icon}</span>{opt.label}
                    </button>
                  );
                })}
              </div>

              {sessionMissed && (
                <div style={{ background: statusColors.not_done.bg, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 13, color: statusColors.not_done.fg, fontWeight: 500, marginBottom: 8 }}>
                    Séance non réalisée. Tu veux la reprogrammer ?
                  </div>
                  <button
                    onClick={() => setShowMove(true)}
                    style={{
                      background: statusColors.not_done.fg, color: "#fff",
                      border: "none", borderRadius: 8, padding: "8px 14px",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >Reprogrammer →</button>
                </div>
              )}

              {/* Card RPE perçu */}
              <div style={{
                background: surfaceCard, border: `1px solid ${border}`,
                borderRadius: 12, padding: 14,
                opacity: sessionDone ? 1 : sessionMissed ? 0.5 : 0.85,
                pointerEvents: sessionDone ? "auto" : sessionMissed ? "none" : "auto",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: textMid }}>Charge ressentie (1-10)</span>
                  <span style={{
                    fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 700,
                    color: rpe ? getChargeColor((rpe || 0) * 3) : textLight,
                  }}>
                    {rpe ? `${rpe} / 10` : "—"}
                  </span>
                </div>
                <div
                  ref={rpeGridRef}
                  role="radiogroup"
                  aria-label="Charge ressentie 1 à 10"
                  tabIndex={0}
                  onKeyDown={handleRpeKey}
                  style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, outline: "none" }}
                  onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}44`}
                  onBlur={e => e.currentTarget.style.boxShadow = "none"}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                    const active = rpe === n;
                    return (
                      <button
                        key={n}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setRpe(n)}
                        style={{
                          height: 30, borderRadius: 6, border: "none",
                          background: active ? accent : surfaceMuted,
                          color: active ? "#fff" : textMid,
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                          fontFamily: "inherit", transition: "background 0.1s",
                        }}
                      >{n}</button>
                    );
                  })}
                </div>
                {rpe && <div style={{ fontSize: 11, color: textLight, marginTop: 8 }}>{rpe} — {RPE_LABELS[rpe] || ""}</div>}
              </div>

              {/* Card Qualité ressentie */}
              <div style={{
                background: surfaceCard, border: `1px solid ${border}`,
                borderRadius: 12, padding: 14,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                opacity: sessionDone ? 1 : sessionMissed ? 0.5 : 0.85,
                pointerEvents: sessionDone ? "auto" : sessionMissed ? "none" : "auto",
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: textMid }}>Qualité ressentie</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      onClick={() => setQuality(s === quality ? null : s)}
                      aria-label={`${s} étoile${s > 1 ? "s" : ""}`}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 22, padding: 0, lineHeight: 1,
                        color: quality >= s ? "#d4a843" : (isDark ? "#444" : "#d8d0bf"),
                      }}
                    >★</button>
                  ))}
                </div>
              </div>

              {/* Card Charge réalisée (uniquement si adaptée) */}
              {status === "adapted" && (
                <div style={{
                  background: statusColors.adapted.bg, border: `1px solid ${statusColors.adapted.fg}55`,
                  borderRadius: 12, padding: 14,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: statusColors.adapted.fg }}>Charge réalisée</span>
                    <span style={{ fontWeight: 700, color: getChargeColor(adaptedCharge) }}>{adaptedCharge}</span>
                  </div>
                  <input
                    type="range" min="0" max="30" step="1"
                    value={adaptedCharge}
                    onChange={e => setAdaptedCharge(+e.target.value)}
                    style={{ width: "100%", accentColor: accent }}
                  />
                  <div style={{ fontSize: 10, color: textLight, marginTop: 4 }}>Charge prévue : {session.charge}</div>
                </div>
              )}

              {/* Accordéon Notes */}
              <div style={{
                background: surfaceCard, border: `1px solid ${border}`,
                borderRadius: 12, padding: notesOpen ? "12px 14px 14px" : "10px 14px",
                opacity: sessionMissed ? 0.5 : 1,
                pointerEvents: sessionMissed ? "none" : "auto",
              }}>
                <button
                  onClick={() => setNotesOpen(o => !o)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, color: textMid, fontWeight: 500,
                  }}
                >
                  <span>{notes ? `Notes (${notes.length})` : "+ Ajouter des notes"}</span>
                  <span style={{ color: textLight, fontSize: 12 }}>{notesOpen ? "▲" : "▼"}</span>
                </button>
                {notesOpen && (
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Sensations, observations, ajustements…"
                    style={{
                      marginTop: 8, width: "100%", boxSizing: "border-box",
                      background: paperDim, border: `1px solid ${border}`,
                      borderRadius: 8, padding: "8px 10px",
                      fontSize: 13, fontFamily: "inherit", color: text,
                      minHeight: 70, resize: "vertical", outline: "none",
                    }}
                    rows={4}
                  />
                )}
              </div>

              {/* Block feedbacks (Suspension etc.) */}
              {sessionDone && hasBlocks && effectiveBlocks.some(bl => bl.blockType === "Suspension") && (
                <div style={{ background: surfaceCard, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                    Suivi suspension
                  </div>
                  {effectiveBlocks.filter(bl => bl.blockType === "Suspension").map((bl, i) => {
                    const cfg = BLOCK_TYPES[bl.blockType] || {};
                    const color = cfg.color || "#a78bfa";
                    const existing = blockFeedbacks.find(bf => bf.blockId === bl.id);
                    const suspCfgRef = bl.config ?? DEFAULT_SUSPENSION_CONFIG;
                    const suspData = existing?.suspensionData ?? {};
                    const patchSuspData = (patch) => {
                      setBlockFeedbacks(prev => {
                        const without = prev.filter(bf => bf.blockId !== bl.id);
                        const prev_sd = prev.find(bf => bf.blockId === bl.id)?.suspensionData ?? {};
                        return [...without, { blockId: bl.id, blockName: bl.name, blockType: bl.blockType, text: existing?.text || "", suspensionData: { ...prev_sd, ...patch } }];
                      });
                    };
                    return (
                      <div key={i} style={{ borderLeft: `3px solid ${color}66`, paddingLeft: 10, marginTop: i ? 12 : 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8 }}>{bl.name}</div>
                        {suspCfgRef.armMode === "two" ? (
                          <div>
                            <span style={{ fontSize: 10, color: textLight, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                              Poids réel (cible {suspCfgRef.targetWeight} kg)
                            </span>
                            <input
                              type="number" step="0.5"
                              value={suspData.actualWeight ?? ""}
                              onChange={e => patchSuspData({ actualWeight: e.target.value === "" ? null : +e.target.value })}
                              placeholder={String(suspCfgRef.targetWeight ?? 0)}
                              style={{
                                width: 100, background: paperDim, border: `1px solid ${border}`,
                                borderRadius: 6, padding: "6px 10px",
                                fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                                color: text, textAlign: "center", outline: "none",
                              }}
                            />
                          </div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {["actualWeightLeft", "actualWeightRight"].map((k, ki) => (
                              <div key={k}>
                                <span style={{ fontSize: 10, color: textLight, display: "block", marginBottom: 4 }}>
                                  {ki === 0 ? "Gauche" : "Droite"}
                                </span>
                                <input
                                  type="number" step="0.5"
                                  value={suspData[k] ?? ""}
                                  onChange={e => patchSuspData({ [k]: e.target.value === "" ? null : +e.target.value })}
                                  placeholder={String(ki === 0 ? suspCfgRef.targetWeightLeft : suspCfgRef.targetWeightRight)}
                                  style={{
                                    width: "100%", boxSizing: "border-box",
                                    background: paperDim, border: `1px solid ${border}`,
                                    borderRadius: 6, padding: "6px 10px",
                                    fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                                    color: text, textAlign: "center", outline: "none",
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <textarea
                          value={existing?.text || ""}
                          onChange={e => {
                            const val = e.target.value;
                            setBlockFeedbacks(prev => {
                              const without = prev.filter(bf => bf.blockId !== bl.id);
                              const sd = prev.find(bf => bf.blockId === bl.id)?.suspensionData;
                              if (val.trim() || sd) return [...without, { blockId: bl.id, blockName: bl.name, blockType: bl.blockType, text: val, ...(sd ? { suspensionData: sd } : {}) }];
                              return without;
                            });
                          }}
                          placeholder="Adaptation, ressenti…"
                          rows={2}
                          style={{
                            width: "100%", boxSizing: "border-box", marginTop: 8,
                            background: paperDim, border: `1px solid ${border}`,
                            borderRadius: 6, padding: "6px 8px",
                            fontSize: 12, fontFamily: "inherit", color: text,
                            resize: "vertical", outline: "none",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Lien détail de la séance */}
              {(hasBlocks || hasContent) && (
                <div style={{ paddingTop: 4 }}>
                  <button
                    onClick={() => setShowDetails(v => !v)}
                    style={{
                      background: "none", border: "none", padding: 0,
                      color: accent, fontSize: 13, fontWeight: 500,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {showDetails ? "▲ Masquer le détail de la séance" : `Voir le détail de la séance →`}
                  </button>
                </div>
              )}

              {/* Détail technique (accordion) */}
              {showDetails && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
                  {hasBlocks && effectiveBlocks.map((bl, i) => {
                    const cfg = BLOCK_TYPES[bl.blockType] || {};
                    const color = cfg.color || "#888";
                    return (
                      <div key={i} style={{
                        borderRadius: 10, border: `1px solid ${border}`,
                        borderLeft: `3px solid ${color}`, background: surfaceCard, overflow: "hidden",
                      }}>
                        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{bl.blockType}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{bl.name}</span>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                              {bl.duration && <span style={{ fontSize: 10, color: textLight }}>{bl.duration} min</span>}
                              {cfg.hasCharge && bl.charge > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: getChargeColor(bl.charge), background: getChargeColor(bl.charge) + "22", padding: "1px 6px", borderRadius: 4 }}>
                                  ⚡ {bl.charge}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: color + "22", border: `2px solid ${color}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, color, fontWeight: 700, flexShrink: 0,
                          }}>{i + 1}</div>
                        </div>
                        {bl.blockType === "Suspension" && (
                          <SuspensionInfoCard config={bl.config} isDark={isDark} />
                        )}
                        {bl.description?.trim() && (
                          <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${border}` }}>
                            <div style={{ paddingTop: 8 }}>
                              <RichText text={bl.description} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!hasBlocks && hasContent && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      {hasWarmup && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Échauffement</div><RichText text={session.warmup} /></>}
                      {hasMain && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>Cœur de séance</div><RichText text={session.main} /></>}
                      {hasCooldown && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>Retour au calme</div><RichText text={session.cooldown} /></>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer sticky ─────────────────────────────────────── */}
        <div style={{
          padding: "12px 18px",
          background: paperDim,
          borderTop: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          {showMove ? (
            <button
              onClick={() => setShowMove(false)}
              style={{
                width: "100%",
                background: "transparent",
                color: textMid,
                border: `1px solid ${borderStrong}`,
                borderRadius: 8, padding: "11px 18px",
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >← Retour au ressenti</button>
          ) : (
            <button
              onClick={handleSave}
              style={{
                width: "100%",
                background: inkPrimary,
                color: isDark ? paper : "#fff",
                border: "none", borderRadius: 8,
                padding: "12px 18px",
                fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                transition: "filter 0.12s",
              }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.08)"}
              onMouseLeave={e => e.currentTarget.style.filter = "none"}
            >Enregistrer</button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer cette séance ?"
          sub={session.name}
          onConfirm={() => { onDelete?.(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function kebabItemStyle({ color }) {
  return {
    display: "block", width: "100%", textAlign: "left",
    background: "none", border: "none",
    padding: "8px 10px", borderRadius: 6,
    fontSize: 12, color, fontFamily: "inherit", cursor: "pointer",
  };
}

function renderMovePanel({
  isAthleteUser, isDark, paperDim, surfaceCard, border, borderStrong, text, textMid, textLight, accent,
  newStartTime, setNewStartTime, newLocation, setNewLocation,
  targetWeekKey, setTargetWeekKey, targetDayIndex, setTargetDayIndex,
  prevWeekKey, nextWeekKey, weekLabel, targetMonday,
  smDayIndex, smWeekKey, session, dayChanged, timeChanged, locationChanged,
  timeSaved, setTimeSaved,
  onUpdateStartTime, onMoveSession, onSuggestMove,
  suggestionNote, setSuggestionNote,
  pendingSuggestions, formatSuggTarget,
  onAcceptSuggestion, onRejectSuggestion,
}) {
  const inputStyle = {
    background: surfaceCard, border: `1px solid ${border}`,
    borderRadius: 6, padding: "8px 11px",
    color: text, fontSize: 13, fontFamily: "inherit", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, display: "block" };
  const dayBtnStyle = (active) => ({
    flex: 1, padding: "7px 2px", borderRadius: 6,
    border: `1px solid ${active ? accent : border}`,
    background: active ? accent + "22" : "transparent",
    color: active ? accent : textLight,
    cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400, fontFamily: "inherit",
  });
  const saveBtnStyle = {
    background: accent, border: "none", color: "#fff",
    borderRadius: 8, padding: "8px 16px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };
  const ghostBtn = {
    background: "transparent", border: `1px solid ${borderStrong}`,
    color: textMid, borderRadius: 6,
    padding: "5px 11px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <label style={labelStyle}>Heure de départ</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="time" value={newStartTime}
            onChange={e => { setNewStartTime(e.target.value); setTimeSaved(false); }}
            style={{ ...inputStyle, width: "auto", minWidth: 120 }} />
          {newStartTime && (
            <button style={ghostBtn} onClick={() => { setNewStartTime(""); setTimeSaved(false); }}>Effacer</button>
          )}
        </div>
        {isAthleteUser && timeChanged && (
          <button style={{ ...saveBtnStyle, marginTop: 8, fontSize: 12 }}
            onClick={() => { onUpdateStartTime(newStartTime); setTimeSaved(true); }}>
            {timeSaved ? "✓ Heure enregistrée" : "Enregistrer l'heure"}
          </button>
        )}
        {!isAthleteUser && (timeChanged || locationChanged) && !dayChanged && (
          <button style={{ ...saveBtnStyle, marginTop: 8, fontSize: 12 }}
            onClick={() => onMoveSession(smWeekKey, smDayIndex, newStartTime, newLocation)}>
            Enregistrer{timeChanged && locationChanged ? " l'heure et le lieu" : timeChanged ? " l'heure" : " le lieu"}
          </button>
        )}
      </div>

      {!isAthleteUser && (
        <div>
          <label style={labelStyle}>Lieu</label>
          <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)}
            placeholder="Salle, falaise…" style={inputStyle} />
        </div>
      )}

      <div>
        <label style={labelStyle}>{isAthleteUser ? "Suggérer un déplacement vers" : "Déplacer vers"}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button style={ghostBtn} onClick={() => { setTargetWeekKey(prevWeekKey); setTargetDayIndex(smDayIndex); }}>←</button>
          <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: textMid, fontWeight: 500 }}>{weekLabel}</span>
          <button style={ghostBtn} onClick={() => { setTargetWeekKey(nextWeekKey); setTargetDayIndex(smDayIndex); }}>→</button>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {DAYS.map((d, i) => {
            const dateD = targetMonday ? addDays(targetMonday, i) : null;
            const dateStr = dateD ? `${dateD.getDate()}/${dateD.getMonth() + 1}` : "";
            return (
              <button key={i} style={dayBtnStyle(targetDayIndex === i)}
                onClick={() => setTargetDayIndex(i)}>
                <div>{d}</div>
                <div style={{ fontSize: 9, opacity: 0.7 }}>{dateStr}</div>
              </button>
            );
          })}
        </div>

        {!isAthleteUser && dayChanged && (
          <button style={{ ...saveBtnStyle, marginTop: 12, width: "100%" }}
            onClick={() => onMoveSession(targetWeekKey, targetDayIndex, newStartTime || session.startTime || null, newLocation)}>
            Déplacer la séance
          </button>
        )}
        {isAthleteUser && dayChanged && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              style={{
                width: "100%", boxSizing: "border-box",
                background: paperDim, border: `1px solid ${border}`,
                borderRadius: 6, padding: "6px 10px",
                fontSize: 12, fontFamily: "inherit", color: text,
                minHeight: 56, resize: "vertical", outline: "none",
              }}
              placeholder="Note pour le coach (optionnel)…"
              value={suggestionNote} onChange={e => setSuggestionNote(e.target.value)} rows={2}
            />
            <button style={saveBtnStyle}
              onClick={() => { onSuggestMove(targetWeekKey, targetDayIndex, suggestionNote); setSuggestionNote(""); setTargetWeekKey(smWeekKey); setTargetDayIndex(smDayIndex); }}>
              Envoyer la suggestion
            </button>
          </div>
        )}
        {isAthleteUser && !dayChanged && (
          <div style={{ fontSize: 11, color: textLight, marginTop: 8, fontStyle: "italic" }}>
            Sélectionne un autre jour pour envoyer une suggestion de déplacement à ton coach.
          </div>
        )}
      </div>

      {!isAthleteUser && pendingSuggestions.length > 0 && (
        <div>
          <label style={{ ...labelStyle, color: "#f97316" }}>Suggestions de l'athlète</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingSuggestions.map(s => (
              <div key={s.id} style={{
                borderRadius: 8, border: `1px solid ${isDark ? "#3a2a10" : "#fbd8aa"}`,
                background: isDark ? "#1e1808" : "#fff8ee", padding: "10px 12px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#fbbf24" : "#92400e", marginBottom: 4 }}>
                  → {formatSuggTarget(s.toWeekKey, s.toDayIndex)}
                </div>
                {s.note && <div style={{ fontSize: 11, color: isDark ? "#c8b870" : "#78540a", fontStyle: "italic", marginBottom: 8 }}>"{s.note}"</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...saveBtnStyle, padding: "5px 12px", fontSize: 11, flex: 1 }}
                    onClick={() => onAcceptSuggestion(s.id)}>✓ Accepter</button>
                  <button style={{ ...ghostBtn, padding: "5px 12px", fontSize: 11, flex: 1, color: isDark ? "#f87171" : "#dc2626", borderColor: isDark ? "#4a1c1c" : "#fca5a5" }}
                    onClick={() => onRejectSuggestion(s.id)}>✗ Refuser</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

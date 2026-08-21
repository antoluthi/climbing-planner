import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { DAYS, getMesoColor } from "../lib/constants.js";
import { getChargeColor, normalizeCharge10, chargeLabel } from "../lib/charge.js";
import { getMondayOf, addDays, weekKey } from "../lib/helpers.js";
import { RichText } from "./RichText.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { Z } from "../theme/makeStyles.js";
import { pushLayer, lockBodyScroll } from "../lib/native.js";
import { getDiscipline, METRIC_LABELS } from "../lib/disciplines.js";
import { colors, DATA } from "../theme/palette.js";

// ─── SESSION MODAL — refonte sans onglets ─────────────────────────────────────
// Le ressenti est la vue par défaut (le moment le plus fréquent d'ouverture).
// Le détail technique devient un accordéon en bas. "Déplacer" est dans un kebab.

const STATUS_OPTIONS = [
  { key: "done",     label: "Fait",      icon: "✓" },
  { key: "adapted",  label: "Adaptée",   icon: "~" },
  { key: "not_done", label: "Manquée",   icon: "✗" },
];

export function SessionModal({
  session, dayLabel, weekMeta, onClose, onEdit, onDelete, onSave,
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

  // ── Move tab state ──
  const [newStartTime, setNewStartTime] = useState(session.startTime || "");
  const [newLocation, setNewLocation] = useState(session.location || "");
  const [targetWeekKey, setTargetWeekKey] = useState(smWeekKey || "");
  const [targetDayIndex, setTargetDayIndex] = useState(smDayIndex ?? 0);
  const [suggestionNote, setSuggestionNote] = useState("");
  const [timeSaved, setTimeSaved] = useState(false);

  const isAthleteUser = role === "athlete";

  const hasWarmup   = !!session.warmup?.trim();
  const hasMain     = !!session.main?.trim();
  const hasCooldown = !!session.cooldown?.trim();
  const hasContent  = hasWarmup || hasMain || hasCooldown;
  // Mode simple / event : champs additionnels à afficher dans le détail.
  const hasSessionNotes   = !!session.notes?.toString().trim();
  const hasDescription    = !!session.description?.toString().trim();
  const hasEventContent   = !!session.content?.toString().trim();
  const hasMetrics        = session.metrics && Object.values(session.metrics).some(v => v != null && v !== "");
  // Le détail est désormais TOUJOURS disponible : on affichera au moins
  // un récap (discipline, charge, durée, lieu) même quand rien n'est saisi.

  // ── Feedback state ──
  const initStatus = () => {
    const fb = session.feedback;
    if (!fb) return null;
    if (fb.status) return fb.status;
    return fb.done ? "done" : "not_done";
  };
  const [status,         setStatus]         = useState(initStatus);
  // Charge planifiée sur l'échelle unifiée 0-10 (référence du slider ressenti).
  const plannedCharge = session.chargePlanned != null
    ? normalizeCharge10(session.chargePlanned)
    : (session.charge != null ? normalizeCharge10(session.charge) : null);
  // Le slider part de la valeur planifiée : l'athlète confirme ou ajuste.
  const [rpe,            setRpe]            = useState(() => session.feedback?.rpe ?? plannedCharge ?? 5);
  const [quality,        setQuality]        = useState(session.feedback?.quality ?? null);
  const [notes,          setNotes]          = useState(session.feedback?.notes ?? "");

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
  const paper        = colors(isDark).card;
  const paperDim     = colors(isDark).surface;
  const surfaceCard  = colors(isDark).card;
  const surfaceMuted = colors(isDark).surface;
  const border       = colors(isDark).borderSubtle;
  const borderStrong = colors(isDark).border;
  const text         = colors(isDark).text;
  const textMid      = colors(isDark).textCard;
  const textLight    = colors(isDark).textMuted;
  const accent       = colors(isDark).accent;
  const inkPrimary   = colors(isDark).text;
  const statusColors = {
    done:     { bg: colors(isDark).successBg, fg: colors(isDark).success },
    adapted:  { bg: colors(isDark).warnBg, fg: colors(isDark).warn },
    not_done: { bg: colors(isDark).dangerBg, fg: colors(isDark).danger },
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

  // Pile de calques : bouton retour Android + Échap top-only + scroll lock.
  // backCloseRef est réassigné à chaque rendu pour capturer l'état frais.
  const backCloseRef = useRef(null);
  backCloseRef.current = () => { if (showMove) setShowMove(false); else onClose(); };
  const layerRef = useRef(null);
  useEffect(() => {
    const layer = pushLayer(() => backCloseRef.current?.());
    layerRef.current = layer;
    const unlock = lockBodyScroll();
    return () => { layer.remove(); unlock(); };
  }, []);

  // Escape closes
  const handleSaveRef = useRef(null);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && layerRef.current?.isTop()) { if (showMove) setShowMove(false); else onClose(); }
      if ((e.key === "Enter") && (e.metaKey || e.ctrlKey)) handleSaveRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Confirmation "Merci pour ton retour." — overlay affiché après enregistrement
  // d'un ressenti (sessionDone). Le persist s'exécute à la fermeture de l'overlay,
  // au clic de l'utilisateur.
  const [showThanks, setShowThanks] = useState(false);
  const persistAndClose = () => {
    onSave({
      status,
      done: sessionDone,
      rpe: sessionDone ? rpe : null,
      quality: sessionDone ? quality : null,
      notes,
    });
  };
  const handleSave = () => {
    if (sessionDone) setShowThanks(true);
    else persistAndClose();
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
    const c = getChargeColor(plannedCharge ?? 0);
    return { fg: c, bg: c + "22" };
  })();

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
                    {pendingSuggestions.length > 0 && <span style={{ marginLeft: 6, width: 7, height: 7, borderRadius: "50%", background: colors(isDark).warn, display: "inline-block" }} />}
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
                      style={kebabItemStyle({ color: colors(isDark).danger })}
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
            {/* Charge planifiée vs ressentie */}
            {(() => {
              const planned = plannedCharge;
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
                      background: statusColors.not_done.fg, color: colors(isDark).onColor,
                      border: "none", borderRadius: 8, padding: "8px 14px",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >Reprogrammer →</button>
                </div>
              )}

              {/* Card Charge ressentie — slider unique, pré-rempli à la charge
                  planifiée : l'athlète confirme (ne touche à rien) ou ajuste si
                  c'était plus / moins soutenu que prévu. Même échelle 0-10 que
                  toutes les disciplines. */}
              {(() => {
                const feltColor = getChargeColor(rpe || 0);
                const delta = plannedCharge != null && rpe != null ? rpe - plannedCharge : null;
                const deltaText = delta == null ? null
                  : delta === 0 ? "Conforme au plan"
                  : delta > 0 ? `Plus soutenu que prévu (+${delta})`
                  : `Moins soutenu que prévu (${delta})`;
                const deltaColor = delta == null || delta === 0
                  ? textLight
                  : delta > 0 ? (colors(isDark).accent) : (colors(isDark).success);
                return (
                  <div style={{
                    background: surfaceCard, border: `1px solid ${border}`,
                    borderRadius: 12, padding: 14,
                    opacity: sessionDone ? 1 : sessionMissed ? 0.5 : 0.85,
                    pointerEvents: sessionDone ? "auto" : sessionMissed ? "none" : "auto",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: textMid }}>Charge ressentie</span>
                      <span style={{
                        fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, fontWeight: 700,
                        color: rpe ? feltColor : textLight,
                      }}>
                        {rpe ? `${rpe} / 10` : "—"}
                      </span>
                    </div>
                    {plannedCharge != null && (
                      <div style={{ fontSize: 11, color: textLight, marginBottom: 8 }}>
                        Prévu : {plannedCharge}/10 — ajuste si c'était plus ou moins soutenu.
                      </div>
                    )}
                    <input
                      type="range" min="1" max="10" step="1"
                      value={rpe ?? plannedCharge ?? 5}
                      onChange={e => setRpe(+e.target.value)}
                      aria-label="Charge ressentie de 1 à 10"
                      style={{ width: "100%", accentColor: feltColor, cursor: "pointer" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: textLight, marginTop: 2 }}>
                      <span>1 · rien</span><span>5 · assez difficile</span><span>10 · maximal</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: feltColor }}>
                        {chargeLabel(rpe ?? plannedCharge ?? 5)}
                      </span>
                      {deltaText && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor, flexShrink: 0 }}>{deltaText}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                        color: quality >= s ? colors(isDark).warn : (colors(isDark).border),
                      }}
                    >★</button>
                  ))}
                </div>
              </div>

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

              {/* Lien détail de la séance — toujours visible */}
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

              {/* Détail technique (accordion) — toujours quelque chose à montrer */}
              {showDetails && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>

                  {/* Séances anciennes : échauffement / cœur / retour au calme */}
                  {hasContent && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      {hasWarmup && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Échauffement</div><RichText text={session.warmup} /></>}
                      {hasMain && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>Cœur de séance</div><RichText text={session.main} /></>}
                      {hasCooldown && <><div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>Retour au calme</div><RichText text={session.cooldown} /></>}
                    </div>
                  )}

                  {/* Notes (mode simple) — texte libre saisi à la création */}
                  {hasSessionNotes && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
                        Notes de la séance
                      </div>
                      <div style={{ fontSize: 13, color: text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {session.notes}
                      </div>
                    </div>
                  )}

                  {/* Description legacy */}
                  {hasDescription && !hasSessionNotes && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
                        Description
                      </div>
                      <RichText text={session.description} />
                    </div>
                  )}

                  {/* Contenu événement */}
                  {hasEventContent && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
                        Description de l'événement
                      </div>
                      <div style={{ fontSize: 13, color: text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {session.content}
                      </div>
                    </div>
                  )}

                  {/* Métriques (course, vélo, renforcement…) */}
                  {hasMetrics && (
                    <div style={{ padding: "10px 14px", background: surfaceCard, border: `1px solid ${border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: textLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                        Métriques
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {Object.entries(session.metrics).map(([key, value]) => {
                          if (value == null || value === "") return null;
                          const m = METRIC_LABELS[key] || { label: key, suffix: "" };
                          return (
                            <div key={key} style={{
                              background: paperDim, border: `1px solid ${border}`,
                              borderRadius: 8, padding: "6px 10px",
                              display: "flex", flexDirection: "column", gap: 1,
                              minWidth: 70,
                            }}>
                              <span style={{ fontSize: 9, color: textLight, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                {m.label}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: text }}>
                                {value}{m.suffix ? ` ${m.suffix}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Récap discipline / charge / durée — fallback minimal */}
                  {!hasContent && !hasSessionNotes && !hasDescription && !hasEventContent && !hasMetrics && (() => {
                    const disc = getDiscipline(session.discipline || "climbing");
                    const planned = session.chargePlanned ?? (session.charge != null ? normalizeCharge10(session.charge) : null);
                    return (
                      <div style={{ padding: "12px 14px", background: surfaceCard, border: `1px dashed ${border}`, borderRadius: 10 }}>
                        <div style={{ fontSize: 12, color: textMid, lineHeight: 1.6 }}>
                          <strong style={{ color: text }}>{disc.label}</strong>
                          {planned != null && <> · charge planifiée <strong style={{ color: text }}>{planned}/10</strong></>}
                          {session.estimatedTime && <> · {session.estimatedTime} min</>}
                          {(session.location || session.address) && <> · {session.location || session.address}</>}
                        </div>
                        <div style={{ fontSize: 11, color: textLight, marginTop: 6, fontStyle: "italic" }}>
                          Aucune description ni bloc renseigné. Tu peux en ajouter via « Modifier la séance ».
                        </div>
                      </div>
                    );
                  })()}
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
                color: isDark ? paper : colors(isDark).onColor,
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

      {showThanks && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: Z.nested,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) persistAndClose(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ressenti enregistré"
            style={{
              background: paper,
              border: `1px solid ${borderStrong}`,
              borderRadius: 16,
              padding: "28px 24px 22px",
              maxWidth: 360, width: "100%",
              display: "flex", flexDirection: "column",
              alignItems: "center", textAlign: "center",
              gap: 12,
              boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 22, fontWeight: 500, color: text,
              letterSpacing: "-0.01em",
            }}>
              Merci pour ton retour.
            </div>
            <button
              onClick={persistAndClose}
              style={{
                marginTop: 6,
                background: inkPrimary,
                color: isDark ? paper : colors(isDark).onColor,
                border: "none", borderRadius: 8,
                padding: "10px 22px",
                fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >Fermer</button>
          </div>
        </div>
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
    background: accent, border: "none", color: colors(isDark).onColor,
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
          <label style={{ ...labelStyle, color: colors(isDark).warn }}>Suggestions de l'athlète</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingSuggestions.map(s => (
              <div key={s.id} style={{
                borderRadius: 8, border: `1px solid ${colors(isDark).borderSubtle}`,
                background: colors(isDark).card, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: colors(isDark).warn, marginBottom: 4 }}>
                  → {formatSuggTarget(s.toWeekKey, s.toDayIndex)}
                </div>
                {s.note && <div style={{ fontSize: 11, color: colors(isDark).warn, fontStyle: "italic", marginBottom: 8 }}>"{s.note}"</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...saveBtnStyle, padding: "5px 12px", fontSize: 11, flex: 1 }}
                    onClick={() => onAcceptSuggestion(s.id)}>✓ Accepter</button>
                  <button style={{ ...ghostBtn, padding: "5px 12px", fontSize: 11, flex: 1, color: colors(isDark).danger, borderColor: colors(isDark).danger }}
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

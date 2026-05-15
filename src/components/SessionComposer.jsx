import { useState, useRef, useEffect, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { generateId } from "../lib/storage.js";
import { getChargeColor } from "../lib/charge.js";
import { BLOCK_TYPES } from "../lib/constants.js";
import { calcEndTime } from "../lib/helpers.js";
import { DISCIPLINES, disciplineList, getDiscipline, METRIC_LABELS } from "../lib/disciplines.js";
import { BlockEditor } from "./BlockEditor.jsx";
import { DisciplineIcon } from "./DisciplineIcon.jsx";
import { Z } from "../theme/makeStyles.js";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

// ─── SESSION COMPOSER (unifié) ────────────────────────────────────────────────
// Remplace SessionBuilder / SessionComposerModal / CustomSessionModal /
// QuickSessionModal / AddSessionChoiceModal. Supporte :
//   - 3 modes : simple · detailed · event
//   - N disciplines : escalade, course, vélo, renforcement, mobilité, autre
//   - charge planifiée unifiée 0-10
//
// Le parent route le résultat selon session.mode :
//   - 'simple' | 'detailed' → addSession (data.weeks)
//   - 'event'               → addQuickSession (data.quickSessions)

const EVENT_COLORS = ["#c0392b", "#f97316", "#d4a843", "#2e6b3f", "#0891b2", "#2563eb", "#6d28d9", "#8a7f70"];

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function summarizePlannedChargeFromBlocks(blocks, discipline) {
  if (discipline === "climbing") {
    // Somme des charges 0-216 normalisée → 0-10
    const sum = blocks.reduce((s, b) => s + (Number(b.charge) || 0), 0);
    return clamp(Math.round(sum / 21.6), 0, 10);
  }
  // Sinon : somme directe des charges 0-10, cappée à 10
  const sum = blocks.reduce((s, b) => s + (Number(b.charge) || 0), 0);
  return clamp(Math.round(sum), 0, 10);
}

export function SessionComposer({
  initial,
  titlePrefill,
  dayLabel,
  defaultDate,
  onSave,
  onClose,
  communitySessions = [],
  allSessions = [],
  availableBlocks = [],
  onCreateCustom,
  onSaveBlock,
}) {
  const { isDark } = useThemeCtx();
  const titleRef = useRef(null);

  // ── Confirm-on-close (protège des miss-clicks) ────────────────────────────
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);
  const wrap = (setter) => (v) => { markDirty(); setter(v); };

  // ── Discipline ──
  const initialDiscipline = initial?.discipline || "climbing";
  const [discipline, _setDiscipline] = useState(initialDiscipline);

  // ── Mode (simple / detailed / event) ──
  const initialMode = initial?.mode || getDiscipline(initialDiscipline).defaultMode || "detailed";
  const [mode, _setMode] = useState(initialMode);
  const isEvent = mode === "event";

  // ── Titre ──
  const [title, _setTitle] = useState(initial?.title || initial?.name || titlePrefill || "");
  const setTitle = wrap(_setTitle);

  // ── Durée + heure ──
  const [estimatedTime, _setEstimatedTime] = useState(initial?.estimatedTime != null ? String(initial.estimatedTime) : "");
  const setEstimatedTime = wrap(_setEstimatedTime);
  const [startTime, _setStartTime] = useState(initial?.startTime || "");
  const setStartTime = wrap(_setStartTime);

  // ── Lieu ──
  const [location, _setLocation] = useState(initial?.location || initial?.address || "");
  const setLocation = wrap(_setLocation);

  // ── Notes (mode simple) ──
  const [notes, _setNotes] = useState(initial?.notes || "");
  const setNotes = wrap(_setNotes);

  // ── Charge planifiée 0-10 (modes simple / detailed / event-ignored) ──
  const initialChargePlanned = (() => {
    if (initial?.chargePlanned != null) return clamp(Math.round(initial.chargePlanned), 0, 10);
    if (initial?.charge != null) {
      const c = Number(initial.charge);
      if (c > 10) return clamp(Math.round(c / 21.6), 0, 10);
      return clamp(Math.round(c), 0, 10);
    }
    return 5;
  })();
  const [chargePlanned, _setChargePlanned] = useState(initialChargePlanned);
  const setChargePlanned = wrap(_setChargePlanned);

  // ── Métriques (mode simple / detailed pour disciplines avec metrics) ──
  const [metrics, _setMetrics] = useState(initial?.metrics || {});
  const updateMetric = (key, value) => {
    markDirty();
    _setMetrics(prev => ({ ...prev, [key]: value }));
  };

  // ── Blocs (mode detailed) ──
  const [blocks, _setBlocks] = useState(() => {
    if (initial?.blocks?.length) {
      return initial.blocks.map(b => ({
        ...b,
        id: b.id || generateId(),
        type: b.type || b.blockType,
        blockType: b.blockType || b.type,
      }));
    }
    return []; // pas de blocs par défaut — l'utilisateur ajoute
  });
  const setBlocks = (updater) => { markDirty(); _setBlocks(updater); };

  // ── Event-specific ──
  const eventInitialDate = initial?.startDate || initial?.date || defaultDate || todayISO();
  const [startDate, _setStartDate] = useState(eventInitialDate);
  const setStartDate = wrap(_setStartDate);
  const [endDate, _setEndDate] = useState(initial?.endDate || eventInitialDate);
  const setEndDate = wrap(_setEndDate);
  const [color, _setColor] = useState(initial?.color || DISCIPLINES.climbing.color);
  const setColor = wrap(_setColor);
  const [isObjective, _setIsObjective] = useState(initial?.isObjective ?? false);
  const setIsObjective = wrap(_setIsObjective);
  const [eventContent, _setEventContent] = useState(initial?.content || "");
  const setEventContent = wrap(_setEventContent);

  // ── UI state ──
  const [addingType, setAddingType] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pendingEventToggle, setPendingEventToggle] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [climbingCalcOpen, setClimbingCalcOpen] = useState(false);
  const [climbingNbMov, setClimbingNbMov] = useState("");
  const [climbingInt, setClimbingInt] = useState(3);
  const [climbingComp, setClimbingComp] = useState(3);
  const dragIdxRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // ── Setters compositionnels (avec contraintes) ──
  const setDiscipline = (newId) => {
    if (newId === discipline) return;
    markDirty();
    _setDiscipline(newId);
    // Bascule auto sur defaultMode si le mode courant est detailed mais
    // la discipline préfère simple (et vice-versa pour les nouveaux comptes).
    const newCfg = getDiscipline(newId);
    if (mode !== "event" && mode !== newCfg.defaultMode) {
      // On respecte le choix utilisateur s'il a déjà des blocs, mais
      // on suggère le mode par défaut si tout est vide.
      const hasBlocks = blocks.length > 0;
      if (!hasBlocks) {
        _setMode(newCfg.defaultMode);
      }
    }
  };

  const setMode = (newMode) => {
    if (newMode === mode) return;
    markDirty();
    _setMode(newMode);
  };

  // ── Focus titre au montage ──
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Raccourcis clavier ──
  const handleSaveRef = useRef(null);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") requestClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        handleSaveRef.current?.();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── Block mutations ──
  const addBlock = (typeName) => {
    const cfg = BLOCK_TYPES[typeName] || { defaultCharge: 5, defaultDuration: 15 };
    const isClimbing = discipline === "climbing";
    setBlocks(b => [...b, {
      id: generateId(),
      type: typeName, blockType: typeName,
      name: "",
      charge: isClimbing ? cfg.defaultCharge : Math.min(cfg.defaultCharge, 5),
      duration: cfg.defaultDuration,
      location: "",
      notes: "",
    }]);
    setAddingType(false);
  };
  const addFromLibrary = (lb) => {
    setBlocks(b => [...b, { ...lb, id: generateId(), type: lb.blockType }]);
    setShowLibrary(false);
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
  const handleDragStart = (idx) => (e) => {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* */ }
  };
  const handleDragOver = (idx) => (e) => { e.preventDefault(); setHoverIdx(idx); };
  const handleDrop = (idx) => (e) => {
    e.preventDefault();
    const from = dragIdxRef.current;
    setHoverIdx(null);
    dragIdxRef.current = null;
    if (from == null || from === idx) return;
    setBlocks(b => {
      const arr = [...b];
      const [moved] = arr.splice(from, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
  };

  // ── Charger un modèle ──
  const loadFromModel = (model) => {
    if (model.title || model.name) setTitle(model.title || model.name);
    if (model.estimatedTime) setEstimatedTime(String(model.estimatedTime));
    if (model.blocks?.length) {
      _setBlocks(model.blocks.map(b => ({
        ...b,
        id: generateId(),
        type: b.type || b.blockType,
        blockType: b.blockType || b.type,
      })));
    }
    if (model.chargePlanned != null) setChargePlanned(model.chargePlanned);
    else if (model.charge != null) {
      const c = Number(model.charge);
      setChargePlanned(c > 10 ? clamp(Math.round(c / 21.6), 0, 10) : clamp(Math.round(c), 0, 10));
    }
    markDirty();
    setShowModelPicker(false);
  };

  // ── Bascule mode événement (avec confirm si on perd des blocs) ──
  const requestEventToggle = () => {
    if (!isEvent && blocks.length > 0) {
      setPendingEventToggle(true);
    } else {
      setMode(isEvent ? getDiscipline(discipline).defaultMode : "event");
    }
  };
  const confirmEventToggle = () => {
    setPendingEventToggle(false);
    setMode("event");
  };

  // ── Validation ──
  const canSave = title.trim().length > 0 && (
    isEvent ? !!startDate : true
  );

  // ── Save ──
  const handleSave = () => {
    if (!canSave) return;
    markPristine();

    if (isEvent) {
      // Event : structure quickSession enrichie
      const payload = {
        id: initial?.id || generateId(),
        schemaVersion: 2,
        discipline,
        mode: "event",
        name: title.trim(),
        title: title.trim(),
        startDate,
        endDate: endDate && endDate > startDate ? endDate : undefined,
        allDay: !startTime,
        startTime: startTime || undefined,
        endTime: startTime && estimatedTime ? calcEndTime(startTime, +estimatedTime) : undefined,
        duration: estimatedTime ? +estimatedTime : undefined,
        location: location.trim() || undefined,
        address: location.trim() || undefined,
        color: color,
        content: eventContent.trim() || undefined,
        isObjective,
        isQuick: true,
        chargePlanned: 0,
        type: "Évènement",
      };
      onSave(payload);
      return;
    }

    // Session structurée (simple ou detailed)
    const cleanBlocks = blocks.map(({ id: bid, ...rest }) => ({
      ...rest,
      id: bid,
      type: rest.type || rest.blockType,
      blockType: rest.blockType || rest.type,
    }));
    const finalCharge = mode === "detailed" && cleanBlocks.length > 0
      ? summarizePlannedChargeFromBlocks(cleanBlocks, discipline)
      : chargePlanned;

    onSave({
      id: initial?.id || generateId(),
      schemaVersion: 2,
      discipline,
      mode,
      name: title.trim(),
      title: title.trim(),
      type: discipline === "climbing" ? "Grimpe" : (getDiscipline(discipline).label || "Séance"),
      chargePlanned: finalCharge,
      charge: discipline === "climbing"
        ? cleanBlocks.reduce((s, b) => s + (b.charge || 0), 0) || finalCharge
        : finalCharge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      startTime: startTime || null,
      endTime: startTime && estimatedTime ? calcEndTime(startTime, +estimatedTime) : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      blocks: mode === "detailed" ? cleanBlocks : [],
      metrics: Object.keys(metrics).length ? metrics : undefined,
      isCustom: true,
      saveAsTemplate: saveAsTemplate || undefined,
    });
  };
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ── Tokens visuels (alignés avec les autres modales) ─────────────────────
  const paper        = isDark ? "#1f2421" : "#fcf8ef";
  const paperDim     = isDark ? "#1a1f1c" : "#f7f1e2";
  const surfaceCard  = isDark ? "#1f2421" : "#ffffff";
  const surfaceInput = isDark ? "#1a1f1c" : "#fcf8ef";
  const border       = isDark ? "#2a302a" : "#e6dfd1";
  const borderStrong = isDark ? "#3a4035" : "#d8d0bf";
  const text         = isDark ? "#e8e4de" : "#2a2218";
  const textMid      = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight    = isDark ? "#7a7570" : "#8a7f70";
  const accent       = isDark ? "#c8906a" : "#8b4c20";
  const inkPrimary   = isDark ? "#c8c0b4" : "#2a2218";

  const disciplineCfg = getDiscipline(discipline);
  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: textLight,
    letterSpacing: "0.07em", textTransform: "uppercase",
    marginBottom: 8, display: "block",
  };
  const cardLabel = {
    fontFamily: "'Newsreader', Georgia, serif",
    fontSize: 13, fontWeight: 500, color: text,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const headerTitle = isEvent
    ? (initial ? "Modifier l'événement" : "Nouvel événement")
    : (initial ? "Modifier la séance" : "Nouvelle séance");
  const headerEyebrow = (() => {
    const now = new Date();
    const dateStr = dayLabel
      || now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${dateStr}${dayLabel ? "" : " · " + timeStr}`;
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
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        style={{
          background: paper,
          borderRadius: 16,
          border: `1px solid ${borderStrong}`,
          width: "100%",
          maxWidth: 480,
          maxHeight: "94vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
        }}
      >
        {/* ── Header sticky ───────────────────────────── */}
        <div style={{
          padding: "14px 18px 12px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
            {headerEyebrow}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, fontWeight: 500, color: text, lineHeight: 1.15 }}>
              {headerTitle}
            </div>
            <button
              onClick={requestClose}
              aria-label="Fermer"
              style={{
                background: "none", border: `1px solid ${border}`, borderRadius: "50%",
                color: textLight, padding: 0, width: 28, height: 28,
                cursor: "pointer", fontSize: 14, fontFamily: "inherit", lineHeight: 1,
                flexShrink: 0,
              }}
            >✕</button>
          </div>
          {!initial && !isEvent && (
            <button
              onClick={() => setShowModelPicker(true)}
              style={{
                marginTop: 6, fontSize: 11,
                background: "none", border: "none",
                color: accent, padding: 0, cursor: "pointer",
                fontFamily: "inherit", textDecoration: "underline",
              }}
            >Charger un modèle…</button>
          )}
        </div>

        {/* ── Body scrollable ──────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 8px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Titre */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={isEvent ? "Titre de l'événement…" : "Titre de la séance…"}
            style={{
              width: "100%", boxSizing: "border-box",
              background: surfaceCard, border: `1px solid ${border}`,
              borderRadius: 10, padding: "12px 14px",
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 17, fontWeight: 500, color: text,
              outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
            onBlur={e => (e.currentTarget.style.borderColor = border)}
          />

          {/* Discipline chips */}
          <div>
            <span style={labelStyle}>Discipline</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {disciplineList().map(d => {
                const active = d.id === discipline;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDiscipline(d.id)}
                    aria-pressed={active}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 12px", borderRadius: 16,
                      background: active ? d.color + "22" : surfaceCard,
                      border: `1px solid ${active ? d.color : border}`,
                      color: active ? d.color : textMid,
                      fontSize: 12, fontWeight: active ? 600 : 500,
                      fontFamily: "inherit", cursor: "pointer",
                      whiteSpace: "nowrap", flexShrink: 0,
                      transition: "background 0.12s, border-color 0.12s, color 0.12s",
                    }}
                  >
                    <DisciplineIcon id={d.iconId} size={16} color={active ? d.color : textMid} />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggle "Saisie simplifiée" (caché en mode event) */}
          {!isEvent && (
            <ToggleCard
              title="Saisie simplifiée"
              sub="Un seul écran : durée, charge planifiée, notes."
              checked={mode === "simple"}
              onChange={(checked) => setMode(checked ? "simple" : "detailed")}
              color={accent}
              tokens={{ surfaceCard, border, text, textLight }}
            />
          )}

          {/* Toggle "Mode événement" */}
          <ToggleCard
            title="Mode événement"
            sub="Stage, compétition, jour multi-jour (sans charge)."
            checked={isEvent}
            onChange={() => requestEventToggle()}
            color="#c0392b"
            tokens={{ surfaceCard, border, text, textLight }}
          />

          {/* ── Rendu selon mode ───────────────────────────── */}
          {!isEvent && mode === "simple" && (
            <SimpleModePanel
              startTime={startTime} setStartTime={setStartTime}
              estimatedTime={estimatedTime} setEstimatedTime={setEstimatedTime}
              location={location} setLocation={setLocation}
              chargePlanned={chargePlanned} setChargePlanned={setChargePlanned}
              notes={notes} setNotes={setNotes}
              metrics={metrics} updateMetric={updateMetric}
              discipline={disciplineCfg}
              tokens={{ surfaceCard, surfaceInput, border, text, textMid, textLight, accent, paperDim }}
              labelStyle={labelStyle} cardLabel={cardLabel}
            />
          )}

          {!isEvent && mode === "detailed" && (
            <DetailedModePanel
              startTime={startTime} setStartTime={setStartTime}
              estimatedTime={estimatedTime} setEstimatedTime={setEstimatedTime}
              location={location} setLocation={setLocation}
              blocks={blocks}
              addingType={addingType} setAddingType={setAddingType}
              showLibrary={showLibrary} setShowLibrary={setShowLibrary}
              addBlock={addBlock} addFromLibrary={addFromLibrary}
              updateBlock={updateBlock} removeBlock={removeBlock} moveBlock={moveBlock}
              handleDragStart={handleDragStart} handleDragOver={handleDragOver} handleDrop={handleDrop}
              hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
              availableBlocks={availableBlocks}
              allSessions={allSessions}
              onCreateCustom={onCreateCustom}
              onSaveBlock={onSaveBlock}
              discipline={disciplineCfg}
              metrics={metrics} updateMetric={updateMetric}
              climbingCalcOpen={climbingCalcOpen} setClimbingCalcOpen={setClimbingCalcOpen}
              climbingNbMov={climbingNbMov} setClimbingNbMov={setClimbingNbMov}
              climbingInt={climbingInt} setClimbingInt={setClimbingInt}
              climbingComp={climbingComp} setClimbingComp={setClimbingComp}
              saveAsTemplate={saveAsTemplate} setSaveAsTemplate={setSaveAsTemplate}
              tokens={{ surfaceCard, surfaceInput, border, borderStrong, text, textMid, textLight, accent, paperDim, inkPrimary }}
              labelStyle={labelStyle} cardLabel={cardLabel}
            />
          )}

          {isEvent && (
            <EventModePanel
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              location={location} setLocation={setLocation}
              color={color} setColor={setColor}
              isObjective={isObjective} setIsObjective={setIsObjective}
              content={eventContent} setContent={setEventContent}
              tokens={{ surfaceCard, surfaceInput, border, text, textMid, textLight, accent, paperDim }}
              labelStyle={labelStyle}
            />
          )}

        </div>

        {/* ── Footer ───────────────────────────── */}
        <div style={{
          padding: "12px 18px",
          background: paperDim,
          borderTop: `1px solid ${border}`,
          display: "flex", gap: 10, justifyContent: "flex-end",
          flexShrink: 0,
        }}>
          <button
            onClick={requestClose}
            style={{
              background: "transparent", border: `1px solid ${borderStrong}`,
              color: textMid, padding: "9px 18px",
              fontSize: 13, fontWeight: 500, borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Annuler</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: canSave ? inkPrimary : border,
              color: canSave ? (isDark ? "#1a1f1c" : "#fff") : textLight,
              border: "none", padding: "9px 22px",
              fontSize: 13, fontWeight: 600, borderRadius: 8,
              cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "inherit", opacity: canSave ? 1 : 0.6,
              flex: 1,
            }}
          >
            {isEvent
              ? (initial ? "Enregistrer" : "Ajouter au calendrier")
              : (initial ? "Enregistrer" : "Ajouter la séance")}
          </button>
        </div>
      </div>

      {/* Modèles à charger (mini bottom-sheet) */}
      {showModelPicker && (
        <ModelPickerSheet
          models={[...allSessions, ...communitySessions]}
          onPick={loadFromModel}
          onClose={() => setShowModelPicker(false)}
          tokens={{ paper, paperDim, surfaceCard, border, borderStrong, text, textLight, accent }}
        />
      )}

      {/* Confirm bascule event ON (perd blocs) */}
      {pendingEventToggle && (
        <ConfirmModal
          title="Passer en mode événement ?"
          sub="Les blocs et la charge resteront en mémoire mais ne seront pas utilisés tant que tu es en mode événement."
          confirmLabel="Continuer"
          cancelLabel="Annuler"
          onConfirm={confirmEventToggle}
          onClose={() => setPendingEventToggle(false)}
        />
      )}

      {/* Confirm fermeture si dirty */}
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </div>
  );
}

// ─── ToggleCard ────────────────────────────────────────────────────────────
function ToggleCard({ title, sub, checked, onChange, color, tokens }) {
  const { surfaceCard, border, text, textLight } = tokens;
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: surfaceCard, border: `1px solid ${checked ? color + "88" : border}`,
        borderRadius: 12, padding: "12px 14px",
        cursor: "pointer", fontFamily: "inherit",
        textAlign: "left", width: "100%",
        transition: "border-color 0.12s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{title}</div>
        <div style={{ fontSize: 11, color: textLight, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 11,
        background: checked ? color : "#aaa",
        position: "relative", flexShrink: 0, transition: "background 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s",
        }} />
      </div>
    </button>
  );
}

// ─── SimpleModePanel ───────────────────────────────────────────────────────
function SimpleModePanel({
  startTime, setStartTime, estimatedTime, setEstimatedTime,
  location, setLocation,
  chargePlanned, setChargePlanned,
  notes, setNotes,
  metrics, updateMetric,
  discipline,
  tokens, labelStyle, cardLabel,
}) {
  const { surfaceCard, surfaceInput, border, text, textMid, textLight, paperDim } = tokens;
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: surfaceInput, border: `1px solid ${border}`,
    borderRadius: 8, padding: "8px 10px",
    fontSize: 13, fontFamily: "inherit", color: text,
    outline: "none",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Durée + heure */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Heure</span>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Durée (min)</span>
          <input type="number" min="0" placeholder="60"
            value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* Lieu */}
      <div>
        <span style={labelStyle}>Lieu</span>
        <input type="text" placeholder="Salle, falaise, parcours…"
          value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} />
      </div>

      {/* Métriques (si discipline en a) */}
      {discipline.metrics.length > 0 && (
        <div style={{ background: surfaceCard, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ ...cardLabel, marginBottom: 10 }}>Métriques {discipline.label.toLowerCase()} (optionnel)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {discipline.metrics.map(k => {
              const m = METRIC_LABELS[k];
              if (!m) return null;
              return (
                <div key={k}>
                  <span style={{ ...labelStyle, marginBottom: 4 }}>{m.label}{m.suffix && ` (${m.suffix})`}</span>
                  <input
                    type={m.isText ? "text" : "number"}
                    step={m.isText ? undefined : m.step}
                    placeholder={m.placeholder}
                    value={metrics[k] ?? ""}
                    onChange={e => updateMetric(k, m.isText ? e.target.value : (e.target.value === "" ? null : +e.target.value))}
                    style={{ ...inputStyle, background: paperDim }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charge planifiée (pips) */}
      <ChargePlannedPips
        value={chargePlanned}
        onChange={setChargePlanned}
        color={discipline.color}
        tokens={{ surfaceCard, border, text, textMid, textLight }}
      />

      {/* Notes */}
      <div>
        <span style={labelStyle}>Notes</span>
        <textarea
          rows={4}
          placeholder="Détails, ressenti, contexte…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>
    </div>
  );
}

// ─── ChargePlannedPips ─────────────────────────────────────────────────────
function ChargePlannedPips({ value, onChange, color, tokens }) {
  const { surfaceCard, border, textMid, textLight } = tokens;
  return (
    <div style={{ background: surfaceCard, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: textMid }}>Charge planifiée</span>
        <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 700, color }}>
          {value} / 10
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const active = value >= n;
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              aria-label={`Charge ${n} sur 10`}
              style={{
                height: 26, borderRadius: 5, border: "none",
                background: active ? color : (border),
                color: active ? "#fff" : textLight,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "background 0.1s",
              }}
            >{n}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: textLight, marginTop: 6 }}>
        1 = très facile · 5 = soutenu · 10 = maximal
      </div>
    </div>
  );
}

// ─── DetailedModePanel ─────────────────────────────────────────────────────
function DetailedModePanel({
  startTime, setStartTime, estimatedTime, setEstimatedTime,
  location, setLocation,
  blocks, addingType, setAddingType, showLibrary, setShowLibrary,
  addBlock, addFromLibrary, updateBlock, removeBlock, moveBlock,
  handleDragStart, handleDragOver, handleDrop, hoverIdx, setHoverIdx,
  availableBlocks, allSessions, onCreateCustom, onSaveBlock,
  discipline,
  metrics, updateMetric,
  saveAsTemplate, setSaveAsTemplate,
  tokens, labelStyle, cardLabel,
}) {
  const { surfaceCard, surfaceInput, border, borderStrong, text, textMid, textLight, accent, paperDim } = tokens;
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: surfaceInput, border: `1px solid ${border}`,
    borderRadius: 8, padding: "8px 10px",
    fontSize: 13, fontFamily: "inherit", color: text,
    outline: "none",
  };
  const totalCharge = blocks.length > 0
    ? summarizePlannedChargeFromBlocks(blocks, discipline.id)
    : 0;
  const totalDuration = blocks.reduce((s, b) => s + (b.duration || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Durée + lieu */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Heure</span>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Durée totale (min)</span>
          <input type="number" min="0" placeholder={String(totalDuration || 60)}
            value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <span style={labelStyle}>Lieu</span>
        <input type="text" placeholder="Salle, falaise, parcours…"
          value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} />
      </div>

      {/* Blocs */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={cardLabel}>Blocs</span>
          <span style={{ fontSize: 11, color: textLight }}>
            {blocks.length} bloc{blocks.length !== 1 ? "s" : ""}
            {totalDuration > 0 && ` · ${totalDuration} min`}
            {totalCharge > 0 && <> · <strong style={{ color: discipline.color }}>charge {totalCharge}/10</strong></>}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {blocks.map((bl, i) => {
            const type = bl.type || bl.blockType;
            const cfg = BLOCK_TYPES[type] || { color: discipline.color };
            const isHover = hoverIdx === i;
            return (
              <div
                key={bl.id}
                draggable
                onDragStart={handleDragStart(i)}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop(i)}
                onDragEnd={() => { setHoverIdx(null); }}
                style={{
                  background: surfaceCard,
                  border: `1px solid ${border}`,
                  borderLeft: `3px solid ${cfg.color}`,
                  borderTop: isHover ? `2px solid ${accent}` : `1px solid ${border}`,
                  borderRadius: 8,
                  transition: "border-color 0.12s",
                }}
              >
                <BlockEditorCompact
                  block={bl}
                  onUpdate={changes => updateBlock(bl.id, changes)}
                  onRemove={() => removeBlock(bl.id)}
                  canMoveUp={i > 0}
                  canMoveDown={i < blocks.length - 1}
                  onMoveUp={() => moveBlock(bl.id, -1)}
                  onMoveDown={() => moveBlock(bl.id, 1)}
                  allSessions={allSessions}
                  onCreateCustom={onCreateCustom}
                  onSaveAsBlock={onSaveBlock}
                  discipline={discipline.id}
                  tokens={{ text, textLight, isDark: false }}
                  cfg={cfg}
                />
              </div>
            );
          })}
        </div>

        {/* Add block */}
        {!addingType && !showLibrary && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              onClick={() => setAddingType(true)}
              style={{
                flex: 1, border: `1px dashed ${borderStrong}`,
                background: "transparent", borderRadius: 8,
                padding: "10px 12px", fontSize: 13,
                color: accent, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              }}
            >+ Ajouter un bloc</button>
            {availableBlocks.length > 0 && (
              <button
                onClick={() => setShowLibrary(true)}
                style={{
                  border: `1px dashed ${borderStrong}`, background: "transparent",
                  borderRadius: 8, padding: "10px 14px",
                  fontSize: 12, color: textMid, fontFamily: "inherit", cursor: "pointer",
                }}
              >Bibliothèque ({availableBlocks.length})</button>
            )}
          </div>
        )}
        {addingType && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {discipline.blockTypes.map(type => {
              const cfg = BLOCK_TYPES[type] || { color: discipline.color };
              return (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  style={{
                    flex: "1 1 90px", padding: "8px 10px",
                    background: cfg.color + "18", border: `1px solid ${cfg.color}55`,
                    borderRadius: 6, color: cfg.color, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                  }}
                >{type}</button>
              );
            })}
            <button
              onClick={() => setAddingType(false)}
              style={{
                padding: "8px 12px", background: "none", border: `1px solid ${border}`,
                borderRadius: 6, color: textLight, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11,
              }}
            >Annuler</button>
          </div>
        )}
        {showLibrary && (
          <div style={{ marginTop: 10, border: `1px solid ${border}`, borderRadius: 8, maxHeight: 220, overflowY: "auto", background: surfaceInput }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: textLight, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Bibliothèque de blocs</span>
              <button onClick={() => setShowLibrary(false)} style={{ background: "none", border: "none", color: textLight, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
            </div>
            {availableBlocks.map(lb => {
              const cfg = BLOCK_TYPES[lb.blockType] || { color: discipline.color };
              return (
                <div
                  key={lb.id}
                  onClick={() => addFromLibrary(lb)}
                  style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${border}` }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: text }}>{lb.name}</div>
                    <div style={{ fontSize: 10, color: textLight }}>
                      {lb.blockType}{lb.duration ? ` · ${lb.duration} min` : ""}{lb.charge ? ` · ⚡${lb.charge}` : ""}
                    </div>
                  </div>
                  <span style={{ color: accent, fontSize: 16, lineHeight: 1 }}>+</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Métriques discipline (option) */}
      {discipline.metrics.length > 0 && (
        <div style={{ background: surfaceCard, border: `1px solid ${border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ ...cardLabel, marginBottom: 10 }}>Métriques {discipline.label.toLowerCase()} (optionnel)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {discipline.metrics.map(k => {
              const m = METRIC_LABELS[k];
              if (!m) return null;
              return (
                <div key={k}>
                  <span style={{ ...labelStyle, marginBottom: 4 }}>{m.label}{m.suffix && ` (${m.suffix})`}</span>
                  <input
                    type={m.isText ? "text" : "number"}
                    step={m.isText ? undefined : m.step}
                    placeholder={m.placeholder}
                    value={metrics[k] ?? ""}
                    onChange={e => updateMetric(k, m.isText ? e.target.value : (e.target.value === "" ? null : +e.target.value))}
                    style={{ ...inputStyle, background: paperDim }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save as template */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: textMid, cursor: "pointer" }}>
        <input type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} />
        Sauvegarder comme modèle réutilisable
      </label>
    </div>
  );
}

// ─── EventModePanel ─────────────────────────────────────────────────────────
function EventModePanel({
  startDate, setStartDate, endDate, setEndDate,
  location, setLocation,
  color, setColor,
  isObjective, setIsObjective,
  content, setContent,
  tokens, labelStyle,
}) {
  const { surfaceInput, border, text, textMid, textLight } = tokens;
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: surfaceInput, border: `1px solid ${border}`,
    borderRadius: 8, padding: "8px 10px",
    fontSize: 13, fontFamily: "inherit", color: text,
    outline: "none",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Date de début</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Date de fin</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <span style={labelStyle}>Lieu</span>
        <input type="text" placeholder="Buoux, Fontainebleau…"
          value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <span style={labelStyle}>Couleur</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EVENT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: c, cursor: "pointer", border: "none", padding: 0,
                boxShadow: color === c
                  ? `0 0 0 2px ${text}, 0 0 0 4px ${c}`
                  : "0 1px 3px rgba(0,0,0,0.15)",
                transition: "box-shadow 0.15s",
              }}
            />
          ))}
        </div>
      </div>
      <label style={{
        display: "flex", alignItems: "center", gap: 10,
        background: tokens.surfaceCard, border: `1px solid ${border}`,
        borderRadius: 12, padding: "12px 14px", cursor: "pointer",
      }}>
        <input type="checkbox" checked={isObjective} onChange={e => setIsObjective(e.target.checked)} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text }}>Marquer comme objectif</div>
          <div style={{ fontSize: 11, color: textLight, marginTop: 2 }}>
            Visible dans le calendrier annuel et sur les cycles.
          </div>
        </div>
      </label>
      <div>
        <span style={labelStyle}>Notes / description</span>
        <textarea
          rows={5}
          placeholder="Lieu, participants, projet…"
          value={content}
          onChange={e => setContent(e.target.value)}
          style={{ ...inputStyle, minHeight: 100, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>
      <div style={{ fontSize: 11, color: textMid, fontStyle: "italic" }}>
        Le mode événement n'utilise pas la charge planifiée ni les blocs.
      </div>
    </div>
  );
}

// ─── BlockEditorCompact ─────────────────────────────────────────────────────
function BlockEditorCompact({
  block, onUpdate, onRemove,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
  allSessions, onCreateCustom, onSaveAsBlock,
  discipline, cfg, tokens,
}) {
  const [expanded, setExpanded] = useState(false);
  const type = block.type || block.blockType || "Bloc";
  const text = tokens.text;
  const textLight = tokens.textLight;
  const meta = [
    block.duration ? `${block.duration} min` : null,
    cfg.hasCharge && block.charge ? `charge ${block.charge}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <span aria-hidden style={{
          fontSize: 14, color: textLight, cursor: "grab",
          letterSpacing: "-0.1em", userSelect: "none", padding: "0 2px",
        }}>⋮⋮</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {block.name || block.presetName || type}
          </div>
          <div style={{ fontSize: 11, color: textLight, marginTop: 2 }}>
            <span style={{ color: cfg.color, fontWeight: 600 }}>{type}</span>
            {meta && <span> · {meta}</span>}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label="Supprimer le bloc"
          style={{ background: "none", border: "none", color: "#b05050", cursor: "pointer", padding: "3px 6px", fontSize: 13, fontFamily: "inherit" }}
        >✕</button>
        <span style={{ color: textLight, fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 8px 10px" }}>
          <BlockEditor
            block={block}
            onUpdate={onUpdate}
            onRemove={onRemove}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            allSessions={allSessions}
            onCreateCustom={onCreateCustom}
            onSaveAsBlock={onSaveAsBlock}
            discipline={discipline}
          />
        </div>
      )}
    </div>
  );
}

// ─── ModelPickerSheet ─────────────────────────────────────────────────────
function ModelPickerSheet({ models, onPick, onClose, tokens }) {
  const { paper, surfaceCard, border, text, textLight, accent } = tokens;
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const seen = new Set();
    return models.filter(m => {
      const n = (m.name || m.title || "").toLowerCase();
      if (!n || seen.has(n)) return false;
      seen.add(n);
      if (!q) return true;
      return n.includes(q);
    }).slice(0, 30);
  }, [models, query]);
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        zIndex: Z.nested,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: 12,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: paper, border: `1px solid ${border}`,
        borderRadius: "16px 16px 0 0",
        width: "100%", maxWidth: 480, maxHeight: "75vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.20)",
      }}>
        <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${border}` }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 16, fontWeight: 500, color: text, marginBottom: 6 }}>
            Charger un modèle
          </div>
          <input
            type="text"
            placeholder="Rechercher…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              background: surfaceCard, border: `1px solid ${border}`,
              borderRadius: 8, padding: "8px 10px",
              fontSize: 13, fontFamily: "inherit", color: text,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", color: textLight, fontSize: 12 }}>
              Aucun modèle trouvé.
            </div>
          ) : filtered.map((m, i) => (
            <button
              key={m.id || i}
              onClick={() => onPick(m)}
              style={{
                width: "100%", textAlign: "left",
                padding: "10px 16px",
                background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 10,
                borderBottom: `1px solid ${border}`,
              }}
            >
              <div style={{ width: 4, height: 28, borderRadius: 2, background: getChargeColor(m.charge ?? 0) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: text }}>{m.title || m.name}</div>
                <div style={{ fontSize: 11, color: textLight }}>
                  {m.type || "Séance"}{m.blocks?.length ? ` · ${m.blocks.length} bloc${m.blocks.length > 1 ? "s" : ""}` : ""}{m.estimatedTime ? ` · ${m.estimatedTime} min` : ""}
                </div>
              </div>
              {m.charge != null && (
                <span style={{ fontSize: 11, color: accent }}>⚡{m.charge}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${border}` }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "8px 16px",
              background: "transparent", border: `1px solid ${border}`,
              borderRadius: 8, color: textLight,
              fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >Fermer</button>
        </div>
      </div>
    </div>
  );
}

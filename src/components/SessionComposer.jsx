import { useState, useRef, useEffect, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";
import { getChargeColor } from "../lib/charge.js";
import { BlockEditor } from "./BlockEditor.jsx";
import { Z } from "../theme/makeStyles.js";

// ─── SESSION COMPOSER ─────────────────────────────────────────────────────────
// Composant unifié pour créer/modifier une séance.
// Remplace SessionBuilder et SessionComposerModal.

// Évolution de couleur de charge totale pour la chip header
function chargeChipColors(charge, isDark) {
  if (charge < 4)  return { bg: isDark ? "#1a2a1c" : "#e3f0e5", fg: isDark ? "#7ab890" : "#2e6b3f" };
  if (charge < 7)  return { bg: isDark ? "#2a2410" : "#fef2dc", fg: isDark ? "#d4a843" : "#b8881a" };
  return { bg: isDark ? "#2a1a10" : "#fbecdc", fg: isDark ? "#c8906a" : "#b8651a" };
}

export function SessionComposer({
  initial,
  titlePrefill,
  dayLabel,
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

  // ── State ─────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial?.title || initial?.name || titlePrefill || "");
  const [estimatedTime, setEstimatedTime] = useState(initial?.estimatedTime != null ? String(initial.estimatedTime) : "");
  const [note, setNote] = useState(initial?.note || "");
  const [blocks, setBlocks] = useState(() => {
    if (initial?.blocks?.length) {
      return initial.blocks.map(b => ({
        ...b,
        id: b.id || generateId(),
        // Normalise blockType (DB) vs type (inline)
        type: b.type || b.blockType,
        blockType: b.blockType || b.type,
      }));
    }
    return [
      { id: generateId(), type: "Échauffement", blockType: "Échauffement", charge: 0, duration: 15, location: "", notes: "" },
      { id: generateId(), type: "Retour au calme", blockType: "Retour au calme", charge: 3, duration: 10, location: "", notes: "" },
    ];
  });
  const [addingType, setAddingType] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const dragIdxRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Focus title au montage
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Cmd+Enter to save, Esc to close
  const handleSaveRef = useRef(null);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
      if ((e.key === "Enter") && (e.metaKey || e.ctrlKey)) {
        handleSaveRef.current?.();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalCharge = blocks
    .filter(b => (b.type || b.blockType) === "Grimpe" || (b.type || b.blockType) === "Exercices" || (b.type || b.blockType) === "Suspension")
    .reduce((s, b) => s + (b.charge || 0), 0);

  const totalDuration = blocks.reduce((s, b) => s + (b.duration || 0), 0);
  const mainTypeChip = useMemo(() => {
    const climbing = blocks.find(b => (b.type || b.blockType) === "Grimpe");
    if (climbing) return "Voie / Bloc";
    const susp = blocks.find(b => (b.type || b.blockType) === "Suspension");
    if (susp) return "Hangboard";
    const ex = blocks.find(b => (b.type || b.blockType) === "Exercices");
    if (ex) return "Exercice";
    return "Séance";
  }, [blocks]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addBlock = (type) => {
    const cfg = BLOCK_TYPES[type];
    const newBlock = {
      id: generateId(),
      type, blockType: type,
      name: "",
      charge: cfg.defaultCharge,
      duration: cfg.defaultDuration,
      location: "",
      notes: "",
    };
    const insertIdx = blocks.length > 0 && (blocks[blocks.length - 1].type || blocks[blocks.length - 1].blockType) === "Retour au calme"
      ? blocks.length - 1
      : blocks.length;
    setBlocks(b => [...b.slice(0, insertIdx), newBlock, ...b.slice(insertIdx)]);
    setAddingType(false);
  };

  const addFromLibrary = (libBlock) => {
    setBlocks(b => [...b, {
      ...libBlock,
      id: generateId(),
      type: libBlock.blockType,
    }]);
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

  // Drag & drop avec HTML5
  const handleDragStart = (idx) => (e) => {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* ignore */ }
  };
  const handleDragOver = (idx) => (e) => {
    e.preventDefault();
    setHoverIdx(idx);
  };
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

  const loadFromCommunity = (cs) => {
    if (cs.title) setTitle(cs.title);
    else if (cs.name) setTitle(cs.name);
    if (cs.estimatedTime) setEstimatedTime(String(cs.estimatedTime));
    if (cs.note) setNote(cs.note);
    if (cs.blocks) setBlocks(cs.blocks.map(b => ({
      ...b,
      id: generateId(),
      type: b.type || b.blockType,
      blockType: b.blockType || b.type,
    })));
    setCommunityOpen(false);
  };

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const cleanBlocks = blocks.map(({ id: bid, ...rest }) => ({
      ...rest,
      id: bid,
      type: rest.type || rest.blockType,
      blockType: rest.blockType || rest.type,
    }));
    onSave({
      id: initial?.id || generateId(),
      title: title.trim(),
      name: title.trim(),
      estimatedTime: estimatedTime ? +estimatedTime : (totalDuration || null),
      note: note.trim() || null,
      charge: totalCharge,
      blocks: cleanBlocks,
      isCustom: true,
      type: mainTypeChip === "Exercice" ? "Exercice" : "Grimpe",
    });
  };
  // Stockage dans une closure via useEffect pour respecter les règles react-hooks/refs
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ── Couleurs / tokens (alignés sur le mockup terracotta) ──────────────────
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

  const chipBase = {
    background: surfaceCard,
    border: `1px solid ${border}`,
    borderRadius: 18,
    padding: "5px 11px",
    fontSize: 12,
    color: textMid,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "inherit",
    lineHeight: 1.2,
  };

  const chargeColors = chargeChipColors(totalCharge, isDark);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        zIndex: Z.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Modifier la séance" : "Composer la séance"}
        style={{
          background: paper,
          borderRadius: 16,
          border: `1px solid ${borderStrong}`,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        }}
      >
        {/* ── Header sticky avec gradient ─────────────────────────────── */}
        <div
          style={{
            padding: "14px 18px 12px",
            background: isDark
              ? `linear-gradient(180deg, ${paper}, ${paperDim})`
              : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
            borderBottom: `1px solid ${border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 500, color: text, lineHeight: 1.2 }}>
                {initial ? "Modifier la séance" : "Composer la séance"}
              </div>
              {dayLabel && <div style={{ fontSize: 12, color: textLight, marginTop: 3 }}>{dayLabel}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{ background: "none", border: "none", color: textLight, cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1, fontFamily: "inherit" }}
            >✕</button>
          </div>
        </div>

        {/* ── Body scrollable ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 8px" }}>
          {/* Titre (big serif) */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Nommer la séance…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: surfaceCard,
              border: `1px solid ${border}`,
              borderRadius: 10,
              padding: "12px 14px",
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 16,
              fontWeight: 500,
              color: text,
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
            onBlur={e => (e.currentTarget.style.borderColor = border)}
          />

          {/* Meta chips */}
          <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={chipBase}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
              {mainTypeChip}
            </span>
            <span style={chipBase}>
              <input
                type="number"
                min="0"
                placeholder="—"
                value={estimatedTime}
                onChange={e => setEstimatedTime(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: 36,
                  fontSize: 12,
                  color: textMid,
                  fontFamily: "inherit",
                  padding: 0,
                  textAlign: "right",
                }}
              />
              <span style={{ color: textLight }}>min</span>
            </span>
            <span
              style={{
                ...chipBase,
                marginLeft: "auto",
                background: chargeColors.bg,
                borderColor: chargeColors.fg + "55",
                color: chargeColors.fg,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: chargeColors.fg }} />
              Charge · {totalCharge}
            </span>
          </div>

          {/* Note rapide (optionnel) */}
          {(note || initial) && (
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Note / objectif (optionnel)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 10,
                background: "transparent",
                border: `1px dashed ${border}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontFamily: "inherit",
                color: textMid,
                outline: "none",
              }}
            />
          )}

          {/* Modèle communauté (collapsible) */}
          {communitySessions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setCommunityOpen(o => !o)}
                style={{
                  fontSize: 11,
                  color: accent,
                  background: "none",
                  border: `1px dashed ${accent}55`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.04em",
                }}
              >
                {communityOpen ? "▲" : "▼"} Charger un modèle communauté
              </button>
              {communityOpen && (
                <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto", border: `1px solid ${border}`, borderRadius: 6 }}>
                  {communitySessions.map((cs, i) => (
                    <div
                      key={i}
                      onClick={() => loadFromCommunity(cs)}
                      style={{ padding: "8px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, borderBottom: i < communitySessions.length - 1 ? `1px solid ${border}` : "none" }}
                    >
                      <span style={{ color: text, fontWeight: 500 }}>{cs.title || cs.name}</span>
                      <span style={{ fontSize: 11, color: getChargeColor(cs.charge), fontWeight: 700 }}>⚡{cs.charge}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Blocs header */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 13, fontWeight: 500, color: text, letterSpacing: "0.04em" }}>
              Blocs
            </span>
            <span style={{ fontSize: 11, color: textLight }}>
              {blocks.length} bloc{blocks.length !== 1 ? "s" : ""}
              {totalDuration > 0 && ` · ${totalDuration} min`}
              {totalCharge > 0 && <> · <strong style={{ color: chargeColors.fg }}>charge totale {totalCharge}</strong></>}
            </span>
          </div>

          {/* Liste de blocs avec drag-and-drop */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {blocks.map((bl, i) => {
              const type = bl.type || bl.blockType;
              const cfg = BLOCK_TYPES[type] || { color: "#888" };
              const isHover = hoverIdx === i;
              return (
                <div
                  key={bl.id}
                  draggable
                  onDragStart={handleDragStart(i)}
                  onDragOver={handleDragOver(i)}
                  onDrop={handleDrop(i)}
                  onDragEnd={() => { setHoverIdx(null); dragIdxRef.current = null; }}
                  style={{
                    background: surfaceCard,
                    border: `1px solid ${border}`,
                    borderLeft: `3px solid ${cfg.color}`,
                    borderTop: isHover ? `2px solid ${accent}` : `1px solid ${border}`,
                    borderRadius: 8,
                    transition: "border-color 0.12s, box-shadow 0.12s",
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
                    isDark={isDark}
                    cfg={cfg}
                    textLight={textLight}
                  />
                </div>
              );
            })}
          </div>

          {/* Ajouter un bloc */}
          {!addingType && !showLibrary ? (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                onClick={() => setAddingType(true)}
                style={{
                  flex: 1,
                  border: `1px dashed ${borderStrong}`,
                  background: "transparent",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: accent,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "center",
                }}
              >
                + Ajouter un bloc
              </button>
              {availableBlocks.length > 0 && (
                <button
                  onClick={() => setShowLibrary(true)}
                  style={{
                    border: `1px dashed ${borderStrong}`,
                    background: "transparent",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12,
                    color: textMid,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  Bibliothèque ({availableBlocks.length})
                </button>
              )}
            </div>
          ) : addingType ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {["Grimpe", "Exercices", "Suspension", "Étirements", "Échauffement", "Retour au calme"].map(type => {
                const cfg = BLOCK_TYPES[type];
                return (
                  <button
                    key={type}
                    style={{
                      flex: "1 1 90px",
                      padding: "8px 10px",
                      background: cfg.color + "18",
                      border: `1px solid ${cfg.color}55`,
                      borderRadius: 6,
                      color: cfg.color,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                    onClick={() => addBlock(type)}
                  >
                    {type}
                  </button>
                );
              })}
              <button
                style={{
                  padding: "8px 12px",
                  background: "none",
                  border: `1px solid ${border}`,
                  borderRadius: 6,
                  color: textLight,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                }}
                onClick={() => setAddingType(false)}
              >
                Annuler
              </button>
            </div>
          ) : (
            // Library picker
            <div style={{ marginTop: 10, border: `1px solid ${border}`, borderRadius: 8, maxHeight: 220, overflowY: "auto", background: surfaceInput }}>
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: textLight, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
                  Bibliothèque de blocs
                </span>
                <button onClick={() => setShowLibrary(false)} style={{ background: "none", border: "none", color: textLight, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
              </div>
              {availableBlocks.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", color: textLight, fontSize: 12 }}>Aucun bloc en bibliothèque</div>
              ) : (
                availableBlocks.map(lb => {
                  const cfg = BLOCK_TYPES[lb.blockType] || { color: "#888" };
                  return (
                    <div
                      key={lb.id}
                      onClick={() => addFromLibrary(lb)}
                      style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${border}` }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lb.name}</div>
                        <div style={{ fontSize: 10, color: textLight }}>
                          {lb.blockType}
                          {lb.duration ? ` · ${lb.duration} min` : ""}
                          {lb.charge ? ` · ⚡${lb.charge}` : ""}
                        </div>
                      </div>
                      <span style={{ color: accent, fontSize: 16, lineHeight: 1 }}>+</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Footer sticky ───────────────────────────────────────────── */}
        <div
          style={{
            padding: "12px 18px",
            background: paperDim,
            borderTop: `1px solid ${border}`,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${borderStrong}`,
              color: textMid,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: canSave ? inkPrimary : border,
              border: "none",
              color: canSave ? (isDark ? "#1a1f1c" : "#fff") : textLight,
              padding: "9px 22px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              opacity: canSave ? 1 : 0.6,
              transition: "filter 0.12s, opacity 0.12s",
            }}
            onMouseEnter={e => { if (canSave) e.currentTarget.style.filter = "brightness(1.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK EDITOR (compact wrapper) ─────────────────────────────────────────
// Affiche un bloc de séance avec poignée drag, infos compactes,
// et bascule vers le BlockEditor complet pour l'édition.

function BlockEditorCompact({
  block, onUpdate, onRemove,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
  allSessions, onCreateCustom, onSaveAsBlock,
  isDark, cfg, textLight,
}) {
  const [expanded, setExpanded] = useState(false);
  const type = block.type || block.blockType || "Bloc";
  const text = isDark ? "#e8e4de" : "#2a2218";

  const meta = [
    block.duration ? `${block.duration} min` : null,
    cfg.hasCharge && block.charge ? `charge ${block.charge}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      {/* Compact row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span
          aria-hidden
          title="Glisser pour réordonner"
          style={{
            fontSize: 14,
            color: textLight,
            cursor: "grab",
            letterSpacing: "-0.1em",
            userSelect: "none",
            padding: "0 2px",
          }}
        >⋮⋮</span>
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
          style={{
            background: "none",
            border: "none",
            color: isDark ? "#c87070" : "#b05050",
            cursor: "pointer",
            padding: "3px 6px",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >✕</button>
        <span style={{ color: textLight, fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded editor */}
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
          />
        </div>
      )}
    </div>
  );
}

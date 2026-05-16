import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";
import { getChargeColor, getNbMouvementsZone, VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES } from "../lib/charge.js";
import { BlockEditor } from "./BlockEditor.jsx";
import { RichText } from "./RichText.jsx";

// ─── TEMPLATE EDITOR MODAL ──────────────────────────────────────────────────
// Pre-filled session editor — user picks a template, then customises everything
// before adding it to a day. Optionally saves as a new template.

export function TemplateEditorModal({
  template, startTime: initStart, address: initAddr, coachNote: initNote,
  onConfirm, onSaveAsTemplate, onSaveBlock, onClose, allSessions, dbBlocks, onCreateCustom,
}) {
  const { styles, isDark } = useThemeCtx();
  const originalName = template.title || template.name || "";

  // ── Detect mode ──
  const isBlockTemplate = template.isBlock === true;
  const hasBlocks = Array.isArray(template.blocks) && template.blocks.length > 0;
  const hasText   = !!(template.warmup || template.main || template.cooldown);
  const initialMode = hasBlocks || isBlockTemplate ? "blocks" : hasText ? "text" : "blocks";

  // ── Session info state ──
  const [title, setTitle]             = useState(originalName);
  const [type, setType]               = useState(template.type || "Grimpe");
  const [estimatedTime, setEstTime]   = useState(template.estimatedTime ?? template.duration ?? "");
  const [location, setLocation]       = useState(template.location || "");
  const [note, setNote]               = useState(template.note || "");
  const [minRecovery, setMinRecov]    = useState(template.minRecovery ?? "");

  // ── Scheduling state ──
  const [editStart, setEditStart]     = useState(initStart || "09:00");
  const [editAddr, setEditAddr]       = useState(initAddr || "");
  const [editCoachNote, setEditCN]    = useState(initNote || "");

  // ── Mode ──
  const [mode] = useState(initialMode);

  // ── Block state (enriched from dbBlocks) ──
  const enrichBlock = (b) => {
    // Merge DB block data if available (config, description)
    const dbMatch = (dbBlocks || []).find(db => db.id === b.id || (db.name === b.name && db.blockType === (b.type || b.blockType)));
    const merged = dbMatch ? { ...dbMatch, ...b, config: b.config ?? dbMatch.config ?? null, description: b.description ?? dbMatch.description ?? b.notes ?? "", type: b.type || b.blockType || dbMatch.blockType } : b;
    return { ...merged, id: generateId(), type: merged.type || merged.blockType || "Grimpe" };
  };
  const initBlocks = () => {
    if (isBlockTemplate) {
      const dbMatch = (dbBlocks || []).find(db => db.id === template.id || db.name === template.name);
      return [enrichBlock({
        type: template.blockType || "Grimpe",
        name: template.name, charge: template.charge || 0,
        duration: template.duration || 0,
        description: template.description || "",
        config: template.config ?? dbMatch?.config ?? null,
      })];
    }
    if (hasBlocks) return template.blocks.map(b => enrichBlock(b));
    return [
      { id: generateId(), type: "Échauffement", charge: 5, duration: 15, location: "", notes: "" },
      { id: generateId(), type: "Retour au calme", charge: 3, duration: 10, location: "", notes: "" },
    ];
  };
  const [blocks, setBlocks] = useState(initBlocks);
  const [addingType, setAddingType] = useState(false);

  // ── Text state ──
  const [warmup, setWarmup]     = useState(template.warmup || "");
  const [main, setMain]         = useState(template.main || "");
  const [cooldown, setCooldown] = useState(template.cooldown || "");
  const [section, setSection]   = useState("main");
  const [preview, setPreview]   = useState(false);

  // ── Text charge (for text-mode sessions) ──
  const [textCharge, setTextCharge] = useState(template.charge ?? 24);
  const [calcOpen, setCalcOpen]     = useState(false);
  const [nbMouvements, setNbMouv]   = useState("");
  const [calcZone, setCalcZone]     = useState(3);
  const [calcComplexity, setCalcCx] = useState(3);

  // ── Save-as-template state ──
  const [saveOpen, setSaveOpen]     = useState(false);
  const [saveName, setSaveName]     = useState("");
  const [saved, setSaved]           = useState(false);

  // ── Derived ──
  const totalBlockCharge = blocks.filter(b => b.type === "Grimpe" || b.type === "Exercices").reduce((s, b) => s + (b.charge || 0), 0);
  const charge = mode === "blocks" ? totalBlockCharge : textCharge;

  const currentText = section === "warmup" ? warmup : section === "main" ? main : cooldown;
  const setCurrentText = section === "warmup" ? setWarmup : section === "main" ? setMain : setCooldown;
  const sectionLabels = { warmup: "Échauffement", main: "Cœur de séance", cooldown: "Retour au calme" };

  // ── Block management ──
  const addBlock = (btype) => {
    const cfg = BLOCK_TYPES[btype];
    const nb = { id: generateId(), type: btype, charge: cfg.defaultCharge, duration: cfg.defaultDuration, location: "", notes: "" };
    const insertIdx = blocks.length > 0 && blocks[blocks.length - 1].type === "Retour au calme"
      ? blocks.length - 1 : blocks.length;
    setBlocks(b => [...b.slice(0, insertIdx), nb, ...b.slice(insertIdx)]);
    setAddingType(false);
  };
  const updateBlock = (id, changes) => setBlocks(b => b.map(bl => bl.id === id ? { ...bl, ...changes } : bl));
  const removeBlock = (id) => setBlocks(b => b.filter(bl => bl.id !== id));
  const moveBlock = (id, dir) => setBlocks(b => {
    const i = b.findIndex(bl => bl.id === id);
    if (i + dir < 0 || i + dir >= b.length) return b;
    const arr = [...b]; [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]]; return arr;
  });

  // ── End time calc ──
  const getEndTime = (start, dur) => {
    if (!start || !dur) return null;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + Number(dur);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const endTime = getEndTime(editStart, estimatedTime);

  // ── Confirm ──
  const handleConfirm = () => {
    if (!title.trim()) return;
    const session = {
      id: generateId(),
      templateId: template.id,
      name: title.trim(),
      title: title.trim(),
      type,
      charge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      location: location.trim() || null,
      note: note.trim() || null,
      minRecovery: minRecovery ? +minRecovery : null,
      ...(mode === "blocks" ? { blocks } : {}),
      ...(mode === "text" ? { warmup, main, cooldown } : {}),
      startTime: editStart,
      endTime: endTime ?? undefined,
      ...(editCoachNote.trim() ? { coachNote: editCoachNote.trim() } : {}),
      ...(editAddr.trim() ? { address: editAddr.trim() } : {}),
      isCustom: true,
    };
    onConfirm(session);
  };

  // ── Save as template ──
  const handleSaveAsTemplate = () => {
    const tName = saveName.trim() || title.trim();
    if (!tName) return;
    onSaveAsTemplate({
      id: generateId(),
      name: tName, type, charge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      location: location.trim() || null,
      minRecovery: minRecovery ? +minRecovery : null,
      ...(mode === "blocks" ? { blocks: blocks.map(b => ({ ...b, id: generateId() })) } : {}),
      ...(mode === "text" ? { warmup, main, cooldown } : {}),
      isCustom: true,
    });
    setSaved(true);
    setSaveOpen(false);
    setSaveName("");
    setTimeout(() => setSaved(false), 3000);
  };

  // ── Styles ──
  const surface = isDark ? "#241b13" : "#ffffff";
  const bg2     = isDark ? "#241b13" : "#f3f7f4";
  const border  = isDark ? "#3a2e22" : "#daeade";
  const text    = isDark ? "#f0e6d0" : "#1a2e1f";
  const muted   = isDark ? "#a89a82" : "#6b8c72";
  const accent  = isDark ? "#e0a875" : "#8b4c20";

  const inputBase = { background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 11px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 9, color: muted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 };
  const sectionStyle = { padding: "10px 12px", background: isDark ? "#1a1410" : "#f5f0e8", borderRadius: 8, border: `1px solid ${isDark ? "#2a2018" : "#ccc6b8"}` };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px #0009", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Personnaliser la séance</div>
            <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
              Depuis : <span style={{ fontWeight: 600, color: accent }}>{originalName}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ─ Infos séance ─ */}
          <div style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={labelStyle}>Titre de la séance *</div>
              <input style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
                value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 auto" }}>
                <div style={labelStyle}>Type</div>
                <select style={{ ...inputBase, padding: "6px 8px" }} value={type} onChange={e => setType(e.target.value)}>
                  <option>Grimpe</option>
                  <option>Exercice</option>
                </select>
              </div>
              <div style={{ flex: "1 1 80px" }}>
                <div style={labelStyle}>Durée (min)</div>
                <input type="number" min="0" style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
                  placeholder="90" value={estimatedTime} onChange={e => setEstTime(e.target.value)} />
              </div>
              <div style={{ flex: "2 1 120px" }}>
                <div style={labelStyle}>Lieu</div>
                <input style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
                  placeholder="Salle, falaise…" value={location} onChange={e => setLocation(e.target.value)} />
              </div>
            </div>
            <div>
              <div style={labelStyle}>Note rapide</div>
              <input style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
                placeholder="Objectif, contexte…" value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

          {/* ─ BLOCK MODE ─ */}
          {mode === "blocks" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Blocs de séance</span>
                <span style={{ fontSize: 11, color: getChargeColor(totalBlockCharge), fontWeight: 700 }}>⚡{totalBlockCharge} total</span>
              </div>

              {blocks.map((bl, i) => (
                <BlockEditor
                  key={bl.id} block={bl}
                  onUpdate={changes => updateBlock(bl.id, changes)}
                  onRemove={() => removeBlock(bl.id)}
                  canMoveUp={i > 0} canMoveDown={i < blocks.length - 1}
                  onMoveUp={() => moveBlock(bl.id, -1)}
                  onMoveDown={() => moveBlock(bl.id, 1)}
                  allSessions={allSessions}
                  onCreateCustom={onCreateCustom}
                  onSaveAsBlock={onSaveBlock}
                />
              ))}

              {!addingType ? (
                <button
                  onClick={() => setAddingType(true)}
                  style={{ width: "100%", textAlign: "center", padding: "8px 0", background: "none", border: `1px dashed ${border}`, borderRadius: 6, color: muted, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}
                >
                  ＋ Ajouter un bloc
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Grimpe", "Exercices", "Suspension"].map(btype => {
                    const cfg = BLOCK_TYPES[btype];
                    return (
                      <button key={btype} onClick={() => addBlock(btype)}
                        style={{ flex: "1 1 80px", padding: "7px 10px", background: cfg.color + "18", border: `1px solid ${cfg.color}55`, borderRadius: 6, color: cfg.color, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>
                        {btype}
                      </button>
                    );
                  })}
                  <button onClick={() => setAddingType(false)}
                    style={{ padding: "7px 10px", background: "none", border: `1px solid ${border}`, borderRadius: 6, color: muted, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>
                    Annuler
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─ TEXT MODE ─ */}
          {mode === "text" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Charge */}
              <div style={sectionStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={labelStyle}>Charge ⚡</span>
                  <button onClick={() => setCalcOpen(o => !o)}
                    style={{ fontSize: 9, background: isDark ? "#241b13" : "#e8e0d4", border: `1px solid ${border}`, borderRadius: 4, color: accent, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                    {calcOpen ? "Fermer calc." : "Calculateur"}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: getChargeColor(textCharge), minWidth: 28 }}>{textCharge}</span>
                  <input type="range" min="0" max="216" value={textCharge}
                    onChange={e => setTextCharge(+e.target.value)}
                    style={{ flex: 1, accentColor: accent }} />
                  <input type="number" min="0" max="216" value={textCharge}
                    onChange={e => setTextCharge(+e.target.value)}
                    style={{ ...inputBase, width: 52, textAlign: "center" }} />
                </div>
                {calcOpen && (() => {
                  const volZone = getNbMouvementsZone(+nbMouvements);
                  const volLabel = VOLUME_ZONES[volZone - 1].label;
                  const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;
                  return (
                    <div style={{ marginTop: 8, padding: 8, background: isDark ? "#100c08" : "#f0ece4", borderRadius: 6, border: `1px solid ${border}` }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 80px" }}>
                          <div style={labelStyle}>Nb mouvements</div>
                          <input type="number" min="1" placeholder="40" value={nbMouvements}
                            onChange={e => setNbMouv(e.target.value)}
                            style={{ ...inputBase, width: "100%", boxSizing: "border-box" }} />
                          {nbMouvements && <div style={{ fontSize: 9, color: accent, marginTop: 2 }}>Zone {volZone} · {volLabel}</div>}
                        </div>
                        <div style={{ flex: "1 1 80px" }}>
                          <div style={labelStyle}>Intensité</div>
                          <select style={{ ...inputBase, width: "100%", boxSizing: "border-box" }} value={calcZone} onChange={e => setCalcZone(+e.target.value)}>
                            {INTENSITY_ZONES.map(z => <option key={z.index} value={z.index}>{z.index} – {z.label}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: "1 1 80px" }}>
                          <div style={labelStyle}>Complexité</div>
                          <select style={{ ...inputBase, width: "100%", boxSizing: "border-box" }} value={calcComplexity} onChange={e => setCalcCx(+e.target.value)}>
                            {COMPLEXITY_ZONES.map(z => <option key={z.index} value={z.index}>{z.index} – {z.label}</option>)}
                          </select>
                        </div>
                      </div>
                      {computed !== null && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: getChargeColor(computed) }}>{computed}</span>
                          <span style={{ fontSize: 10, color: muted }}>= Vol.{volZone} × Int.{calcZone} × C.{calcComplexity}</span>
                          <button onClick={() => { setTextCharge(computed); setCalcOpen(false); setNbMouv(""); }}
                            style={{ marginLeft: "auto", fontSize: 10, background: accent, color: "#fff", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                            Appliquer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Text tabs */}
              <div>
                <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                  {["warmup", "main", "cooldown"].map(s => (
                    <button key={s} onClick={() => setSection(s)}
                      style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: "6px 6px 0 0", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: section === s ? 700 : 400, background: section === s ? (isDark ? "#241b13" : "#e8e0d4") : "transparent", color: section === s ? accent : muted }}>
                      {sectionLabels[s]}
                    </button>
                  ))}
                  <button onClick={() => setPreview(p => !p)}
                    style={{ padding: "6px 10px", border: "none", background: "none", cursor: "pointer", fontSize: 9, color: muted, fontFamily: "inherit" }}>
                    {preview ? "Éditer" : "Aperçu"}
                  </button>
                </div>
                {preview ? (
                  <div style={{ ...inputBase, minHeight: 80, padding: 10, lineHeight: 1.5 }}>
                    <RichText text={currentText} />
                  </div>
                ) : (
                  <textarea
                    value={currentText}
                    onChange={e => setCurrentText(e.target.value)}
                    placeholder={`Contenu de « ${sectionLabels[section]} »…`}
                    style={{ ...inputBase, width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 80, lineHeight: 1.5 }}
                  />
                )}
              </div>
            </div>
          )}

          {/* ─ Planification ─ */}
          <div style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Planification</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div style={labelStyle}>Heure de départ</div>
                <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                  style={{ ...inputBase, padding: "5px 9px", fontSize: 13 }} />
              </div>
              {endTime && estimatedTime && (
                <div style={{ fontSize: 10, color: muted, paddingBottom: 4 }}>
                  → {endTime} <span style={{ color: accent }}>({estimatedTime} min)</span>
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>Adresse / lieu (optionnel)</div>
              <input value={editAddr} onChange={e => setEditAddr(e.target.value)}
                placeholder="Ex : Arkose Nation, 75012 Paris…"
                style={{ ...inputBase, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={labelStyle}>Note coach (optionnel)</div>
              <textarea value={editCoachNote} onChange={e => setEditCN(e.target.value)}
                placeholder="Message pour les athlètes…" rows={2}
                style={{ ...inputBase, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }} />
            </div>
          </div>

          {/* ─ Save as template ─ */}
          {saveOpen && (
            <div style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Sauvegarder comme modèle</div>
              <div style={{ fontSize: 10, color: muted }}>Le modèle original « {originalName} » ne sera pas modifié.</div>
              <input value={saveName} onChange={e => setSaveName(e.target.value)}
                placeholder={title.trim() || "Nom du nouveau modèle…"}
                style={{ ...inputBase, width: "100%", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSaveOpen(false)}
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, color: muted, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  Annuler
                </button>
                <button onClick={handleSaveAsTemplate}
                  style={{ background: accent, border: "none", borderRadius: 6, color: "#fff", padding: "6px 16px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>
                  Sauvegarder
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${border}`, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onClose}
            style={{ background: "none", border: `1px solid ${border}`, borderRadius: 7, color: muted, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            Annuler
          </button>

          <button onClick={() => setSaveOpen(o => !o)}
            style={{ background: "none", border: `1px solid ${accent}55`, borderRadius: 7, color: accent, padding: "8px 14px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>
            {saved ? "✓ Sauvegardé" : "Sauver comme modèle"}
          </button>

          <div style={{ flex: 1 }} />

          <button onClick={handleConfirm}
            disabled={!title.trim()}
            style={{ background: accent, border: "none", borderRadius: 7, color: "#fff", padding: "9px 20px", cursor: title.trim() ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "inherit", fontWeight: 700, boxShadow: `0 2px 8px ${accent}44`, opacity: title.trim() ? 1 : 0.4 }}>
            Ajouter au calendrier
          </button>
        </div>
      </div>
    </div>
  );
}

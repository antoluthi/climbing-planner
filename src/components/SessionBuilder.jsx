import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { generateId } from "../lib/storage.js";
import { getChargeColor } from "../lib/charge.js";
import { BlockEditor } from "./BlockEditor.jsx";

// ─── MODAL: Créer / construire une séance ─────────────────────────────────────

export function SessionBuilder({ onSave, onClose, communitySessions, allSessions, onCreateCustom }) {
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

import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor } from "../lib/charge.js";

export function SessionComposerModal({ initial, availableBlocks, onSave, onClose }) {
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
  const accent  = isDark ? "#c8906a" : "#8b4c20";

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

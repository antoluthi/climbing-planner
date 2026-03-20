import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor, getNbMouvementsZone, VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES } from "../lib/charge.js";

// ─── COMPOSANT: Éditeur de bloc ───────────────────────────────────────────────

export function BlockEditor({ block, onUpdate, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown, allSessions, onCreateCustom }) {
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

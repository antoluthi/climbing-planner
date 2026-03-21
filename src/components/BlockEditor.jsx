import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, GRIP_TYPES, DEFAULT_SUSPENSION_CONFIG } from "../lib/constants.js";
import { getChargeColor, getNbMouvementsZone, VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES } from "../lib/charge.js";
import { RichText } from "./RichText.jsx";

// ─── COMPOSANT: Éditeur de bloc ───────────────────────────────────────────────

export function BlockEditor({ block, onUpdate, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown, allSessions, onCreateCustom, onSaveAsBlock }) {
  const { styles, isDark } = useThemeCtx();
  const cfg = BLOCK_TYPES[block.type] || BLOCK_TYPES["Grimpe"];
  const [open, setOpen] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  const [nbMouvements, setNbMouvements] = useState("");
  const [calcZone, setCalcZone] = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);
  const [descPreview, setDescPreview] = useState(false);
  const [blockSaved, setBlockSaved] = useState(false);

  const hasCharge = cfg.hasCharge;
  const grimpePresets = allSessions?.filter(s => s.type === "Grimpe") || [];
  const exercicePresets = allSessions?.filter(s => s.type === "Exercice") || [];

  // Suspension config helpers
  const suspCfg = block.config ? { ...DEFAULT_SUSPENSION_CONFIG, ...block.config } : null;
  const patchSusp = (patch) => onUpdate({ config: { ...(block.config || DEFAULT_SUSPENSION_CONFIG), ...patch } });

  // Description: blocks from DB use `description`, inline-created use `notes`
  const desc = block.description ?? block.notes ?? "";
  const setDesc = (val) => onUpdate({ description: val, notes: val });

  const inputStyle = {
    background: isDark ? "#181d1a" : "#f5f0e8",
    border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`,
    borderRadius: 4, color: isDark ? "#d8d4ce" : "#2a2218",
    fontSize: 11, fontFamily: "inherit", padding: "3px 6px", outline: "none",
  };
  const labelStyle = { fontSize: 9, color: isDark ? "#606860" : "#9a9080", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 };
  const muted = isDark ? "#6a8870" : "#6b8c72";
  const accent = isDark ? "#c8906a" : "#8b4c20";

  const handleSaveAsBlock = () => {
    if (!onSaveAsBlock) return;
    onSaveAsBlock({
      blockType: block.type,
      name: block.name || block.presetName || block.type,
      duration: block.duration || null,
      charge: block.charge || 0,
      description: desc,
      config: block.type === "Suspension" ? (block.config || null) : null,
    });
    setBlockSaved(true);
    setTimeout(() => setBlockSaved(false), 3000);
  };

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
        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, flex: 0, flexShrink: 0 }}>{block.type}</span>
        {(block.name || block.presetName) && (
          <span style={{ fontSize: 10, color: isDark ? "#8a9090" : "#6b7060", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {block.name || block.presetName}
          </span>
        )}
        {!block.name && !block.presetName && <span style={{ flex: 1 }} />}
        {hasCharge && (
          <span style={{ fontSize: 10, color: getChargeColor(block.charge || 0), fontWeight: 700, flexShrink: 0 }}>⚡{block.charge || 0}</span>
        )}
        <span style={{ fontSize: 10, color: isDark ? "#555" : "#aaa", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button style={{ background: "none", border: "none", cursor: canMoveUp ? "pointer" : "default", opacity: canMoveUp ? 0.7 : 0.2, fontSize: 11, color: isDark ? "#aaa" : "#666", padding: "0 2px" }} onClick={onMoveUp} disabled={!canMoveUp}>↑</button>
          <button style={{ background: "none", border: "none", cursor: canMoveDown ? "pointer" : "default", opacity: canMoveDown ? 0.7 : 0.2, fontSize: 11, color: isDark ? "#aaa" : "#666", padding: "0 2px" }} onClick={onMoveDown} disabled={!canMoveDown}>↓</button>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: isDark ? "#f87171" : "#dc2626", padding: "0 4px" }} onClick={onRemove}>✕</button>
        </div>
      </div>

      {/* Corps du bloc */}
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Nom du bloc (editable) */}
          <div>
            <div style={labelStyle}>Nom du bloc</div>
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              placeholder="Nom du bloc…"
              value={block.name || block.presetName || ""}
              onChange={e => onUpdate({ name: e.target.value, presetName: e.target.value })} />
          </div>

          {/* Preset picker pour Grimpe */}
          {block.type === "Grimpe" && grimpePresets.length > 0 && (
            <div>
              <div style={labelStyle}>Modèle de grimpe (optionnel)</div>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={{ ...inputStyle, flex: 1 }}
                  value={block.presetId ?? ""}
                  onChange={e => {
                    const preset = grimpePresets.find(s => String(s.id) === e.target.value);
                    if (preset) onUpdate({ presetId: preset.id, presetName: preset.name, name: preset.name, charge: preset.charge });
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
          {block.type === "Exercices" && exercicePresets.length > 0 && (
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

          {/* ── Suspension config ── */}
          {block.type === "Suspension" && suspCfg && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, background: isDark ? "#141a16" : "#f3f7f4", borderRadius: 6, padding: "10px 12px", border: `1px solid ${"#a78bfa"}44` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>Paramètres suspension</div>

              {/* Mode bras + Support */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Bras</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["two", "2 mains"], ["one", "1 main"]].map(([v, l]) => (
                      <button key={v} onClick={() => patchSusp({ armMode: v })}
                        style={{ flex: 1, padding: "4px 6px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: suspCfg.armMode === v ? 700 : 400, border: `1px solid ${suspCfg.armMode === v ? "#a78bfa" : (isDark ? "#2e342f" : "#ccc6b8")}`, background: suspCfg.armMode === v ? "#a78bfa28" : "none", color: suspCfg.armMode === v ? "#a78bfa" : muted }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Support</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["wall", "Mur"], ["floor", "Sol"]].map(([v, l]) => (
                      <button key={v} onClick={() => patchSusp({ supportType: v })}
                        style={{ flex: 1, padding: "4px 6px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: suspCfg.supportType === v ? 700 : 400, border: `1px solid ${suspCfg.supportType === v ? "#a78bfa" : (isDark ? "#2e342f" : "#ccc6b8")}`, background: suspCfg.supportType === v ? "#a78bfa28" : "none", color: suspCfg.supportType === v ? "#a78bfa" : muted }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Prise */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Prise (mm)</div>
                  <input type="number" min="5" max="50" value={suspCfg.gripSize} onChange={e => patchSusp({ gripSize: +e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Préhension</div>
                  <select value={suspCfg.gripType} onChange={e => patchSusp({ gripType: e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box", cursor: "pointer" }}>
                    {GRIP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Temps */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Suspension (s)</div>
                  <input type="number" min="1" max="60" value={suspCfg.hangTime} onChange={e => patchSusp({ hangTime: +e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Repos (s)</div>
                  <input type="number" min="1" max="300" value={suspCfg.restTime} onChange={e => patchSusp({ restTime: +e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Séries × Répétitions */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Séries</div>
                  <input type="number" min="1" max="20" value={suspCfg.sets} onChange={e => patchSusp({ sets: +e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Répétitions</div>
                  <input type="number" min="1" max="20" value={suspCfg.reps} onChange={e => patchSusp({ reps: +e.target.value })}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Poids */}
              <div>
                <div style={labelStyle}>
                  Poids ciblé {suspCfg.supportType === "wall" ? "(kg, − = délestage)" : "(kg soulevé)"}
                </div>
                {suspCfg.armMode === "two" ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" step="0.5" value={suspCfg.targetWeight} onChange={e => patchSusp({ targetWeight: +e.target.value })}
                      style={{ ...inputStyle, width: 70 }} />
                    <span style={{ fontSize: 10, color: muted }}>kg</span>
                    {suspCfg.supportType === "wall" && suspCfg.targetWeight < 0 && <span style={{ fontSize: 9, color: "#fbbf24" }}>délestage</span>}
                    {suspCfg.supportType === "wall" && suspCfg.targetWeight > 0 && <span style={{ fontSize: 9, color: "#a78bfa" }}>lest</span>}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: muted, marginBottom: 2 }}>Gauche</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input type="number" step="0.5" value={suspCfg.targetWeightLeft} onChange={e => patchSusp({ targetWeightLeft: +e.target.value })}
                          style={{ ...inputStyle, width: 60 }} />
                        <span style={{ fontSize: 10, color: muted }}>kg</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: muted, marginBottom: 2 }}>Droite</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input type="number" step="0.5" value={suspCfg.targetWeightRight} onChange={e => patchSusp({ targetWeightRight: +e.target.value })}
                          style={{ ...inputStyle, width: 60 }} />
                        <span style={{ fontSize: 10, color: muted }}>kg</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Initialize suspension config if missing */}
          {block.type === "Suspension" && !suspCfg && (
            <button onClick={() => onUpdate({ config: { ...DEFAULT_SUSPENSION_CONFIG } })}
              style={{ padding: "6px 12px", background: "#a78bfa22", border: `1px solid #a78bfa55`, borderRadius: 5, color: "#a78bfa", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600 }}>
              Configurer la suspension
            </button>
          )}

          {/* Charge + calculateur (types with hasCharge) */}
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

          {/* Durée + Lieu */}
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

          {/* Description / Notes (rich text) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={labelStyle}>Consignes / Notes</div>
              {desc && (
                <button onClick={() => setDescPreview(p => !p)}
                  style={{ background: "none", border: `1px solid ${isDark ? "#2e342f" : "#ccc6b8"}`, borderRadius: 3, color: muted, padding: "1px 6px", cursor: "pointer", fontSize: 9, fontFamily: "inherit" }}>
                  {descPreview ? "Éditer" : "Aperçu"}
                </button>
              )}
            </div>
            {descPreview ? (
              <div style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 48, padding: "6px 8px", lineHeight: 1.4 }}>
                <RichText text={desc} />
              </div>
            ) : (
              <textarea style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 48, lineHeight: 1.4 }}
                placeholder="Description, objectifs, consignes…"
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            )}
          </div>

          {/* Save as block template */}
          {onSaveAsBlock && (
            <button onClick={handleSaveAsBlock}
              style={{ alignSelf: "flex-start", padding: "4px 12px", background: "none", border: `1px solid ${accent}55`, borderRadius: 5, color: blockSaved ? (isDark ? "#4ade80" : "#16a34a") : accent, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600 }}>
              {blockSaved ? "✓ Bloc sauvegardé" : "Sauver ce bloc comme modèle"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

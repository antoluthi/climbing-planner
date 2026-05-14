import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, GRIP_TYPES, DEFAULT_SUSPENSION_CONFIG } from "../lib/constants.js";
import { VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES, getNbMouvementsZone, getChargeColor } from "../lib/charge.js";
import { RichText } from "./RichText.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

export function BlockFormModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const blockTypeKeys = Object.keys(BLOCK_TYPES);

  // ── Confirm-on-close (protège des miss-clicks) ────────────────────────────
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);

  const [blockType,      _setBlockType]      = useState(initial?.blockType ?? "Grimpe");
  const setBlockType = v => { markDirty(); _setBlockType(v); };
  const [name,           _setName]           = useState(initial?.name      ?? "");
  const setName = v => { markDirty(); _setName(v); };
  const [duration,       _setDuration]       = useState(initial?.duration  ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultDuration);
  const setDuration = v => { markDirty(); _setDuration(v); };
  const [charge,         _setCharge]         = useState(initial?.charge    ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultCharge);
  const setCharge = v => { markDirty(); _setCharge(v); };
  const [desc,           _setDesc]           = useState(initial?.description ?? "");
  const setDesc = v => { markDirty(); _setDesc(v); };
  const [preview,        setPreview]        = useState(false);

  // Calculateur de charge (état purement visuel — pas dirty)
  const [calcOpen,       setCalcOpen]       = useState(false);
  const [infoOpen,       setInfoOpen]       = useState(false);
  const [nbMouvements,   setNbMouvements]   = useState("");
  const [calcZone,       setCalcZone]       = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);

  // Config Suspension
  const [suspCfg, _setSuspCfg] = useState(() => ({ ...DEFAULT_SUSPENSION_CONFIG, ...(initial?.config ?? {}) }));
  const patchSusp = (patch) => { markDirty(); _setSuspCfg(prev => ({ ...prev, ...patch })); };

  const cfg    = BLOCK_TYPES[blockType] || BLOCK_TYPES["Grimpe"];
  const bg     = isDark ? "#141a16" : "#f3f7f4";
  const surface= isDark ? "#1c2820" : "#ffffff";
  const border = isDark ? "#263228" : "#daeade";
  const text   = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted  = isDark ? "#6a8870" : "#6b8c72";

  const handleSave = () => {
    if (!name.trim()) return;
    markPristine();
    onSave({
      id: initial?.id ?? ("blk_" + Math.random().toString(36).slice(2) + Date.now()),
      blockType,
      name: name.trim(),
      duration: duration ? +duration : null,
      charge: cfg.hasCharge ? +charge : 0,
      description: desc.trim() || "",
      config: blockType === "Suspension" ? { ...suspCfg } : null,
    });
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "8px 12px", color: text, fontSize: 13, fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, display: "block" };

  const volZone  = getNbMouvementsZone(+nbMouvements);
  const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 50px #0009", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>{initial ? "Modifier le bloc" : "Nouveau bloc"}</span>
          <button onClick={requestClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
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

          {/* ── Config Suspension ── */}
          {blockType === "Suspension" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, background: isDark ? "#141a16" : "#f3f7f4", borderRadius: 8, padding: "14px 16px", border: `1px solid ${"#a78bfa"}44` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.12em", textTransform: "uppercase" }}>Paramètres de suspension</div>

              {/* Mode de bras + Type de support */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Mode de bras</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["two", "Deux mains"], ["one", "Une main"]].map(([val, lbl]) => (
                      <button key={val} onClick={() => patchSusp({ armMode: val })}
                        style={{ flex: 1, padding: "6px 8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: suspCfg.armMode === val ? 700 : 400, border: `1px solid ${suspCfg.armMode === val ? "#a78bfa" : border}`, background: suspCfg.armMode === val ? "#a78bfa28" : "none", color: suspCfg.armMode === val ? "#a78bfa" : muted }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Type de support</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["wall", "Au mur"], ["floor", "Au sol"]].map(([val, lbl]) => (
                      <button key={val} onClick={() => patchSusp({ supportType: val })}
                        style={{ flex: 1, padding: "6px 8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: suspCfg.supportType === val ? 700 : 400, border: `1px solid ${suspCfg.supportType === val ? "#a78bfa" : border}`, background: suspCfg.supportType === val ? "#a78bfa28" : "none", color: suspCfg.supportType === val ? "#a78bfa" : muted }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 9, color: muted, marginTop: 4 }}>
                    {suspCfg.supportType === "wall" ? "PDC ± lest (poulie de délestage)" : "Soulèvement de poids via poulie"}
                  </div>
                </div>
              </div>

              {/* Taille de la prise + Type de préhension */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Taille de la prise (mm)</span>
                  <input style={inputStyle} type="number" min="5" max="50" step="1" value={suspCfg.gripSize} onChange={e => patchSusp({ gripSize: +e.target.value })} placeholder="20" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Type de préhension</span>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={suspCfg.gripType} onChange={e => patchSusp({ gripType: e.target.value })}>
                    {GRIP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Temps suspension + Temps repos */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Temps de suspension (sec)</span>
                  <input style={inputStyle} type="number" min="1" max="60" value={suspCfg.hangTime} onChange={e => patchSusp({ hangTime: +e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Temps de repos (sec)</span>
                  <input style={inputStyle} type="number" min="1" max="300" value={suspCfg.restTime} onChange={e => patchSusp({ restTime: +e.target.value })} />
                </div>
              </div>

              {/* Séries + Répétitions */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Séries</span>
                  <input style={inputStyle} type="number" min="1" max="20" value={suspCfg.sets} onChange={e => patchSusp({ sets: +e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>Répétitions</span>
                  <input style={inputStyle} type="number" min="1" max="20" value={suspCfg.reps} onChange={e => patchSusp({ reps: +e.target.value })} />
                </div>
              </div>

              {/* Poids ciblé */}
              <div>
                <span style={labelStyle}>
                  Poids ciblé{suspCfg.supportType === "wall" ? (suspCfg.armMode === "one" ? " par bras (kg, − = délestage)" : " (kg, − = délestage)") : (suspCfg.armMode === "one" ? " par bras soulevé (kg)" : " soulevé (kg)")}
                </span>
                {suspCfg.armMode === "two" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inputStyle, width: 80 }} type="number" step="0.5" value={suspCfg.targetWeight} onChange={e => patchSusp({ targetWeight: +e.target.value })} />
                    <span style={{ fontSize: 11, color: muted }}>kg</span>
                    {suspCfg.supportType === "wall" && suspCfg.targetWeight < 0 && <span style={{ fontSize: 10, color: "#fbbf24" }}>délestage</span>}
                    {suspCfg.supportType === "wall" && suspCfg.targetWeight > 0 && <span style={{ fontSize: 10, color: "#a78bfa" }}>lest</span>}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: muted, marginBottom: 4 }}>Main gauche</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input style={{ ...inputStyle, width: 80 }} type="number" step="0.5" value={suspCfg.targetWeightLeft} onChange={e => patchSusp({ targetWeightLeft: +e.target.value })} />
                        <span style={{ fontSize: 11, color: muted }}>kg</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: muted, marginBottom: 4 }}>Main droite</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input style={{ ...inputStyle, width: 80 }} type="number" step="0.5" value={suspCfg.targetWeightRight} onChange={e => patchSusp({ targetWeightRight: +e.target.value })} />
                        <span style={{ fontSize: 11, color: muted }}>kg</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
          <button onClick={requestClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, color: muted, padding: "8px 16px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
          <button onClick={handleSave} disabled={!name.trim()}
            style={{ background: name.trim() ? cfg.color : (isDark ? "#1e2b22" : "#c8e6d4"), border: "none", borderRadius: 6, color: name.trim() ? "#fff" : muted, padding: "8px 20px", cursor: name.trim() ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>
            {initial ? "Enregistrer" : "Créer le bloc"}
          </button>
        </div>
      </div>
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </div>
  );
}

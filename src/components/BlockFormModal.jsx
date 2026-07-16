import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES, GRIP_TYPES, DEFAULT_SUSPENSION_CONFIG } from "../lib/constants.js";
import { VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES, getNbMouvementsZone, getChargeColor, getZoneColor, climbingCharge10, normalizeCharge10 } from "../lib/charge.js";
import { RichText } from "./RichText.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Field, TextInput, Textarea, Select, SegmentedControl } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";

const SUSP = "#a78bfa";

export function BlockFormModal({ initial, onSave, onClose }) {
  const { styles, isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const blockTypeKeys = Object.keys(BLOCK_TYPES);

  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);

  const [blockType, _setBlockType] = useState(initial?.blockType ?? "Grimpe");
  const setBlockType = v => { markDirty(); _setBlockType(v); };
  const [name, _setName] = useState(initial?.name ?? "");
  const setName = v => { markDirty(); _setName(v); };
  const [duration, _setDuration] = useState(initial?.duration ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultDuration);
  const setDuration = v => { markDirty(); _setDuration(v); };
  const [charge, _setCharge] = useState(() => normalizeCharge10(initial?.charge ?? BLOCK_TYPES[initial?.blockType ?? "Grimpe"].defaultCharge));
  const setCharge = v => { markDirty(); _setCharge(v); };
  const [desc, _setDesc] = useState(initial?.description ?? "");
  const setDesc = v => { markDirty(); _setDesc(v); };
  const [preview, setPreview] = useState(false);

  const [calcOpen, setCalcOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [nbMouvements, setNbMouvements] = useState("");
  const [calcZone, setCalcZone] = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);

  const [suspCfg, _setSuspCfg] = useState(() => ({ ...DEFAULT_SUSPENSION_CONFIG, ...(initial?.config ?? {}) }));
  const patchSusp = (patch) => { markDirty(); _setSuspCfg(prev => ({ ...prev, ...patch })); };

  const cfg = BLOCK_TYPES[blockType] || BLOCK_TYPES["Grimpe"];

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

  const volZone = getNbMouvementsZone(+nbMouvements);
  // Assistant escalade : zones 1-6 → charge de bloc sur l'échelle unifiée 0-10.
  const computed = nbMouvements ? climbingCharge10(volZone, calcZone, calcComplexity) : null;

  return (
    <Modal onClose={requestClose} maxWidth={480} ariaLabel={initial ? "Modifier le bloc" : "Nouveau bloc"}>
      <ModalHeader title={initial ? "Modifier le bloc" : "Nouveau bloc"} onClose={requestClose} />
      <ModalBody>
        {/* Type de bloc */}
        <Field label="Type de bloc">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {blockTypeKeys.map(t => {
              const c = BLOCK_TYPES[t].color;
              const active = blockType === t;
              return (
                <button
                  key={t}
                  onClick={() => { setBlockType(t); if (!initial) { setDuration(BLOCK_TYPES[t].defaultDuration); setCharge(BLOCK_TYPES[t].defaultCharge); } }}
                  style={{
                    padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                    fontWeight: active ? 600 : 500,
                    border: `1px solid ${active ? c : T.border}`,
                    background: active ? c + "22" : "transparent",
                    color: active ? c : T.textMid,
                  }}
                >{t}</button>
              );
            })}
          </div>
        </Field>

        <Field label="Nom du bloc">
          <TextInput placeholder="Ex : Campus board 4×5 mouvements…" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </Field>

        <Field label="Durée (min)">
          <TextInput type="number" min="1" max="240" value={duration} onChange={e => setDuration(e.target.value)} style={{ maxWidth: 140 }} />
        </Field>

        {/* Paramètres de suspension */}
        {blockType === "Suspension" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, background: SUSP + "12", borderRadius: 10, padding: "14px 16px", border: `1px solid ${SUSP}44` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: SUSP, letterSpacing: "0.12em", textTransform: "uppercase" }}>Paramètres de suspension</div>

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Mode de bras" style={{ flex: 1 }}>
                <SegmentedControl
                  options={[{ value: "two", label: "Deux mains" }, { value: "one", label: "Une main" }]}
                  value={suspCfg.armMode} onChange={v => patchSusp({ armMode: v })} accent={SUSP}
                />
              </Field>
              <Field label="Type de support" style={{ flex: 1 }}>
                <SegmentedControl
                  options={[{ value: "wall", label: "Au mur" }, { value: "floor", label: "Au sol" }]}
                  value={suspCfg.supportType} onChange={v => patchSusp({ supportType: v })} accent={SUSP}
                />
                <div style={{ fontSize: 9, color: T.textLight, marginTop: 4 }}>
                  {suspCfg.supportType === "wall" ? "PDC ± lest (poulie de délestage)" : "Soulèvement de poids via poulie"}
                </div>
              </Field>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Taille de prise (mm)" style={{ flex: 1 }}>
                <TextInput type="number" min="5" max="50" step="1" value={suspCfg.gripSize} onChange={e => patchSusp({ gripSize: +e.target.value })} placeholder="20" />
              </Field>
              <Field label="Type de préhension" style={{ flex: 1 }}>
                <Select value={suspCfg.gripType} onChange={e => patchSusp({ gripType: e.target.value })}>
                  {GRIP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Suspension (sec)" style={{ flex: 1 }}>
                <TextInput type="number" min="1" max="60" value={suspCfg.hangTime} onChange={e => patchSusp({ hangTime: +e.target.value })} />
              </Field>
              <Field label="Repos (sec)" style={{ flex: 1 }}>
                <TextInput type="number" min="1" max="300" value={suspCfg.restTime} onChange={e => patchSusp({ restTime: +e.target.value })} />
              </Field>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Séries" style={{ flex: 1 }}>
                <TextInput type="number" min="1" max="20" value={suspCfg.sets} onChange={e => patchSusp({ sets: +e.target.value })} />
              </Field>
              <Field label="Répétitions" style={{ flex: 1 }}>
                <TextInput type="number" min="1" max="20" value={suspCfg.reps} onChange={e => patchSusp({ reps: +e.target.value })} />
              </Field>
            </div>

            <Field label={`Poids ciblé${suspCfg.supportType === "wall" ? (suspCfg.armMode === "one" ? " par bras (kg, − = délestage)" : " (kg, − = délestage)") : (suspCfg.armMode === "one" ? " par bras soulevé (kg)" : " soulevé (kg)")}`}>
              {suspCfg.armMode === "two" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TextInput type="number" step="0.5" value={suspCfg.targetWeight} onChange={e => patchSusp({ targetWeight: +e.target.value })} style={{ width: 90 }} />
                  <span style={{ fontSize: 11, color: T.textLight }}>kg</span>
                  {suspCfg.supportType === "wall" && suspCfg.targetWeight < 0 && <span style={{ fontSize: 10, color: "#e6c46a" }}>délestage</span>}
                  {suspCfg.supportType === "wall" && suspCfg.targetWeight > 0 && <span style={{ fontSize: 10, color: SUSP }}>lest</span>}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Main gauche</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <TextInput type="number" step="0.5" value={suspCfg.targetWeightLeft} onChange={e => patchSusp({ targetWeightLeft: +e.target.value })} style={{ width: 90 }} />
                      <span style={{ fontSize: 11, color: T.textLight }}>kg</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>Main droite</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <TextInput type="number" step="0.5" value={suspCfg.targetWeightRight} onChange={e => patchSusp({ targetWeightRight: +e.target.value })} style={{ width: 90 }} />
                      <span style={{ fontSize: 11, color: T.textLight }}>kg</span>
                    </div>
                  </div>
                </div>
              )}
            </Field>
          </div>
        )}

        {/* Charge */}
        {cfg.hasCharge && (
          <Field label="Charge d'entraînement">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button style={styles.calcBtn} onClick={() => { setCalcOpen(o => !o); setInfoOpen(false); }}>Calculateur</button>
              <button style={{ ...styles.calcBtn, background: "none" }} onClick={() => { setInfoOpen(o => !o); setCalcOpen(false); }}>Infos</button>
            </div>
            <div style={styles.customFormChargeRow}>
              <span style={{ ...styles.customFormChargeVal, color: getChargeColor(charge) }}>{charge}<span style={{ fontSize: 11, opacity: 0.6 }}>/10</span></span>
              <input style={styles.customFormSlider} type="range" min="0" max="10" value={charge} onChange={e => setCharge(+e.target.value)} />
            </div>

            {calcOpen && (
              <div style={styles.calcPanel}>
                <div style={styles.calcRow}>
                  <div style={styles.calcField}>
                    <span style={styles.calcLabel}>Nb de mouvements</span>
                    <input style={styles.calcInput} type="number" min="1" placeholder="ex: 40" value={nbMouvements} onChange={e => setNbMouvements(e.target.value)} />
                    {nbMouvements && <span style={styles.calcVolumeHint}>→ Zone {volZone} · {VOLUME_ZONES[volZone - 1].label} ({VOLUME_ZONES[volZone - 1].range})</span>}
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
                    <span style={{ ...styles.calcResultVal, color: getChargeColor(computed) }}>{computed}<span style={{ fontSize: 11, opacity: 0.6 }}>/10</span></span>
                    <span style={{ fontSize: 11, color: T.textLight }}>← Vol.{volZone} × Int.{calcZone} × Compl.{calcComplexity}, ramené sur 0-10</span>
                    <button style={styles.calcApplyBtn} onClick={() => { setCharge(computed); setCalcOpen(false); }}>Appliquer →</button>
                  </div>
                )}
              </div>
            )}

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
                              <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getZoneColor(z.index) + "33", color: getZoneColor(z.index) }}>{z.index}</span></td>
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
                              <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getZoneColor(z.index) + "33", color: getZoneColor(z.index) }}>{z.index}</span></td>
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
                              <td style={styles.infoTd}><span style={{ ...styles.infoIndexBadge, background: getZoneColor(z.index) + "33", color: getZoneColor(z.index) }}>{z.index}</span></td>
                              <td style={styles.infoTd}>{z.label}</td>
                              <td style={styles.infoTd}>{z.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: 11, color: T.textLight, fontStyle: "italic" }}>Formule : Zone volume × Zone intensité × Index complexité, ramené sur l'échelle 0-10</div>
                  </div>
                </div>
              </div>
            )}
          </Field>
        )}

        {/* Consignes */}
        <Field label="Consignes">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => setPreview(p => !p)} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: preview ? T.text : T.textMid, padding: "3px 10px", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>
              {preview ? "Éditer" : "Aperçu"}
            </button>
          </div>
          {preview ? (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, minHeight: 120, padding: "10px 12px", lineHeight: 1.6, color: T.text }}>
              <RichText text={desc} />
            </div>
          ) : (
            <Textarea
              style={{ minHeight: 120, lineHeight: 1.6 }}
              placeholder={"Protocole, répétitions, intensité cible…\n\n* puce\n**gras**\n[ ] checkbox\n[x] checkbox coché"}
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          )}
          <div style={{ fontSize: 10, color: T.textLight, marginTop: 5 }}>
            Syntaxe : <code>* puce</code> · <code>**gras**</code> · <code>[ ] checkbox</code> · <code>`code`</code>
          </div>
        </Field>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
        <Button variant="primary" size="md" disabled={!name.trim()} onClick={handleSave} style={name.trim() ? { background: cfg.color, color: "#fff" } : undefined}>
          {initial ? "Enregistrer" : "Créer le bloc"}
        </Button>
      </ModalFooter>

      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </Modal>
  );
}

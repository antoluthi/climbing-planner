import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { generateId } from "../lib/storage.js";
import { getChargeColor, getNbMouvementsZone, VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES } from "../lib/charge.js";
import { RichText } from "./RichText.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { ConfirmModal } from "./ConfirmModal.jsx";

// ─── MODAL: CRÉER / MODIFIER UNE SÉANCE PERSONNALISÉE ─────────────────────────

export function CustomSessionModal({ initial, data, onSave, onClose }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);

  // Wrappers : tout changement user marque la modale dirty.
  const wrap = (setter) => (v) => { markDirty(); setter(v); };

  const [name, _setName] = useState(initial?.name ?? "");
  const setName = wrap(_setName);
  const [type, _setType] = useState(initial?.type ?? "Grimpe");
  const setType = wrap(_setType);
  const [charge, _setCharge] = useState(initial?.charge ?? 24);
  const setCharge = wrap(_setCharge);
  const [estimatedTime, _setEstimatedTime] = useState(initial?.estimatedTime ?? "");
  const setEstimatedTime = wrap(_setEstimatedTime);
  const [location, _setLocation] = useState(initial?.location ?? "");
  const setLocation = wrap(_setLocation);

  const [minRecovery, _setMinRecovery] = useState(initial?.minRecovery ?? "");
  const setMinRecovery = wrap(_setMinRecovery);
  const [warmup, _setWarmup] = useState(initial?.warmup ?? "");
  const setWarmup = wrap(_setWarmup);
  const [main, _setMain] = useState(initial?.main ?? "");
  const setMain = wrap(_setMain);
  const [cooldown, _setCooldown] = useState(initial?.cooldown ?? "");
  const setCooldown = wrap(_setCooldown);
  // États purement visuels (pas dirty)
  const [section, setSection] = useState("main");
  const [preview, setPreview] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [nbMouvements, setNbMouvements] = useState("");
  const [calcZone, setCalcZone] = useState(3);
  const [calcComplexity, setCalcComplexity] = useState(3);



  const currentText = section === "warmup" ? warmup : section === "main" ? main : cooldown;
  const setCurrentText = section === "warmup" ? setWarmup : section === "main" ? setMain : setCooldown;

  const handleSave = () => {
    if (!name.trim()) return;
    markPristine();
    const session = {
      id: initial?.id ?? generateId(),
      type, name: name.trim(), charge,
      estimatedTime: estimatedTime ? +estimatedTime : null,
      location: location.trim() || null,
      minRecovery: minRecovery ? +minRecovery : null,
      warmup, main, cooldown,
      isCustom: true,
    };
    onSave(session);
  };

  const sectionLabels = { warmup: "Échauffement", main: "Cœur de séance", cooldown: "Retour au calme" };

  return (
    <div style={styles.customFormOverlay}>
      <div style={styles.customForm}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "Modifier la séance" : "Nouvelle séance personnalisée"}</span>
          <button style={styles.closeBtn} onClick={requestClose}>✕</button>
        </div>

        <div style={styles.customFormBody}>
          {/* Nom + type */}
          <div style={styles.customFormRow}>
            <select style={styles.customFormSelect} value={type} onChange={e => setType(e.target.value)}>
              <option>Grimpe</option>
              <option>Exercice</option>
            </select>
            <input style={{ ...styles.customFormInput, flex: 1 }} placeholder="Nom de la séance…" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Temps / Lieu */}
          <div style={{ ...styles.customFormRow, flexWrap: "wrap" }}>
            <div style={{ ...styles.customFormField, flex: "1 1 100px" }}>
              <span style={styles.customFormLabel}>Temps estimé (min)</span>
              <input style={styles.customFormInput} type="number" min="0" placeholder="90" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} />
            </div>
            <div style={{ ...styles.customFormField, flex: "2 1 160px" }}>
              <span style={styles.customFormLabel}>Lieu</span>
              <input style={styles.customFormInput} placeholder="Salle, falaise…" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </div>



          {/* Charge + récup */}
          <div style={{ ...styles.customFormField }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={styles.customFormLabel}>Charge d'entraînement</span>
              <button style={styles.calcBtn} onClick={() => { setCalcOpen(o => !o); setInfoOpen(false); }}>
                Calculateur
              </button>
              <button style={{ ...styles.calcBtn, background: "none" }} onClick={() => { setInfoOpen(o => !o); setCalcOpen(false); }}>
                Infos
              </button>
            </div>
            <div style={styles.customFormChargeRow}>
              <span style={{ ...styles.customFormChargeVal, color: getChargeColor(charge) }}>{charge}</span>
              <input style={styles.customFormSlider} type="range" min="0" max="216" value={charge} onChange={e => setCharge(+e.target.value)} />
              <div style={{ ...styles.customFormField, flex: "0 0 120px" }}>
                <span style={styles.customFormLabel}>Récup. mini (h)</span>
                <input style={styles.customFormInput} type="number" min="0" placeholder="48" value={minRecovery} onChange={e => setMinRecovery(e.target.value)} />
              </div>
            </div>

            {/* ── Inline calculator ── */}
            {calcOpen && (() => {
              const volZone = getNbMouvementsZone(+nbMouvements);
              const volLabel = VOLUME_ZONES[volZone - 1].label;
              const computed = nbMouvements ? volZone * calcZone * calcComplexity : null;
              return (
                <div style={styles.calcPanel}>
                  <div style={styles.calcRow}>
                    <div style={styles.calcField}>
                      <span style={styles.calcLabel}>Nb de mouvements</span>
                      <input
                        style={styles.calcInput}
                        type="number" min="1" placeholder="ex: 40"
                        value={nbMouvements}
                        onChange={e => setNbMouvements(e.target.value)}
                      />
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
                        = Zone vol.{volZone} × Int.{calcZone} × Compl.{calcComplexity}
                      </span>
                      <button style={styles.calcApplyBtn} onClick={() => { setCharge(computed); setCalcOpen(false); }}>
                        Appliquer →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Info modal (reference tables) ── */}
          {infoOpen && (
            <div style={styles.infoOverlay} onClick={() => setInfoOpen(false)}>
              <div style={styles.infoPanel} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <span style={styles.modalTitle}>Référence — Calcul de charge</span>
                  <button style={styles.closeBtn} onClick={() => setInfoOpen(false)}>✕</button>
                </div>
                <div style={styles.infoPanelBody}>

                  {/* Table 1 – Volume */}
                  <div>
                    <div style={styles.infoTableTitle}>1 · Volume (nb de mouvements → zone)</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Zone</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>Nb mouvements</th>
                        </tr>
                      </thead>
                      <tbody>
                        {VOLUME_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.range}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table 2 – Intensité */}
                  <div>
                    <div style={styles.infoTableTitle}>2 · Zone d'intensité</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Zone</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>% Perf max</th>
                          <th style={styles.infoTh}>Type d'effort</th>
                          <th style={styles.infoTh}>Récupération</th>
                        </tr>
                      </thead>
                      <tbody>
                        {INTENSITY_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.pct}</td>
                            <td style={styles.infoTd}>{z.effort}</td>
                            <td style={styles.infoTd}>{z.recovery}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table 3 – Complexité */}
                  <div>
                    <div style={styles.infoTableTitle}>3 · Index de complexité</div>
                    <table style={styles.infoTable}>
                      <thead>
                        <tr>
                          <th style={styles.infoTh}>Index</th>
                          <th style={styles.infoTh}>Catégorie</th>
                          <th style={styles.infoTh}>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {COMPLEXITY_ZONES.map(z => (
                          <tr key={z.index}>
                            <td style={styles.infoTd}>
                              <span style={{ ...styles.infoIndexBadge, background: getChargeColor(z.index * 6) + "33", color: getChargeColor(z.index * 6) }}>{z.index}</span>
                            </td>
                            <td style={styles.infoTd}>{z.label}</td>
                            <td style={styles.infoTd}>{z.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7060", fontStyle: "italic" }}>
                    Formule : Charge = Zone volume × Zone intensité × Index complexité (max 216)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section tabs */}
          <div>
            <div style={styles.customFormSectionTabs}>
              {["warmup", "main", "cooldown"].map(s => (
                <button key={s} style={{ ...styles.customFormSectionTab, ...(section === s ? styles.customFormSectionTabActive : {}) }} onClick={() => { setSection(s); setPreview(false); }}>
                  {sectionLabels[s]}
                </button>
              ))}
              <button style={{ ...styles.customFormSectionTab, marginLeft: "auto", ...(preview ? styles.customFormSectionTabActive : {}) }} onClick={() => setPreview(p => !p)}>
                {preview ? "Éditer" : "Aperçu"}
              </button>
            </div>
            {preview ? (
              <div style={{ ...styles.customFormInput, minHeight: 120, padding: "10px 12px" }}>
                <RichText text={currentText} />
              </div>
            ) : (
              <textarea
                style={{ ...styles.customFormTextarea, minHeight: 120 }}
                placeholder={`${sectionLabels[section]}…\n* bullet point\n[ ] checkbox\n**gras**  \`code\`  [lien](url)  ![img](url)`}
                value={currentText}
                onChange={e => setCurrentText(e.target.value)}
                rows={6}
              />
            )}
            <div style={styles.customFormHint}>
              Syntaxe : <code style={{ opacity: 0.8 }}>* puce</code> · <code style={{ opacity: 0.8 }}>[ ] checkbox</code> · <code style={{ opacity: 0.8 }}>[x]</code> · <code style={{ opacity: 0.8 }}>**gras**</code> · <code style={{ opacity: 0.8 }}>[texte](url)</code> · <code style={{ opacity: 0.8 }}>![alt](url)</code>
            </div>
          </div>
        </div>

        <div style={styles.feedbackFooter}>
          <button style={styles.cancelBtn} onClick={requestClose}>Annuler</button>
          <button style={{ ...styles.saveBtn, opacity: name.trim() ? 1 : 0.4 }} onClick={handleSave} disabled={!name.trim()}>Enregistrer</button>
        </div>
      </div>
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </div>
  );
}

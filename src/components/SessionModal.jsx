import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { DAYS, BLOCK_TYPES, DEFAULT_SUSPENSION_CONFIG, getMesoColor } from "../lib/constants.js";
import { getChargeColor } from "../lib/charge.js";
import { getMondayOf, addDays, weekKey } from "../lib/helpers.js";
import { RichText } from "./RichText.jsx";
import { SuspensionInfoCard } from "./SuspensionInfoCard.jsx";

// ─── MODAL: SESSION UNIFIÉE (Séance + Ressenti) ───────────────────────────────

export function SessionModal({ session, dayLabel, weekMeta, onClose, onEdit, onSave, dbBlocks,
  role, smWeekKey, smDayIndex, smSessionIndex,
  onMoveSession, onUpdateStartTime, onSuggestMove, moveSuggestions,
  onAcceptSuggestion, onRejectSuggestion }) {
  const { styles, isDark, mesocycles } = useThemeCtx();
  const [tab, setTab] = useState("session");

  // ── Déplacer tab state ──
  const [newStartTime, setNewStartTime] = useState(session.startTime || "");
  const [targetWeekKey, setTargetWeekKey] = useState(smWeekKey || "");
  const [targetDayIndex, setTargetDayIndex] = useState(smDayIndex ?? 0);
  const [suggestionNote, setSuggestionNote] = useState("");
  const [timeSaved, setTimeSaved] = useState(false);

  const isAthleteUser = role === "athlete";
  const canDirectlyMove = !isAthleteUser; // coach, solo (null), auto

  const targetMonday = targetWeekKey ? getMondayOf(addDays(new Date(targetWeekKey + "T00:00:00"), 1)) : null;
  const prevWeekKey = targetMonday ? weekKey(getMondayOf(addDays(targetMonday, -7))) : smWeekKey;
  const nextWeekKey = targetMonday ? weekKey(getMondayOf(addDays(targetMonday, 7))) : smWeekKey;
  const weekLabel = targetMonday
    ? `Sem. du ${targetMonday.getDate()} ${targetMonday.toLocaleDateString("fr-FR", { month: "short" })} ${targetMonday.getFullYear()}`
    : "";

  const dayChanged = targetWeekKey !== smWeekKey || targetDayIndex !== smDayIndex;
  const timeChanged = newStartTime !== (session.startTime || "");

  const pendingSuggestions = (moveSuggestions || []).filter(s => s.sessionId === session.id && s.status === "pending");

  const formatSuggTarget = (toWKey, toDi) => {
    if (!toWKey) return "";
    const d = addDays(new Date(toWKey + "T00:00:00"), toDi);
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  // Quand un bloc est ajouté directement depuis CoachPickerModal (isBlock: true),
  // il est stocké comme objet brut sans tableau blocks[].
  // On synthétise un tableau pour que le rendu soit uniforme.
  // Si bl.config est null (bloc ajouté avant migration), on cherche dans dbBlocks.
  const enrichConfig = (bl) => ({
    ...bl,
    config: bl.config ?? dbBlocks?.find(b => b.id === bl.id)?.config ?? null,
  });
  const effectiveBlocks = (
    session.isBlock && !session.blocks?.length
      ? [{ id: session.id, blockType: session.blockType, name: session.name, duration: session.duration, charge: session.charge, description: session.description, config: session.config ?? null }]
      : (session.blocks ?? [])
  ).map(enrichConfig);

  const hasBlocks   = effectiveBlocks.length > 0;
  const hasWarmup   = !!session.warmup?.trim();
  const hasMain     = !!session.main?.trim();
  const hasCooldown = !!session.cooldown?.trim();
  const hasContent  = hasWarmup || hasMain || hasCooldown;

  const defaultContent = hasWarmup ? "warmup" : hasMain ? "main" : hasCooldown ? "cooldown" : "main";
  const [contentTab, setContentTab] = useState(defaultContent);

  const [done,           setDone]           = useState(session.feedback?.done           ?? false);
  const [rpe,            setRpe]            = useState(session.feedback?.rpe            ?? 5);
  const [quality,        setQuality]        = useState(session.feedback?.quality        ?? null);
  const [notes,          setNotes]          = useState(session.feedback?.notes          ?? "");
  const [blockFeedbacks, setBlockFeedbacks] = useState(session.feedback?.blockFeedbacks ?? []);

  const mesoLabel = weekMeta?.mesocycle || session.dateMeta?.mesocycle;
  const mesoColor = getMesoColor(mesocycles, mesoLabel);
  const hasFeedback = !!session.feedback;

  const contentTabs = [
    hasWarmup   && { key: "warmup",   label: "Échauffement" },
    { key: "main", label: "Cœur de séance" },
    hasCooldown && { key: "cooldown", label: "Retour au calme" },
  ].filter(Boolean);

  // Tab bar style helpers
  const mainTabStyle = (t) => ({
    flex: 1, padding: "10px 4px", background: "none", border: "none", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: "0.07em", textTransform: "uppercase",
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? (isDark ? "#c8906a" : "#8b4c20") : (isDark ? "#707870" : "#8a7f70"),
    borderBottom: `2px solid ${tab === t ? (isDark ? "#c8906a" : "#8b4c20") : "transparent"}`,
    transition: "color 0.15s, border-color 0.15s",
  });

  const contentTabStyle = (k) => ({
    flex: 1, padding: "7px 4px", background: "none", border: "none", cursor: "pointer",
    fontSize: 11, fontFamily: "inherit", letterSpacing: "0.04em",
    fontWeight: contentTab === k ? 600 : 400,
    color: contentTab === k ? (isDark ? "#e8e4de" : "#2a2218") : (isDark ? "#707870" : "#8a7f70"),
    borderBottom: `2px solid ${contentTab === k ? (isDark ? "#e8e4de" : "#2a2218") : "transparent"}`,
  });

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, maxWidth: 500, display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* ── Main tab bar — en haut ── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0, background: isDark ? "#1f2421" : "#e8e2d8", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
          <button style={mainTabStyle("session")} onClick={() => setTab("session")}>Séance</button>
          <button style={mainTabStyle("ressenti")} onClick={() => setTab("ressenti")}>
            Ressenti{hasFeedback ? " ✓" : ""}
          </button>
          <button style={{ ...mainTabStyle("deplacer"), position: "relative" }} onClick={() => setTab("deplacer")}>
            Déplacer
            {pendingSuggestions.length > 0 && (
              <span style={{ position: "absolute", top: 6, right: 2, width: 7, height: 7, borderRadius: "50%", background: "#f97316" }} />
            )}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 2, padding: "0 8px", alignItems: "center" }}>
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Résumé statique ── */}
        <div style={{ padding: "12px 18px 10px", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? "#e8e4de" : "#2a2218", lineHeight: 1.3, marginBottom: 8 }}>
            {session.name}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <span style={{ ...styles.sessionTypeBadge, background: session.type === "Séance" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
              {session.type || "Séance"}
            </span>
            <span style={{ ...styles.chargePill, background: getChargeColor(session.charge) + "33", color: getChargeColor(session.charge), border: `1px solid ${getChargeColor(session.charge)}55` }}>
              ⚡{session.charge}
            </span>
            {session.estimatedTime && <span style={styles.detailMetaChip}>{session.estimatedTime} min</span>}
            {session.location      && <span style={styles.detailMetaChip}>{session.location}</span>}
            {session.address       && <span style={styles.detailMetaChip}>📍 {session.address}</span>}
            {session.minRecovery   && <span style={styles.detailMetaChip}>{session.minRecovery}h récup</span>}
            {mesoLabel && <span style={{ ...styles.sessionCardMeso, background: mesoColor + "22", color: mesoColor, border: `1px solid ${mesoColor}55` }}>{mesoLabel}</span>}
            {weekMeta?.microcycle && <span style={styles.detailMetaChip}>{weekMeta.microcycle}</span>}
          </div>
          {dayLabel && (
            <div style={{ fontSize: 10, color: isDark ? "#707870" : "#8a7f70", marginTop: 5, letterSpacing: "0.05em" }}>
              {dayLabel}
              {session.startTime && (
                <span style={{ marginLeft: 8, color: isDark ? "#c8906a" : "#8b4c20", fontWeight: 600 }}>
                  {session.startTime}{session.endTime ? ` – ${session.endTime}` : ""}
                </span>
              )}
            </div>
          )}
          {session.coachNote && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: isDark ? "#2a1a10" : "#ecddd4", borderRadius: 6, borderLeft: `3px solid ${isDark ? "#c8906a" : "#8b4c20"}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "#c8906a" : "#8b4c20", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Mot de l'entraîneur</div>
              <div style={{ fontSize: 12, color: isDark ? "#e0c8b0" : "#3a2010", lineHeight: 1.5 }}>{session.coachNote}</div>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "session" ? (
            hasBlocks ? (
              /* ── Blocs composant la séance ── */
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {effectiveBlocks.map((bl, i) => {
                  const cfg = BLOCK_TYPES[bl.blockType] || {};
                  const color = cfg.color || "#888";
                  return (
                    <div key={i} style={{ borderRadius: 8, border: `1px solid ${isDark ? "#2a332d" : "#d8e8d0"}`, borderLeft: `4px solid ${color}`, background: isDark ? "#181f1b" : "#f7faf8", overflow: "hidden" }}>
                      {/* Bloc header */}
                      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>{bl.blockType}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#e0e8d8" : "#1a2a1f" }}>{bl.name}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                            {bl.duration && (
                              <span style={{ fontSize: 10, color: isDark ? "#7a9a80" : "#5a7a60" }}>{bl.duration} min</span>
                            )}
                            {cfg.hasCharge && bl.charge > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: getChargeColor(bl.charge), background: getChargeColor(bl.charge) + "22", padding: "1px 6px", borderRadius: 4 }}>
                                ⚡ {bl.charge}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: color + "22", border: `2px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, color, fontWeight: 700 }}>
                          {i + 1}
                        </div>
                      </div>
                      {/* Carte paramètres Suspension */}
                      {bl.blockType === "Suspension" && (
                        <SuspensionInfoCard config={bl.config} isDark={isDark} />
                      )}
                      {/* Description */}
                      {bl.description?.trim() && (
                        <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${isDark ? "#222c24" : "#e0ead8"}` }}>
                          <div style={{ paddingTop: 8 }}>
                            <RichText text={bl.description} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : hasContent ? (
              <>
                {/* Content sub-tabs */}
                <div style={{ display: "flex", borderBottom: `1px solid ${isDark ? "#252b27" : "#ccc6b8"}`, padding: "0 8px", background: isDark ? "#191e1b" : "#f0ebe2" }}>
                  {contentTabs.map(ct => (
                    <button key={ct.key} style={contentTabStyle(ct.key)} onClick={() => setContentTab(ct.key)}>
                      {ct.label}
                    </button>
                  ))}
                </div>
                <div style={{ padding: "14px 18px" }}>
                  {contentTab === "warmup"   && <RichText text={session.warmup} />}
                  {contentTab === "main"     && <RichText text={session.main} />}
                  {contentTab === "cooldown" && <RichText text={session.cooldown} />}
                </div>
              </>
            ) : (
              <div style={{ padding: "28px 18px", color: isDark ? "#707870" : "#8a7f70", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
                Pas de contenu détaillé pour cette séance.
              </div>
            )
          ) : tab === "ressenti" ? (
            /* ── Ressenti ── */
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Done */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ ...styles.doneBtn, ...(done ? styles.doneBtnActive : {}), flex: 1 }}
                  onClick={() => setDone(true)}
                >✓ Réalisée</button>
                <button
                  style={{ ...styles.doneBtn, ...(!done ? styles.doneBtnActiveNeg : {}), flex: 1 }}
                  onClick={() => setDone(false)}
                >✗ Non réalisée</button>
              </div>

              {done && (
                <>
                  {/* RPE */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                      <span>Fatigue RPE</span>
                      <span style={{ color: getChargeColor(rpe * 3), fontWeight: 700 }}>{rpe}/10</span>
                    </div>
                    <input type="range" min={1} max={10} step={1} value={rpe}
                      onChange={e => setRpe(+e.target.value)} style={styles.slider} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: isDark ? "#707870" : "#8a7f70", marginTop: 2 }}>
                      <span>Facile</span><span>Modéré</span><span>Maximal</span>
                    </div>
                  </div>

                  {/* Quality */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Qualité de séance</div>
                    <div style={styles.stars}>
                      {[1,2,3,4,5].map(s => (
                        <button key={s}
                          style={{ ...styles.star, color: quality >= s ? "#fbbf24" : (isDark ? "#555" : "#bbb") }}
                          onClick={() => setQuality(s === quality ? null : s)}
                        >★</button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Notes générales</div>
                    <textarea style={{ ...styles.textarea, minHeight: 70 }}
                      placeholder="Sensations, observations, ajustements…"
                      value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    />
                  </div>

                  {/* Block feedbacks */}
                  {hasBlocks && (
                    <div>
                      <div style={{ fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Retour par bloc <span style={{ fontWeight: 400, opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {effectiveBlocks.map((bl, i) => {
                          const cfg   = BLOCK_TYPES[bl.blockType] || {};
                          const color = cfg.color || "#888";
                          const existing = blockFeedbacks.find(bf => bf.blockId === bl.id);
                          const isSusp = bl.blockType === "Suspension";
                          // Utilise la config du bloc si disponible, sinon les valeurs par défaut
                          const suspCfgRef = bl.config ?? DEFAULT_SUSPENSION_CONFIG;
                          const suspData = existing?.suspensionData ?? {};
                          const patchSuspData = (patch) => {
                            setBlockFeedbacks(prev => {
                              const without = prev.filter(bf => bf.blockId !== bl.id);
                              const prev_sd = prev.find(bf => bf.blockId === bl.id)?.suspensionData ?? {};
                              return [...without, { blockId: bl.id, blockName: bl.name, blockType: bl.blockType, text: existing?.text || "", suspensionData: { ...prev_sd, ...patch } }];
                            });
                          };
                          const wInputStyle = { background: isDark ? "#141a16" : "#fff", border: `1px solid ${isDark ? "#3a4a3e" : "#c8d8c0"}`, borderRadius: 6, padding: "8px 10px", color: isDark ? "#d8e8d0" : "#1a2e1f", fontSize: 16, fontWeight: 700, textAlign: "center", width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none" };
                          const wLabelStyle = { fontSize: 10, fontWeight: 700, color: isDark ? "#6a8870" : "#7a8870", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "block" };
                          return (
                            <div key={i} style={{ borderLeft: `3px solid ${color}66`, paddingLeft: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 8 }}>
                                <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 10, marginRight: 5 }}>{bl.blockType}</span>{bl.name}
                              </div>
                              {/* Suspension : saisie structurée du poids réel */}
                              {isSusp && (
                                <div style={{ marginBottom: 10, background: isDark ? "#181c20" : "#f4f0ff", borderRadius: 8, padding: "12px 14px", border: `1px solid ${isDark ? "#2e2848" : "#d0c4f4"}`, display: "flex", flexDirection: "column", gap: 10 }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>Poids réel utilisé</span>
                                    {/* Cible coach */}
                                    <span style={{ fontSize: 10, color: isDark ? "#7070a0" : "#9080c0" }}>
                                      Cible : {suspCfgRef.armMode === "one"
                                        ? `G ${suspCfgRef.targetWeightLeft >= 0 ? "+" : ""}${suspCfgRef.targetWeightLeft} / D ${suspCfgRef.targetWeightRight >= 0 ? "+" : ""}${suspCfgRef.targetWeightRight} kg`
                                        : `${suspCfgRef.targetWeight >= 0 ? "+" : ""}${suspCfgRef.targetWeight} kg`}
                                    </span>
                                  </div>
                                  {suspCfgRef.armMode === "two" ? (
                                    <div>
                                      <span style={wLabelStyle}>
                                        {suspCfgRef.supportType === "wall" ? "Lest (kg, négatif = délestage)" : "Poids soulevé (kg)"}
                                      </span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <input
                                          type="number" step="0.5"
                                          style={wInputStyle}
                                          placeholder={String(suspCfgRef.targetWeight ?? 0)}
                                          value={suspData.actualWeight ?? ""}
                                          onChange={e => patchSuspData({ actualWeight: e.target.value === "" ? null : +e.target.value })}
                                        />
                                        <span style={{ fontSize: 12, color: isDark ? "#6a8870" : "#7a8870", whiteSpace: "nowrap" }}>kg</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                      <div>
                                        <span style={wLabelStyle}>Main gauche (kg)</span>
                                        <input
                                          type="number" step="0.5"
                                          style={wInputStyle}
                                          placeholder={String(suspCfgRef.targetWeightLeft ?? 0)}
                                          value={suspData.actualWeightLeft ?? ""}
                                          onChange={e => patchSuspData({ actualWeightLeft: e.target.value === "" ? null : +e.target.value })}
                                        />
                                      </div>
                                      <div>
                                        <span style={wLabelStyle}>Main droite (kg)</span>
                                        <input
                                          type="number" step="0.5"
                                          style={wInputStyle}
                                          placeholder={String(suspCfgRef.targetWeightRight ?? 0)}
                                          value={suspData.actualWeightRight ?? ""}
                                          onChange={e => patchSuspData({ actualWeightRight: e.target.value === "" ? null : +e.target.value })}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <textarea
                                style={{ ...styles.textarea, minHeight: isSusp ? 56 : 48, fontSize: 12, resize: "vertical" }}
                                placeholder="Adaptation, ressenti spécifique… (laisser vide si rien à dire)"
                                value={existing?.text || ""}
                                onChange={e => {
                                  const val = e.target.value;
                                  setBlockFeedbacks(prev => {
                                    const without = prev.filter(bf => bf.blockId !== bl.id);
                                    const sd = prev.find(bf => bf.blockId === bl.id)?.suspensionData;
                                    if (val.trim() || sd) return [...without, { blockId: bl.id, blockName: bl.name, blockType: bl.blockType, text: val, ...(sd ? { suspensionData: sd } : {}) }];
                                    return without;
                                  });
                                }}
                                rows={2}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button style={styles.saveBtn} onClick={() => onSave({ done, rpe: done ? rpe : null, quality: done ? quality : null, notes, blockFeedbacks: done ? blockFeedbacks : [] })}>
                Enregistrer le ressenti
              </button>
            </div>
          ) : tab === "deplacer" ? (
            /* ── Déplacer ── */
            (() => {
              const inputStyle = { background: isDark ? "#141a16" : "#fff", border: `1px solid ${isDark ? "#3a4a3e" : "#c8d8c0"}`, borderRadius: 6, padding: "8px 11px", color: isDark ? "#d8e8d0" : "#1a2e1f", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };
              const labelStyle = { fontSize: 11, color: isDark ? "#707870" : "#8a7f70", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, display: "block" };
              const dayBtnStyle = (active) => ({
                flex: 1, padding: "7px 2px", borderRadius: 6, border: `1px solid ${active ? (isDark ? "#c8906a" : "#8b4c20") : (isDark ? "#2a3a2e" : "#d4e8db")}`,
                background: active ? (isDark ? "#2a1a10" : "#ecddd4") : "none",
                color: active ? (isDark ? "#c8906a" : "#8b4c20") : (isDark ? "#8a9a88" : "#6b8c72"),
                cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400, fontFamily: "inherit",
              });
              return (
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>

                  {/* ── Heure de départ ── */}
                  <div>
                    <label style={labelStyle}>Heure de départ</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="time" value={newStartTime} onChange={e => { setNewStartTime(e.target.value); setTimeSaved(false); }}
                        style={{ ...inputStyle, width: "auto", minWidth: 120 }} />
                      {newStartTime && <button style={{ ...styles.viewToggleBtn, padding: "6px 12px", fontSize: 11 }}
                        onClick={() => { setNewStartTime(""); setTimeSaved(false); }}>Effacer</button>}
                    </div>
                    {isAthleteUser && timeChanged && (
                      <button style={{ ...styles.saveBtn, marginTop: 8, padding: "8px 16px", fontSize: 12 }}
                        onClick={() => { onUpdateStartTime(newStartTime); setTimeSaved(true); }}>
                        {timeSaved ? "✓ Heure enregistrée" : "Enregistrer l'heure"}
                      </button>
                    )}
                    {!isAthleteUser && timeChanged && !dayChanged && (
                      <button style={{ ...styles.saveBtn, marginTop: 8, padding: "8px 16px", fontSize: 12 }}
                        onClick={() => onMoveSession(smWeekKey, smDayIndex, newStartTime)}>
                        Enregistrer l'heure
                      </button>
                    )}
                  </div>

                  {/* ── Jour ── */}
                  <div>
                    <label style={labelStyle}>{isAthleteUser ? "Suggérer un déplacement vers" : "Déplacer vers"}</label>
                    {/* Week nav */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <button style={styles.navBtn} onClick={() => { setTargetWeekKey(prevWeekKey); setTargetDayIndex(smDayIndex); }}>←</button>
                      <span style={{ flex: 1, textAlign: "center", fontSize: 11, color: isDark ? "#c8d8c0" : "#2a4a30", fontWeight: 500 }}>{weekLabel}</span>
                      <button style={styles.navBtn} onClick={() => { setTargetWeekKey(nextWeekKey); setTargetDayIndex(smDayIndex); }}>→</button>
                    </div>
                    {/* Day buttons */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {DAYS.map((d, i) => {
                        const dateD = targetMonday ? addDays(targetMonday, i) : null;
                        const dateStr = dateD ? `${dateD.getDate()}/${dateD.getMonth() + 1}` : "";
                        return (
                          <button key={i} style={dayBtnStyle(targetDayIndex === i && targetWeekKey === (targetWeekKey))}
                            onClick={() => setTargetDayIndex(i)}>
                            <div>{d}</div>
                            <div style={{ fontSize: 9, opacity: 0.7 }}>{dateStr}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Coach: move button */}
                    {!isAthleteUser && dayChanged && (
                      <button style={{ ...styles.saveBtn, marginTop: 12 }}
                        onClick={() => onMoveSession(targetWeekKey, targetDayIndex, newStartTime || session.startTime || null)}>
                        Déplacer la séance
                      </button>
                    )}
                    {!isAthleteUser && dayChanged && (timeChanged) && (
                      <div style={{ fontSize: 10, color: isDark ? "#5a7a62" : "#8a9e90", marginTop: 4 }}>
                        La séance sera déplacée avec l'heure {newStartTime}.
                      </div>
                    )}

                    {/* Athlete: suggestion form */}
                    {isAthleteUser && dayChanged && (
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          style={{ ...styles.textarea, minHeight: 56, fontSize: 12 }}
                          placeholder="Note pour le coach (optionnel)…"
                          value={suggestionNote} onChange={e => setSuggestionNote(e.target.value)} rows={2}
                        />
                        <button style={styles.saveBtn}
                          onClick={() => { onSuggestMove(targetWeekKey, targetDayIndex, suggestionNote); setSuggestionNote(""); setTargetWeekKey(smWeekKey); setTargetDayIndex(smDayIndex); }}>
                          Envoyer la suggestion
                        </button>
                      </div>
                    )}
                    {isAthleteUser && !dayChanged && (
                      <div style={{ fontSize: 11, color: isDark ? "#5a7a62" : "#8a9e90", marginTop: 8, fontStyle: "italic" }}>
                        Sélectionne un autre jour pour envoyer une suggestion de déplacement à ton coach.
                      </div>
                    )}
                  </div>

                  {/* ── Suggestions en attente (coach uniquement) ── */}
                  {!isAthleteUser && pendingSuggestions.length > 0 && (
                    <div>
                      <label style={{ ...labelStyle, color: "#f97316" }}>Suggestions de l'athlète</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pendingSuggestions.map(s => (
                          <div key={s.id} style={{ borderRadius: 8, border: `1px solid ${isDark ? "#3a2a10" : "#fbd8aa"}`, background: isDark ? "#1e1808" : "#fff8ee", padding: "10px 12px" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#fbbf24" : "#92400e", marginBottom: 4 }}>
                              → {formatSuggTarget(s.toWeekKey, s.toDayIndex)}
                            </div>
                            {s.note && <div style={{ fontSize: 11, color: isDark ? "#c8b870" : "#78540a", fontStyle: "italic", marginBottom: 8 }}>"{s.note}"</div>}
                            <div style={{ display: "flex", gap: 6 }}>
                              <button style={{ ...styles.saveBtn, padding: "5px 12px", fontSize: 11, flex: 1 }}
                                onClick={() => onAcceptSuggestion(s.id)}>✓ Accepter</button>
                              <button style={{ ...styles.doneBtn, padding: "5px 12px", fontSize: 11, flex: 1, color: isDark ? "#f87171" : "#dc2626", borderColor: isDark ? "#4a1c1c" : "#fca5a5" }}
                                onClick={() => onRejectSuggestion(s.id)}>✗ Refuser</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : null}
        </div>
      </div>
    </div>
  );
}

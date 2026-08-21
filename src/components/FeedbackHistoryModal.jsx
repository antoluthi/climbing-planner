import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import supabase from "../lib/supabase.js";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { Modal, ModalHeader } from "./ui/Modal.jsx";
import { colors, DATA } from "../theme/palette.js";

/// ─── MODAL: HISTORIQUE FEEDBACKS COACH ───────────────────────────────────────

export function FeedbackHistoryModal({ type, id, name, onClose }) {
  const { isDark } = useThemeCtx();
  const [feedbacks, setFeedbacks] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || id == null) { setFeedbacks([]); return; }
    const load = async () => {
      const { data, error: err } = await supabase
        .from("session_feedbacks")
        .select("*")
        .order("feedback_date", { ascending: false });
      if (err) { setError(err.message); setFeedbacks([]); return; }
      const all = data || [];
      if (type === "session") {
        setFeedbacks(all.filter(fb => fb.session_id === id || fb.session_name === name));
      } else {
        setFeedbacks(all.filter(fb =>
          Array.isArray(fb.block_feedbacks) &&
          fb.block_feedbacks.some(bf => bf.blockId === id && (bf.text?.trim() || bf.suspensionData != null))
        ));
      }
    };
    load();
  }, [type, id, name]);

  const surface = colors(isDark).card;
  const bg      = colors(isDark).successBg;
  const border  = colors(isDark).successBg;
  const text    = colors(isDark).text;
  const muted   = colors(isDark).success;
  const accent  = colors(isDark).accent;

  const fmtDate = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  };
  const fmtDateShort = (ds) => {
    if (!ds) return "";
    return new Date(ds).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  // Données de progression poids pour les blocs Suspension
  const suspChartData = useMemo(() => {
    if (type !== "block" || !feedbacks?.length) return null;
    // Vérifie si au moins un feedback a des données de suspension
    const hasSuspData = feedbacks.some(fb => {
      const bf = (fb.block_feedbacks || []).find(b => b.blockId === id);
      return bf?.suspensionData != null;
    });
    if (!hasSuspData) return null;
    // Détecte le mode bras depuis le premier feedback avec suspensionData
    const firstBf = feedbacks.map(fb => (fb.block_feedbacks || []).find(b => b.blockId === id)).find(bf => bf?.suspensionData);
    const isOneArm = firstBf?.suspensionData?.actualWeightLeft != null || firstBf?.suspensionData?.actualWeightRight != null;
    return {
      isOneArm,
      points: [...feedbacks]
        .reverse()
        .map(fb => {
          const bf = (fb.block_feedbacks || []).find(b => b.blockId === id);
          if (!bf?.suspensionData) return null;
          const sd = bf.suspensionData;
          return {
            date: fmtDateShort(fb.feedback_date),
            fullDate: fmtDate(fb.feedback_date),
            athlete: fb.athlete_name || "?",
            ...(isOneArm
              ? { gauche: sd.actualWeightLeft ?? null, droite: sd.actualWeightRight ?? null }
              : { poids: sd.actualWeight ?? null }),
          };
        })
        .filter(Boolean),
    };
  }, [type, feedbacks, id]);

  return (
    <Modal onClose={onClose} maxWidth={540} ariaLabel={`Retours athlètes — ${name}`}>
      <ModalHeader
        eyebrow={type === "session" ? "Retours athlètes — Séance" : "Retours athlètes — Bloc"}
        title={name}
        onClose={onClose}
      />

        {/* ── Graphique évolution poids Suspension ── */}
        {suspChartData && suspChartData.points.length > 1 && (
          <div style={{ padding: "12px 16px 0", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DATA.hands.left, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Évolution du poids
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={suspChartData.points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors(isDark).successBg} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: muted }} />
                <YAxis tick={{ fontSize: 9, fill: muted }} unit="kg" />
                <ReferenceLine y={0} stroke={muted} strokeDasharray="2 2" />
                <Tooltip
                  contentStyle={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: text, fontWeight: 600, marginBottom: 4 }}
                  formatter={(val, name) => [`${val} kg`, name]}
                />
                {suspChartData.isOneArm ? (
                  <>
                    <Line type="monotone" dataKey="gauche" stroke={DATA.hands.left} strokeWidth={2} dot={{ r: 3 }} name="Main gauche" connectNulls />
                    <Line type="monotone" dataKey="droite" stroke={DATA.hands.right} strokeWidth={2} dot={{ r: 3 }} name="Main droite" connectNulls />
                  </>
                ) : (
                  <Line type="monotone" dataKey="poids" stroke={DATA.hands.left} strokeWidth={2} dot={{ r: 3 }} name="Poids" connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
            {suspChartData.isOneArm && (
              <div style={{ display: "flex", gap: 14, fontSize: 10, color: muted, paddingBottom: 8, justifyContent: "center" }}>
                <span style={{ color: DATA.hands.left }}>●</span> Main gauche
                <span style={{ color: DATA.hands.right }}>●</span> Main droite
              </div>
            )}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {feedbacks === null ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: muted, fontSize: 12 }}>Chargement…</div>
          ) : error ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: colors(isDark).danger, fontSize: 12 }}>{error}</div>
          ) : feedbacks.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", color: muted }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>—</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>Aucun retour pour l'instant</div>
              <div style={{ fontSize: 12 }}>
                {type === "session" ? "Les athlètes n'ont pas encore donné de feedback sur cette séance." : "Aucun athlète n'a encore commenté ce bloc."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {feedbacks.map((fb, i) => {
                const blockFb = type === "block"
                  ? (fb.block_feedbacks || []).find(bf => bf.blockId === id)
                  : null;
                return (
                  <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden" }}>
                    {/* Athlete + date row */}
                    <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: accent + "28", color: accent, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {(fb.athlete_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: text }}>{fb.athlete_name || "Athlète inconnu"}</div>
                          <div style={{ fontSize: 10, color: muted }}>{fmtDate(fb.feedback_date)}</div>
                        </div>
                      </div>
                      {fb.done !== null && fb.done !== undefined && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 4, background: fb.done ? colors(isDark).successBg : colors(isDark).dangerBg, color: fb.done ? colors(isDark).success : colors(isDark).danger, border: `1px solid ${fb.done ? colors(isDark).successBorder : colors(isDark).dangerBorder}` }}>
                          {fb.done ? "✓ Réalisée" : "✗ Non réalisée"}
                        </span>
                      )}
                    </div>

                    {/* Feedback body */}
                    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* RPE + quality */}
                      {(fb.rpe != null || fb.quality != null) && (
                        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                          {fb.rpe != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 10, color: muted }}>RPE</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: getChargeColor(fb.rpe) }}>{fb.rpe}/10</span>
                            </div>
                          )}
                          {fb.quality != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 10, color: muted }}>Qualité</span>
                              <span style={{ fontSize: 12, color: colors(isDark).warn, letterSpacing: 1 }}>{"★".repeat(fb.quality)}{"☆".repeat(5 - fb.quality)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* General notes (session view) */}
                      {type === "session" && fb.notes?.trim() && (
                        <div>
                          <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Notes générales</div>
                          <div style={{ fontSize: 12, color: text, lineHeight: 1.5, background: surface, padding: "6px 10px", borderRadius: 5, border: `1px solid ${border}` }}>{fb.notes}</div>
                        </div>
                      )}
                      {/* Block-specific feedback (block view) */}
                      {type === "block" && blockFb && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Données de suspension */}
                          {blockFb.suspensionData && (
                            <div style={{ background: colors(isDark).surface, borderRadius: 6, padding: "8px 10px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: DATA.hands.left, marginBottom: 4 }}>Poids réel</div>
                              {blockFb.suspensionData.actualWeight != null ? (
                                <span style={{ fontSize: 13, fontWeight: 700, color: DATA.hands.left }}>
                                  {blockFb.suspensionData.actualWeight >= 0 ? "+" : ""}{blockFb.suspensionData.actualWeight} kg
                                </span>
                              ) : (
                                <div style={{ display: "flex", gap: 12 }}>
                                  {blockFb.suspensionData.actualWeightLeft != null && (
                                    <div>
                                      <div style={{ fontSize: 9, color: muted }}>Gauche</div>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: DATA.hands.left }}>
                                        {blockFb.suspensionData.actualWeightLeft >= 0 ? "+" : ""}{blockFb.suspensionData.actualWeightLeft} kg
                                      </span>
                                    </div>
                                  )}
                                  {blockFb.suspensionData.actualWeightRight != null && (
                                    <div>
                                      <div style={{ fontSize: 9, color: muted }}>Droite</div>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: DATA.hands.right }}>
                                        {blockFb.suspensionData.actualWeightRight >= 0 ? "+" : ""}{blockFb.suspensionData.actualWeightRight} kg
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {blockFb.text?.trim() && (
                            <div>
                              <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Retour sur ce bloc</div>
                              <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>{blockFb.text}</div>
                            </div>
                          )}
                          {fb.notes?.trim() && (
                            <div style={{ fontSize: 11, color: muted, fontStyle: "italic" }}>
                              Note générale : {fb.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </Modal>
  );
}

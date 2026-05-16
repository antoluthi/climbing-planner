import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor } from "../lib/charge.js";
import { SuspensionSummaryChips } from "./SuspensionSummaryChips.jsx";
import { BlockFormModal } from "./BlockFormModal.jsx";
import { FeedbackHistoryModal } from "./FeedbackHistoryModal.jsx";

export function CoachLibraryView({ catalog, onNew, onEdit, onDelete, blocks, onNewBlock, onEditBlock, onDeleteBlock }) {
  const { isDark } = useThemeCtx();
  const [subTab,          setSubTab]          = useState("sessions"); // "sessions" | "blocks"
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState("Tous");
  const [sort,            setSort]            = useState("date"); // "date" | "charge"
  const [confirmId,       setConfirmId]       = useState(null);
  const [blockForm,       setBlockForm]       = useState(null); // null | { initial? }
  const [feedbackHistory, setFeedbackHistory] = useState(null); // null | { type, id, name }

  const bg      = isDark ? "#241b13" : "#f3f7f4";
  const surface = isDark ? "#241b13" : "#ffffff";
  const border  = isDark ? "#3a2e22" : "#daeade";
  const text    = isDark ? "#f0e6d0" : "#1a2e1f";
  const muted   = isDark ? "#a89a82" : "#6b8c72";
  const accent  = isDark ? "#e0a875" : "#8b4c20";
  const danger  = isDark ? "#f08070" : "#f08070";

  // ── Shared item row ──
  const ItemActions = ({ id, onEdit: doEdit, onDel, onHistory }) => confirmId === id ? (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <button onClick={() => { onDel(id); setConfirmId(null); }} style={{ background: danger, border: "none", borderRadius: 5, color: "#fff", padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>Supprimer</button>
      <button onClick={() => setConfirmId(null)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: muted, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Annuler</button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      {onHistory && (
        <button onClick={onHistory} title="Retours athlètes" style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: accent, padding: "5px 8px", cursor: "pointer", fontSize: 11, lineHeight: 1, fontFamily: "inherit", letterSpacing: "0.02em" }}>Feedback</button>
      )}
      <button onClick={doEdit} title="Modifier" style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: muted, padding: "5px 9px", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✎</button>
      <button onClick={() => setConfirmId(id)} title="Supprimer" style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: danger + "bb", padding: "5px 9px", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
    </div>
  );

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => (b.charge ?? 0) - (a.charge ?? 0));
    return arr;
  };

  // ── Séances tab — toutes les séances (communautaires) ──
  const allSessions = catalog; // plus de filtre isCustom
  const filteredSessions = applySort(allSessions.filter(s => {
    const matchType   = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }));
  const byType = {};
  filteredSessions.forEach(s => { (byType[s.type] = byType[s.type] || []).push(s); });

  // ── Blocs tab ──
  const filteredBlocks = applySort((blocks || []).filter(b =>
    (filter === "Tous" || b.blockType === filter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  ));
  const byBlockType = {};
  filteredBlocks.forEach(b => { (byBlockType[b.blockType] = byBlockType[b.blockType] || []).push(b); });

  const isSessionTab = subTab === "sessions";
  const filterOptions = isSessionTab ? ["Tous", "Grimpe", "Exercice"] : ["Tous", ...Object.keys(BLOCK_TYPES)];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: bg, padding: "20px 16px" }}>
      <div style={{ maxWidth: 660, margin: "0 auto" }}>

        {/* ── Sub-tabs ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 22, background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: 3 }}>
          {[{ key: "sessions", label: "Séances" }, { key: "blocks", label: "Blocs" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSubTab(key); setSearch(""); setFilter("Tous"); setSort("date"); setConfirmId(null); }}
              style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: subTab === key ? (isDark ? "#3a2e22" : "#d4e8db") : "none",
                color: subTab === key ? accent : muted,
              }}
            >{label}</button>
          ))}
        </div>

        {/* ── Header : titre + bouton ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>
              {isSessionTab ? "Mes séances" : "Mes blocs"}
            </div>
            <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>
              {isSessionTab
                ? `${allSessions.length} séance${allSessions.length !== 1 ? "s" : ""}`
                : `${(blocks || []).length} bloc${(blocks || []).length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button
            onClick={isSessionTab ? onNew : () => setBlockForm({})}
            style={{ background: accent, border: "none", borderRadius: 7, color: "#fff", padding: "9px 16px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.03em", boxShadow: `0 2px 10px ${accent}44` }}
          >
            ＋ {isSessionTab ? "Nouvelle séance" : "Nouveau bloc"}
          </button>
        </div>

        {/* ── Recherche + filtres ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          <input
            style={{ background: surface, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 12px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none" }}
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {filterOptions.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                    fontWeight: filter === f ? 600 : 400,
                    background: filter === f ? (isDark ? "#3a2e22" : "#d4e8db") : "none",
                    border: `1px solid ${filter === f ? accent + "88" : border}`,
                    color: filter === f ? accent : muted,
                  }}
                >{f}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: muted }}>Trier :</span>
              {[["date", "Date ↓"], ["charge", "Charge ↓"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    padding: "4px 9px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                    fontWeight: sort === key ? 600 : 400,
                    background: sort === key ? (isDark ? "#3a2e22" : "#d4e8db") : "none",
                    border: `1px solid ${sort === key ? accent + "88" : border}`,
                    color: sort === key ? accent : muted,
                  }}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ══ SÉANCES ══ */}
        {isSessionTab && (
          allSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: muted }}>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: text }}>Aucune séance</div>
              <div style={{ fontSize: 12 }}>Créez vos premières séances pour les retrouver dans le calendrier.</div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: muted, fontSize: 12 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byType).map(([type, sessions]) => (
              <div key={type} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${border}` }}>{type}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sessions.map(s => (
                    <div key={s.id} style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${getChargeColor(s.charge)}`, borderRadius: 7, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: muted, display: "flex", gap: 10 }}>
                          {s.estimatedTime && <span>{s.estimatedTime} min</span>}
                          {s.location     && <span>{s.location}</span>}
                          {s.minRecovery  && <span>↺ {s.minRecovery}h récup</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 4, flexShrink: 0, background: getChargeColor(s.charge) + "28", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>⚡{s.charge}</span>
                      <ItemActions id={s.id} onEdit={() => onEdit(s)} onDel={onDelete} onHistory={() => setFeedbackHistory({ type: "session", id: s.id, name: s.name })} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        )}

        {/* ══ BLOCS ══ */}
        {!isSessionTab && (
          (blocks || []).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: muted }}>

              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: text }}>Aucun bloc</div>
              <div style={{ fontSize: 12 }}>Créez des blocs réutilisables (exercices, protocoles) à assembler dans vos séances.</div>
            </div>
          ) : filteredBlocks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: muted, fontSize: 12 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byBlockType).map(([btype, blist]) => {
              const cfg = BLOCK_TYPES[btype] || {};
              return (
                <div key={btype} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: cfg.color || muted, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${border}` }}>
                    {btype}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {blist.map(b => (
                      <div key={b.id} style={{ background: surface, border: `1px solid ${border}`, borderLeft: `3px solid ${cfg.color || "#a89a82"}`, borderRadius: 7, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                          <div style={{ fontSize: 10, color: muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {b.duration    && <span>⏱ {b.duration} min</span>}
                            {cfg.hasCharge && b.charge > 0 && <span style={{ color: getChargeColor(b.charge) }}>⚡{b.charge}</span>}
                            {b.blockType === "Suspension" && b.config ? (
                              <SuspensionSummaryChips config={b.config} muted={muted} />
                            ) : b.description ? (
                              <span style={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.description}</span>
                            ) : null}
                          </div>
                        </div>
                        <ItemActions id={b.id} onEdit={() => setBlockForm({ initial: b })} onDel={onDeleteBlock} onHistory={() => setFeedbackHistory({ type: "block", id: b.id, name: b.name })} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* ── Modal bloc ── */}
      {blockForm !== null && (
        <BlockFormModal
          initial={blockForm.initial}
          onSave={b => { (blockForm.initial ? onEditBlock : onNewBlock)(b); setBlockForm(null); }}
          onClose={() => setBlockForm(null)}
        />
      )}

      {/* ── Modal historique feedbacks ── */}
      {feedbackHistory && (
        <FeedbackHistoryModal
          type={feedbackHistory.type}
          id={feedbackHistory.id}
          name={feedbackHistory.name}
          onClose={() => setFeedbackHistory(null)}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor, getSessionCharge, normalizeCharge10 } from "../lib/charge.js";
import { SuspensionSummaryChips } from "./SuspensionSummaryChips.jsx";
import { BlockFormModal } from "./BlockFormModal.jsx";
import { FeedbackHistoryModal } from "./FeedbackHistoryModal.jsx";
import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import {
  Segmented, SectionLabel, Chip, PrimaryButton, RoundIconButton, SANS, MONO,
} from "./ui/Ascent.jsx";

// ─── BIBLIOTHÈQUE ─────────────────────────────────────────────────────────────
// Séances et blocs réutilisables. Habillage « Ascent » : cartes sombres, filets
// de 0.5 px entre les lignes, chips en pill pour les filtres et le tri.

export function CoachLibraryView({ catalog, onNew, onEdit, onDelete, blocks, onNewBlock, onEditBlock, onDeleteBlock }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const [subTab,          setSubTab]          = useState("sessions"); // "sessions" | "blocks"
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState("Tous");
  const [sort,            setSort]            = useState("date"); // "date" | "charge"
  const [confirmId,       setConfirmId]       = useState(null);
  const [blockForm,       setBlockForm]       = useState(null); // null | { initial? }
  const [feedbackHistory, setFeedbackHistory] = useState(null); // null | { type, id, name }

  // ── Actions d'une ligne (retours / modifier / supprimer) ──
  const ItemActions = ({ id, onEdit: doEdit, onDel, onHistory }) => confirmId === id ? (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <Chip isDark={isDark} size="sm" label="Supprimer" active color={c.danger}
            onClick={() => { onDel(id); setConfirmId(null); }} />
      <Chip isDark={isDark} size="sm" label="Annuler" onClick={() => setConfirmId(null)} />
    </div>
  ) : (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
      {onHistory && (
        <RoundIconButton isDark={isDark} size={30} label="Retours des athlètes" onClick={onHistory}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0121 11.5z" />
          </svg>
        </RoundIconButton>
      )}
      <RoundIconButton isDark={isDark} size={30} label="Modifier" onClick={doEdit}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </RoundIconButton>
      <RoundIconButton isDark={isDark} size={30} label="Supprimer" onClick={() => setConfirmId(id)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.danger}
             strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </RoundIconButton>
    </div>
  );

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => getSessionCharge(b) - getSessionCharge(a));
    return arr;
  };

  // ── Séances — le catalogue est commun à tous les comptes ──
  const allSessions = catalog;
  const filteredSessions = applySort(allSessions.filter(s => {
    const matchType   = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }));
  const byType = {};
  filteredSessions.forEach(s => { (byType[s.type] = byType[s.type] || []).push(s); });

  // ── Blocs ──
  const filteredBlocks = applySort((blocks || []).filter(b =>
    (filter === "Tous" || b.blockType === filter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  ));
  const byBlockType = {};
  filteredBlocks.forEach(b => { (byBlockType[b.blockType] = byBlockType[b.blockType] || []).push(b); });

  const isSessionTab = subTab === "sessions";
  const filterOptions = isSessionTab ? ["Tous", "Grimpe", "Exercice"] : ["Tous", ...Object.keys(BLOCK_TYPES)];

  const listCard = {
    background: c.card, border: `1px solid ${c.border}`,
    borderRadius: RADIUS.card, overflow: "hidden",
  };
  const rowBase = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "13px 14px", minHeight: 56,
  };
  const emptyBox = { textAlign: "center", padding: "60px 20px", color: c.textMuted, fontFamily: SANS };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: c.bg, padding: "18px 16px 90px", fontFamily: SANS }}>
      <div style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>

        {/* ── Séances / Blocs ── */}
        <Segmented
          isDark={isDark}
          value={subTab}
          onChange={key => { setSubTab(key); setSearch(""); setFilter("Tous"); setSort("date"); setConfirmId(null); }}
          options={[{ value: "sessions", label: "Séances" }, { value: "blocks", label: "Blocs" }]}
          style={{ marginBottom: 20 }}
        />

        {/* ── Titre + création ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.text, letterSpacing: "-0.3px" }}>
              {isSessionTab ? "Séances" : "Blocs"}
            </div>
            <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
              {isSessionTab
                ? `${allSessions.length} séance${allSessions.length !== 1 ? "s" : ""}`
                : `${(blocks || []).length} bloc${(blocks || []).length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <PrimaryButton
            isDark={isDark}
            height={40}
            onClick={isSessionTab ? onNew : () => setBlockForm({})}
            style={{ width: "auto", padding: "0 18px", flexShrink: 0, fontSize: 14 }}
          >
            + {isSessionTab ? "Séance" : "Bloc"}
          </PrimaryButton>
        </div>

        {/* ── Recherche ── */}
        <input
          style={{
            width: "100%", background: c.control, border: "none", outline: "none",
            borderRadius: RADIUS.pill, padding: "11px 18px", color: c.text,
            fontSize: 14, fontFamily: SANS, marginBottom: 12,
          }}
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* ── Filtres ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {filterOptions.map(f => (
            <Chip
              key={f} isDark={isDark} size="sm" label={f}
              active={filter === f}
              color={!isSessionTab && BLOCK_TYPES[f]?.color}
              onClick={() => setFilter(f)}
            />
          ))}
        </div>

        {/* ── Tri ── */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontSize: 12, color: c.textDim }}>Trier</span>
          {[["date", "Récent"], ["charge", "Charge"]].map(([key, label]) => (
            <Chip key={key} isDark={isDark} size="sm" label={label}
                  active={sort === key} onClick={() => setSort(key)} />
          ))}
        </div>

        {/* ══ SÉANCES ══ */}
        {isSessionTab && (
          allSessions.length === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: c.text }}>Aucune séance</div>
              <div style={{ fontSize: 13 }}>Crée tes premières séances pour les retrouver dans le calendrier.</div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ ...emptyBox, padding: "40px 20px", fontSize: 13 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byType).map(([type, sessions]) => (
              <div key={type} style={{ marginBottom: 22 }}>
                <SectionLabel isDark={isDark}>{type}</SectionLabel>
                <div style={listCard}>
                  {sessions.map((s, i) => {
                    const charge = getSessionCharge(s);
                    const tone = getChargeColor(charge);
                    return (
                      <div key={s.id} style={{
                        ...rowBase,
                        borderBottom: i === sessions.length - 1 ? "none" : `0.5px solid ${c.border}`,
                      }}>
                        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: tone, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: 11, color: c.textDim, display: "flex", gap: 10, marginTop: 2 }}>
                            {s.estimatedTime && <span>{s.estimatedTime} min</span>}
                            {s.location     && <span>{s.location}</span>}
                            {s.minRecovery  && <span>↺ {s.minRecovery} h</span>}
                          </div>
                        </div>
                        <span style={{ font: `700 15px ${MONO}`, color: tone, flexShrink: 0 }}>{charge}</span>
                        <ItemActions
                          id={s.id}
                          onEdit={() => onEdit(s)}
                          onDel={onDelete}
                          onHistory={() => setFeedbackHistory({ type: "session", id: s.id, name: s.name })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        )}

        {/* ══ BLOCS ══ */}
        {!isSessionTab && (
          (blocks || []).length === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: c.text }}>Aucun bloc</div>
              <div style={{ fontSize: 13 }}>Crée des blocs réutilisables (exercices, protocoles) à assembler dans tes séances.</div>
            </div>
          ) : filteredBlocks.length === 0 ? (
            <div style={{ ...emptyBox, padding: "40px 20px", fontSize: 13 }}>Aucun résultat.</div>
          ) : (
            Object.entries(byBlockType).map(([btype, blist]) => {
              const cfg = BLOCK_TYPES[btype] || {};
              const tone = cfg.color || c.textMuted;
              return (
                <div key={btype} style={{ marginBottom: 22 }}>
                  <SectionLabel isDark={isDark} style={{ color: tone }}>{btype}</SectionLabel>
                  <div style={listCard}>
                    {blist.map((b, i) => (
                      <div key={b.id} style={{
                        ...rowBase,
                        borderBottom: i === blist.length - 1 ? "none" : `0.5px solid ${c.border}`,
                      }}>
                        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: tone, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {b.name}
                          </div>
                          <div style={{ fontSize: 11, color: c.textDim, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2, alignItems: "center" }}>
                            {b.duration && <span>{b.duration} min</span>}
                            {cfg.hasCharge && b.charge > 0 && (
                              <span style={{ font: `700 12px ${MONO}`, color: getChargeColor(normalizeCharge10(b.charge)) }}>
                                {normalizeCharge10(b.charge)}
                              </span>
                            )}
                            {b.blockType === "Suspension" && b.config ? (
                              <SuspensionSummaryChips config={b.config} muted={c.textDim} />
                            ) : b.description ? (
                              <span style={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.description}</span>
                            ) : null}
                          </div>
                        </div>
                        <ItemActions
                          id={b.id}
                          onEdit={() => setBlockForm({ initial: b })}
                          onDel={onDeleteBlock}
                          onHistory={() => setFeedbackHistory({ type: "block", id: b.id, name: b.name })}
                        />
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

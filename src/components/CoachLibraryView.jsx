import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor, getSessionCharge } from "../lib/charge.js";
import { FeedbackHistoryModal } from "./FeedbackHistoryModal.jsx";
import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import { disciplineList, getDiscipline } from "../lib/disciplines.js";
import {
  Chip, PrimaryButton, RoundIconButton, PageTitle, SectionLabel, SportBadge, SANS, MONO,
} from "./ui/Ascent.jsx";

// ─── BIBLIOTHÈQUE ─────────────────────────────────────────────────────────────
// Les séances modèles, celles qu'on recharge depuis le formulaire d'ajout.
// Habillage « Ascent » : cartes sombres, filets de 0,5 px, chips en pill.

export function CoachLibraryView({ catalog, onNew, onEdit, onDelete }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const [search,          setSearch]          = useState("");
  const [discipline,      setDiscipline]      = useState("all");
  const [sort,            setSort]            = useState("date"); // "date" | "charge"
  const [confirmId,       setConfirmId]       = useState(null);
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

  // ── Filtre + tri ──
  const sessions = (catalog || []).filter(s => {
    const name = (s.name || s.title || "").toLowerCase();
    if (search.trim() && !name.includes(search.trim().toLowerCase())) return false;
    if (discipline === "all") return true;
    return (s.discipline || "climbing") === discipline;
  });
  const sorted = [...sessions].sort((a, b) => sort === "charge"
    ? getSessionCharge(b) - getSessionCharge(a)
    : Number(b.id) - Number(a.id));

  // Groupées par discipline — l'ancien regroupement par « type » ne veut plus
  // dire grand-chose depuis que chaque séance porte sa discipline.
  const byDiscipline = {};
  sorted.forEach(s => {
    const id = getDiscipline(s.discipline || "climbing").id;
    (byDiscipline[id] = byDiscipline[id] || []).push(s);
  });

  const listCard = {
    background: c.card, border: `1px solid ${c.border}`,
    borderRadius: RADIUS.card, overflow: "hidden",
  };
  const emptyBox = { textAlign: "center", padding: "60px 20px", color: c.textMuted, fontFamily: SANS };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: c.bg, padding: "18px 16px 90px", fontFamily: SANS }}>
      <div style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>

        <PageTitle isDark={isDark}>Bibliothèque</PageTitle>

        {/* ── Compte + création ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: c.textMuted, minWidth: 0 }}>
            {(catalog || []).length} séance{(catalog || []).length !== 1 ? "s" : ""}
          </div>
          <PrimaryButton
            isDark={isDark} height={40} onClick={onNew}
            style={{ width: "auto", padding: "0 18px", flexShrink: 0, fontSize: 14 }}
          >
            + Séance
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
          <Chip isDark={isDark} size="sm" label="Toutes"
                active={discipline === "all"} onClick={() => setDiscipline("all")} />
          {disciplineList().map(d => (
            <Chip key={d.id} isDark={isDark} size="sm" label={d.label} color={d.color}
                  active={discipline === d.id} onClick={() => setDiscipline(d.id)} />
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

        {/* ── Liste ── */}
        {(catalog || []).length === 0 ? (
          <div style={emptyBox}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: c.text }}>Aucune séance</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              Coche « Enregistrer comme modèle » en créant une séance : elle se retrouvera ici,
              et se rechargera depuis le formulaire d'ajout.
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ ...emptyBox, padding: "40px 20px", fontSize: 13 }}>Aucun résultat.</div>
        ) : (
          Object.entries(byDiscipline).map(([dId, list]) => {
            const d = getDiscipline(dId);
            return (
              <div key={dId} style={{ marginBottom: 22 }}>
                <SectionLabel isDark={isDark} style={{ color: d.color }}>{d.label}</SectionLabel>
                <div style={listCard}>
                  {list.map((s, i) => {
                    const charge = getSessionCharge(s);
                    const tone = getChargeColor(charge, isDark);
                    return (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "13px 14px", minHeight: 56,
                        borderBottom: i === list.length - 1 ? "none" : `0.5px solid ${c.border}`,
                      }}>
                        <SportBadge disciplineId={d.id} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, color: c.text,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {s.name || s.title}
                          </div>
                          <div style={{ fontSize: 11, color: c.textDim, display: "flex", gap: 10, marginTop: 2 }}>
                            {s.estimatedTime ? <span>{s.estimatedTime} min</span> : null}
                            {s.metrics?.distanceKm ? <span>{s.metrics.distanceKm} km</span> : null}
                            {s.location ? <span>{s.location}</span> : null}
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
            );
          })
        )}
      </div>

      {/* ── Historique des retours ── */}
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

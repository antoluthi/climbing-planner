import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { Modal, ModalHeader, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { TextInput } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";

// ─── MODAL: Ajouter une séance ────────────────────────────────────────────────

export function SessionPicker({ onSelect, onClose, customSessions, onCreateCustom, sessions, createLabel }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [address, setAddress] = useState("");
  const [sort, setSort] = useState("date");
  const catalogSessions = sessions || [];

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => b.charge - a.charge);
    return arr;
  };
  const matches = (s) => (filter === "Tous" || s.type === filter)
    && s.name.toLowerCase().includes(search.toLowerCase());

  const filtered = applySort(catalogSessions.filter(matches));
  const filteredCustom = applySort((customSessions || []).filter(matches));

  const chip = (active, onClick, children) => (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: "inherit",
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accent + "22" : "transparent",
        color: active ? T.accent : T.textMid, fontWeight: active ? 600 : 500,
      }}
    >{children}</button>
  );

  const Row = ({ s, isCustom }) => {
    const cc = getChargeColor(s.charge);
    const active = selected?.id === s.id;
    return (
      <button
        onClick={() => setSelected(s)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%",
          textAlign: "left", fontFamily: "inherit", cursor: "pointer",
          padding: "10px 12px", borderRadius: 10,
          background: active ? T.accent + "18" : T.surface,
          border: `1px solid ${active ? T.accent : T.border}`,
          borderLeft: isCustom ? `3px solid ${cc}` : `1px solid ${active ? T.accent : T.border}`,
          transition: "background 0.12s, border-color 0.12s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
            background: s.type === "Grimpe" ? T.accent + "22" : (isDark ? "#2a3340" : "#e0e8f0"),
            color: s.type === "Grimpe" ? T.accent : (isDark ? "#9bb4cc" : "#5a6878"),
          }}>{s.type}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            {(s.estimatedTime || s.location) && (
              <span style={{ fontSize: 10, color: T.textLight }}>
                {s.estimatedTime ? `${s.estimatedTime} min` : ""}{s.location ? `  ·  ${s.location}` : ""}
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, flexShrink: 0,
          background: cc + "22", color: cc, border: `1px solid ${cc}55`,
        }}>{s.charge}</span>
      </button>
    );
  };

  return (
    <Modal onClose={onClose} maxWidth={460} ariaLabel="Choisir une séance">
      <ModalHeader title="Choisir une séance" onClose={onClose} />

      {/* Barre de recherche + filtres (fixe) */}
      <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10, borderBottom: `1px solid ${T.border}` }}>
        <TextInput placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["Tous", "Grimpe", "Exercice"].map(f => chip(filter === f, () => setFilter(f), f))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.textLight }}>Trier</span>
            {chip(sort === "date", () => setSort("date"), "Date ↓")}
            {chip(sort === "charge", () => setSort("charge"), "Charge ↓")}
          </div>
        </div>
      </div>

      {/* Liste (défilante) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredCustom.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: T.textLight, textTransform: "uppercase", padding: "2px 2px" }}>Mes séances</div>
            {filteredCustom.map(s => <Row key={s.id} s={s} isCustom />)}
          </>
        )}
        {filtered.map(s => <Row key={s.id} s={s} />)}
        {filtered.length === 0 && filteredCustom.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 0", color: T.textLight, fontSize: 13 }}>Aucune séance trouvée</div>
        )}
      </div>

      {/* Footer : adresse (si sélection) + actions */}
      <ModalFooter align="between">
        <Button variant="ghost" size="md" onClick={onCreateCustom}>{createLabel ?? "＋ Créer"}</Button>
        {selected ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, marginLeft: 10, justifyContent: "flex-end" }}>
            <TextInput
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Lieu (optionnel)…"
              style={{ flex: 1, maxWidth: 220, fontSize: 12, padding: "8px 10px" }}
            />
            <Button variant="primary" size="md" onClick={() => onSelect({ ...selected, ...(address.trim() ? { address: address.trim() } : {}) })}>
              Ajouter
            </Button>
          </div>
        ) : <span style={{ fontSize: 11, color: T.textLight }}>Sélectionne une séance</span>}
      </ModalFooter>
    </Modal>
  );
}

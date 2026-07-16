import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor, getSessionCharge, normalizeCharge10 } from "../lib/charge.js";
import { Modal, ModalHeader, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Field, TextInput, Textarea } from "./ui/Field.jsx";
import { Button } from "./ui/Button.jsx";

// ─── COACH PICKER MODAL ───────────────────────────────────────────────────────

export function CoachPickerModal({ sessions, blocks, onSelect, onClose }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const [tab,        setTab]        = useState("sessions");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [selected,   setSelected]   = useState(null);
  const [startTime,  setStartTime]  = useState("09:00");
  const [coachNote,  setCoachNote]  = useState("");
  const [address,    setAddress]    = useState("");
  const [sort,       setSort]       = useState("date");

  const isSessionTab = tab === "sessions";

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => (b.charge ?? 0) - (a.charge ?? 0));
    return arr;
  };

  const filteredSessions = applySort(sessions.filter(s =>
    (typeFilter === "Tous" || s.type === typeFilter) && s.name.toLowerCase().includes(search.toLowerCase())
  ));
  const filteredBlocks = applySort(blocks.filter(b =>
    (typeFilter === "Tous" || b.blockType === typeFilter) && b.name.toLowerCase().includes(search.toLowerCase())
  ));

  const sessionTypes  = [...new Set(sessions.map(s => s.type).filter(Boolean))];
  const filterOptions = isSessionTab ? ["Tous", ...sessionTypes] : ["Tous", ...Object.keys(BLOCK_TYPES)];

  const getEndTime = (start, duration) => {
    if (!start || !duration) return null;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + Number(duration);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const handleAdd = () => {
    if (!selected) return;
    const duration = selected.type === "session" ? selected.item.estimatedTime : selected.item.duration;
    onSelect({
      ...selected.item,
      startTime,
      endTime: getEndTime(startTime, duration) ?? undefined,
      isBlock: selected.type === "block",
      ...(coachNote.trim() ? { coachNote: coachNote.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
    });
  };

  const chip = (active, onClick, children) => (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accent + "22" : "transparent",
        color: active ? T.accent : T.textMid, fontWeight: active ? 600 : 500,
      }}
    >{children}</button>
  );

  const ItemRow = ({ item, type }) => {
    const isSel = selected?.item.id === item.id && selected?.type === type;
    const cfg   = type === "block" ? (BLOCK_TYPES[item.blockType] || {}) : null;
    const color = type === "block" ? (cfg?.color || "#a89a82") : getChargeColor(getSessionCharge(item));
    const dur   = type === "session" ? item.estimatedTime : item.duration;
    return (
      <button
        onClick={() => setSelected({ type, item })}
        style={{
          width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
          padding: "10px 12px", borderRadius: 10,
          background: isSel ? T.accent + "18" : T.surface,
          border: `1px solid ${isSel ? T.accent : T.border}`,
          display: "flex", alignItems: "center", gap: 10,
          transition: "background 0.12s, border-color 0.12s",
        }}
      >
        {cfg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.name}
          </div>
          <div style={{ fontSize: 10, color: T.textLight, display: "flex", gap: 8, marginTop: 2 }}>
            {type === "session" && item.type && <span>{item.type}</span>}
            {type === "block"   && <span style={{ color }}>{item.blockType}</span>}
            {dur && <span>⏱ {dur} min</span>}
            {type === "session" && <span style={{ color: getChargeColor(getSessionCharge(item)) }}>⚡{getSessionCharge(item)}</span>}
            {type === "block" && cfg?.hasCharge && item.charge > 0 && <span style={{ color: getChargeColor(normalizeCharge10(item.charge)) }}>⚡{normalizeCharge10(item.charge)}</span>}
          </div>
        </div>
        {isSel && <span style={{ color: T.accent, fontSize: 16, flexShrink: 0 }}>✓</span>}
      </button>
    );
  };

  const selDuration = selected ? (selected.type === "session" ? selected.item.estimatedTime : selected.item.duration) : null;
  const endTime = selected ? getEndTime(startTime, selDuration) : null;

  return (
    <Modal onClose={onClose} maxWidth={440} ariaLabel="Ajouter au calendrier">
      <ModalHeader title="Ajouter au calendrier" onClose={onClose} />

      {/* Onglets séances / blocs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
        {[{ key: "sessions", label: "Séances" }, { key: "blocks", label: "Blocs" }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSearch(""); setTypeFilter("Tous"); setSelected(null); }}
            style={{
              flex: 1, padding: "11px 0", border: "none", background: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? T.accent : T.textMid,
              borderBottom: `2px solid ${tab === key ? T.accent : "transparent"}`, marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Recherche + filtres */}
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <TextInput placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filterOptions.map(f => chip(typeFilter === f, () => setTypeFilter(f), f))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.textLight }}>Trier</span>
            {chip(sort === "date", () => setSort("date"), "Date ↓")}
            {chip(sort === "charge", () => setSort("charge"), "Charge ↓")}
          </div>
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {isSessionTab
          ? (filteredSessions.length === 0
              ? <div style={{ padding: "30px", textAlign: "center", color: T.textLight, fontSize: 12 }}>Aucune séance</div>
              : filteredSessions.map(s => <ItemRow key={s.id} item={s} type="session" />))
          : (filteredBlocks.length === 0
              ? <div style={{ padding: "30px", textAlign: "center", color: T.textLight, fontSize: 12 }}>Aucun bloc</div>
              : filteredBlocks.map(b => <ItemRow key={b.id} item={b} type="block" />))
        }
      </div>

      {/* Footer : détails de planification */}
      {selected ? (
        <div style={{ padding: "12px 18px", background: T.paperDim, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <Field label="Heure de départ" style={{ flex: "0 0 auto" }}>
              <TextInput type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: 130 }} />
            </Field>
            {endTime && selDuration && (
              <div style={{ fontSize: 11, color: T.textLight, paddingBottom: 11 }}>
                → {endTime} · <span style={{ color: T.accent }}>{selDuration} min</span>
              </div>
            )}
          </div>
          <Field label="Adresse / lieu" hint="optionnel">
            <TextInput value={address} onChange={e => setAddress(e.target.value)} placeholder="Ex : Salle Arkose Nation…" />
          </Field>
          {selected.type === "session" && (
            <Field label="Mot de l'entraîneur" hint="optionnel">
              <Textarea value={coachNote} onChange={e => setCoachNote(e.target.value)} placeholder="Message pour les athlètes…" rows={2} />
            </Field>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" size="md" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="md" onClick={handleAdd}>Ajouter</Button>
          </div>
        </div>
      ) : (
        <ModalFooter align="between">
          <span style={{ fontSize: 12, color: T.textLight }}>Sélectionne une séance ou un bloc…</span>
          <Button variant="secondary" size="md" onClick={onClose}>Annuler</Button>
        </ModalFooter>
      )}
    </Modal>
  );
}

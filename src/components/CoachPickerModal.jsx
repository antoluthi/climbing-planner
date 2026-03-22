import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BLOCK_TYPES } from "../lib/constants.js";
import { getChargeColor } from "../lib/charge.js";

// ─── COACH PICKER MODAL ───────────────────────────────────────────────────────

export function CoachPickerModal({ sessions, blocks, onSelect, onClose }) {
  const { isDark } = useThemeCtx();
  const [tab,        setTab]        = useState("sessions");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [selected,   setSelected]   = useState(null); // { type, item }
  const [startTime,  setStartTime]  = useState("09:00");
  const [coachNote,  setCoachNote]  = useState("");
  const [address,    setAddress]    = useState("");
  const [sort,       setSort]       = useState("date"); // "date" | "charge"

  const surface = isDark ? "#1c2820" : "#ffffff";
  const bg2     = isDark ? "#141a16" : "#f3f7f4";
  const border  = isDark ? "#263228" : "#daeade";
  const text    = isDark ? "#d8e8d0" : "#1a2e1f";
  const muted   = isDark ? "#6a8870" : "#6b8c72";
  const accent  = isDark ? "#c8906a" : "#8b4c20";

  const isSessionTab = tab === "sessions";

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => (b.charge ?? 0) - (a.charge ?? 0));
    return arr;
  };

  const filteredSessions = applySort(sessions.filter(s =>
    (typeFilter === "Tous" || s.type === typeFilter) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  ));
  const filteredBlocks = applySort(blocks.filter(b =>
    (typeFilter === "Tous" || b.blockType === typeFilter) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  ));

  const sessionTypes  = [...new Set(sessions.map(s => s.type).filter(Boolean))];
  const filterOptions = isSessionTab
    ? ["Tous", ...sessionTypes]
    : ["Tous", ...Object.keys(BLOCK_TYPES)];

  const getEndTime = (start, duration) => {
    if (!start || !duration) return null;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + Number(duration);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const handleAdd = () => {
    if (!selected) return;
    const duration = selected.type === "session"
      ? selected.item.estimatedTime
      : selected.item.duration;
    onSelect({
      ...selected.item,
      startTime,
      endTime: getEndTime(startTime, duration) ?? undefined,
      isBlock: selected.type === "block",
      ...(coachNote.trim() ? { coachNote: coachNote.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
    });
  };

  const inputBase = { background: bg2, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 11px", color: text, fontSize: 12, fontFamily: "inherit", outline: "none" };

  const ItemRow = ({ item, type }) => {
    const isSel = selected?.item.id === item.id && selected?.type === type;
    const cfg   = type === "block" ? (BLOCK_TYPES[item.blockType] || {}) : null;
    const color = type === "block" ? (cfg?.color || "#888") : getChargeColor(item.charge);
    const dur   = type === "session" ? item.estimatedTime : item.duration;
    return (
      <div
        onClick={() => setSelected({ type, item })}
        style={{
          padding: "10px 14px", cursor: "pointer",
          background: isSel ? (isDark ? "#1b3026" : "#e2f5e8") : "transparent",
          borderLeft: `3px solid ${isSel ? accent : "transparent"}`,
          borderBottom: `1px solid ${border}`,
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        {cfg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0, display: "inline-block" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 400, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.name}
          </div>
          <div style={{ fontSize: 10, color: muted, display: "flex", gap: 8, marginTop: 2 }}>
            {type === "session" && item.type && <span>{item.type}</span>}
            {type === "block"   && <span style={{ color }}>{item.blockType}</span>}
            {dur && <span>⏱ {dur} min</span>}
            {type === "session" && <span style={{ color: getChargeColor(item.charge) }}>⚡{item.charge}</span>}
            {type === "block" && cfg?.hasCharge && item.charge > 0 && <span style={{ color: getChargeColor(item.charge) }}>⚡{item.charge}</span>}
          </div>
        </div>
        {type === "session" && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: color + "28", color, border: `1px solid ${color}55`, flexShrink: 0 }}>
            ⚡{item.charge}
          </span>
        )}
        {isSel && <span style={{ color: accent, fontSize: 16, flexShrink: 0 }}>✓</span>}
      </div>
    );
  };

  const selDuration = selected
    ? (selected.type === "session" ? selected.item.estimatedTime : selected.item.duration)
    : null;
  const endTime = selected ? getEndTime(startTime, selDuration) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: surface, borderRadius: 12, width: "100%", maxWidth: 420, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px #0009", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>Ajouter au calendrier</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${border}` }}>
          {[{ key: "sessions", label: "Séances" }, { key: "blocks", label: "Blocs" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSearch(""); setTypeFilter("Tous"); setSelected(null); }}
              style={{
                flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: tab === key ? 700 : 400,
                color: tab === key ? accent : muted,
                borderBottom: `2px solid ${tab === key ? accent : "transparent"}`,
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        {/* Search + filter */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: 7 }}>
          <input
            style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {filterOptions.map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  style={{
                    padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                    fontFamily: "inherit",
                    border: `1px solid ${typeFilter === f ? accent + "88" : border}`,
                    background: typeFilter === f ? (isDark ? "#263228" : "#d4e8db") : "none",
                    color: typeFilter === f ? accent : muted,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: muted }}>Trier :</span>
              {[["date", "Date ↓"], ["charge", "Charge ↓"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit",
                    border: `1px solid ${sort === key ? accent + "88" : border}`,
                    background: sort === key ? (isDark ? "#263228" : "#d4e8db") : "none",
                    color: sort === key ? accent : muted,
                  }}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isSessionTab
            ? (filteredSessions.length === 0
                ? <div style={{ padding: "30px", textAlign: "center", color: muted, fontSize: 12 }}>Aucune séance</div>
                : filteredSessions.map(s => <ItemRow key={s.id} item={s} type="session" />))
            : (filteredBlocks.length === 0
                ? <div style={{ padding: "30px", textAlign: "center", color: muted, fontSize: 12 }}>Aucun bloc</div>
                : filteredBlocks.map(b => <ItemRow key={b.id} item={b} type="block" />))
          }
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: 10 }}>
          {selected ? (
            <>
              {/* Heure + durée */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Heure de départ</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    style={{ ...inputBase, padding: "5px 9px", fontSize: 13 }}
                  />
                </div>
                {endTime && selDuration && (
                  <div style={{ fontSize: 10, color: muted, marginTop: 13 }}>
                    → {endTime}<br />
                    <span style={{ color: accent }}>{selDuration} min</span>
                  </div>
                )}
              </div>
              {/* Adresse / lieu */}
              <div>
                <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Adresse / lieu (optionnel)</div>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Ex : Salle Arkose Nation, 75012 Paris…"
                  style={{ ...inputBase, width: "100%", boxSizing: "border-box" }}
                />
              </div>
              {/* Mot de l'entraîneur (séances seulement) */}
              {selected.type === "session" && (
                <div>
                  <div style={{ fontSize: 10, color: muted, marginBottom: 3 }}>Mot de l'entraîneur (optionnel)</div>
                  <textarea
                    value={coachNote}
                    onChange={e => setCoachNote(e.target.value)}
                    placeholder="Message pour les athlètes…"
                    rows={2}
                    style={{ ...inputBase, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 7, color: muted, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
                <button
                  onClick={handleAdd}
                  style={{ background: accent, border: "none", borderRadius: 7, color: "#fff", padding: "9px 20px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, boxShadow: `0 2px 8px ${accent}44` }}
                >Ajouter</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: muted, fontSize: 12 }}>Sélectionnez une séance ou un bloc…</div>
              <button onClick={onClose} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 7, color: muted, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

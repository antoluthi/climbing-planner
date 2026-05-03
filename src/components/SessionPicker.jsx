import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";

// ─── MODAL: Ajouter une séance ────────────────────────────────────────────────

export function SessionPicker({ onSelect, onClose, customSessions, onCreateCustom, sessions, createLabel }) {
  const { styles, isDark } = useThemeCtx();
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [address, setAddress] = useState("");
  const [sort, setSort] = useState("date"); // "date" | "charge"
  const catalogSessions = sessions || [];

  const applySort = (arr) => {
    if (sort === "date")   return [...arr].sort((a, b) => b.id - a.id);
    if (sort === "charge") return [...arr].sort((a, b) => b.charge - a.charge);
    return arr;
  };

  const filtered = applySort(catalogSessions.filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }));

  const filteredCustom = applySort((customSessions || []).filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  }));

  const sortBtn = (key, label) => ({
    style: {
      padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "inherit",
      border: `1px solid ${sort === key ? (isDark ? "#c8906a88" : "#8b4c2088") : (isDark ? "#263228" : "#daeade")}`,
      background: sort === key ? (isDark ? "#263228" : "#d4e8db") : "none",
      color: sort === key ? (isDark ? "#c8906a" : "#8b4c20") : (isDark ? "#6a8870" : "#6b8c72"),
    },
    onClick: () => setSort(key),
    children: label,
  });

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Choisir une séance</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalFilters}>
          <input
            style={styles.searchInput}
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <div style={styles.filterTabs}>
              {["Tous", "Grimpe", "Exercice"].map(f => (
                <button
                  key={f}
                  style={{ ...styles.filterTab, ...(filter === f ? styles.filterTabActive : {}) }}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: isDark ? "#6a8870" : "#6b8c72" }}>Trier :</span>
              <button {...sortBtn("date",   "Date ↓")} />
              <button {...sortBtn("charge", "Charge ↓")} />
            </div>
          </div>
        </div>
        <div style={styles.sessionList}>
          {/* Mes séances */}
          {filteredCustom.length > 0 && (
            <>
              <div style={{ ...styles.customPickerLabel, padding: "6px 14px 2px", fontSize: 9 }}>MES SÉANCES</div>
              {filteredCustom.map(s => (
                <div key={s.id} style={{ ...styles.sessionItem, borderLeft: `2px solid ${getChargeColor(s.charge)}`, background: selected?.id === s.id ? (isDark ? "#1b3026" : "#e2f5e8") : undefined }} onClick={() => setSelected(s)}>
                  <div style={styles.sessionItemLeft}>
                    <span style={{ ...styles.sessionTypeBadge, background: s.type === "Grimpe" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>{s.type}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={styles.sessionItemName}>{s.name}</span>
                      {(s.estimatedTime || s.location) && (
                        <span style={{ fontSize: 10, color: styles.dashText }}>
                          {s.estimatedTime ? `${s.estimatedTime}min` : ""}{s.location ? `  ${s.location}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>{s.charge}</span>
                </div>
              ))}
            </>
          )}
          {/* Séances communautaires (créées par d'autres utilisateurs) */}
          {filtered.length > 0 && (
            <>
              <div style={{ ...styles.customPickerLabel, padding: "6px 14px 2px", fontSize: 9 }}>COMMUNAUTÉ</div>
              {filtered.map(s => (
                <div key={s.id} style={{ ...styles.sessionItem, background: selected?.id === s.id ? (isDark ? "#1b3026" : "#e2f5e8") : undefined }} onClick={() => setSelected(s)}>
                  <div style={styles.sessionItemLeft}>
                    <span style={{ ...styles.sessionTypeBadge, background: s.type === "Grimpe" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
                      {s.type}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={styles.sessionItemName}>{s.name}</span>
                      {s.creatorName && (
                        <span style={{ fontSize: 9, color: isDark ? "#6a8870" : "#7a9a80", fontStyle: "italic" }}>
                          par {s.creatorName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>
                    {s.charge}
                  </span>
                </div>
              ))}
            </>
          )}
          {filtered.length === 0 && filteredCustom.length === 0 && (
            <div style={styles.emptySearch}>Aucune séance trouvée</div>
          )}
        </div>
        {/* Footer: address + confirm */}
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${styles.dashGrid}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {selected ? (
            <>
              <div>
                <div style={{ fontSize: 10, color: isDark ? "#6a8870" : "#6b8c72", marginBottom: 3 }}>Adresse / lieu (optionnel)</div>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Ex : Salle Arkose Nation, 75012 Paris…"
                  style={{ width: "100%", boxSizing: "border-box", background: isDark ? "#141a16" : "#f3f7f4", border: `1px solid ${isDark ? "#263228" : "#daeade"}`, borderRadius: 6, padding: "7px 11px", color: isDark ? "#d8e8d0" : "#1a2e1f", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                <button style={styles.createCustomBtn} onClick={onCreateCustom}>
                  {createLabel ?? "＋ Créer une séance"}
                </button>
                <button
                  onClick={() => onSelect({ ...selected, ...(address.trim() ? { address: address.trim() } : {}) })}
                  style={{ background: isDark ? "#c8906a" : "#8b4c20", border: "none", borderRadius: 7, color: "#fff", padding: "9px 20px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}
                >Ajouter</button>
              </div>
            </>
          ) : (
            <button style={styles.createCustomBtn} onClick={onCreateCustom}>
              {createLabel ?? "＋ Créer une séance / exercice personnalisé"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

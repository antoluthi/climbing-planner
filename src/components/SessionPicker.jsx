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
  const catalogSessions = sessions || [];

  const filtered = catalogSessions.filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const filteredCustom = (customSessions || []).filter(s => {
    const matchType = filter === "Tous" || s.type === filter;
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
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
        </div>
        <div style={styles.sessionList}>
          {/* Custom sessions section */}
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
          {/* Predefined sessions */}
          {filtered.map(s => (
            <div key={s.id} style={{ ...styles.sessionItem, background: selected?.id === s.id ? (isDark ? "#1b3026" : "#e2f5e8") : undefined }} onClick={() => setSelected(s)}>
              <div style={styles.sessionItemLeft}>
                <span style={{ ...styles.sessionTypeBadge, background: s.type === "Grimpe" ? styles.seanceBadgeBg : styles.exerciceBadgeBg }}>
                  {s.type}
                </span>
                <span style={styles.sessionItemName}>{s.name}</span>
              </div>
              <span style={{ ...styles.chargePill, background: getChargeColor(s.charge) + "33", color: getChargeColor(s.charge), border: `1px solid ${getChargeColor(s.charge)}55` }}>
                {s.charge}
              </span>
            </div>
          ))}
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

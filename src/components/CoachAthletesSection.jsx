import { useState } from "react";

// ─── COACH ATHLETES SECTION (inside ProfileView) ─────────────────────────────

export function CoachAthletesSection({ athletes, onSearch, onInvite, sentInvites, onRemove, viewingAthlete, onToggle, isDark, styles, accent, mutedColor, textColor, btnBorder }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState(null);   // null = pas encore cherché
  const [loading, setLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null); // feedback après envoi

  const bg      = isDark ? "#241b13" : "#f3f7f4";
  const surface = isDark ? "#241b13" : "#ffffff";
  const border  = isDark ? "#3a2e22" : "#daeade";

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await onSearch(query);
    setResults(res);
    setLoading(false);
  };

  const alreadyAdded = (userId) => athletes.some(a => a.userId === userId);
  // Invitation déjà envoyée et pas encore traitée par l'athlète.
  const invitePending = (userId) => (sentInvites || []).some(i => i.user_id === userId && i.status === "unread");
  const inviteDeclined = (userId) => (sentInvites || []).some(i => i.user_id === userId && i.status === "declined")
    && !invitePending(userId) && !alreadyAdded(userId);

  const handleInvite = async (userId) => {
    const res = await onInvite?.(userId);
    if (res?.error === "already_pending") setInviteMsg({ type: "info", text: "Invitation déjà envoyée — en attente de réponse." });
    else if (res?.error) setInviteMsg({ type: "error", text: "Envoi impossible. Vérifie la connexion (ou que la migration notifications est appliquée)." });
    else setInviteMsg({ type: "ok", text: "Invitation envoyée ! L'athlète doit l'accepter depuis sa cloche de notifications." });
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Mes athlètes</div>

      {/* Liste des athlètes actuels */}
      {athletes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {athletes.map(a => {
            const isViewing = viewingAthlete?.userId === a.userId;
            return (
              <div key={a.relationId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: isViewing ? (isDark ? "#3a2616" : "#e4f5ea") : surface, border: `1px solid ${isViewing ? accent + "88" : border}`, borderRadius: 7, transition: "all 0.15s" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isViewing ? accent : textColor }}>
                    {a.firstName} {a.lastName}
                  </div>
                </div>
                <button
                  onClick={() => onToggle(isViewing ? null : a)}
                  style={{ background: isViewing ? accent : "none", border: `1px solid ${isViewing ? accent : border}`, borderRadius: 5, color: isViewing ? "#fff" : mutedColor, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  {isViewing ? "✓ En vue" : "Voir"}
                </button>
                <button
                  onClick={() => onRemove(a.relationId)}
                  title="Retirer cet athlète"
                  style={{ background: "none", border: `1px solid ${border}`, borderRadius: 5, color: isDark ? "#f08070" : "#f08070", padding: "4px 8px", cursor: "pointer", fontSize: 12, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: mutedColor, fontStyle: "italic", marginBottom: 14 }}>
          Aucun athlète suivi pour l'instant.
        </div>
      )}

      {/* Recherche */}
      <div style={{ fontSize: 11, color: mutedColor, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>Inviter un athlète</div>
      <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5, marginBottom: 8 }}>
        L'athlète reçoit une notification 🔔 et doit accepter avant que tu puisses voir son planning.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "7px 11px", color: textColor, fontSize: 13, fontFamily: "inherit", outline: "none" }}
          placeholder="Rechercher par prénom ou nom…"
          value={query}
          onChange={e => { setQuery(e.target.value); setResults(null); }}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          style={{ background: accent, border: "none", borderRadius: 6, color: "#fff", padding: "7px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700, opacity: (!query.trim() || loading) ? 0.5 : 1 }}
        >
          {loading ? "…" : "Chercher"}
        </button>
      </div>

      {/* Résultats de recherche */}
      {results !== null && (
        <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 7, overflow: "hidden" }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 12px", fontSize: 12, color: mutedColor, fontStyle: "italic", textAlign: "center" }}>
              Aucun athlète trouvé pour "{query}"
            </div>
          ) : results.map((r, i) => (
            <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i > 0 ? `1px solid ${border}` : "none", background: surface }}>
              <div style={{ flex: 1, fontSize: 13, color: textColor, fontWeight: 500 }}>
                {r.firstName} {r.lastName}
              </div>
              {alreadyAdded(r.userId) ? (
                <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>Déjà suivi ✓</span>
              ) : invitePending(r.userId) ? (
                <span style={{ fontSize: 11, color: mutedColor, fontWeight: 600, fontStyle: "italic" }}>Invitation en attente…</span>
              ) : (
                <button
                  onClick={() => handleInvite(r.userId)}
                  style={{ background: isDark ? "#3a2e22" : "#d4e8db", border: `1px solid ${accent}66`, borderRadius: 5, color: accent, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}
                >
                  {inviteDeclined(r.userId) ? "Réinviter" : "Inviter"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {inviteMsg && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 7, fontSize: 12, lineHeight: 1.5,
          background: inviteMsg.type === "error" ? (isDark ? "#2a1612" : "#fbecec") : (isDark ? "#1a2a1d" : "#e3f0e5"),
          color: inviteMsg.type === "error" ? "#f08070" : (isDark ? "#82c894" : "#2e6b3f"),
        }}>
          {inviteMsg.text}
        </div>
      )}
    </div>
  );
}

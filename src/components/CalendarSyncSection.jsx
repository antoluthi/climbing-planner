import { useState } from "react";

// ─── CALENDAR SYNC SECTION ─────────────────────────────────────────────────────

export function CalendarSyncSection({ profile, onUpdateProfile, isDark, accent, mutedColor, textColor, surfaceBg, borderColor, btnBorder, styles }) {
  const [copiedCaldav, setCopiedCaldav] = useState(false);

  const token = profile.calendarToken || null;
  const caldavUrl = token ? `${window.location.origin}/api/caldav/${token}/` : null;

  const generateToken = () => {
    const newToken = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    onUpdateProfile({ ...profile, calendarToken: newToken });
  };

  const handleCopy = (url, setCopied) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRevoke = () => {
    if (!window.confirm("Révoquer le lien ? L'ancien lien ne fonctionnera plus.")) return;
    const { calendarToken: _removed, ...rest } = profile;
    onUpdateProfile({ ...rest, calendarToken: null });
  };

  const inputStyle = { flex: 1, minWidth: 160, background: isDark ? "#15100b" : "#ddd7cc", border: `1px solid ${borderColor}`, borderRadius: 5, color: mutedColor, padding: "7px 10px", fontSize: 11, fontFamily: "monospace", outline: "none" };
  const copyBtnStyle = (copied) => ({ background: copied ? accent : "none", border: `1px solid ${copied ? accent : btnBorder}`, color: copied ? "#0a1a0f" : accent, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: copied ? 600 : 400, transition: "all 0.2s", whiteSpace: "nowrap" });

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Synchronisation calendrier (CalDAV)</div>
      <div style={{ fontSize: 12, color: mutedColor, marginBottom: 10, lineHeight: 1.5 }}>
        Connectez votre planning comme un compte CalDAV natif dans Apple Calendar, Thunderbird ou DAVx⁵ (Android).
        La synchronisation est en lecture seule.
      </div>

      {!token ? (
        <button
          onClick={generateToken}
          style={{ background: accent, border: "none", color: "#0a1a0f", padding: "8px 18px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}
        >
          Générer les liens de synchronisation
        </button>
      ) : (
        <>
          {/* CalDAV URL */}
          <div style={{ fontSize: 11, color: textColor, marginBottom: 4, fontWeight: 600 }}>URL CalDAV</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <input readOnly value={caldavUrl} style={inputStyle} onFocus={e => e.target.select()} />
            <button onClick={() => handleCopy(caldavUrl, setCopiedCaldav)} style={copyBtnStyle(copiedCaldav)}>
              {copiedCaldav ? "✓ Copié !" : "Copier"}
            </button>
          </div>

          {/* Instructions CalDAV */}
          <div style={{ fontSize: 10, color: mutedColor, marginBottom: 12, lineHeight: 1.6, background: isDark ? "#1a1410" : "#e8e2d8", borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ marginBottom: 3 }}><span style={{ color: textColor }}>Apple Calendar / iOS</span> — Réglages → Calendrier → Comptes → Ajouter → Autre → Compte CalDAV → coller l&apos;URL</div>
            <div style={{ marginBottom: 3 }}><span style={{ color: textColor }}>Thunderbird</span> — Nouveau Calendrier → Sur le réseau → Format : CalDAV → coller l&apos;URL</div>
            <div><span style={{ color: textColor }}>DAVx⁵ (Android)</span> — Ajouter compte → Connexion manuelle → URL CalDAV → coller l&apos;URL</div>
          </div>

          <button
            onClick={handleRevoke}
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: "inherit", opacity: 0.7 }}
          >
            Révoquer les liens
          </button>
        </>
      )}
    </div>
  );
}

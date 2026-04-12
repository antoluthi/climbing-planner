import { useState, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { AuthPanel } from "./AuthPanel.jsx";
import { CoachAthletesSection } from "./CoachAthletesSection.jsx";
import { PhotoCropModal } from "./PhotoCropModal.jsx";
import { CalendarSyncSection } from "./CalendarSyncSection.jsx";
import supabase from "../lib/supabase.js";

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────

export function ProfileView({ data, onUpdateProfile, session, onAuthChange, syncStatus, onUpload, onPull, onImport, toggleTheme, isDark,
  athletes, onSearchAthletes, onAddAthlete, onRemoveAthlete, viewingAthlete, onToggleViewAthlete }) {
  const { styles } = useThemeCtx();
  const profile = data.profile || {};

  const [showCrop, setShowCrop] = useState(false);
  const [editName, setEditName] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const importRef = useRef(null);

  // Photo stored in data.profile.avatarDataUrl — syncs via Supabase automatically
  const photoUrl = profile.avatarDataUrl || "";

  const handleSavePhoto = (dataUrl) => {
    onUpdateProfile({ ...profile, avatarDataUrl: dataUrl });
    setShowCrop(false);
  };

  const handleSaveName = () => {
    onUpdateProfile({ ...profile, firstName, lastName });
    setEditName(false);
  };

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planif-escalade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.weeks !== undefined && parsed.weekMeta !== undefined) onImport(parsed);
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const accent = isDark ? "#c8906a" : "#8b4c20";
  const mutedColor = isDark ? "#707870" : "#8a7f70";
  const textColor = isDark ? "#e8e4de" : "#2a2218";
  const surfaceBg = isDark ? "#1f2421" : "#e8e2d8";
  const borderColor = isDark ? "#252b27" : "#ccc6b8";
  const inputBg = isDark ? "#252b27" : "#ddd7cc";
  const btnBorder = isDark ? "#2e3430" : "#bfb9aa";

  const syncIcon = syncStatus === "saving" ? "⟳" : syncStatus === "saved" ? "✓" : syncStatus === "offline" ? "⚡" : null;
  const syncColor = syncStatus === "saved" ? accent : syncStatus === "offline" ? "#f97316" : mutedColor;

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;

  return (
    <div style={styles.profileView}>
      {/* ── Photo + identité ── */}
      <div style={{ ...styles.profileSection }}>
        <div style={styles.profileSectionTitle}>Profil</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...styles.profileAvatar, borderColor: accent + "55" }} onClick={() => setShowCrop(true)}>
              {photoUrl
                ? <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ fontSize: 28, color: mutedColor }}>?</span>
              }
            </div>
            <span style={styles.profileAvatarHint} onClick={() => setShowCrop(true)}>
              {photoUrl ? "Modifier" : "Ajouter une photo"}
            </span>
          </div>

          {/* Nom */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {editName ? (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                    value={firstName} onChange={e => setFirstName(e.target.value)}
                    placeholder="Prénom" autoFocus
                    onKeyDown={e => e.key === "Enter" && handleSaveName()}
                  />
                  <input
                    style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                    value={lastName} onChange={e => setLastName(e.target.value)}
                    placeholder="Nom de famille"
                    onKeyDown={e => e.key === "Enter" && handleSaveName()}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.profileSaveBtn} onClick={handleSaveName}>Enregistrer</button>
                  <button style={styles.profileCancelBtn} onClick={() => { setFirstName(profile.firstName || ""); setLastName(profile.lastName || ""); setEditName(false); }}>Annuler</button>
                </div>
              </>
            ) : (
              <div
                style={{ cursor: "pointer", padding: "10px 0" }}
                onClick={() => setEditName(true)}
              >
                <div style={{ fontSize: displayName ? 20 : 13, fontWeight: 600, color: displayName ? textColor : mutedColor, letterSpacing: displayName ? "0.02em" : "0.04em" }}>
                  {displayName || "Ajouter un nom"}
                </div>
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>{session?.user?.email || "Non connecté"}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Rôle (lecture seule) ── */}
      {"role" in profile && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Rôle</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: isDark ? "#263228" : "#d4e8db", border: `1px solid ${accent}88`, color: accent, padding: "7px 16px", borderRadius: 5, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>
              {profile.role === "coach" ? "Coach" : profile.role === "athlete" ? "Athlète suivi" : profile.role === "auto" ? "Athlète autonome ✦" : "Athlète solo"}
            </span>
            <span style={{ fontSize: 11, color: mutedColor, fontStyle: "italic" }}>
              {profile.role === "athlete" && "Vos cycles sont en lecture seule. Votre coach les modifie pour vous."}
              {profile.role === "coach"  && "Vous pouvez créer et modifier les cycles de vos athlètes."}
              {profile.role === "auto"   && "Mode autonome — accès complet coach + athlète."}
              {(profile.role == null)    && "Vous gérez votre planning en autonomie."}
            </span>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: mutedColor, opacity: 0.7 }}>
              Pour modifier votre rôle, contactez votre administrateur.
            </span>
            {session && supabase && (
              <button
                onClick={async () => {
                  const { data: row } = await supabase
                    .from("climbing_plans")
                    .select("status")
                    .eq("user_id", session.user.id)
                    .maybeSingle();
                  if (row && "status" in row) {
                    onUpdateProfile({ ...profile, role: row.status });
                  }
                }}
                style={{ background: "none", border: `1px solid ${btnBorder}`, borderRadius: 5, color: mutedColor, padding: "3px 10px", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}
              >
                ↺ Re-sync depuis la DB
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mes athlètes (coach / auto uniquement) ── */}
      {(profile.role === "coach" || profile.role === "auto") && onSearchAthletes && (
        <CoachAthletesSection
          athletes={athletes || []}
          onSearch={onSearchAthletes}
          onAdd={onAddAthlete}
          onRemove={onRemoveAthlete}
          viewingAthlete={viewingAthlete}
          onToggle={onToggleViewAthlete}
          isDark={isDark}
          styles={styles}
          accent={accent}
          mutedColor={mutedColor}
          textColor={textColor}
          btnBorder={btnBorder}
        />
      )}

      {/* ── Connexion ── */}
      {supabase && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Connexion</div>
          <AuthPanel session={session} onAuthChange={onAuthChange} fullWidth />
        </div>
      )}

      {/* ── Apparence ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Apparence</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: textColor }}>Thème</span>
          <button
            onClick={toggleTheme}
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "6px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.06em" }}
          >
            {isDark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
        {/* Timeline range */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: textColor }}>Plage horaire</span>
          <select
            value={profile.timelineRange?.start ?? 6}
            onChange={e => onUpdateProfile({ ...profile, timelineRange: { ...(profile.timelineRange || {}), start: Number(e.target.value), end: profile.timelineRange?.end ?? 22 } })}
            style={{ background: inputBg, border: `1px solid ${btnBorder}`, color: textColor, padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}
          >
            {Array.from({ length: 13 }, (_, i) => (
              <option key={i} value={i}>{`${i.toString().padStart(2, "0")}h`}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: mutedColor }}>—</span>
          <select
            value={profile.timelineRange?.end ?? 22}
            onChange={e => onUpdateProfile({ ...profile, timelineRange: { ...(profile.timelineRange || {}), start: profile.timelineRange?.start ?? 6, end: Number(e.target.value) } })}
            style={{ background: inputBg, border: `1px solid ${btnBorder}`, color: textColor, padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}
          >
            {Array.from({ length: 13 }, (_, i) => {
              const v = i + 12;
              return <option key={v} value={v}>{`${v.toString().padStart(2, "0")}h`}</option>;
            })}
          </select>
          <span style={{ fontSize: 10, color: mutedColor, fontStyle: "italic" }}>Vue semaine</span>
        </div>
      </div>


      {/* ── Données ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Données</div>
        {/* Cloud sync */}
        {session && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            {syncIcon && <span style={{ fontSize: 12, color: syncColor }}>{syncIcon}</span>}
            {onUpload && (
              <button
                style={{ background: "none", border: `1px solid ${btnBorder}`, color: accent, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={onUpload} title="Envoyer mes données vers le cloud (écraser)"
              >↑ Envoyer vers le cloud</button>
            )}
            {onPull && (
              <button
                style={{ background: "none", border: `1px solid ${btnBorder}`, color: isDark ? "#60a5fa" : "#2563eb", padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={onPull} title="Charger les données depuis le cloud (écraser local)"
              >↓ Charger depuis le cloud</button>
            )}
          </div>
        )}
        {/* Local import/export */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
            onClick={handleExport}
          >↓ Exporter JSON</button>
          <button
            style={{ background: "none", border: `1px solid ${btnBorder}`, color: mutedColor, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
            onClick={() => importRef.current?.click()}
          >↑ Importer JSON</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
      </div>

      {/* ── Abonnement calendrier ── */}
      {session && (
        <CalendarSyncSection
          profile={profile}
          onUpdateProfile={onUpdateProfile}
          isDark={isDark}
          accent={accent}
          mutedColor={mutedColor}
          textColor={textColor}
          surfaceBg={surfaceBg}
          borderColor={borderColor}
          btnBorder={btnBorder}
          styles={styles}
        />
      )}

      {showCrop && <PhotoCropModal onSave={handleSavePhoto} onClose={() => setShowCrop(false)} />}
    </div>
  );
}

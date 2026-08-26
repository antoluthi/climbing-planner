import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { AuthPanel } from "./AuthPanel.jsx";
import { CoachAthletesSection } from "./CoachAthletesSection.jsx";
import { RoleSection } from "./RoleSection.jsx";
import { PhotoCropModal } from "./PhotoCropModal.jsx";
import { CalendarSyncSection } from "./CalendarSyncSection.jsx";
import { DayNightToggle } from "./DayNightToggle.jsx";
import supabase from "../lib/supabase.js";
import { uploadAvatar, deleteAvatar } from "../lib/avatar-storage.js";
import { isNative } from "../lib/native.js";
import { readSyncMeta } from "../lib/sync-meta.js";
import { toast } from "../lib/toast.js";
import { colors, DATA } from "../theme/palette.js";
import { disciplineList } from "../lib/disciplines.js";
import { RowCard, Row, Segmented, Chip, RoundIconButton, SANS, MONO } from "./ui/Ascent.jsx";
import { PublicPlansSection } from "./PublicPlansSection.jsx";
import { NotificationsSection } from "./NotificationsSection.jsx";

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────

export function ProfileView({ data, onUpdateProfile, session, onAuthChange, syncStatus, onUpload, onPull, onImport, toggleTheme, isDark,
  athletes, onSearchAthletes, onInviteAthlete, sentInvites, onRemoveAthlete,
  myCoaches, onLeaveCoach, accountRole, onChangeRole, onBack,
  viewingAthlete, onToggleViewAthlete, onOpenPublicPlan }) {
  const { styles } = useThemeCtx();
  const profile = data.profile || {};

  const [showCrop, setShowCrop] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editName, setEditName] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const [isPublic, setIsPublic] = useState(null); // null = loading
  const [savingPublic, setSavingPublic] = useState(false);

  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    supabase
      .from("climbing_plans")
      .select("is_public")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data: row }) => setIsPublic(row?.is_public ?? false));
  }, [session?.user?.id]);

  const togglePublic = async () => {
    if (!supabase || !session?.user?.id || savingPublic) return;
    const next = !isPublic;
    setIsPublic(next);
    setSavingPublic(true);
    await supabase
      .from("climbing_plans")
      .update({ is_public: next })
      .eq("user_id", session.user.id);
    setSavingPublic(false);
  };
  const importRef = useRef(null);

  // Photo : nouveau modèle = profile.avatarUrl (URL Supabase Storage).
  // Legacy = profile.avatarDataUrl (base64 stocké dans le JSONB). On garde
  // un fallback pour la rétro-compat des comptes non encore migrés.
  const photoUrl = profile.avatarUrl || profile.avatarDataUrl || "";

  const handleSavePhoto = async (dataUrl) => {
    // Pas authentifié → fallback localStorage base64 (mode hors-ligne).
    if (!session?.user?.id) {
      onUpdateProfile({ ...profile, avatarDataUrl: dataUrl, avatarUrl: undefined });
      setShowCrop(false);
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await uploadAvatar(session.user.id, dataUrl);
      // On vide avatarDataUrl pour ne plus polluer le JSONB cloud.
      onUpdateProfile({ ...profile, avatarUrl: url, avatarDataUrl: undefined });
      toast.success("Photo de profil enregistrée");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[avatar] upload error:", e);
      // Fallback : on garde en local pour ne pas perdre la photo.
      onUpdateProfile({ ...profile, avatarDataUrl: dataUrl });
      toast.error("Upload échoué — photo sauvée en local. Vérifie le bucket Supabase « avatars ».");
    } finally {
      setUploadingPhoto(false);
      setShowCrop(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (session?.user?.id) {
      await deleteAvatar(session.user.id);
    }
    onUpdateProfile({ ...profile, avatarUrl: undefined, avatarDataUrl: undefined });
    toast.success("Photo retirée");
  };

  const handleSaveName = () => {
    if (firstName !== (profile.firstName || "") || lastName !== (profile.lastName || "")) {
      onUpdateProfile({ ...profile, firstName, lastName });
    }
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

  const accent = colors(isDark).accent;
  const mutedColor = colors(isDark).textMuted;
  const textColor = colors(isDark).text;
  const surfaceBg = colors(isDark).borderSubtle;
  const borderColor = colors(isDark).border;
  const inputBg = colors(isDark).borderSubtle;
  const btnBorder = colors(isDark).border;

  const syncIcon = syncStatus === "saving" ? "⟳" : syncStatus === "saved" ? "✓" : syncStatus === "offline" ? "⚡" : null;
  const syncColor = syncStatus === "saved" ? accent : syncStatus === "offline" ? colors(isDark).warn : mutedColor;

  // État réel de la synchronisation, lu au marqueur local. Relu à chaque
  // changement de `syncStatus`, c'est-à-dire à chaque échange avec la base.
  const syncLine = (() => {
    if (!session) return null;
    const meta = readSyncMeta();
    if (meta.dirtyAt) return { text: "Modifications en attente d'envoi", tone: colors(isDark).warn };
    if (!meta.syncedAt) return { text: "Pas encore synchronisé", tone: mutedColor };
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(meta.syncedAt)) / 60000));
    const when = mins < 1 ? "à l'instant"
      : mins < 60 ? `il y a ${mins} min`
      : new Date(meta.syncedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return { text: `Synchronisé ${when}`, tone: mutedColor };
  })();

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;

  const initials = ((profile.firstName?.[0] || "") + (profile.lastName?.[0] || "")).toUpperCase() || "—";

  return (
    <div style={styles.profileView}>
      {/* ── En-tête : retour + titre (prototype « Ascent ») ── */}
      {onBack && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <RoundIconButton isDark={isDark} size={36} label="Retour" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </RoundIconButton>
          <div style={{ fontSize: 18, fontWeight: 700, color: textColor, fontFamily: SANS }}>Compte</div>
        </div>
      )}

      {/* ── Photo + identité ── */}
      <div style={{ ...styles.profileSection }}>
        <div style={styles.profileSectionTitle}>Profil</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{ ...styles.profileAvatar, borderColor: accent + "55", position: "relative" }}
              onClick={() => !uploadingPhoto && setShowCrop(true)}
            >
              {photoUrl
                ? <img src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                : <span style={{ font: `700 22px ${MONO}`, color: accent }}>{initials}</span>
              }
              {uploadingPhoto && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.55)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "50%",
                  fontSize: 11, color: colors(isDark).onColor, fontWeight: 600,
                  letterSpacing: "0.05em",
                }}>
                  Upload…
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={styles.profileAvatarHint} onClick={() => !uploadingPhoto && setShowCrop(true)}>
                {photoUrl ? "Modifier" : "Ajouter une photo"}
              </span>
              {photoUrl && !uploadingPhoto && (
                <span
                  style={{ ...styles.profileAvatarHint, color: mutedColor }}
                  onClick={handleRemovePhoto}
                >Retirer</span>
              )}
            </div>
          </div>

          {/* Nom */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                  value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Prénom"
                  onBlur={handleSaveName}
                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                />
                <input
                  style={{ ...styles.profileNameInput, flex: 1, minWidth: 100 }}
                  value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Nom de famille"
                  onBlur={handleSaveName}
                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                />
              </div>
              <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>{session?.user?.email || "Non connecté"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Données personnelles (prototype « Ascent ») ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Données personnelles</div>
        <RowCard isDark={isDark}>
          <Row isDark={isDark} label="Taille">
            <ProfileNumberInput isDark={isDark} value={profile.height} suffix="cm"
              onCommit={v => onUpdateProfile({ ...profile, height: v })} />
          </Row>
          <Row isDark={isDark} label="Poids objectif">
            <ProfileNumberInput isDark={isDark} value={profile.weightGoal} suffix="kg" step={0.5}
              onCommit={v => onUpdateProfile({ ...profile, weightGoal: v })} />
          </Row>
          {/* Plus de sélecteur d'unités : l'app est métrique de bout en bout
              (kg, km, min), et rien ne lisait ce réglage. */}
          <Row isDark={isDark} label="Date de naissance" last>
            <input
              type="date"
              value={profile.birthdate || ""}
              onChange={e => onUpdateProfile({ ...profile, birthdate: e.target.value })}
              style={{
                background: "transparent", border: "none", color: colors(isDark).text,
                fontSize: 14, fontWeight: 600, fontFamily: SANS, textAlign: "right",
                colorScheme: isDark ? "dark" : "light", outline: "none",
              }}
            />
          </Row>
        </RowCard>
      </div>

      {/* ── Sports pratiqués ── */}
      <div style={styles.profileSection}>
        <div style={styles.profileSectionTitle}>Sports</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {disciplineList().map(d => {
            const selected = (profile.sports || []).includes(d.id);
            return (
              <Chip
                key={d.id}
                isDark={isDark}
                label={d.label}
                color={DATA.sports[d.id]}
                active={selected}
                onClick={() => {
                  const cur = profile.sports || [];
                  const next = selected ? cur.filter(x => x !== d.id) : [...cur, d.id];
                  onUpdateProfile({ ...profile, sports: next });
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Rôle ── modifiable, sauf en vue athlète (le profil affiché n'est
           pas le nôtre). */}
      {session && !viewingAthlete && onChangeRole && (
        <RoleSection
          isDark={isDark}
          styles={styles}
          accountRole={accountRole}
          athletes={athletes || []}
          onChangeRole={onChangeRole}
          onRemoveAthlete={onRemoveAthlete}
        />
      )}

      {/* ── Mes athlètes (coach uniquement — rôle du COMPTE) ── */}
      {accountRole === "coach" && onSearchAthletes && (
        <CoachAthletesSection
          athletes={athletes || []}
          onSearch={onSearchAthletes}
          onInvite={onInviteAthlete}
          sentInvites={sentInvites || []}
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

      {/* ── Mon coach (visible dès qu'un lien existe) ── */}
      {(myCoaches || []).length > 0 && !viewingAthlete && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Mon coach</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {myCoaches.map(c => (
              <div key={c.relationId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: colors(isDark).card, border: `1px solid ${colors(isDark).successBg}`, borderRadius: 7 }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: textColor }}>
                  {c.firstName} {c.lastName}
                </div>
                <span style={{ fontSize: 11, color: mutedColor }}>peut voir et modifier ton planning</span>
                <button
                  onClick={() => window.confirm(`Quitter ${c.firstName} ? Il n'aura plus accès à ton planning.`) && onLeaveCoach?.(c.relationId)}
                  title="Quitter ce coach"
                  style={{ background: "none", border: `1px solid ${colors(isDark).successBg}`, borderRadius: 5, color: colors(isDark).danger, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}
                >
                  Quitter
                </button>
              </div>
            ))}
          </div>
        </div>
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
          <DayNightToggle
            isDark={isDark}
            onToggle={toggleTheme}
            size={20}
            style={{ border: `1px solid ${btnBorder}`, borderRadius: 6 }}
          />
          <span style={{ fontSize: 11, color: mutedColor }}>{isDark ? "Mode clair" : "Mode sombre"}</span>
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


      <NotificationsSection
        isDark={isDark}
        styles={styles}
        enabled={profile.notifySessions}
        onChange={v => onUpdateProfile({ ...profile, notifySessions: v })}
      />

      {/* ── Confidentialité ── */}
      {session && (
        <div style={styles.profileSection}>
          <div style={styles.profileSectionTitle}>Confidentialité</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: textColor, fontWeight: 500 }}>Planning public</div>
              <div style={{ fontSize: 11, color: mutedColor, marginTop: 3, maxWidth: 240, lineHeight: 1.4 }}>
                Ton planning devient visible de tous — séances et cycles, en
                lecture seule — depuis l'écran de connexion comme depuis un
                autre compte.
              </div>
            </div>
            {/* Toggle slider */}
            <button
              onClick={togglePublic}
              disabled={isPublic === null || savingPublic}
              title={isPublic ? "Désactiver le partage" : "Activer le partage"}
              style={{
                flexShrink: 0,
                width: 44, height: 24, borderRadius: 12, border: "none",
                background: isPublic ? accent : (colors(isDark).border),
                position: "relative", cursor: isPublic === null ? "default" : "pointer",
                transition: "background 0.25s",
                opacity: isPublic === null ? 0.4 : 1,
                padding: 0,
              }}
            >
              <div style={{
                position: "absolute",
                top: 3, left: isPublic ? 23 : 3,
                width: 18, height: 18, borderRadius: "50%",
                background: colors(isDark).onColor,
                transition: "left 0.25s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              }} />
            </button>
          </div>
        </div>
      )}

      {onOpenPublicPlan && (
        <PublicPlansSection
          isDark={isDark}
          styles={styles}
          currentUserId={session?.user?.id}
          onOpen={onOpenPublicPlan}
        />
      )}

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
                style={{ background: "none", border: `1px solid ${btnBorder}`, color: colors(isDark).info, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                onClick={onPull} title="Charger les données depuis le cloud (écraser local)"
              >↓ Charger depuis le cloud</button>
            )}
          </div>
        )}
        {syncLine && (
          <div style={{ fontSize: 11, color: syncLine.tone, marginBottom: 12 }}>{syncLine.text}</div>
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

      {/* ── Version installée ──
          L'APK est distribué hors store : sans ça, impossible de savoir sur
          quelle build tourne quelqu'un qui remonte un bug. */}
      <div style={{ textAlign: "center", fontSize: 10, color: mutedColor, opacity: 0.7, marginTop: 24 }}>
        Version {__APP_VERSION__}{isNative ? " · Android" : ""}
      </div>

      {showCrop && <PhotoCropModal onSave={handleSavePhoto} onClose={() => setShowCrop(false)} />}
    </div>
  );
}

// Valeur numérique éditable alignée à droite (lignes « Données personnelles »).
// Champ non contrôlé, remonté par `key` quand la valeur change à l'extérieur :
// évite de synchroniser un état local depuis un effet.
function ProfileNumberInput({ isDark, value, suffix, step = 1, onCommit }) {
  const commit = (e) => {
    const v = parseFloat(e.currentTarget.value.replace(",", "."));
    onCommit(isNaN(v) ? undefined : v);
  };
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <input
        key={String(value)}
        type="number"
        step={step}
        defaultValue={value != null ? String(value) : ""}
        placeholder="—"
        onBlur={commit}
        onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
        style={{
          background: "transparent", border: "none", outline: "none",
          color: colors(isDark).text, fontSize: 14, fontWeight: 600,
          fontFamily: SANS, textAlign: "right", width: 62,
        }}
      />
      <span style={{ fontSize: 13, color: colors(isDark).textMuted, fontFamily: SANS }}>{suffix}</span>
    </span>
  );
}

import { useEffect, useState } from "react";
import { colors } from "../theme/palette.js";
import { notificationsPermission, requestNotificationsPermission } from "../lib/notifications.js";

// ─── RAPPELS DE SÉANCE ───────────────────────────────────────────────────────
// Une seule bascule. Android 13+ exige que la permission soit demandée à
// l'exécution : on la demande ici, au moment où l'utilisateur dit oui, et pas
// au premier lancement de l'app où elle n'aurait aucun sens.
export function NotificationsSection({ isDark, styles, enabled, onChange }) {
  const c = colors(isDark);
  const [perm, setPerm] = useState(null);   // null = en cours, "unsupported" = web
  const [busy, setBusy] = useState(false);

  useEffect(() => { notificationsPermission().then(setPerm); }, []);

  const web = perm === "unsupported";
  const denied = perm === "denied";
  const on = !!enabled && !web;

  const toggle = async () => {
    if (web || busy) return;
    if (on) { onChange(false); return; }
    setBusy(true);
    const granted = await requestNotificationsPermission();
    setPerm(granted);
    setBusy(false);
    if (granted === "granted") onChange(true);
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Notifications</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ maxWidth: 250 }}>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>Rappels de séance</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            Une heure avant le départ, puis — la séance passée — une invitation à
            noter ton ressenti. C’est la même notification qui change.
          </div>
          {web && (
            <div style={{ fontSize: 11, color: c.textDim, marginTop: 5, fontStyle: "italic" }}>
              Disponible dans l’application Android.
            </div>
          )}
          {denied && !web && (
            <div style={{ fontSize: 11, color: c.warn, marginTop: 5 }}>
              Refusé par le téléphone — à réactiver dans les réglages d’Android.
            </div>
          )}
        </div>

        <button
          onClick={toggle}
          disabled={web || busy}
          aria-pressed={on}
          aria-label="Rappels de séance"
          style={{
            flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: "none",
            background: on ? c.accent : c.border,
            position: "relative", cursor: web ? "default" : "pointer",
            transition: "background 0.25s", opacity: web ? 0.4 : 1, padding: 0,
          }}
        >
          <div style={{
            position: "absolute", top: 3, left: on ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: c.onColor, transition: "left 0.25s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }} />
        </button>
      </div>
    </div>
  );
}

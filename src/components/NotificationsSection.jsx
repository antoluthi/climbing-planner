import { useEffect, useState } from "react";
import { colors } from "../theme/palette.js";
import { notificationsPermission, requestNotificationsPermission } from "../lib/notifications.js";
import { nativeDiagnostics, formatDiagnostics } from "../lib/native-diag.js";
import { writeWidgetSnapshot } from "../lib/widget.js";

// ─── RAPPELS DE SÉANCE ───────────────────────────────────────────────────────
// Une bascule, et — dessous — de quoi savoir ce qui se passe quand elle ne
// marche pas. Un APK installé à la main n'a ni console ni rapport de plantage :
// sans cet encart, un appel de plugin qui échoue est invisible.
export function NotificationsSection({ isDark, styles, data, enabled, onChange }) {
  const c = colors(isDark);
  const [perm, setPerm] = useState(null);   // null = en cours
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);   // ce qu'a répondu la dernière tentative
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => { notificationsPermission().then(setPerm); }, []);

  const web = perm === "unsupported";
  const on = !!enabled && !web;

  // La bascule bascule **même si la permission est refusée** : le réglage est à
  // l'utilisateur, la permission est à Android. On dit ce qui manque au lieu de
  // rester inerte.
  const toggle = async () => {
    if (web || busy) return;
    if (on) { onChange(false); setNote(null); return; }
    setBusy(true);
    try {
      const res = await requestNotificationsPermission();
      setPerm(res);
      onChange(true);
      setNote(
        res === "granted" ? null
        : res.startsWith?.("error") ? `Android a répondu : ${res.slice(6)}`
        : "Android refuse les notifications pour cette app — à autoriser dans ses réglages."
      );
    } catch (e) {
      setNote("Échec inattendu : " + (e?.message || String(e)).slice(0, 100));
    } finally {
      setBusy(false);
    }
  };

  const runDiag = async () => {
    setDiagBusy(true);
    const d = await nativeDiagnostics();
    const w = await writeWidgetSnapshot(data);
    setDiag(formatDiagnostics(d) + "\n" +
      `écriture     ${w.ok ? `ok · ${w.reminders} rappel(s)` : "ÉCHEC · " + w.reason}`);
    setDiagBusy(false);
  };

  const smallBtn = {
    border: `1px solid ${c.border}`, borderRadius: 999, background: "none",
    color: c.textCard, fontFamily: "inherit", fontSize: 11, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer",
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
          {note && (
            <div style={{ fontSize: 11, color: c.warn, marginTop: 5, lineHeight: 1.4 }}>{note}</div>
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

      {/* ── Diagnostic ──
          Le seul endroit d'où l'on peut voir, depuis le téléphone, quel appel
          natif échoue. Le bouton écrit aussi pour le widget : c'est le même
          chemin que celui qui tourne tout seul, en version déclenchée. */}
      <div style={{ marginTop: 14, borderTop: `1px solid ${c.borderSubtle}`, paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 11, color: c.textMuted }}>
            Notifications ou widget muets ? Lance le diagnostic.
          </span>
          <button onClick={runDiag} disabled={diagBusy} style={smallBtn}>
            {diagBusy ? "…" : "Diagnostic"}
          </button>
        </div>

        {diag && (
          <pre style={{
            marginTop: 10, marginBottom: 0, padding: "10px 12px",
            background: c.inputBg, borderRadius: 12,
            fontSize: 10.5, lineHeight: 1.5, color: c.textCard,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}>{diag}</pre>
        )}
      </div>
    </div>
  );
}

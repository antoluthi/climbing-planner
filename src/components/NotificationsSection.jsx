import { useEffect, useState } from "react";
import { colors } from "../theme/palette.js";
import { notificationsPermission, requestNotificationsPermission, HOOPER_HOUR_DEFAULT } from "../lib/notifications.js";
import { nativeDiagnostics, formatDiagnostics } from "../lib/native-diag.js";
import { writeWidgetSnapshot } from "../lib/widget.js";

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
// Deux rappels indépendants — les séances et le ressenti du jour — et, dessous,
// de quoi savoir ce qui se passe quand ils ne marchent pas. Un APK installé à
// la main n'a ni console ni rapport de plantage : sans cet encart, un appel de
// plugin qui échoue est invisible.
//
// Les deux bascules partagent la même permission Android : la première qu'on
// active la demande, la seconde n'a plus rien à demander.
export function NotificationsSection({
  isDark, styles, data,
  enabled, onChange,
  hooperEnabled, onHooperChange,
  hooperHour, onHooperHourChange,
}) {
  const c = colors(isDark);
  const [perm, setPerm] = useState(null);   // null = en cours
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);   // ce qu'a répondu la dernière tentative
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => { notificationsPermission().then(setPerm); }, []);

  const web = perm === "unsupported";
  const sessionsOn = !!enabled && !web;
  const hooperOn = !!hooperEnabled && !web;

  // La bascule bascule **même si la permission est refusée** : le réglage est à
  // l'utilisateur, la permission est à Android. On dit ce qui manque au lieu de
  // rester inerte.
  const toggle = async (isOn, apply) => {
    if (web || busy) return;
    if (isOn) { apply(false); setNote(null); return; }
    setBusy(true);
    try {
      const res = await requestNotificationsPermission();
      setPerm(res);
      apply(true);
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

  // Affichage au fil de l'eau : chaque étape qui répond s'écrit tout de suite.
  // Si l'une reste muette malgré son délai, on voit quand même tout ce qui
  // précède — c'est exactement ce qui manquait quand le bouton restait sur « … ».
  const runDiag = async () => {
    setDiagBusy(true);
    setDiag("Diagnostic en cours…");
    try {
      const d = await nativeDiagnostics(partial => setDiag(formatDiagnostics(partial)));
      let text = formatDiagnostics(d);
      setDiag(text + "\nécriture     …");
      const w = await writeWidgetSnapshot(data);
      text += `\nécriture     ${w.ok ? `ok · ${w.reminders} rappel(s) · ${w.days} j d’avance` : "ÉCHEC · " + w.reason}`;
      setDiag(text);
    } catch (e) {
      setDiag(prev => (prev || "") + "\n⚠ diagnostic : " + (e?.message || String(e)));
    } finally {
      setDiagBusy(false);
    }
  };

  const smallBtn = {
    border: `1px solid ${c.border}`, borderRadius: 999, background: "none",
    color: c.textCard, fontFamily: "inherit", fontSize: 11, fontWeight: 600,
    padding: "6px 12px", cursor: "pointer",
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Notifications</div>

      {/* ── Rappels de séance ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ maxWidth: 250 }}>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>Rappels de séance</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            Une heure avant le départ, puis — la séance passée — une invitation à
            noter ton ressenti. C’est la même notification qui change.
          </div>
        </div>
        <Switch isDark={isDark} on={sessionsOn} disabled={web || busy}
                label="Rappels de séance"
                onClick={() => toggle(sessionsOn, onChange)} />
      </div>

      {/* ── Ressenti du jour ──
          Persistante à dessein : un Hooper oublié ne se rattrape pas, et une
          notification balayable se balaie sans y penser. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        marginTop: 16, borderTop: `1px solid ${c.borderSubtle}`, paddingTop: 14,
      }}>
        <div style={{ maxWidth: 250 }}>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>Ressenti du jour</div>
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            Une notification qui <strong>reste dans le tiroir</strong> tant que le
            Hooper de la journée n’est pas rempli, et disparaît dès qu’il l’est.
          </div>
        </div>
        <Switch isDark={isDark} on={hooperOn} disabled={web || busy}
                label="Ressenti du jour"
                onClick={() => toggle(hooperOn, onHooperChange)} />
      </div>

      {hooperOn && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: c.textMuted }}>À partir de</span>
          <select
            value={hooperHour ?? HOOPER_HOUR_DEFAULT}
            onChange={e => onHooperHourChange?.(Number(e.target.value))}
            style={{
              background: c.inputBg, border: `1px solid ${c.border}`, color: c.text,
              padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit",
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${String(h).padStart(2, "0")}h`}</option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: c.textDim, fontStyle: "italic" }}>
            l’heure passée, le rappel arrive tout de suite
          </span>
        </div>
      )}

      {web && (
        <div style={{ fontSize: 11, color: c.textDim, marginTop: 10, fontStyle: "italic" }}>
          Disponible dans l’application Android.
        </div>
      )}
      {note && (
        <div style={{ fontSize: 11, color: c.warn, marginTop: 8, lineHeight: 1.4 }}>{note}</div>
      )}

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

// Bascule ronde — la même dans les deux rangées, pour qu'elles se lisent comme
// un seul réglage à deux lignes.
function Switch({ isDark, on, disabled, label, onClick }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      style={{
        flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: "none",
        background: on ? c.accent : c.border,
        position: "relative", cursor: disabled ? "default" : "pointer",
        transition: "background 0.25s", opacity: disabled ? 0.4 : 1, padding: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: c.onColor, transition: "left 0.25s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

import { useEffect, useState } from "react";
import { colors } from "../theme/palette.js";
import { garminCall, garminMessage, GARMIN_KEY_URL } from "../lib/garmin.js";

// ─── GARMIN CONNECT ──────────────────────────────────────────────────────────
// La clé d'API personnelle de Garmin : on la colle ici une fois, le serveur la
// vérifie auprès de Garmin puis la garde (table `garmin_links`, fermée aux
// clients). L'app n'en revoit que les quatre derniers caractères.
//
// L'état affiché vient du serveur (`/api/garmin/status`) : c'est lui qui sait
// si une clé existe. Le drapeau `profile.garmin` du planning n'en est que le
// reflet, recalé ici à chaque visite (une clé reliée ou oubliée depuis un
// autre appareil).
export function GarminSection({ isDark, styles, garmin, sleep, flagLinked }) {
  const c = colors(isDark);
  const [status, setStatus] = useState(null);       // null = en cours
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(null);           // "save" | "delete" | null
  const [message, setMessage] = useState(null);     // { text, tone }
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const { markLinked, markUnlinked } = garmin;

  useEffect(() => {
    let alive = true;
    garminCall("status").then(res => {
      if (!alive) return;
      // Serveur injoignable : on se fie au drapeau du planning, sans le recaler.
      if (!res.ok) { setStatus({ linked: !!flagLinked, unreachable: res.error }); return; }
      setStatus(res.data);
      // Recaler le drapeau du planning sur ce que sait le serveur.
      if (res.data.linked && !flagLinked) markLinked();
      if (!res.data.linked && flagLinked) markUnlinked();
    });
    return () => { alive = false; };
    // Une fois par visite : le drapeau changera justement à cause de nous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy("save");
    setMessage(null);
    const res = await garminCall("key", { method: "POST", body: { apiKey: keyInput } });
    setBusy(null);
    if (!res.ok) { setMessage({ text: garminMessage(res.error), tone: c.danger }); return; }
    setStatus(res.data);
    setKeyInput("");
    setEditing(false);
    setMessage({ text: "Clé acceptée par Garmin. L'import de ton sommeil commence.", tone: c.textMuted });
    markLinked();
  };

  const unlink = async () => {
    if (busy) return;
    setBusy("delete");
    const res = await garminCall("key", { method: "DELETE" });
    setBusy(null);
    setConfirmUnlink(false);
    if (!res.ok) { setMessage({ text: garminMessage(res.error), tone: c.danger }); return; }
    setStatus({ linked: false });
    setMessage({ text: "Clé oubliée. Les nuits déjà importées restent dans tes stats.", tone: c.textMuted });
    markUnlinked();
  };

  const linked = !!status?.linked;
  const garminNights = (sleep || []).filter(n => n?.source === "garmin");
  const lastNight = garminNights.reduce((m, n) => (n.date > m ? n.date : m), "");
  const syncError = garmin.error || (garmin.broken ? "key_rejected" : null);

  const btn = (primary) => ({
    background: primary ? c.accent : "none",
    border: `1px solid ${primary ? c.accent : c.border}`,
    color: primary ? c.onColor : c.textCard,
    padding: "7px 14px", borderRadius: 999, cursor: "pointer",
    fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  });
  const muted = { fontSize: 11, color: c.textMuted, lineHeight: 1.5 };

  const keyForm = (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...muted, marginBottom: 8 }}>
        Crée une clé sur{" "}
        <a href={GARMIN_KEY_URL} target="_blank" rel="noopener noreferrer" style={{ color: c.accent, fontWeight: 600 }}>
          Garmin Connect
        </a>{" "}
        (Paramètres, API personnelle), puis colle-la ici. Garmin la vérifie tout de suite.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && keyInput.trim()) save(); }}
          placeholder="Clé d'API personnelle"
          autoComplete="off"
          spellCheck={false}
          aria-label="Clé d'API personnelle Garmin"
          style={{
            flex: 1, minWidth: 0, background: c.control, border: `1px solid ${c.border}`, borderRadius: 12,
            padding: "9px 12px", color: c.text, fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={!keyInput.trim() || !!busy}
          style={{ ...btn(true), opacity: !keyInput.trim() || busy ? 0.45 : 1, cursor: !keyInput.trim() || busy ? "default" : "pointer" }}
        >
          {busy === "save" ? "Vérification…" : "Relier"}
        </button>
      </div>
      <div style={{ ...muted, color: c.textDim, marginTop: 8 }}>
        La clé reste sur le serveur : elle n'est jamais dans ton planning, et ton coach ne la voit pas.
      </div>
    </div>
  );

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Garmin Connect</div>

      {status === null ? (
        <div style={muted}>…</div>
      ) : !linked ? (
        <>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 500 }}>Sommeil de ta montre</div>
          <div style={{ ...muted, marginTop: 3 }}>
            Relie ton compte Garmin pour retrouver tes nuits dans les stats : durée, phases, score, et
            les nuits qui suivent une grosse journée d'entraînement.
          </div>
          {keyForm}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: syncError ? c.warn : c.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>Relié</span>
            {status.hint && <span style={muted}>clé …{status.hint}</span>}
          </div>
          <div style={{ ...muted, marginTop: 4 }}>
            {garmin.running
              ? `Import du sommeil : ${garmin.done} sur ${garmin.total}…`
              : garminNights.length
                ? `${garminNights.length} ${garminNights.length > 1 ? "nuits importées" : "nuit importée"}, la dernière le ${shortDay(lastNight)}.`
                : "Aucune nuit importée pour l'instant."}
          </div>
          {syncError && !garmin.running && (
            <div style={{ ...muted, color: c.danger, marginTop: 4 }}>{garminMessage(syncError)}</div>
          )}

          {confirmUnlink ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...muted, color: c.text }}>
                Le serveur oublie la clé et l'import s'arrête. Les nuits déjà importées restent.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={unlink} style={{ ...btn(false), color: c.danger, borderColor: c.danger }}>
                  {busy === "delete" ? "…" : "Délier"}
                </button>
                <button type="button" onClick={() => setConfirmUnlink(false)} style={btn(false)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button
                type="button"
                onClick={() => garmin.sync({ force: true })}
                disabled={garmin.running}
                style={{ ...btn(false), color: c.accent, opacity: garmin.running ? 0.5 : 1 }}
              >
                Synchroniser
              </button>
              <button type="button" onClick={() => { setEditing(e => !e); setMessage(null); }} style={btn(false)}>
                {editing ? "Garder cette clé" : "Changer de clé"}
              </button>
              <button type="button" onClick={() => setConfirmUnlink(true)} style={{ ...btn(false), color: c.textMuted }}>
                Délier
              </button>
            </div>
          )}
          {editing && keyForm}
        </>
      )}

      {status?.unreachable && (
        <div style={{ ...muted, color: c.warn, marginTop: 8 }}>{garminMessage(status.unreachable)}</div>
      )}
      {message && <div style={{ fontSize: 11, color: message.tone, marginTop: 8, lineHeight: 1.5 }}>{message.text}</div>}
    </div>
  );
}

function shortDay(iso) {
  if (!iso) return "";
  // Le mois en entier : « le 30 oct. » finirait la phrase sur deux points.
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

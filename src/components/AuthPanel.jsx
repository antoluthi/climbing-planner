import { useState } from "react";
import supabase from "../lib/supabase.js";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Caillou } from "./Caillou.jsx";
import { isNative, AUTH_CALLBACK_URL } from "../lib/native.js";

export function AuthPanel({ session, onAuthChange, fullWidth }) {
  const { styles, isDark } = useThemeCtx();
  const wideInput = fullWidth ? { ...styles.authInput, width: "100%", maxWidth: 280, boxSizing: "border-box" } : styles.authInput;
  const barStyle = fullWidth ? { ...styles.authBar, flexDirection: "column", alignItems: "flex-start", gap: 10 } : styles.authBar;
  /* eslint-disable no-unused-vars */
  void isDark; // theme available if needed
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState("password"); // "password" | "signup" | "magiclink" | "setpw" | "pwdone"
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [authError, setAuthError] = useState("");

  const reset = () => { setAuthError(""); setSent(false); setSending(false); };
  const go = m => { setMode(m); reset(); setPassword(""); };

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password.trim() || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: password.trim(),
    });
    setSending(false);
    if (error) setAuthError("Email ou mot de passe incorrect");
  };

  const handleMagicLink = async () => {
    if (!email.trim() || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // APK : window.location.origin vaut https://localhost — le lien doit
      // rediriger vers le deep link de l'app (géré dans lib/native.js).
      options: { emailRedirectTo: isNative ? AUTH_CALLBACK_URL : window.location.origin },
    });
    setSending(false);
    if (error) {
      setAuthError(error.status === 429 ? "Trop d'essais — attendez quelques minutes" : error.message);
    } else { setSent(true); }
  };

  // Création de compte par email + mot de passe (le magic link reste possible
  // mais n'est plus le seul moyen de créer un compte — et il est vite
  // rate-limité côté Supabase).
  const handleSignUp = async () => {
    if (!email.trim() || password.trim().length < 6 || !supabase) return;
    setSending(true); setAuthError("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: { emailRedirectTo: isNative ? AUTH_CALLBACK_URL : window.location.origin },
    });
    setSending(false);
    if (error) {
      setAuthError(error.status === 429 ? "Trop d'essais — attendez quelques minutes"
        : /already registered/i.test(error.message) ? "Un compte existe déjà avec cet email — connecte-toi."
        : error.message);
      return;
    }
    // Selon la config Supabase : session directe, ou confirmation email requise.
    if (data?.session) return; // connecté — onAuthStateChange prend le relais
    setSent(true);
  };

  const handleSetPassword = async () => {
    if (password.trim().length < 6 || !supabase) return;
    setSending(true); setAuthError("");
    const { error } = await supabase.auth.updateUser({ password: password.trim() });
    setSending(false);
    if (error) { setAuthError(error.message); }
    else { setMode("pwdone"); setPassword(""); }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch {}
    onAuthChange(null);
  };

  if (!supabase) return null;

  /* ── Connecté ── */
  if (session) {
    if (mode === "setpw") return (
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <input
          style={{ ...wideInput, width: fullWidth ? undefined : 150 }}
          type="password"
          placeholder="Nouveau mot de passe (6+ car.)"
          value={password}
          autoFocus
          onChange={e => { setPassword(e.target.value); setAuthError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSetPassword()}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.authBtn} onClick={handleSetPassword} disabled={sending || password.length < 6}>
            {sending ? "…" : "Enregistrer"}
          </button>
          <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>✕</button>
        </div>
        {authError && <span style={styles.authErrorMsg}>{authError}</span>}
      </div>
    );

    if (mode === "pwdone") return (
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <span style={styles.authSentMsg}>✓ Mot de passe défini</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.authLogoutBtn} onClick={() => go("password")}>✕</button>
          <button style={styles.authLogoutBtn} onClick={handleLogout}>Déco</button>
        </div>
      </div>
    );

    return (
      <div style={barStyle}>
        <span style={styles.authEmail}>{session.user.email}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...styles.authBtn, fontSize: 10, padding: "3px 8px", opacity: 0.75 }}
            onClick={() => go("setpw")}
            title="Définir un mot de passe pour se connecter sans magic link"
          >Définir MDP</button>
          <button style={styles.authLogoutBtn} onClick={handleLogout}>Déconnexion</button>
        </div>
      </div>
    );
  }

  /* ── Création de compte ── */
  if (mode === "signup") return (
    <div style={barStyle}>
      {sent ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Caillou state="curious" size={110} />
          <span style={styles.authSentMsg}>Compte créé — confirme ton adresse via l'email reçu, puis connecte-toi.</span>
        </div>
      ) : (
        <>
          <input
            style={wideInput}
            type="email"
            placeholder="votre@email.com"
            value={email}
            autoFocus
            onChange={e => { setEmail(e.target.value); setAuthError(""); }}
          />
          <input
            style={{ ...wideInput, width: fullWidth ? undefined : 150 }}
            type="password"
            placeholder="Mot de passe (6+ car.)"
            value={password}
            onChange={e => { setPassword(e.target.value); setAuthError(""); }}
            onKeyDown={e => e.key === "Enter" && handleSignUp()}
          />
          <button style={styles.authBtn} onClick={handleSignUp} disabled={sending || !email.trim() || password.trim().length < 6}>
            {sending ? "…" : "Créer le compte"}
          </button>
        </>
      )}
      <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>← Connexion</button>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );

  /* ── Magic link ── */
  if (mode === "magiclink") return (
    <div style={barStyle}>
      {sent ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Caillou state="curious" size={110} />
          <span style={styles.authSentMsg}>Lien envoyé — vérifiez vos mails</span>
        </div>
      ) : (
        <>
          <input
            style={wideInput}
            type="email"
            placeholder="votre@email.com"
            value={email}
            autoFocus
            onChange={e => { setEmail(e.target.value); setAuthError(""); }}
            onKeyDown={e => e.key === "Enter" && handleMagicLink()}
          />
          <button style={styles.authBtn} onClick={handleMagicLink} disabled={sending}>
            {sending ? "…" : "Envoyer le lien"}
          </button>
        </>
      )}
      <button style={{ ...styles.authLogoutBtn, opacity: 0.7 }} onClick={() => go("password")}>← Connexion MDP</button>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );

  /* ── Mot de passe (défaut) ── */
  return (
    <div style={barStyle}>
      <input
        style={wideInput}
        type="email"
        placeholder="votre@email.com"
        value={email}
        onChange={e => { setEmail(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <input
        style={{ ...wideInput, width: fullWidth ? undefined : 130 }}
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={e => { setPassword(e.target.value); setAuthError(""); }}
        onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={styles.authBtn} onClick={handlePasswordLogin} disabled={sending || !password.trim()}>
          {sending ? "…" : "Connexion"}
        </button>
        <button style={{ ...styles.authLogoutBtn, opacity: 0.75 }} onClick={() => go("signup")} title="Créer un compte avec email + mot de passe">
          Créer un compte
        </button>
        <button style={{ ...styles.authLogoutBtn, opacity: 0.6 }} onClick={() => go("magiclink")} title="Connexion par lien email">
          Lien →
        </button>
      </div>
      {authError && <span style={styles.authErrorMsg}>{authError}</span>}
    </div>
  );
}

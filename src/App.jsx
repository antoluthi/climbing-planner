import { useState, useEffect } from "react";
import { ThemeContext } from "./theme/ThemeContext.jsx";
import { makeStyles } from "./theme/makeStyles.js";
import { useAuth } from "./context/AuthContext.js";
import { DataProvider } from "./context/DataProvider.jsx";
import { RoleRouter } from "./shells/RoleRouter.jsx";
import supabase from "./lib/supabase.js";
import { AuthPanel } from "./components/AuthPanel.jsx";
import { PublicPlanView, PublicPlanOverlay } from "./components/PublicPlanView.jsx";
import { fetchPublicPlans } from "./lib/supabase-public.js";
import { DayNightToggle } from "./components/DayNightToggle.jsx";
import { syncSystemBars } from "./lib/native.js";
import { colors } from "./theme/palette.js";

export default function App() {
  const { session, setSession, authChecked } = useAuth();

  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") === "dark");
  const styles = makeStyles(isDark);
  const toggleTheme = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  // APK : aligne le style des icônes de la barre de statut/navigation Android
  // sur le thème de l'app (no-op sur le web).
  useEffect(() => { syncSystemBars(isDark); }, [isDark]);
  // Les quelques règles CSS statiques (survols) lisent la palette par ici.
  useEffect(() => {
    document.documentElement.style.setProperty("--cp-tint", colors(isDark).tint);
  }, [isDark]);

  const [publicPlanUser, setPublicPlanUser] = useState(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState(null);

  const accent = colors(isDark).accent;

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors(isDark).surface }}>
        <div style={{ color: accent, fontSize: 28, fontWeight: 300, letterSpacing: "0.1em" }}>…</div>
      </div>
    );
  }

  if (publicPlanUser && !session) {
    return (
      <PublicPlanView
        onBack={() => setPublicPlanUser(null)}
        userId={publicPlanUser.userId}
        firstName={publicPlanUser.firstName}
        lastName={publicPlanUser.lastName}
        avatarUrl={publicPlanUser.avatarUrl}
      />
    );
  }

  if (supabase && !session) {
    const loginBrown = colors(isDark).accent;
    const loginBrownBg = isDark ? "rgba(184,101,26,0.18)" : "rgba(139,76,32,0.08)";
    const loginBrownBorder = isDark ? "rgba(184,101,26,0.55)" : "rgba(139,76,32,0.4)";
    const loginBorder = colors(isDark).border;
    const loginStyles = {
      ...styles,
      authBtn: { ...styles.authBtn, background: loginBrownBg, border: `1px solid ${loginBrownBorder}`, color: loginBrown },
      authLogoutBtn: { ...styles.authLogoutBtn, color: colors(isDark).textDim },
    };

    const openProfilePicker = async () => {
      setShowProfilePicker(p => !p);
      if (publicProfiles !== null) return;
      if (!supabase) return;
      setPublicProfiles(await fetchPublicPlans());
    };

    return (
      <ThemeContext.Provider value={{ styles: loginStyles, isDark, toggleTheme, mesocycles: [] }}>
        <div style={{
          minHeight: "100vh", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 24,
          background: colors(isDark).surface,
        }}>
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <DayNightToggle
              isDark={isDark}
              onToggle={toggleTheme}
              style={{
                border: `1px solid ${colors(isDark).border}`,
                borderRadius: 8,
                color: colors(isDark).textDim,
              }}
            />
          </div>

          <div style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 22, fontWeight: 500, fontStyle: "italic",
            color: loginBrown, letterSpacing: "0.08em",
          }}>Climbing Planner</div>

          <div style={{
            background: colors(isDark).card,
            borderRadius: 12, padding: "28px 24px",
            boxShadow: `0 4px 28px rgba(92, 51, 23, ${isDark ? "0.35" : "0.10"})`,
            minWidth: 300, border: `1px solid ${loginBorder}`,
          }}>
            <AuthPanel session={null} onAuthChange={setSession} fullWidth />
          </div>

          <div style={{
            border: `1px solid ${loginBorder}`,
            borderRadius: 10, overflow: "hidden",
            minWidth: 300,
          }}>
            <button
              onClick={openProfilePicker}
              style={{
                width: "100%", background: "none", border: "none",
                borderBottom: showProfilePicker ? `1px solid ${loginBorder}` : "none",
                padding: "13px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                color: colors(isDark).textMuted,
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, letterSpacing: "0.03em",
              }}
            >
              <span>Voir un planning public</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{showProfilePicker ? "▲" : "▼"}</span>
            </button>

            {showProfilePicker && (
              publicProfiles === null ? (
                <div style={{ padding: "14px 20px", color: colors(isDark).borderStrong, fontSize: 13 }}>
                  Chargement…
                </div>
              ) : publicProfiles.filter(p => p.firstName || p.lastName).length === 0 ? (
                <div style={{ padding: "14px 20px", color: colors(isDark).borderStrong, fontSize: 13 }}>
                  Aucun planning public disponible.
                </div>
              ) : (
                publicProfiles.filter(p => p.firstName || p.lastName).map((p, i) => {
                  const initials = [p.firstName?.[0], p.lastName?.[0]].filter(Boolean).join("").toUpperCase();
                  const fullName = [p.firstName?.trim(), p.lastName?.trim()].filter(Boolean).join(" ");
                  return (
                    <button
                      key={p.userId}
                      onClick={() => { setPublicPlanUser(p); setShowProfilePicker(false); }}
                      style={{
                        width: "100%", background: "none", border: "none",
                        borderTop: i > 0 ? `1px solid ${loginBorder}` : "none",
                        padding: "11px 20px",
                        display: "flex", alignItems: "center", gap: 11,
                        cursor: "pointer", textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = colors(isDark).surface}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      {p.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={fullName}
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: colors(isDark).borderSubtle,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700,
                          color: colors(isDark).textMuted,
                          flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                      )}
                      <span style={{ fontSize: 13, color: colors(isDark).text, fontWeight: 500 }}>
                        {fullName}
                      </span>
                      <span style={{ marginLeft: "auto", color: colors(isDark).border, fontSize: 12 }}>→</span>
                    </button>
                  );
                })
              )
            )}
          </div>
        </div>
      </ThemeContext.Provider>
    );
  }

  return (
    <DataProvider>
      <RoleRouter
        isDark={isDark} toggleTheme={toggleTheme} styles={styles}
        onOpenPublicPlan={setPublicPlanUser}
      />
      {/* Par-dessus l'app, jamais à la place : on remonte dans l'écran qu'on
          venait de quitter, et le planning déjà chargé n'est pas rejeté. */}
      {publicPlanUser && (
        <PublicPlanOverlay onClose={() => setPublicPlanUser(null)}>
          <PublicPlanView
            onBack={() => setPublicPlanUser(null)}
            userId={publicPlanUser.userId}
            firstName={publicPlanUser.firstName}
            lastName={publicPlanUser.lastName}
            avatarUrl={publicPlanUser.avatarUrl}
          />
        </PublicPlanOverlay>
      )}
    </DataProvider>
  );
}

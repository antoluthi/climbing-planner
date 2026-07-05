import { useState } from "react";
import { ThemeContext } from "./theme/ThemeContext.jsx";
import { makeStyles } from "./theme/makeStyles.js";
import { useAuth } from "./context/AuthContext.js";
import { DataProvider } from "./context/DataProvider.jsx";
import { RoleRouter } from "./shells/RoleRouter.jsx";
import supabase from "./lib/supabase.js";
import { AuthPanel } from "./components/AuthPanel.jsx";
import { PublicPlanView } from "./components/PublicPlanView.jsx";
import { DayNightToggle } from "./components/DayNightToggle.jsx";

export default function App() {
  const { session, setSession, authChecked } = useAuth();

  const [isDark, setIsDark] = useState(() => localStorage.getItem("climbing_theme") === "dark");
  const styles = makeStyles(isDark);
  const toggleTheme = () => setIsDark(d => {
    localStorage.setItem("climbing_theme", d ? "light" : "dark");
    return !d;
  });

  const [publicPlanUser, setPublicPlanUser] = useState(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [publicProfiles, setPublicProfiles] = useState(null);

  const accent = isDark ? "#e0a875" : "#8b4c20";

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "#1a1410" : "#f0f0f0" }}>
        <div style={{ color: accent, fontSize: 28, fontWeight: 300, letterSpacing: "0.1em" }}>…</div>
      </div>
    );
  }

  if (publicPlanUser) {
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
    const loginBrown = isDark ? "#e0a875" : "#5c3317";
    const loginBrownBg = isDark ? "rgba(184,101,26,0.18)" : "rgba(139,76,32,0.08)";
    const loginBrownBorder = isDark ? "rgba(184,101,26,0.55)" : "rgba(139,76,32,0.4)";
    const loginBorder = isDark ? "#2e2419" : "#ddd0c2";
    const loginStyles = {
      ...styles,
      authBtn: { ...styles.authBtn, background: loginBrownBg, border: `1px solid ${loginBrownBorder}`, color: loginBrown },
      authLogoutBtn: { ...styles.authLogoutBtn, color: isDark ? "#c4b69c" : "#8b6650" },
    };

    const openProfilePicker = async () => {
      setShowProfilePicker(p => !p);
      if (publicProfiles !== null) return;
      if (!supabase) return;
      const { data: rows } = await supabase
        .from("climbing_plans")
        .select("user_id, first_name, last_name, data")
        .eq("is_public", true);
      if (rows) {
        setPublicProfiles(rows.map(r => ({
          userId: r.user_id,
          firstName: r.first_name || r.data?.profile?.firstName || "",
          lastName: r.last_name || r.data?.profile?.lastName || "",
          avatarUrl: r.data?.profile?.avatarUrl || null,
        })));
      } else {
        setPublicProfiles([]);
      }
    };

    return (
      <ThemeContext.Provider value={{ styles: loginStyles, isDark, toggleTheme, mesocycles: [] }}>
        <div style={{
          minHeight: "100vh", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 24,
          background: isDark ? "#1a1410" : "#ede7de",
        }}>
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <DayNightToggle
              isDark={isDark}
              onToggle={toggleTheme}
              style={{
                border: `1px solid ${isDark ? "#3a2e22" : "#ccc6b8"}`,
                borderRadius: 8,
                color: isDark ? "#c4b69c" : "#6a6258",
              }}
            />
          </div>

          <div style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 22, fontWeight: 500, fontStyle: "italic",
            color: loginBrown, letterSpacing: "0.08em",
          }}>Climbing Planner</div>

          <div style={{
            background: isDark ? "#241b13" : "#faf6f1",
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
                color: isDark ? "#a89a82" : "#8a7060",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, letterSpacing: "0.03em",
              }}
            >
              <span>Voir un planning public</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{showProfilePicker ? "▲" : "▼"}</span>
            </button>

            {showProfilePicker && (
              publicProfiles === null ? (
                <div style={{ padding: "14px 20px", color: isDark ? "#8a7d68" : "#aaa89e", fontSize: 13 }}>
                  Chargement…
                </div>
              ) : publicProfiles.filter(p => p.firstName || p.lastName).length === 0 ? (
                <div style={{ padding: "14px 20px", color: isDark ? "#8a7d68" : "#aaa89e", fontSize: 13 }}>
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
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? "#1f1810" : "#f0ebe0"}
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
                          background: isDark ? "#2a2018" : "#e4ddd4",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700,
                          color: isDark ? "#a89a82" : "#8a7060",
                          flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                      )}
                      <span style={{ fontSize: 13, color: isDark ? "#e0d4c0" : "#2a2218", fontWeight: 500 }}>
                        {fullName}
                      </span>
                      <span style={{ marginLeft: "auto", color: isDark ? "#4a3e30" : "#c8c0b4", fontSize: 12 }}>→</span>
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
      <RoleRouter isDark={isDark} toggleTheme={toggleTheme} styles={styles} />
    </DataProvider>
  );
}

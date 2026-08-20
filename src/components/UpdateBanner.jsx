import { useEffect, useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";
import { checkForUpdate, isDismissed, dismissUpdate } from "../lib/update-check.js";

// ─── BANDEAU DE MISE À JOUR (APK) ─────────────────────────────────────────────
// L'APK ne se met pas à jour tout seul : ce bandeau est le seul signal qu'une
// nouvelle version existe. Muet sur le web et en build local — checkForUpdate()
// s'y désactive de lui-même.

export function UpdateBanner({ isMobile }) {
  const { isDark } = useThemeCtx();
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then(found => {
      if (!cancelled && found && !isDismissed(found.versionCode)) setUpdate(found);
    });
    return () => { cancelled = true; };
  }, []);

  if (!update) return null;

  const surface = isDark ? "#2a2218" : "#2a2218";
  const text = isDark ? "#f0e6d0" : "#fcf8ef";
  const accent = "#e0a875";

  const close = () => {
    dismissUpdate(update.versionCode);
    setUpdate(null);
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: isMobile ? 12 : 16,
        left: isMobile ? 12 : "auto",
        right: isMobile ? 12 : 20,
        zIndex: Z.toast,
        maxWidth: isMobile ? "calc(100vw - 24px)" : 380,
        background: surface,
        color: text,
        border: `1px solid ${accent}55`,
        borderRadius: 10,
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "inherit",
        fontSize: 13,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        Version {update.versionName} disponible
      </span>
      <a
        href={update.url}
        target="_blank"
        rel="noreferrer"
        onClick={close}
        style={{
          color: accent,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          textDecoration: "none",
          padding: "4px 8px",
          whiteSpace: "nowrap",
        }}
      >
        Télécharger
      </a>
      <button
        onClick={close}
        aria-label="Fermer"
        style={{
          background: "transparent",
          border: "none",
          color: text,
          fontFamily: "inherit",
          fontSize: 14,
          cursor: "pointer",
          opacity: 0.6,
          padding: "0 2px",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

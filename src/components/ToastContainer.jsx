import { useEffect, useState } from "react";
import { toast } from "../lib/toast.js";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";

// ─── TOAST CONTAINER ──────────────────────────────────────────────────────────
// S'abonne au store et affiche en bas, avec UNDO et auto-dismiss.

export function ToastContainer({ isMobile }) {
  const [items, setItems] = useState([]);
  const { isDark } = useThemeCtx();

  useEffect(() => toast.subscribe(setItems), []);

  if (items.length === 0) return null;

  const text = isDark ? "#e8e4de" : "#fcf8ef";
  const surface = isDark ? "#2a2218" : "#2a2218";
  const accent = isDark ? "#c8906a" : "#c8906a";
  const success = "#7ab890";
  const error = "#e87878";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: isMobile ? 16 : 20,
        left: isMobile ? 16 : "auto",
        right: isMobile ? 16 : 20,
        zIndex: Z.toast,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        maxWidth: isMobile ? "calc(100vw - 32px)" : 360,
      }}
    >
      {items.map(t => (
        <div
          key={t.id}
          style={{
            background: surface,
            color: text,
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            border: `1px solid ${t.kind === "error" ? error : t.kind === "success" ? success : accent}55`,
            pointerEvents: "auto",
            animation: "cp-toast-in 0.2s ease-out",
            fontFamily: "inherit",
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: t.kind === "error" ? error : t.kind === "success" ? success : accent,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, color: text, lineHeight: 1.4 }}>{t.message}</span>
          {t.undo && (
            <button
              onClick={() => {
                try { t.undo(); } catch { /* ignore */ }
                toast.dismiss(t.id);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: accent,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Annuler
            </button>
          )}
          <button
            onClick={() => toast.dismiss(t.id)}
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
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

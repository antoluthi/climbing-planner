import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";

export function RoleOnboardingModal({ onSelect }) {
  const { isDark } = useThemeCtx();
  const bg       = isDark ? "#181f1b" : "#f6f9f7";
  const surface  = isDark ? "#1e2820" : "#ffffff";
  const border   = isDark ? "#2a3a2e" : "#d4e8db";
  const text     = isDark ? "#e2ead5" : "#1a2e1f";
  const muted    = isDark ? "#7a9880" : "#6b8c72";
  const accent   = isDark ? "#c8906a" : "#8b4c20";
  const [selected, setSelected] = useState(null);

  const roles = [
    {
      value: null,
      label: "Athlète solo",
      desc: "Vous gérez votre planning vous-même.",
    },
    {
      value: "coach",
      label: "Coach",
      desc: "Vous créez et modifiez les cycles de vos athlètes.",
    },
    {
      value: "athlete",
      label: "Athlète suivi",
      desc: "Votre coach gère vos cycles. Vos cycles sont en lecture seule.",
    },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: surface, border: `1px solid ${border}`,
        borderRadius: 14, padding: "32px 28px", maxWidth: 420, width: "100%",
        boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: muted, textTransform: "uppercase", marginBottom: 8 }}>
          Bienvenue
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: text, marginBottom: 6 }}>
          Quel est votre rôle ?
        </div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 24, lineHeight: 1.5 }}>
          Ce choix est permanent. Contactez votre administrateur pour le modifier.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {roles.map(opt => {
            const active = selected === opt.value || (selected === undefined && opt.value === null && false);
            const isSelected = selected !== null ? selected === opt.value : opt.value === selected;
            return (
              <button
                key={String(opt.value)}
                onClick={() => setSelected(opt.value)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: isSelected ? (isDark ? "#1f3327" : "#e8f5ed") : bg,
                  border: `1.5px solid ${isSelected ? accent : border}`,
                  borderRadius: 9, padding: "14px 16px",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? accent : text, marginBottom: 3 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          disabled={selected === undefined}
          onClick={() => selected !== undefined && onSelect(selected)}
          style={{
            width: "100%",
            background: selected !== undefined ? accent : (isDark ? "#2a3a2e" : "#e0ebe3"),
            border: "none", borderRadius: 8,
            color: selected !== undefined ? "#fff" : muted,
            padding: "12px 20px",
            cursor: selected !== undefined ? "pointer" : "default",
            fontSize: 13, fontFamily: "inherit", fontWeight: 700,
            letterSpacing: "0.04em",
            opacity: selected !== undefined ? 1 : 0.5,
          }}
        >
          Confirmer
        </button>
      </div>
    </div>
  );
}

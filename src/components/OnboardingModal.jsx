import { useState, useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Z } from "../theme/makeStyles.js";
import { Button } from "./ui/Button.jsx";

// ─── ONBOARDING MODAL ─────────────────────────────────────────────────────────
// 3 écrans expliquant les concepts clés : cycles, Hooper, créatine.
// Affiché au 1er login après le choix du rôle. Persiste profile.onboarded.

const SCREENS = [
  {
    key: "cycles",
    eyebrow: "Planifie sur le long terme",
    title: "Cycles d'entraînement",
    body: (
      <>
        L'app structure ton entraînement en <strong>mésocycles</strong> (4-12 semaines, comme « Force-Endurance » ou « Affûtage »), eux-mêmes
        découpés en <strong>microcycles</strong> (1-2 semaines avec un objectif précis). Chaque jour, tu vois
        où tu en es : <em>« S2/4 — Force-Endurance »</em>.
      </>
    ),
    bullets: [
      "Tu visualises ton plan sur l'année entière.",
      "Les charges quotidiennes prennent du sens dans la durée.",
      "Tu peux les modifier à tout moment dans l'onglet Cycles.",
    ],
    glyph: "↻",
    color: "#8b4c20",
  },
  {
    key: "hooper",
    eyebrow: "Détecte le surentraînement",
    title: "Indice Hooper",
    body: (
      <>
        Chaque jour, note <strong>4 indicateurs de bien-être</strong> sur 7 : sommeil, fatigue, stress et courbatures.
        Suivi sur la durée, le score t'avertit quand ton corps a besoin de récupérer
        — bien avant que la blessure n'arrive.
      </>
    ),
    bullets: [
      "30 secondes par jour, et c'est tout.",
      "Le score quotidien apparaît sur la heatmap dans Stats.",
      "Plus le score est haut, plus tu es en zone de fatigue.",
    ],
    glyph: "⚇",
    color: "#e6c46a",
  },
  {
    key: "creatine",
    eyebrow: "Suivi simple, données fiables",
    title: "Créatine & poids",
    body: (
      <>
        Dans le <strong>Journal du jour</strong>, tu peux logger en un tap si tu as pris ta créatine
        et te peser. Si tu crées un cycle « Créatine » dans Cycles, l'app te rappellera
        de la prendre les jours concernés.
      </>
    ),
    bullets: [
      "Aucune obligation — coche seulement ce qui te concerne.",
      "Les données alimentent les graphiques Stats.",
      "Tout est privé, stocké sur ton compte uniquement.",
    ],
    glyph: "◍",
    color: "#82c894",
  },
];

export function OnboardingModal({ onComplete }) {
  const { isDark } = useThemeCtx();
  const [step, setStep] = useState(0);
  const screen = SCREENS[step];
  const isLast = step === SCREENS.length - 1;

  useEffect(() => {
    const h = e => {
      if (e.key === "ArrowRight" && !isLast) setStep(s => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep(s => s - 1);
      if (e.key === "Escape") onComplete();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [step, isLast, onComplete]);

  const paper        = isDark ? "#241b13" : "#fcf8ef";
  const paperDim     = isDark ? "#15100b" : "#f7f1e2";
  const border       = isDark ? "#3a2e22" : "#e6dfd1";
  const borderStrong = isDark ? "#3a2e22" : "#d8d0bf";
  const text         = isDark ? "#f0e6d0" : "#2a2218";
  const textMid      = isDark ? "#c4b69c" : "#5a4d3c";
  const textLight    = isDark ? "#a89a82" : "#8a7f70";
  const accent       = isDark ? "#e0a875" : "#8b4c20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue dans Climbing Planner"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        zIndex: Z.nested,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: paper,
        borderRadius: 18,
        border: `1px solid ${borderStrong}`,
        width: "100%",
        maxWidth: 460,
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 22px 12px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: accent,
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              Bienvenue · {step + 1}/{SCREENS.length}
            </span>
            <button
              onClick={onComplete}
              aria-label="Passer"
              style={{
                background: "none", border: "none",
                color: textLight, fontSize: 11, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: "0.04em",
              }}
            >Passer →</button>
          </div>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 4 }} aria-label={`Étape ${step + 1} sur ${SCREENS.length}`}>
            {SCREENS.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i <= step ? accent : border,
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 22px 16px" }}>
          {/* Glyph illustration */}
          <div style={{
            display: "flex", justifyContent: "center", marginBottom: 18,
          }}>
            <div
              aria-hidden="true"
              style={{
                width: 72, height: 72, borderRadius: "50%",
                background: screen.color + "22",
                border: `2px solid ${screen.color}55`,
                color: screen.color,
                fontSize: 36, fontWeight: 500,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Newsreader', Georgia, serif",
              }}
            >
              {screen.glyph}
            </div>
          </div>

          {/* Eyebrow */}
          <div style={{
            fontSize: 11, fontWeight: 600, color: textLight,
            letterSpacing: "0.1em", textTransform: "uppercase",
            textAlign: "center", marginBottom: 4,
          }}>
            {screen.eyebrow}
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 26, fontWeight: 500, color: text,
            textAlign: "center", lineHeight: 1.15, marginBottom: 14,
          }}>
            {screen.title}
          </div>

          {/* Body */}
          <div style={{
            fontSize: 14, color: textMid, lineHeight: 1.55,
            marginBottom: 16, textAlign: "left",
          }}>
            {screen.body}
          </div>

          {/* Bullets */}
          <ul style={{
            listStyle: "none", padding: 0, margin: 0,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {screen.bullets.map((b, i) => (
              <li key={i} style={{
                fontSize: 13, color: textMid, lineHeight: 1.5,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: screen.color, flexShrink: 0, marginTop: 7,
                }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px",
          background: paperDim,
          borderTop: `1px solid ${border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ visibility: step === 0 ? "hidden" : "visible" }}
          >
            ← Précédent
          </Button>
          {isLast ? (
            <Button variant="primary" size="md" onClick={onComplete}>
              Compris ✓
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={() => setStep(s => s + 1)}>
              Suivant →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

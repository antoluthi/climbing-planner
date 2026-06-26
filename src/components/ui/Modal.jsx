import { useEffect } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Z } from "../../theme/makeStyles.js";

// ─── MODAL PRIMITIVES ─────────────────────────────────────────────────────────
// Coquille de modale unifiée pour toute l'app. Objectif : chaque modale s'ouvre,
// se ferme, défile et se lit de la même manière. Esc + clic-extérieur ferment,
// le bouton ✕ est toujours en haut à droite, en-tête serif, corps défilant,
// pied collant. Construit sur le motif déjà établi par OnboardingModal /
// DayLogModal / SessionScheduleModal.
//
//   <Modal onClose={requestClose} maxWidth={440}>
//     <ModalHeader eyebrow="…" title="…" onClose={requestClose} />
//     <ModalBody> … </ModalBody>
//     <ModalFooter> <Button …/> </ModalFooter>
//   </Modal>

export function modalTokens(isDark) {
  const D = isDark;
  return {
    paper:        D ? "#241b13" : "#fcf8ef",
    paperDim:     D ? "#15100b" : "#f7f1e2",
    surface:      D ? "#241b13" : "#ffffff",
    surfaceMuted: D ? "#2e2419" : "#f0ebde",
    border:       D ? "#3a2e22" : "#e6dfd1",
    borderStrong: D ? "#3a2e22" : "#d8d0bf",
    text:         D ? "#f0e6d0" : "#2a2218",
    textMid:      D ? "#c4b69c" : "#5a4d3c",
    textLight:    D ? "#a89a82" : "#8a7f70",
    accent:       D ? "#e0a875" : "#8b4c20",
    danger:       D ? "#e87878" : "#b83030",
  };
}

export function Modal({
  children,
  onClose,
  maxWidth = 440,
  zIndex = Z.nested,
  dismissOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
}) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);

  useEffect(() => {
    if (!closeOnEsc) return;
    const h = e => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, closeOnEsc]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={e => { if (dismissOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
        zIndex, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.paper,
          border: `1px solid ${T.borderStrong}`,
          borderRadius: 18,
          width: "100%",
          maxWidth,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// En-tête : petit sur-titre optionnel (eyebrow) + titre serif + bouton fermer.
// `accent` colore le sur-titre ; `tint` applique un bandeau coloré (échéances).
export function ModalHeader({ eyebrow, title, onClose, right, tint }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);

  return (
    <div
      style={{
        padding: "16px 18px 14px",
        background: tint
          ? tint + "22"
          : (isDark
              ? `linear-gradient(180deg, ${T.paper}, ${T.paperDim})`
              : `linear-gradient(180deg, ${T.paper} 0%, ${T.paperDim} 100%)`),
        borderBottom: `1px solid ${tint ? tint + "55" : T.border}`,
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: tint || T.accent,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4,
          }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 22, fontWeight: 500, color: T.text, lineHeight: 1.2,
        }}>
          {title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {right}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "none", border: `1px solid ${T.border}`, borderRadius: "50%",
              color: T.textLight, padding: 0, width: 28, height: 28,
              cursor: "pointer", fontSize: 14, fontFamily: "inherit", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        )}
      </div>
    </div>
  );
}

export function ModalBody({ children, style }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto",
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

// Pied collant. `align` : "end" (par défaut, actions à droite) ou "between".
export function ModalFooter({ children, align = "end" }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  return (
    <div style={{
      padding: "12px 18px",
      background: T.paperDim,
      borderTop: `1px solid ${T.border}`,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 10,
      justifyContent: align === "between" ? "space-between" : "flex-end",
    }}>
      {children}
    </div>
  );
}

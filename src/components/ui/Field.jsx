import { forwardRef } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { modalTokens } from "./Modal.jsx";

// ─── FIELD PRIMITIVES ─────────────────────────────────────────────────────────
// Champs de formulaire unifiés pour les modales. Même typographie, mêmes états
// de focus, même densité partout. Réduit le bruit visuel et rend les formulaires
// prévisibles.

export function Field({ label, hint, children, style }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  return (
    <div style={style}>
      {label && (
        <label style={{
          display: "block", fontSize: 11, fontWeight: 600, color: T.textLight,
          letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8,
        }}>
          {label}
          {hint && (
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontStyle: "italic", color: T.textLight }}>
              {" "}— {hint}
            </span>
          )}
        </label>
      )}
      {children}
    </div>
  );
}

function baseInputStyle(T) {
  return {
    width: "100%", boxSizing: "border-box",
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "10px 12px",
    fontSize: 14, fontFamily: "inherit", color: T.text,
    outline: "none", transition: "border-color 0.15s",
  };
}

function focusHandlers(T) {
  return {
    onFocus: e => (e.currentTarget.style.borderColor = T.accent + "88"),
    onBlur:  e => (e.currentTarget.style.borderColor = T.border),
  };
}

export const TextInput = forwardRef(function TextInput({ style, ...rest }, ref) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const fh = focusHandlers(T);
  return (
    <input
      ref={ref}
      {...fh}
      {...rest}
      style={{ ...baseInputStyle(T), ...style }}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ style, ...rest }, ref) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const fh = focusHandlers(T);
  return (
    <textarea
      ref={ref}
      {...fh}
      {...rest}
      style={{ ...baseInputStyle(T), minHeight: 72, resize: "vertical", lineHeight: 1.5, fontSize: 13, ...style }}
    />
  );
});

export const Select = forwardRef(function Select({ style, children, ...rest }, ref) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const fh = focusHandlers(T);
  return (
    <select
      ref={ref}
      {...fh}
      {...rest}
      style={{ ...baseInputStyle(T), cursor: "pointer", ...style }}
    >
      {children}
    </select>
  );
});

// Pastilles de couleur. `value` est la couleur sélectionnée.
export function ColorSwatches({ colors, value, onChange, size = 26 }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {colors.map(c => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Couleur ${c}`}
            aria-pressed={active}
            style={{
              width: size, height: size, borderRadius: "50%",
              background: c, cursor: "pointer", border: "none", padding: 0,
              boxShadow: active
                ? `0 0 0 2px ${T.text}, 0 0 0 4px ${c}`
                : "0 1px 3px rgba(0,0,0,0.15)",
              transition: "box-shadow 0.15s, transform 0.1s",
              transform: active ? "scale(1.06)" : "scale(1)",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// Contrôle segmenté (onglets compacts). options = [{ value, label }].
export function SegmentedControl({ options, value, onChange, accent }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const acc = accent || T.accent;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, padding: "9px 10px",
              background: active ? acc + "22" : T.surface,
              border: `1px solid ${active ? acc : T.border}`,
              borderRadius: 8, color: active ? T.text : T.textMid,
              fontSize: 12, fontWeight: active ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Interrupteur on/off avec libellé.
export function Toggle({ checked, onChange, label, color }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const on = color || T.accent;
  return (
    // onClick sur le <label> entier : le libellé est cliquable, pas seulement
    // l'interrupteur (le curseur pointer le promettait déjà).
    <label onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? on : (isDark ? "#463826" : "#ccc"),
          position: "relative", flexShrink: 0, transition: "background 0.2s",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }} />
      </div>
      {label && (
        <span style={{ fontSize: 13, color: checked ? T.text : T.textMid, fontWeight: checked ? 600 : 400 }}>
          {label}
        </span>
      )}
    </label>
  );
}

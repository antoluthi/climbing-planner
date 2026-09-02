import { Fragment } from "react";
import { colors } from "../../theme/palette.js";
import { weeksOf } from "../../lib/cycles.js";

// ─── CHAMPS PARTAGÉS DES CYCLES ──────────────────────────────────────────────
// Extraits de `CyclesView` quand la piste des blocs de course est arrivée : les
// deux éditeurs posent les mêmes gestes (une durée en semaines, une couleur,
// une description qui suit son texte), et deux copies auraient divergé.

export function WeekStepper({ isDark, value, onChange, min = 1, max = 24, compact = false }) {
  const c = colors(isDark);
  const n = weeksOf({ durationWeeks: value });
  const size = compact ? 24 : 28;
  const step = (label, delta, disabled) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={delta < 0 ? "Une semaine de moins" : "Une semaine de plus"}
      onClick={() => onChange(Math.min(max, Math.max(min, n + delta)))}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        border: "none", background: disabled ? "transparent" : c.control,
        color: disabled ? c.textDim : c.text,
        fontSize: compact ? 13 : 15, lineHeight: 1, fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >{label}</button>
  );
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
      background: c.inputBg, borderRadius: 999, padding: 3,
    }}>
      {step("−", -1, n <= min)}
      <span style={{
        minWidth: compact ? 40 : 48, textAlign: "center",
        fontSize: compact ? 11 : 12, fontWeight: 600, color: c.text,
        fontVariantNumeric: "tabular-nums",
      }}>{n} sem.</span>
      {step("+", +1, n >= max)}
    </div>
  );
}

// Un objectif de bloc tient rarement sur une ligne : le champ suit le texte,
// et une liste à puces s'y écrit comme dans une note (rendue par RichText dans
// le détail du mésocycle).
export function AutoTextarea({ value, onChange, placeholder, style, rows = 2 }) {
  const fit = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  return (
    <textarea
      ref={fit}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={e => { fit(e.target); onChange(e.target.value); }}
      style={{ ...style, resize: "none", overflow: "hidden", lineHeight: 1.45 }}
    />
  );
}

// Pastille ronde : le champ couleur natif est posé par-dessus, invisible.
export function ColorDot({ color, c, onChange }) {
  return (
    <label style={{
      position: "relative", width: 20, height: 20, borderRadius: 999,
      background: color, flexShrink: 0, cursor: "pointer",
      boxShadow: `0 0 0 1px ${c.border}`,
    }} title="Couleur du bloc">
      <input
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, cursor: "pointer" }}
      />
    </label>
  );
}

export function GripIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {[4, 8, 12].map(y => (
        <Fragment key={y}>
          <circle cx="6" cy={y} r="1.4" />
          <circle cx="10" cy={y} r="1.4" />
        </Fragment>
      ))}
    </svg>
  );
}

export function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
         style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

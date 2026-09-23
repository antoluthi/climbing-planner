import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { weeksOf } from "../../lib/cycles.js";
import { hexToHsl, hslToHex } from "../../lib/color.js";
import { RichTextArea } from "./RichTextArea.jsx";
import { MONO } from "./Ascent.jsx";

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
  // Une description de cycle est rendue par `RichText` : elle se saisit donc
  // avec la même assistance que les autres zones de texte — Entrée continue la
  // liste, Tab imbrique. Le « ? » n'y est pas : ces champs n'ont pas de
  // libellé où l'accrocher, et l'aide est à un écran de là (formulaire de
  // séance, ressenti).
  return (
    <RichTextArea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      style={style}
      autoGrow
      help={false}
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

// ── Champ numérique qui ne se bat pas avec vous ──────────────────────────────
// Un `<input type="number">` contrôlé sur une valeur numérique a deux défauts
// qu'on sent tout de suite au pouce :
//
//  · **vider le champ est impossible.** L'effacement produit `""`, que le
//    parent convertit en 0 — lequel se réaffiche aussitôt et ne s'efface plus.
//  · **les frappes intermédiaires sont réécrites.** « 4. », « 1, » ou « 0 » en
//    route vers « 05 » sont des états parfaitement normaux d'une saisie, que le
//    formatage renvoyait à autre chose sous les doigts.
//
// D'où : le texte reste tel quel pendant la saisie (le brouillon), et on ne
// remonte une valeur qu'à la sortie du champ. Vider devient donc permis, et
// c'est au parent de décider ce que « vide » veut dire — ici, revenir à la
// progression pour une semaine, ou « pas de valeur » pour un réglage de bloc.
//
// `type="text"` plutôt que `number` : un champ numérique rapporte `""` pour
// toute saisie qu'il juge invalide, ce qui reprendrait le problème par l'autre
// bout. `inputMode="decimal"` donne quand même le pavé numérique sur mobile.
export function NumberField({ value, onCommit, style, ...rest }) {
  const [draft, setDraft] = useState(null);   // null = aucune saisie en cours
  const shown = draft !== null ? draft : (value == null ? "" : String(value));

  const commit = () => {
    if (draft === null) return;
    const t = draft.trim().replace(",", ".");   // la virgule décimale française
    setDraft(null);
    if (t === "") return onCommit(null);
    const n = Number(t);
    if (Number.isFinite(n)) onCommit(n);
    // Saisie illisible : on ne remonte rien, l'affichage reprend la valeur.
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={style}
      {...rest}
    />
  );
}

// ─── LA COULEUR D'UN MICROCYCLE ──────────────────────────────────────────────
// Un microcycle n'a pas de couleur à lui par défaut : il prend celle de son
// bloc, et c'est ce qu'on veut presque toujours — les quatre semaines d'un
// même mésocycle forment une famille. Ce qu'on veut *parfois*, c'est en
// éclaircir une pour la distinguer des autres **sans quitter la famille**.
//
// D'où un réglage en HSL plutôt que le sélecteur natif : éclaircir en RGB
// demande de bouger trois nombres à la fois dans la bonne proportion, et à la
// moindre erreur la teinte part ailleurs. Ici la luminosité est un curseur, et
// elle est en tête parce que c'est le geste qu'on vient faire. Le sélecteur
// natif reste dessous, pour la fois où l'on connaît son `#rrggbb`.
//
// `ColorDot` (le mésocycle, un bloc de course) garde le sélecteur natif seul :
// ces couleurs-là n'héritent de rien, il n'y a pas de famille à retrouver ni
// de luminosité à ajuster par rapport à quoi que ce soit.
export function MicroColorDot({ color, inherited, c, onChange, onReset, size = 10 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const hsl = hexToHsl(color);

  // Fixe et non absolu : l'éditeur de cycles défile, et un panneau absolu se
  // ferait couper par la carte du bloc.
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(260, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left - 8), window.innerWidth - width - 12);
    const below = r.bottom + 8;
    const fits = below + 210 < window.innerHeight;
    setPos({ left, width, top: fits ? below : undefined,
             bottom: fits ? undefined : window.innerHeight - r.top + 8 });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!btnRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("touchstart", close, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("touchstart", close, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const set = (patch) => onChange(hslToHex(
    patch.h ?? hsl.h, patch.s ?? hsl.s, patch.l ?? hsl.l));

  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { place(); setOpen(o => !o); }}
        aria-label="Couleur du microcycle"
        title="Couleur du microcycle"
        style={{
          width: size + 8, height: size + 8, padding: 0, borderRadius: 999,
          border: open ? `1px solid ${c.accent}` : "1px solid transparent",
          background: "none", cursor: "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ width: size, height: size, borderRadius: 999, background: color,
                       boxShadow: `0 0 0 1px ${c.border}` }} />
      </button>

      {open && pos && (
        <div style={{
          position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom,
          width: pos.width, zIndex: Z.popoverHi,
          background: c.modalBg, border: `1px solid ${c.borderStrong}`,
          borderRadius: RADIUS.card, padding: "12px 14px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: color,
                           boxShadow: `0 0 0 1px ${c.border}`, flexShrink: 0 }} />
            <span style={{ font: `600 11px ${MONO}`, color: c.textCard }}>{color}</span>
            {inherited && (
              <span style={{ fontSize: 9, color: c.textDim, marginLeft: "auto" }}>couleur du bloc</span>
            )}
          </div>

          <Slider label="Luminosité" value={hsl.l} max={100} c={c}
                  onChange={l => set({ l })}
                  track={`linear-gradient(90deg, ${hslToHex(hsl.h, hsl.s, 10)}, ${hslToHex(hsl.h, hsl.s, 50)}, ${hslToHex(hsl.h, hsl.s, 92)})`} />
          <Slider label="Teinte" value={hsl.h} max={360} c={c}
                  onChange={h => set({ h })}
                  track="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" />
          <Slider label="Saturation" value={hsl.s} max={100} c={c}
                  onChange={s => set({ s })}
                  track={`linear-gradient(90deg, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
            <label style={{ fontSize: 10.5, color: c.textDim, cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5 }}>
              <input type="color" value={color} onChange={e => onChange(e.target.value)}
                     style={{ width: 20, height: 20, padding: 0, border: "none",
                              background: "none", cursor: "pointer" }} />
              RGB exact
            </label>
            {!inherited && (
              <button type="button" onClick={() => { onReset(); setOpen(false); }}
                      style={{ marginLeft: "auto", fontSize: 10.5, color: c.accent,
                               background: "none", border: "none", cursor: "pointer",
                               fontFamily: "inherit", padding: 0 }}>
                Reprendre celle du bloc
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

function Slider({ label, value, max, onChange, track, c }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ display: "flex", justifyContent: "space-between",
                     fontSize: 10, color: c.textDim }}>
        <span>{label}</span><span style={{ font: `600 10px ${MONO}` }}>{value}</span>
      </span>
      <input
        type="range" min={0} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", height: 14, background: track, borderRadius: 999,
                 appearance: "none", WebkitAppearance: "none", outline: "none", cursor: "pointer" }}
      />
    </label>
  );
}

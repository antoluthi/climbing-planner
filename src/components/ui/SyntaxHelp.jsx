import { useState, useRef, useEffect, useCallback } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { RichText } from "../RichText.jsx";
import { SANS, MONO } from "./Ascent.jsx";

// ─── LA SYNTAXE, À PORTÉE DE POUCE ───────────────────────────────────────────
// Une syntaxe qu'on ne voit nulle part n'existe pas : personne ne devine que
// deux astérisques mettent en gras. D'où ce « ? » posé à côté de chaque zone de
// texte qui la comprend.
//
// **Les exemples sont rendus par le vrai moteur** (`RichText`), pas recopiés à
// la main. Une aide écrite en dur se désaccorde du code à la première syntaxe
// ajoutée, et c'est pire que pas d'aide du tout — on croit avoir compris et ça
// ne marche pas.
//
// Ouverture au clic (c'est le seul geste disponible au doigt) et, là où un vrai
// pointeur existe, au survol : sur un ordinateur on passe dessus sans intention
// de cliquer, et l'aide doit venir d'elle-même.
//
// ⚠ **Les deux gestes ne peuvent pas être le même état.** Au survol l'aide est
// déjà ouverte quand le clic arrive : un simple bascule la refermerait, et sur
// un ordinateur elle serait alors impossible à garder ouverte — elle
// disparaîtrait à l'instant où l'on ramène la souris vers le champ pour taper.
// D'où deux états distincts et un `open` qui s'en déduit : le survol l'ouvre le
// temps du survol, le clic l'**épingle** jusqu'au prochain clic (ou Échap).

// Le rendu à droite montre déjà ce que fait la syntaxe : la légende ne le
// répète pas, elle dit ce qui ne se voit pas — la touche qui continue la liste,
// les variantes du même motif.
const ROWS = [
  { code: "**gras**" },
  { code: "*italique*" },
  { code: "~~barré~~" },
  { code: "`code`",                        label: "à la machine" },
  { code: "# Titre",                       label: "## et ### pour deux crans plus petits" },
  { code: "- une puce",                    label: "Entrée en remet une, Tab imbrique" },
  { code: "1. une étape",                  label: "Entrée écrit la suivante" },
  { code: "[ ] à faire",                   label: "[x] une fois faite" },
  { code: "[un lien](https://exemple.fr)", label: "s'ouvre dans un nouvel onglet" },
];

export function SyntaxHelp({ size = 18 }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const [pinned, setPinned] = useState(false);   // clic : reste ouverte
  const [hovering, setHovering] = useState(false); // survol : le temps du survol
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const open = pinned || hovering;

  // Le panneau est en `fixed`, pas en `absolute` : les zones de texte vivent
  // dans des modales à défilement, et un panneau absolu s'y ferait couper au
  // bord. Il est donc ancré au bouton par ses coordonnées d'écran, et ramené
  // dans la fenêtre s'il déborde.
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    const below = r.bottom + 8;
    const fitsBelow = below + 340 < window.innerHeight;
    setPos({ left, width, top: fitsBelow ? below : undefined, bottom: fitsBelow ? undefined : window.innerHeight - r.top + 8 });
  }, []);

  // L'effet ne fait que **s'abonner** : la position, elle, se calcule au moment
  // où l'on ouvre (dans le gestionnaire) — la mesurer depuis un effet
  // déclencherait un second rendu à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    const shut = () => { setPinned(false); setHovering(false); };
    const close = (e) => { if (!btnRef.current?.contains(e.target)) shut(); };
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    // `true` : on écoute à la capture, sinon un clic dans une modale qui
    // arrête la propagation ne fermerait jamais le panneau.
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

  const hoverable = typeof window !== "undefined"
    && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

  return (
    <span
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      onMouseEnter={hoverable ? () => { place(); setHovering(true); } : undefined}
      onMouseLeave={hoverable ? () => setHovering(false) : undefined}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => { place(); setPinned(p => !p); }}
        aria-label="Syntaxe disponible"
        aria-expanded={open}
        title="Syntaxe disponible"
        style={{
          width: size, height: size, borderRadius: 999, padding: 0,
          border: `1px solid ${open ? c.accent : c.border}`,
          background: open ? c.accent + "1e" : "transparent",
          color: open ? c.accent : c.textMuted,
          fontSize: Math.round(size * 0.62), fontWeight: 700, lineHeight: 1,
          fontFamily: SANS, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >?</button>

      {open && pos && (
        <div
          role="tooltip"
          style={{
            position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom,
            width: pos.width, zIndex: Z.popoverHi,   // au-dessus des modales, sous les toasts
            background: c.modalBg, border: `1px solid ${c.borderStrong}`,
            borderRadius: RADIUS.card, padding: "12px 14px",
            boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            fontFamily: SANS, maxHeight: "min(340px, 70vh)", overflowY: "auto",
          }}
        >
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: c.textDim, marginBottom: 8,
          }}>Mise en forme</div>

          {ROWS.map(({ code, label }) => (
            <div key={code} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0" }}>
              <code style={{
                font: `600 11px ${MONO}`, color: c.textCard, background: c.control,
                borderRadius: 6, padding: "3px 6px", flexShrink: 0, maxWidth: "48%",
                overflowWrap: "anywhere",
              }}>{code}</code>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <RichText text={code} style={{ padding: 0, fontSize: 12 }} />
                {label && <span style={{ fontSize: 10.5, color: c.textDim, lineHeight: 1.35 }}>{label}</span>}
              </span>
            </div>
          ))}

          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.borderSubtle}`,
            fontSize: 10.5, color: c.textDim, lineHeight: 1.45,
          }}>
            Deux espaces en début de ligne — ou <strong style={{ color: c.textMuted }}>Tab</strong> —
            imbriquent une puce ; <strong style={{ color: c.textMuted }}>Entrée</strong> sur une puce
            vide sort de la liste.
          </div>
        </div>
      )}
    </span>
  );
}

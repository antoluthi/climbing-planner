import { useRef, useEffect, useCallback } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RichText } from "../RichText.jsx";
import { SANS, MONO } from "./Ascent.jsx";
import { Popover } from "./Popover.jsx";
import { usePopover } from "../../hooks/usePopover.js";

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
  const { anchorRef, open, rect, show, close } = usePopover();
  // Épinglé = ouvert par un clic, donc insensible au survol. En `ref` et non
  // en état : personne ne le lit pendant le rendu, et le passer en état
  // redessinerait le panneau à chaque aller-retour de souris.
  const pinned = useRef(false);
  const leaving = useRef(null);

  const shut = useCallback(() => { pinned.current = false; clearTimeout(leaving.current); close(); }, [close]);

  // Le panneau est **porté dans `<body>`** : il n'est plus un descendant du
  // bouton, donc aller dessus à la souris déclenche le `mouseleave` du bouton.
  // D'où ce délai de grâce, annulé dès qu'on entre dans le panneau — sans lui,
  // l'aide se refermerait au moment précis où l'on va la lire.
  const enter = () => { clearTimeout(leaving.current); if (!open) show(); };
  const leave = () => {
    clearTimeout(leaving.current);
    leaving.current = setTimeout(() => { if (!pinned.current) close(); }, 140);
  };
  useEffect(() => () => clearTimeout(leaving.current), []);

  // ⚠ Survol et clic ne peuvent pas être le même état. Sur un ordinateur
  // l'aide est déjà ouverte quand le clic arrive : une simple bascule la
  // refermerait, et elle serait impossible à garder ouverte — elle
  // disparaîtrait à l'instant où l'on ramène la souris vers le champ.
  const onClick = () => {
    clearTimeout(leaving.current);
    if (open && pinned.current) { pinned.current = false; close(); return; }
    pinned.current = true;
    if (!open) show();
  };

  const hoverable = typeof window !== "undefined"
    && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={onClick}
        onMouseEnter={hoverable ? enter : undefined}
        onMouseLeave={hoverable ? leave : undefined}
        aria-label="Syntaxe disponible"
        aria-expanded={open}
        title="Syntaxe disponible"
        style={{
          width: size, height: size, borderRadius: 999, padding: 0,
          border: `1px solid ${open ? c.accent : c.border}`,
          background: open ? c.accent + "1e" : "transparent",
          color: open ? c.accent : c.textMuted,
          fontSize: Math.round(size * 0.62), fontWeight: 700, lineHeight: 1,
          fontFamily: SANS, cursor: "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >?</button>

      {open && (
        <Popover
          anchorRef={anchorRef} rect={rect} onClose={shut}
          width={300} align="center" role="tooltip" label="Syntaxe disponible"
          onMouseEnter={hoverable ? enter : undefined}
          onMouseLeave={hoverable ? leave : undefined}
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
        </Popover>
      )}
    </>
  );
}

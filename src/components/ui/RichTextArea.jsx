import { useRef, useLayoutEffect } from "react";
import { handleEnter, handleTab } from "../../lib/rich-text.js";
import { SyntaxHelp } from "./SyntaxHelp.jsx";

// ─── LA ZONE DE TEXTE QUI TIENT LA LISTE À VOTRE PLACE ───────────────────────
// Un `<textarea>` ordinaire, plus deux touches qui savent ce qu'on est en train
// d'écrire :
//
//   · **Entrée** dans une liste continue la liste — même indentation, marqueur
//     suivant. Sur un élément vide, elle remonte d'un niveau, puis sort.
//   · **Tab / Maj+Tab** imbriquent et désimbriquent, *seulement* sur une ligne
//     de liste. Ailleurs, Tab garde son rôle : quitter le champ. Le voler en
//     permanence rendrait le formulaire impraticable au clavier.
//
// Toute la décision est dans `lib/rich-text.js`, pure et testée ; ici il ne
// reste que le branchement au DOM et la remise en place du curseur.
//
// ⚠ **Le curseur ne se replace pas tout seul.** La valeur appartient au parent :
// quand on la réécrit, React redessine le champ et le curseur retombe à la fin.
// On note donc où il doit aller et on l'y remet après le rendu — dans un
// `useLayoutEffect`, avant que le navigateur ne peigne, sinon le curseur
// clignote une image à la mauvaise place.

export function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  style,
  autoGrow = false,
  label,
  help = true,
  labelStyle,
  ariaLabel,
  onKeyDown: onKeyDownProp,
  ...rest
}) {
  const ref = useRef(null);
  const pending = useRef(null);

  const fit = (el) => {
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pending.current != null) {
      const { start, end } = pending.current;
      pending.current = null;
      el.setSelectionRange(start, end);
    }
    fit(el);
  });

  const apply = (next, start, end) => {
    pending.current = { start, end };
    onChange(next);
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    // Le parent garde la main sur tout ce qu'on n'intercepte pas — une modale
    // qui enregistre à Ctrl+Entrée, par exemple.
    const pass = () => onKeyDownProp?.(e);
    // Maj+Entrée reste un saut de ligne franc : c'est la sortie de secours
    // quand on veut écrire sous une puce sans en créer une autre.
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const r = handleEnter(el.value, el.selectionStart, el.selectionEnd);
      if (r) {
        e.preventDefault();
        apply(r.value, r.cursor, r.cursor);
        return;
      }
      return pass();
    }
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const r = handleTab(el.value, el.selectionStart, el.selectionEnd, e.shiftKey ? -1 : 1);
      if (r) {
        e.preventDefault();
        apply(r.value, r.selStart, r.selEnd);
        return;
      }
      return pass();
    }
    pass();
  };

  const field = (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel || label}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={autoGrow ? { ...style, resize: "none", overflow: "hidden", lineHeight: 1.45 } : style}
    />
  );

  if (!label && !help) return field;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: label ? 8 : 6 }}>
        {label && <span style={labelStyle}>{label}</span>}
        {help && <span style={{ marginLeft: label ? 0 : "auto" }}><SyntaxHelp /></span>}
      </div>
      {field}
    </>
  );
}

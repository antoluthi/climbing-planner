import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { handleEnter, handleTab, hasRichSyntax } from "../../lib/rich-text.js";
import { SyntaxHelp } from "./SyntaxHelp.jsx";
import { RichText } from "../RichText.jsx";

// ─── LA ZONE DE TEXTE QUI COMPREND CE QU'ON ÉCRIT ────────────────────────────
// Deux champs en un, et le second remplace le premier dès qu'il est prêt :
//
//   1. un `<textarea>` ordinaire, qui sait déjà continuer les listes (Entrée,
//      Tab) et montrer un aperçu du rendu sous lui ;
//   2. `RichEditor` (CodeMirror), qui **rend la syntaxe dans le champ**, sous
//      les doigts — le gras devient gras pendant qu'on l'écrit.
//
// **Pourquoi les deux.** CodeMirror est chargé à la demande, pour ne pas partir
// dans le paquet principal : il y a donc un instant, au premier champ ouvert
// d'une session, où il n'est pas encore là. Le `<textarea>` tient la place
// pendant ce temps — et resterait seul si le chargement échouait (hors ligne
// sur un onglet jamais visité). Un champ de notes doit s'ouvrir, toujours.
//
// La bascule **reprend le curseur** là où il était : sans ça, taper dans les
// premières millisecondes reviendrait à écrire dans un champ qui va disparaître.
//
// ⚠ **Le curseur ne se replace pas tout seul** (côté `<textarea>`). La valeur
// appartient au parent : quand on la réécrit, React redessine le champ et le
// curseur retombe à la fin. On note donc où il doit aller et on l'y remet dans
// un `useLayoutEffect`, avant que le navigateur ne peigne.

// Un seul chargement pour toute l'app, quel que soit le nombre de champs.
let editorPromise = null;
let EditorModule = null;
function loadEditor() {
  if (!editorPromise) {
    editorPromise = import("./RichEditor.jsx")
      .then(m => { EditorModule = m.default; return m.default; })
      .catch(() => null);          // on reste sur le textarea, sans bruit
  }
  return editorPromise;
}

export function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  style,
  autoGrow = false,
  label,
  help = true,
  preview = true,
  rich = true,
  labelStyle,
  ariaLabel,
  onKeyDown: onKeyDownProp,
  ...rest
}) {
  const ref = useRef(null);
  const pending = useRef(null);
  // ⚠ L'initialiseur est **paresseux**, et ce n'est pas un détail de style :
  // `useState(Composant)` prend la fonction pour un initialiseur et **appelle**
  // le composant, sans props. On stocke donc via `() => …`, des deux côtés —
  // ici et dans le `setEditor` du chargement.
  const [Editor, setEditor] = useState(() => (rich ? EditorModule : null));
  const [handoff, setHandoff] = useState(null);   // curseur repris du textarea

  useEffect(() => {
    if (!rich || Editor) return;
    let alive = true;
    loadEditor().then(mod => {
      if (!alive || !mod) return;
      const el = ref.current;
      // Le champ avait le focus : on dit à l'éditeur où reprendre.
      if (el && document.activeElement === el) setHandoff(el.selectionStart);
      setEditor(() => mod);
    });
    return () => { alive = false; };
  }, [rich, Editor]);

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

  // Le champ rendu par CodeMirror hérite du cadre du textarea (fond, bordure,
  // rayon) : les deux doivent se ressembler assez pour que la bascule ne se
  // voie pas. Ce qui ne s'applique qu'à un textarea est retiré.
  const boxed = (css = {}) => {
    const out = { ...css, overflow: "hidden", cursor: "text" };
    // Ce qui n'a de sens que sur un textarea : la poignée de redimensionnement
    // et la hauteur minimale, que l'éditeur reçoit par sa propre prop.
    delete out.resize;
    delete out.minHeight;
    return out;
  };

  const field = Editor ? (
    <Editor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={autoGrow ? 20 : (style?.minHeight ?? rows * 20)}
      autoFocusAt={handoff}
      style={boxed(style)}
    />
  ) : (
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

  // L'aperçu ne sert plus **que** tant que l'éditeur n'est pas là : une fois
  // la syntaxe rendue dans le champ, il en serait la copie inutile.
  const previewed = !Editor && preview && hasRichSyntax(value);
  const previewBlock = previewed && <PreviewBlock value={value} />;

  if (!label && !help) return previewed ? <>{field}{previewBlock}</> : field;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: label ? 8 : 6 }}>
        {label && <span style={labelStyle}>{label}</span>}
        {help && <span style={{ marginLeft: label ? 0 : "auto" }}><SyntaxHelp /></span>}
      </div>
      {field}
      {previewBlock}
    </>
  );
}

function PreviewBlock({ value }) {
  return (
    <div style={{ marginTop: 8 }}>
      <RichText text={value} style={{ padding: "4px 0 0" }} />
    </div>
  );
}

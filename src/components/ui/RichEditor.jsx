import { useRef, useEffect } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { livePreview } from "../../lib/rich-text-cm.js";
import { handleEnter, handleTab } from "../../lib/rich-text.js";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RICH_LINE } from "../../theme/makeStyles.js";

// ─── LE CHAMP QUI REND CE QU'ON Y ÉCRIT ──────────────────────────────────────
// Un `<textarea>` ne peut pas afficher de gras : son contenu est du texte brut.
// D'où CodeMirror, qui dessine son propre texte et sait donc le styliser sous
// les doigts. C'est le moteur d'Obsidian, et c'est aussi le seul qui tienne
// face à **Gboard** : la saisie prédictive d'Android réécrit le mot en cours
// par-dessus lui-même, ce qu'un éditeur `contentEditable` fait à la main et
// rate une fois sur trois.
//
// **Ce module est chargé à la demande** (`RichTextArea` l'importe
// dynamiquement) : il ne part pas dans le paquet principal, et l'accueil ne
// paie rien pour un champ de notes qu'on n'ouvrira peut-être pas.
//
// ⚠ **CodeMirror possède son texte, React non.** On ne lui repasse la valeur
// du parent que si elle diffère vraiment de ce qu'il affiche (une réouverture,
// un modèle chargé) — sinon chaque frappe déclencherait un remplacement complet
// du document et le curseur repartirait à la fin.

// Ce que doivent produire Entrée et Tab. La décision reste dans
// `lib/rich-text.js`, testée sous Node : ici on ne fait que la traduire en
// transaction CodeMirror, pour que le champ et l'aide disent la même chose.
function fromPure(fn) {
  return (view) => {
    const { state } = view;
    const text = state.doc.toString();
    const { from, to } = state.selection.main;
    const r = fn(text, from, to);
    if (!r) return false;                       // touche rendue au navigateur
    view.dispatch({
      changes: { from: 0, to: text.length, insert: r.value },
      selection: { anchor: r.cursor ?? r.selStart, head: r.cursor ?? r.selEnd },
      scrollIntoView: true,
    });
    return true;
  };
}

const richKeymap = [
  { key: "Enter", run: fromPure((t, a, b) => handleEnter(t, a, b)) },
  { key: "Tab", run: fromPure((t, a, b) => handleTab(t, a, b, 1)) },
  { key: "Shift-Tab", run: fromPure((t, a, b) => handleTab(t, a, b, -1)) },
];

function theme(isDark, minHeight) {
  const c = colors(isDark);
  return EditorView.theme({
    "&": {
      color: c.text, background: "transparent",
      fontSize: "13px", fontFamily: "inherit",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      padding: 0, minHeight: `${minHeight}px`,
      lineHeight: String(RICH_LINE), caretColor: c.accent,
      fontFamily: "inherit",
    },
    ".cm-line": { padding: 0 },
    ".cm-scroller": { fontFamily: "inherit", lineHeight: String(RICH_LINE) },
    ".cm-placeholder": { color: c.textDim },
    "&.cm-editor .cm-selectionBackground, & .cm-selectionBackground": { background: c.accent + "33" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: c.accent },

    // Les trois niveaux de titre : mêmes valeurs que `richH1/2/3` du rendu.
    ".cm-rt-h1": { fontSize: "16px", fontWeight: "800", letterSpacing: "-0.01em" },
    ".cm-rt-h2": { fontSize: "14px", fontWeight: "700" },
    ".cm-rt-h3": { fontSize: "12.5px", fontWeight: "700", color: c.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" },

    ".cm-rt-strong": { fontWeight: "700" },
    ".cm-rt-em": { fontStyle: "italic" },
    ".cm-rt-strike": { textDecoration: "line-through", opacity: "0.6" },
    ".cm-rt-code": { background: c.tint, borderRadius: "3px", padding: "1px 4px", fontSize: "0.9em" },
    ".cm-rt-link": { color: c.accent, textDecoration: "underline", textUnderlineOffset: "2px" },
    ".cm-rt-deadlink": { color: c.textMuted },
    ".cm-rt-bullet": { color: c.accent },
    ".cm-rt-ord": { color: c.accent, fontWeight: "700", fontVariantNumeric: "tabular-nums" },
    ".cm-rt-done": { textDecoration: "line-through", opacity: "0.5" },

    // La case à cocher : même boîte que celle du rendu (`richCheckbox`).
    ".cm-rt-box": {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: "13px", height: "13px", borderRadius: "3px",
      border: `1px solid ${c.border2}`, marginRight: "6px",
      fontSize: "9px", lineHeight: "1", verticalAlign: "middle",
    },
    ".cm-rt-box-done": { background: c.accent, borderColor: c.accent, color: c.onColor },
  }, { dark: isDark });
}

export default function RichEditor({
  value, onChange, placeholder = "", minHeight = 70, autoFocusAt = null, style,
}) {
  const { isDark } = useThemeCtx();
  const host = useRef(null);
  const view = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value ?? "",
        extensions: [
          history(),
          keymap.of([...richKeymap, ...historyKeymap, ...defaultKeymap]),
          EditorView.lineWrapping,
          livePreview,
          cmPlaceholder(placeholder),
          theme(isDark, minHeight),
          EditorView.updateListener.of(u => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (autoFocusAt != null) {
      v.focus();
      const at = Math.min(autoFocusAt, v.state.doc.length);
      v.dispatch({ selection: { anchor: at, head: at } });
    }
    return () => { v.destroy(); view.current = null; };
    // Le thème et le gabarit sont figés à la construction : les rejouer
    // reconstruirait l'éditeur à chaque rendu du parent. Le thème change au
    // plus une fois par bascule clair/sombre, traitée juste en dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // La valeur vient du parent quand elle change **ailleurs** qu'ici (un modèle
  // chargé, une réouverture). La comparaison au document évite de réécrire ce
  // que l'utilisateur vient de taper.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (value != null && value !== current) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} style={style} />;
}

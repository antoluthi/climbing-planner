import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { parseItem, indentWidth, safeHref } from "./rich-text.js";

// ─── LA SYNTAXE RENDUE SOUS LES DOIGTS ───────────────────────────────────────
// L'extension CodeMirror qui fait qu'un `**gras**` devient du gras **pendant**
// qu'on l'écrit, au lieu d'attendre l'enregistrement.
//
// Le principe est celui d'Obsidian, et il tient en une phrase : **la ligne où
// se trouve le curseur reste en clair, les autres sont rendues.** C'est ce qui
// permet de corriger une étoile — sur une ligne entièrement rendue, les
// marqueurs sont invisibles et on ne peut plus les atteindre.
//
// ⚠ **Les motifs sont ceux de `rich-text.js` et de `RichText.jsx`, pas ceux de
// Markdown.** On n'installe pas l'analyseur markdown de CodeMirror exprès :
// il connaît des syntaxes que l'app ne rend pas (tableaux, citations, HTML) et
// il les styliserait ici sans que la lecture, elle, en tienne compte. Une
// quatrième idée de ce qu'est la syntaxe, en plus des trois qui se lisent déjà
// ensemble, finirait par les contredire. `parseItem` est donc la même fonction
// des deux côtés, et les motifs en ligne sont recopiés dans le même ordre —
// gras avant italique, pour la même raison qu'au rendu.

const INLINE = [
  { re: /\*\*(.+?)\*\*/g, cls: "cm-rt-strong", open: 2, close: 2 },
  { re: /~~(.+?)~~/g,     cls: "cm-rt-strike", open: 2, close: 2 },
  { re: /\*([^*\n]+)\*/g, cls: "cm-rt-em",     open: 1, close: 1 },
  { re: /`(.+?)`/g,       cls: "cm-rt-code",   open: 1, close: 1 },
];
const LINK = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const HEADING = /^(#{1,3})([ \t]+)(?=\S)/;
const BULLETS = ["•", "◦", "▪", "▪"];
const MAX_LEVEL = 3;

// Un marqueur remplacé par son symbole. `eq` évite de redessiner le nœud à
// chaque frappe : sans elle, CodeMirror recrée le DOM et le curseur saute.
class SymbolWidget extends WidgetType {
  constructor(text, cls) { super(); this.text = text; this.cls = cls; }
  eq(other) { return other.text === this.text && other.cls === this.cls; }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.cls;
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return false; }
}

const hidden = Decoration.replace({});

function decorate(view) {
  const deco = [];
  const { state } = view;

  // Les lignes que le curseur touche : elles restent en clair. Une sélection
  // qui court sur plusieurs lignes les découvre toutes — on est en train de
  // les manipuler.
  const live = new Set();
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number;
    const to = state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) live.add(n);
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      if (line.length) decorateLine(deco, line, live.has(line.number));
      pos = line.to + 1;
    }
  }
  // `true` : la liste est triée par CodeMirror, qui exige un ordre strict.
  return Decoration.set(deco, true);
}

function decorateLine(deco, line, isLive) {
  const text = line.text;
  let contentFrom = line.from;        // début du texte utile (après le marqueur)

  const h = HEADING.exec(text);
  if (h) {
    deco.push(Decoration.line({ class: `cm-rt-h${h[1].length}` }).range(line.from));
    contentFrom = line.from + h[0].length;
    if (!isLive) deco.push(hidden.range(line.from, contentFrom));
  } else {
    const item = parseItem(text);
    if (item) {
      const level = Math.min(MAX_LEVEL, Math.floor(indentWidth(item.indent) / 2));
      const markFrom = line.from + item.indent.length;
      const markTo = markFrom + item.marker.length + item.gap.length;
      contentFrom = markTo;
      // L'indentation est portée par la ligne, pas par des espaces rendus :
      // remplacer « - » par « • » change la largeur, et un décalage calculé en
      // caractères se mettrait à respirer d'un niveau à l'autre.
      deco.push(Decoration.line({
        class: "cm-rt-li",
        attributes: { style: `padding-left:${level * 14}px` },
      }).range(line.from));

      if (item.checkbox) {
        const done = item.marker.toLowerCase() === "[x]";
        deco.push(Decoration.replace({
          widget: new SymbolWidget(done ? "✓" : "", `cm-rt-box${done ? " cm-rt-box-done" : ""}`),
        }).range(markFrom, markTo));
        if (done) deco.push(Decoration.mark({ class: "cm-rt-done" }).range(markTo, line.to));
      } else if (item.ordered) {
        deco.push(Decoration.mark({ class: "cm-rt-ord" }).range(markFrom, markTo));
      } else if (!isLive) {
        deco.push(Decoration.replace({
          widget: new SymbolWidget(BULLETS[level] + " ", "cm-rt-bullet"),
        }).range(markFrom, markTo));
      } else {
        deco.push(Decoration.mark({ class: "cm-rt-ord" }).range(markFrom, markTo));
      }
    }
  }

  inlineDecorations(deco, text, line.from, contentFrom, isLive);
}

function inlineDecorations(deco, text, lineFrom, contentFrom, isLive) {
  const offset = contentFrom - lineFrom;
  const body = text.slice(offset);
  const taken = [];                    // plages déjà prises : on ne superpose pas
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);

  const push = (a, b, openLen, closeLen, cls) => {
    taken.push([a, b]);
    const from = contentFrom + a, to = contentFrom + b;
    deco.push(Decoration.mark({ class: cls }).range(from + openLen, to - closeLen));
    if (!isLive) {
      deco.push(hidden.range(from, from + openLen));
      deco.push(hidden.range(to - closeLen, to));
    }
  };

  // Même ordre qu'au rendu : le gras est cherché avant l'italique, sans quoi
  // « **gras** » se lirait comme une italique vide suivie d'une autre.
  for (const { re, cls, open, close } of INLINE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      const a = m.index, b = a + m[0].length;
      if (free(a, b)) push(a, b, open, close, cls);
    }
  }

  LINK.lastIndex = 0;
  let m;
  while ((m = LINK.exec(body))) {
    const a = m.index, b = a + m[0].length;
    if (!free(a, b)) continue;
    taken.push([a, b]);
    const from = contentFrom + a, to = contentFrom + b;
    const labelFrom = from + 1, labelTo = labelFrom + m[1].length;
    // Une adresse refusée par `safeHref` n'est pas mise en avant comme un
    // lien : la même règle qu'au rendu, où elle s'affiche en clair.
    deco.push(Decoration.mark({ class: safeHref(m[2]) ? "cm-rt-link" : "cm-rt-deadlink" })
      .range(labelFrom, labelTo));
    if (!isLive) {
      deco.push(hidden.range(from, labelFrom));
      deco.push(hidden.range(labelTo, to));
    }
  }
}

export const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = decorate(view); }
    update(u) {
      // La sélection compte autant que le texte : c'est elle qui découvre la
      // ligne courante.
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = decorate(u.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

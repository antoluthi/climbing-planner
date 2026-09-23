// ─── ÉCRIRE EN LISTE SANS Y PENSER ───────────────────────────────────────────
// Ce qui rend une note pénible à taire au pouce, ce n'est pas la syntaxe : c'est
// de la retaper. Un tiret, un espace, puis un tiret et un espace à chaque ligne,
// et deux espaces de plus pour une sous-puce. Ces fonctions font ce travail à la
// place de l'utilisateur — elles décrivent ce que la touche Entrée et la touche
// Tab doivent produire dans une zone de texte.
//
// Elles sont **pures** : elles prennent le texte et la position du curseur, et
// rendent le nouveau texte et la nouvelle position. Aucun DOM, donc testables
// sous Node — et c'est ce qui permet de vérifier les cas tordus (curseur au
// milieu d'une ligne, sélection, liste imbriquée) sans ouvrir un navigateur.

// Un élément de liste : indentation, marqueur, contenu.
// Marqueurs reconnus : « - » et « * » (puce), « 1. » et « 1) » (numérotée),
// « [ ] » et « [x] » (case à cocher).
const ITEM_RE = /^([ \t]*)(-|\*|\d+[.)]|\[[ xX]\])([ \t]+)(.*)$/;

// Deux espaces par niveau : c'est ce qu'écrit la touche Tab, et ce que lit le
// rendu (components/RichText.jsx). Une tabulation en vaut autant.
export const INDENT = "  ";

export function parseItem(line) {
  const m = ITEM_RE.exec(line ?? "");
  if (!m) return null;
  const [, indent, marker, gap, content] = m;
  const ordered = /^\d/.test(marker);
  return {
    indent, marker, gap, content, ordered,
    number: ordered ? parseInt(marker, 10) : null,
    checkbox: marker.startsWith("["),
  };
}

// Largeur d'une indentation, tabulation comptée comme deux espaces.
export function indentWidth(indent) {
  let w = 0;
  for (const ch of indent || "") w += ch === "\t" ? 2 : 1;
  return w;
}

// Bornes de la ligne qui contient `pos`.
function lineBounds(value, pos) {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  const nl = value.indexOf("\n", pos);
  return { start, end: nl === -1 ? value.length : nl };
}

// Le marqueur qui suit : une puce reste la même, une numérotée s'incrémente,
// une case à cocher repart **vide** — on ne recopie pas une tâche déjà faite.
function nextMarker(item) {
  if (item.ordered) {
    const sep = item.marker.slice(-1);      // « . » ou « ) », on garde le sien
    return `${item.number + 1}${sep}`;
  }
  if (item.checkbox) return "[ ]";
  return item.marker;
}

/**
 * Ce que la touche Entrée doit produire. Renvoie `null` quand il n'y a rien de
 * particulier à faire — l'appelant laisse alors le navigateur insérer son saut
 * de ligne, ce qui est le cas le plus fréquent.
 *
 * Trois comportements, dans l'ordre où ils se présentent à l'usage :
 *   · dans un élément **non vide** → nouvelle ligne, même indentation, marqueur
 *     suivant ;
 *   · dans un élément **vide** et indenté → on remonte d'un niveau, la liste
 *     continue ;
 *   · dans un élément **vide** au premier niveau → on sort de la liste (la
 *     ligne est vidée). C'est la façon habituelle de terminer une liste : deux
 *     Entrée.
 */
export function handleEnter(value, selStart, selEnd = selStart) {
  if (selStart !== selEnd) return null;          // une sélection : geste normal
  const { start, end } = lineBounds(value, selStart);
  const line = value.slice(start, end);
  const item = parseItem(line);
  if (!item) return null;

  // Le curseur est dans le marqueur lui-même (avant le contenu) : rien à
  // continuer, on coupe la ligne comme n'importe où ailleurs.
  const contentStart = start + item.indent.length + item.marker.length + item.gap.length;
  if (selStart < contentStart) return null;

  if (item.content.trim() === "") {
    if (indentWidth(item.indent) > 0) {
      const outdented = item.indent.slice(0, -INDENT.length) + item.marker + item.gap;
      return {
        value: value.slice(0, start) + outdented + value.slice(end),
        cursor: start + outdented.length,
      };
    }
    // Sortie de liste : la ligne vide reste vide, le curseur y retombe.
    return { value: value.slice(0, start) + value.slice(end), cursor: start };
  }

  const inserted = "\n" + item.indent + nextMarker(item) + " ";
  return {
    value: value.slice(0, selStart) + inserted + value.slice(selStart),
    cursor: selStart + inserted.length,
  };
}

/**
 * Ce que Tab (dir = 1) et Maj+Tab (dir = −1) doivent produire, sur la ligne du
 * curseur ou sur toutes les lignes de la sélection.
 *
 * Renvoie `null` si **aucune** ligne concernée n'est un élément de liste : la
 * touche Tab garde alors son rôle normal, qui est de quitter le champ. Voler
 * Tab en permanence rendrait le formulaire impossible à parcourir au clavier.
 */
export function handleTab(value, selStart, selEnd, dir) {
  const first = lineBounds(value, selStart).start;
  const last = lineBounds(value, selEnd).end;
  const lines = value.slice(first, last).split("\n");
  if (!lines.some(l => parseItem(l))) return null;

  let delta = 0;         // décalage appliqué à la première ligne
  let total = 0;         // décalage cumulé, pour la fin de sélection
  const next = lines.map((line, i) => {
    const item = parseItem(line);
    if (!item) return line;
    let out;
    if (dir > 0) {
      out = INDENT + line;
    } else {
      if (indentWidth(item.indent) === 0) return line;
      // Retirer un niveau, quelle que soit la forme de l'indentation reçue :
      // une tabulation collée depuis ailleurs vaut deux espaces.
      const kept = item.indent.replace(/\t/g, INDENT).slice(INDENT.length);
      out = kept + line.slice(item.indent.length);
    }
    const d = out.length - line.length;
    if (i === 0) delta = d;
    total += d;
    return out;
  });

  return {
    value: value.slice(0, first) + next.join("\n") + value.slice(last),
    selStart: Math.max(first, selStart + delta),
    selEnd: Math.max(first, selEnd + total),
  };
}

// Un lien n'est suivi que s'il mène quelque part d'inoffensif. `javascript:` et
// `data:` sont les deux façons classiques de faire exécuter du code par un
// texte que quelqu'un d'autre a écrit — et le planning d'un athlète est écrit
// par son coach. Une adresse refusée n'est pas jetée : le rendu l'affiche en
// clair, sans en faire un lien.
export function safeHref(raw) {
  const url = String(raw ?? "").trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return "https://" + url;
  return null;
}

// Y a-t-il, dans ce texte, quelque chose que le rendu afficherait autrement ?
// C'est ce qui décide de montrer un aperçu : sur une note écrite en prose, il
// serait la copie conforme du champ juste au-dessus — du bruit, et de la
// hauteur prise pour rien sur un téléphone.
const INLINE_RE = /\*\*[^\n]+\*\*|~~[^\n]+~~|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/;
export function hasRichSyntax(text) {
  const value = String(text ?? "");
  if (!value.trim()) return false;
  if (INLINE_RE.test(value)) return true;
  return value.split("\n").some(line =>
    /^\s*#{1,3}\s+\S/.test(line) || parseItem(line) !== null);
}

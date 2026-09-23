import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors } from "../theme/palette.js";
import { parseItem, indentWidth, safeHref } from "../lib/rich-text.js";

// ─── RENDU DU TEXTE ÉCRIT À LA MAIN ──────────────────────────────────────────
// Une note de séance, un objectif de cycle, un retour : tout ce qui se tape
// dans l'app passe par ici. La syntaxe est celle d'Obsidian, réduite à ce qui
// sert — il n'y a pas de tableaux ni de notes de bas de page dans un carnet
// d'entraînement.
//
//   # ## ###        titres (trois niveaux)
//   **gras**  *italique*  ~~barré~~  `code`
//   - puce          (deux espaces de plus = sous-puce, jusqu'à trois niveaux)
//   1. numérotée
//   [ ] / [x]       case à cocher
//   [texte](url)    lien  ·  ![alt](url)  image
//
// Le pendant côté saisie est `lib/rich-text.js` (Entrée et Tab), et l'aide
// affichée à l'utilisateur est `ui/SyntaxHelp.jsx`. **Les trois se lisent
// ensemble** : ajouter une syntaxe ici sans l'ajouter à l'aide la rend
// invisible, et l'ajouter à l'aide sans la rendre ici la rend menteuse.

const MAX_LEVEL = 3;
const BULLETS = ["•", "◦", "▪", "▪"];

export function RichText({ text, onCheckToggle, style }) {
  const { styles, isDark } = useThemeCtx();
  if (!text?.trim()) return null;

  const lines = text.split("\n");

  return (
    <div style={{ ...styles.richText, ...style }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // ── Titres ──
        const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
        if (h) {
          const style = [styles.richH1, styles.richH2, styles.richH3][h[1].length - 1];
          return <div key={i} style={style}>{renderInline(h[2], styles)}</div>;
        }

        // ── Éléments de liste (puce, numérotée, case à cocher) ──
        // `parseItem` est la même fonction que celle qui décide de la touche
        // Entrée : ce qui se continue tout seul se rend forcément pareil.
        const item = parseItem(line);
        if (item) {
          const level = Math.min(MAX_LEVEL, Math.floor(indentWidth(item.indent) / 2));
          const pad = { paddingLeft: level * 14 };

          // Obsidian écrit « - [ ] tâche » ; l'app a longtemps écrit « [ ] tâche ».
          // Les deux marchent, et la seconde reste ce qu'on produit.
          const inner = parseItem(item.content);
          const box = item.checkbox ? item : (inner?.checkbox ? inner : null);
          if (box) {
            const done = box.marker.toLowerCase() === "[x]";
            return (
              <div key={i} style={{ ...styles.richLi, ...pad }}>
                <div
                  style={{ ...styles.richCheckbox, ...(done ? styles.richCheckboxDone : {}) }}
                  onClick={() => onCheckToggle?.(i, !done)}
                >
                  {done && <span style={{ fontSize: 9, color: colors(isDark).onColor }}>✓</span>}
                </div>
                <span style={done ? { textDecoration: "line-through", opacity: 0.5 } : {}}>
                  {renderInline(box.content, styles)}
                </span>
              </div>
            );
          }

          return (
            <div key={i} style={{ ...styles.richLi, ...pad }}>
              {item.ordered
                ? <span style={styles.richOrd}>{item.marker}</span>
                : <span style={styles.richBullet}>{BULLETS[level]}</span>}
              <span>{renderInline(item.content, styles)}</span>
            </div>
          );
        }

        // ── Image ──
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          const src = safeHref(imgMatch[2]);
          if (src) return <img key={i} src={src} alt={imgMatch[1]} style={styles.richImg} />;
        }

        // Ligne vide → respiration
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;

        return <div key={i}>{renderInline(trimmed, styles)}</div>;
      })}
    </div>
  );
}

function renderInline(text, styles) {
  const parts = [];
  let rest = text;
  // ⚠ L'ordre compte : le gras est cherché **avant** l'italique. Sur
  // « **gras** », les deux motifs peuvent mordre, et c'est le premier de la
  // liste qui gagne à position égale (comparaison stricte plus bas).
  const patterns = [
    { re: /\*\*(.+?)\*\*/, render: (m, i) => <strong key={i}>{m[1]}</strong> },
    { re: /~~(.+?)~~/, render: (m, i) => <span key={i} style={{ textDecoration: "line-through", opacity: 0.6 }}>{m[1]}</span> },
    { re: /\*([^*\n]+)\*/, render: (m, i) => <em key={i}>{m[1]}</em> },
    { re: /`(.+?)`/, render: (m, i) => <code key={i} style={{ background: styles.c.tint, padding: "1px 4px", borderRadius: 3, fontSize: "0.9em" }}>{m[1]}</code> },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m, i) => {
        const href = safeHref(m[2]);
        if (!href) return <span key={i}>{m[1]}</span>;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={styles.richLink}>
            {m[1]}
          </a>
        );
      },
    },
  ];
  let key = 0;
  while (rest) {
    let earliest = null, match = null, renderer = null;
    for (const { re, render } of patterns) {
      const m = rest.match(re);
      if (m && (earliest === null || m.index < earliest)) {
        earliest = m.index;
        match = m;
        renderer = render;
      }
    }
    if (match === null) { parts.push(rest); break; }
    if (match.index > 0) parts.push(rest.slice(0, match.index));
    parts.push(renderer(match, key++));
    rest = rest.slice(match.index + match[0].length);
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

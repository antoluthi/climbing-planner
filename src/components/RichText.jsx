import { useThemeCtx } from "../theme/ThemeContext.jsx";

export function RichText({ text, onCheckToggle }) {
  const { styles } = useThemeCtx();
  if (!text?.trim()) return null;

  const lines = text.split("\n");

  return (
    <div style={styles.richText}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Checkbox
        const cbDone = trimmed.startsWith("[x] ") || trimmed.startsWith("[X] ");
        const cbOpen = trimmed.startsWith("[ ] ");
        if (cbDone || cbOpen) {
          const content = trimmed.slice(4);
          return (
            <div key={i} style={styles.richLi}>
              <div
                style={{ ...styles.richCheckbox, ...(cbDone ? styles.richCheckboxDone : {}) }}
                onClick={() => onCheckToggle?.(i, !cbDone)}
              >
                {cbDone && <span style={{ fontSize: 9, color: "#fff" }}>✓</span>}
              </div>
              <span style={cbDone ? { textDecoration: "line-through", opacity: 0.5 } : {}}>{renderInline(content, styles)}</span>
            </div>
          );
        }

        // Bullet
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          return (
            <div key={i} style={styles.richLi}>
              <span style={styles.richBullet}>•</span>
              <span>{renderInline(trimmed.slice(2), styles)}</span>
            </div>
          );
        }

        // Image
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={styles.richImg} />;
        }

        // Empty line → spacer
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;

        return <div key={i}>{renderInline(trimmed, styles)}</div>;
      })}
    </div>
  );
}

function renderInline(text, styles) {
  const parts = [];
  let rest = text;
  const patterns = [
    { re: /\*\*(.+?)\*\*/, render: (m, i) => <strong key={i}>{m[1]}</strong> },
    { re: /`(.+?)`/, render: (m, i) => <code key={i} style={{ background: "#ffffff15", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em" }}>{m[1]}</code> },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m, i) => <a key={i} href={m[2]} target="_blank" rel="noopener" style={styles.richLink}>{m[1]}</a> },
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

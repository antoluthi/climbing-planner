import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS } from "../../theme/makeStyles.js";

// ─── BUTTON ───────────────────────────────────────────────────────────────────
// Composant bouton unifié. Variantes : primary, secondary, ghost, danger.
// Tailles : sm, md, lg.

const SIZE_STYLES = {
  sm: { padding: "5px 12px", fontSize: 11, borderRadius: RADIUS.pill },
  md: { padding: "8px 16px", fontSize: 13, borderRadius: RADIUS.pill },
  lg: { padding: "11px 22px", fontSize: 14, borderRadius: RADIUS.pill },
};

export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  fullWidth = false,
  type = "button",
  onClick,
  children,
  style: extraStyle,
  ...rest
}) {
  const { isDark } = useThemeCtx();

  const accent     = colors(isDark).accent;
  const ink        = colors(isDark).text;
  const paper      = colors(isDark).card;
  const border     = colors(isDark).border;
  const textMid    = colors(isDark).textCard;
  const dangerBg   = colors(isDark).danger;
  const ghostHover = colors(isDark).surface;

  const sz = SIZE_STYLES[size] || SIZE_STYLES.md;

  let palette;
  switch (variant) {
    case "primary":
      palette = { background: ink, color: isDark ? paper : colors(isDark).onColor, border: "none", hover: "brightness(1.08)" };
      break;
    case "secondary":
      palette = { background: "transparent", color: ink, border: `1px solid ${border}`, hover: "brightness(0.96)" };
      break;
    case "ghost":
      palette = { background: "transparent", color: textMid, border: "none", hoverBg: ghostHover };
      break;
    case "danger":
      palette = { background: dangerBg, color: colors(isDark).onColor, border: "none", hover: "brightness(1.08)" };
      break;
    case "accent":
      palette = { background: accent, color: colors(isDark).onColor, border: "none", hover: "brightness(1.08)" };
      break;
    default:
      palette = { background: ink, color: isDark ? paper : colors(isDark).onColor, border: "none" };
  }

  const style = {
    ...sz,
    background: palette.background,
    color: palette.color,
    border: palette.border,
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? "100%" : undefined,
    transition: "filter 0.12s, background 0.12s, border-color 0.12s",
    lineHeight: 1.2,
    ...extraStyle,
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
      onMouseEnter={e => {
        if (disabled) return;
        if (palette.hover) e.currentTarget.style.filter = palette.hover;
        if (palette.hoverBg) e.currentTarget.style.background = palette.hoverBg;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.filter = "none";
        if (palette.hoverBg) e.currentTarget.style.background = palette.background;
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

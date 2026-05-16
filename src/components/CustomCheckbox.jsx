// ─── CUSTOM CHECKBOX ─────────────────────────────────────────────────────────
// Theme-aware checkbox replacement. Uses a styled div so no browser defaults.

export function CustomCheckbox({ checked, onChange, isDark, accent, size = 16 }) {
  const borderColor = checked
    ? accent
    : (isDark ? "#a89a82" : "#c4b69c");
  const bg = checked ? accent : "transparent";

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(); } }}
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        border: `2px solid ${borderColor}`,
        background: bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
        outline: "none",
        boxSizing: "border-box",
      }}
      onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}44`; }}
      onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {checked && (
        <svg width={size * 0.6} height={size * 0.5} viewBox="0 0 10 8" fill="none" style={{ display: "block" }}>
          <path d="M1 4L3.5 6.5L9 1" stroke={isDark ? "#15100b" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

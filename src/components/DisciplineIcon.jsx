// ─── DISCIPLINE ICON ─────────────────────────────────────────────────────────
// Pictogrammes SVG monoligne minimalistes, sans remplissage.
// viewBox 24×24, stroke-linecap/linejoin round.

const ICONS = {
  climbing: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19 L9 9 L13 14 L17 6 L21 19 Z" />
      <circle cx="17" cy="6" r="1.2" fill="currentColor" stroke="none" />
    </g>
  ),
  running: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="15" cy="5" r="2" fill="currentColor" stroke="none" />
      <path d="M6 20 L10 14 L14 13 L17 17" />
      <path d="M10 14 L13 9 L17 11" />
      <path d="M3 10 L7 11" />
    </g>
  ),
  cycling: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6"  cy="17" r="3.5" />
      <circle cx="18" cy="17" r="3.5" />
      <path d="M6 17 L11 9 L15 9 L18 17" />
      <path d="M11 9 L14 17" />
    </g>
  ),
  strength: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12 L21 12" />
      <path d="M3 8 L3 16" />
      <path d="M6 5 L6 19" />
      <path d="M18 5 L18 19" />
      <path d="M21 8 L21 16" />
    </g>
  ),
  mobility: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 7 L12 14" />
      <path d="M6 10 L18 10" />
      <path d="M12 14 L8 21" />
      <path d="M12 14 L16 21" />
    </g>
  ),
  event: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21 L5 3" />
      <path d="M5 3 L18 3 L16 8 L18 13 L5 13" />
    </g>
  ),
  custom: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 L12 20" />
      <path d="M4 12 L20 12" />
      <path d="M6 6 L18 18" />
      <path d="M6 18 L18 6" />
    </g>
  ),
};

export function DisciplineIcon({ id = "custom", size = 20, color }) {
  const icon = ICONS[id] || ICONS.custom;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color: color || "currentColor", flexShrink: 0 }}
    >
      {icon}
    </svg>
  );
}

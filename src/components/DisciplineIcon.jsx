// ─── DISCIPLINE ICON ─────────────────────────────────────────────────────────
// Pictogrammes SVG monoligne lisibles à 16px. viewBox 24x24,
// stroke-linecap/linejoin round. Un accent rempli par icône.

const ICONS = {
  // Trois sommets de montagne avec un point au pic le plus haut.
  climbing: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 21 L7 11 L11 16 L15 7 L18 13 L22 21 Z" />
      <circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
    </g>
  ),

  // Coureur de profil, jambe avant + arrière, bras balancés.
  running: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="15" cy="4" r="2" fill="currentColor" stroke="none" />
      <path d="M14 6 L11 14" />
      <path d="M11 9 L17 11" />
      <path d="M11 9 L7 6" />
      <path d="M11 14 L16 18" />
      <path d="M11 14 L8 20" />
      <path d="M3 21 L6.5 21" />
    </g>
  ),

  // Vélo : deux roues + cadre triangulaire + selle + guidon.
  cycling: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6"  cy="18" r="3.2" />
      <circle cx="18" cy="18" r="3.2" />
      <path d="M6 18 L11 9 L18 18" />
      <path d="M11 9 L14 6" />
      <path d="M12 6 L16 6" />
      <path d="M11 9 L16 9" />
    </g>
  ),

  // Haltère longue : barre + 2 plaques par côté + caps.
  strength: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12 L21 12" />
      <path d="M3 10 L3 14" />
      <path d="M5 7  L5 17" />
      <path d="M8 9  L8 15" />
      <path d="M16 9 L16 15" />
      <path d="M19 7 L19 17" />
      <path d="M21 10 L21 14" />
    </g>
  ),

  // Yoga / mobilité : personnage bras levés en V, jambes écartées.
  mobility: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 6 L12 14" />
      <path d="M12 8 L7 3" />
      <path d="M12 8 L17 3" />
      <path d="M12 14 L8 21" />
      <path d="M12 14 L16 21" />
    </g>
  ),

  // Drapeau sur mât.
  event: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21 L5 3" />
      <path d="M5 3 L17 4 L14 8 L17 12 L5 12 Z" />
    </g>
  ),

  // "Autre" : trois points horizontaux.
  custom: (
    <g fill="currentColor" stroke="none">
      <circle cx="5"  cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
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

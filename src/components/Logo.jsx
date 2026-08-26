import { colors } from "../theme/palette.js";

// La marque « Charge » — trois semaines qui montent, une qui décharge. Même
// géométrie que l'icône de l'app : `public/logo.svg` en est la référence
// (viewBox 1024). Ici la boîte est rognée sur les barres pour que la marque
// remplisse la taille demandée, et les couleurs viennent de la palette : sur
// fond clair les barres sont noires, sur fond sombre blanches.
export function ClimbingPlannerLogo({ isDark, size = 36 }) {
  const ink    = colors(isDark).text;
  const accent = colors(isDark).accent;
  const bars = [
    { x: 204.0, y: 538.4, h: 193.6 },
    { x: 371.2, y: 424.0, h: 308.0 },
    { x: 538.4, y: 292.0, h: 440.0, peak: true },
    { x: 705.6, y: 564.8, h: 167.2 },
  ];
  return (
    <svg
      viewBox="196 284 632 456"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      {bars.map(b => (
        <rect
          key={b.x}
          x={b.x} y={b.y} width={114.4} height={b.h} rx={28.6}
          fill={b.peak ? accent : ink}
          opacity={b.peak ? 1 : 0.9}
        />
      ))}
    </svg>
  );
}

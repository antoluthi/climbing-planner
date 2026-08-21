import { useRef } from "react";

// ─── SWIPE HORIZONTAL ─────────────────────────────────────────────────────────
// Détecte un balayage gauche/droite au doigt. Deux niveaux s'en servent :
//   - la page, pour passer d'un onglet à l'autre ;
//   - la grille du calendrier, pour changer de période.
// La grille étant *dans* la page, elle passe `stopPropagation: true` : son geste
// ne remonte pas jusqu'au conteneur de page, sinon un swipe sur le calendrier
// changerait aussi d'onglet.
//
// `threshold` : distance minimale en px. `ratio` : combien le déplacement
// horizontal doit dominer le vertical, pour ne pas capturer un scroll.

export function useSwipe({ onLeft, onRight, threshold = 60, ratio = 1.5, stopPropagation = false } = {}) {
  const start = useRef(null);

  return {
    onTouchStart: (e) => {
      if (stopPropagation) e.stopPropagation();
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchMove: stopPropagation ? (e) => e.stopPropagation() : undefined,
    onTouchEnd: (e) => {
      if (stopPropagation) e.stopPropagation();
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * ratio) return;
      if (dx < 0) onLeft?.();
      else onRight?.();
    },
  };
}

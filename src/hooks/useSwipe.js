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
//
// ⚠️ Un second doigt fait du geste un pincement (le zoom de la grille horaire),
// jamais un balayage. Sans cette garde, le second `touchstart` remplaçait le
// point de départ, et le doigt levé en premier pouvait se trouver à plus de
// 60 px de lui : un pincement changeait de semaine.

export function useSwipe({ onLeft, onRight, threshold = 60, ratio = 1.5, stopPropagation = false } = {}) {
  const start = useRef(null);

  return {
    onTouchStart: (e) => {
      if (stopPropagation) e.stopPropagation();
      if (e.touches.length > 1) { start.current = { multi: true }; return; }
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchMove: stopPropagation ? (e) => e.stopPropagation() : undefined,
    onTouchEnd: (e) => {
      if (stopPropagation) e.stopPropagation();
      if (!start.current) return;
      // Abandonné jusqu'à ce que le dernier doigt se lève.
      if (start.current.multi) { if (e.touches.length === 0) start.current = null; return; }
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

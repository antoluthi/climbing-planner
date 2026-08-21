import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { hasOpenLayers } from "../../lib/native.js";

// ─── CARROUSEL DE PAGES ───────────────────────────────────────────────────────
// Navigation entre onglets au doigt : la page suit la main, on voit la suivante
// arriver, et on relâche pour terminer (ou revenir). Trois calques au plus —
// précédent, courant, suivant — superposés en absolu ; seul le courant est monté
// au repos, les voisins n'apparaissent que le temps du geste.
//
// Deux points à ne pas perdre de vue en modifiant ce fichier :
//
//  1. **`transform` et `position: fixed`** — un `transform` sur un ancêtre fait
//     que ses descendants `fixed` se positionnent par rapport à lui. Les vues
//     rendent leurs modales à l'intérieur : au repos, le calque courant doit
//     donc être en `transform: none`, jamais en `translate3d(0,0,0)`. Le
//     transform n'existe que pendant le geste et son animation de fin — moment
//     où aucune modale ne peut être ouverte (voir `enabled` / `hasOpenLayers`).
//  2. **React n'écrit pas le transform** : il est piloté ici, à la main, dans
//     `place()`. Le mettre aussi en style inline ferait que React, croyant la
//     valeur inchangée d'un rendu à l'autre, laisserait en place un transform
//     périmé.

const WAKE            = 4;     // px : on monte les voisins dès que ça part de côté
const AXIS_LOCK       = 10;    // px : distance avant de trancher l'axe du geste
const AXIS_RATIO      = 1.2;   // dominance horizontale exigée
const COMMIT_RATIO    = 0.25;  // part de la largeur au-delà de laquelle on valide
const COMMIT_VELOCITY = 0.35;  // px/ms — un geste vif valide sans aller au bout
const VELOCITY_WINDOW = 100;   // ms sur lesquelles la vitesse est moyennée
const SETTLE_MS       = 260;
const EDGE_RESIST     = 0.35;  // élasticité aux deux bouts de la liste
const EASE            = "cubic-bezier(0.22, 0.61, 0.36, 1)";

// Zones qui gèrent leur propre balayage horizontal (la grille du calendrier) ou
// dont le geste ne doit rien déclencher (curseurs).
const BLOCKED = '[data-swipe="calendar-grid"], [data-no-swipe], input[type="range"]';

export function SwipePager({
  index, count, keyOf, renderPage, onIndexChange,
  enabled = true, paneStyle, style,
}) {
  const boxRef   = useRef(null);
  const panes    = useRef(new Map());  // clé d'onglet → élément DOM
  const drag     = useRef(null);
  const pending  = useRef(null);       // { dx, dir } passé au travers du changement d'index
  const rafId    = useRef(0);
  const idleId   = useRef(0);
  const [wide, setWide] = useState(false); // voisins montés ?

  const shown = wide
    ? [index - 1, index, index + 1].filter(i => i >= 0 && i < count)
    : [index];

  // ── Placement ──────────────────────────────────────────────────────────────
  const width = () => boxRef.current?.clientWidth || 1;

  const place = (dx, animate) => {
    const w = width();
    panes.current.forEach(el => {
      const slot = Number(el.dataset.slot || 0);
      el.style.transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : "none";
      el.style.transform = (dx === 0 && slot === 0 && !animate)
        ? "none"                                     // cf. note 1 en tête de fichier
        : `translate3d(${slot * w + dx}px, 0, 0)`;
    });
  };

  // Réassigne les créneaux après chaque rendu : c'est ce qui fait qu'un voisin
  // devenu courant glisse à sa place au lieu d'être remonté.
  const syncSlots = () => {
    shown.forEach(i => {
      const el = panes.current.get(keyOf(i));
      if (!el) return;
      const slot = i - index;
      el.dataset.slot = String(slot);
      el.style.pointerEvents = slot === 0 ? "" : "none";
      if (slot === 0) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
    });
  };

  const reduceMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Démonte les voisins une fois l'animation finie et remet le calque courant
  // en `transform: none`.
  const goIdle = (delay) => {
    clearTimeout(idleId.current);
    idleId.current = setTimeout(() => {
      place(0, false);
      setWide(false);
    }, delay + 40);
  };

  useLayoutEffect(() => {
    syncSlots();
    const p = pending.current;
    if (p) {
      pending.current = null;
      // Le calque validé est déjà à l'écran : on repose la piste là où le doigt
      // l'avait laissée, puis on anime jusqu'à zéro. Pas de saut visible.
      place(p.dx + p.dir * width(), false);
      if (reduceMotion()) { place(0, false); goIdle(0); return; }
      rafId.current = requestAnimationFrame(() => place(0, true));
      goIdle(SETTLE_MS);
    } else if (!drag.current) {
      place(0, false);
    }
  });

  useEffect(() => () => {
    cancelAnimationFrame(rafId.current);
    clearTimeout(idleId.current);
  }, []);

  // ── Geste ──────────────────────────────────────────────────────────────────
  const resist = (dx) => {
    const atStart = index === 0 && dx > 0;
    const atEnd   = index === count - 1 && dx < 0;
    return (atStart || atEnd) ? dx * EDGE_RESIST : dx;
  };

  const onTouchStart = (e) => {
    drag.current = null;
    if (!enabled || e.touches.length > 1 || hasOpenLayers()) return;
    if (e.target?.closest?.(BLOCKED)) return;
    const t = e.touches[0];
    const now = performance.now();
    drag.current = { x0: t.clientX, y0: t.clientY, axis: null, dx: 0, v: 0, hist: [{ x: t.clientX, t: now }] };
  };

  const onTouchMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x0;
    const dy = t.clientY - d.y0;

    if (d.axis === null) {
      // Monter les voisins une image avant de verrouiller l'axe : le calque
      // d'à côté est prêt quand le doigt a parcouru assez pour qu'on le voie,
      // et un simple tap ne monte jamais rien.
      if (!wide && Math.abs(dx) >= WAKE && Math.abs(dx) > Math.abs(dy)) setWide(true);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) return;
      if (Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO) {
        // Geste vertical : il appartient au défilement de la page.
        drag.current = null;
        if (wide) goIdle(0);
        return;
      }
      d.axis = "x";
    }

    // Vitesse moyennée sur les 100 dernières millisecondes plutôt que sur le
    // dernier événement : un seul échantillon est trop bruité, et c'est elle
    // qui décide si un geste court mais vif fait tourner la page.
    const now = performance.now();
    d.hist.push({ x: t.clientX, t: now });
    while (d.hist.length > 2 && now - d.hist[0].t > VELOCITY_WINDOW) d.hist.shift();
    const ref = d.hist[0];
    d.v = (t.clientX - ref.x) / Math.max(1, now - ref.t);
    d.dx = resist(dx);
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => place(d.dx, false));
  };

  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") { if (wide) goIdle(0); return; }

    cancelAnimationFrame(rafId.current);
    const dir    = d.dx < 0 ? 1 : -1;
    const target = index + dir;
    const far    = Math.abs(d.dx) > width() * COMMIT_RATIO;
    const fast   = Math.abs(d.v) > COMMIT_VELOCITY && Math.abs(d.dx) > 20;

    if (target >= 0 && target < count && (far || fast)) {
      // On valide d'abord, on anime ensuite (cf. l'effet de mise en page) :
      // l'indicateur de la barre du bas s'allume quand la page part.
      pending.current = { dx: d.dx, dir };
      onIndexChange(target);
    } else {
      place(0, !reduceMotion());
      goIdle(reduceMotion() ? 0 : SETTLE_MS);
    }
  };

  return (
    <div
      ref={boxRef}
      data-swipe="page"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: "relative", flex: 1, minHeight: 0, overflow: "hidden",
        overscrollBehaviorX: "contain",
        ...style,
      }}
    >
      {shown.map(i => {
        const key = keyOf(i);
        return (
          <div
            key={key}
            data-pane={key}
            ref={el => { if (el) panes.current.set(key, el); else panes.current.delete(key); }}
            style={{
              position: "absolute", inset: 0,
              overflowY: "auto", overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              touchAction: "pan-y",
              willChange: "transform",
              ...paneStyle,
            }}
          >
            {renderPage(i)}
          </div>
        );
      })}
    </div>
  );
}

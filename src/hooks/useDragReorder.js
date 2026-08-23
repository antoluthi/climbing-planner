import { useCallback, useEffect, useRef, useState } from "react";

// ─── RÉARRANGEMENT À LA POIGNÉE ──────────────────────────────────────────────
// Glisser une carte pour la remonter ou la descendre, au doigt comme à la
// souris. Le geste part **uniquement de la poignée** (`handleProps`) : ailleurs
// la page défile et le carrousel d'onglets garde la main.
//
// Deux choix à connaître avant de toucher à ce fichier :
//
//  1. **Le transform de la carte tirée est écrit dans le DOM**, pas rendu par
//     React : une image sur deux pendant un glissement, c'est trop de rendus
//     pour une vue pleine de champs. React ne l'efface pas tant que `transform`
//     n'apparaît dans aucun style qu'il pose sur cette carte.
//  2. Seul le **changement de cible** passe par un état — c'est ce qui déplace
//     le trait d'insertion, quelques fois par geste.
//
// Le DOM attendu : un conteneur dont les enfants directs portent
// `data-drag-card`, dans le même ordre que la liste.

const EDGE = 72;    // px : bande haute et basse où la liste défile d'elle-même
const STEP = 14;    // px par image, au maximum

// Défilement automatique aux bords de l'écran : sans lui, on ne peut pas
// déplacer une carte plus loin que ce qui est visible. La boucle s'appelle
// elle-même — d'où sa place ici, hors du composant.
function autoScroll(s, apply) {
  if (!s.card.isConnected) return;
  const high = EDGE, low = window.innerHeight - EDGE;
  let d = 0;
  if (s.lastY < high) d = -Math.min(1, (high - s.lastY) / EDGE) * STEP;
  else if (s.lastY > low) d = Math.min(1, (s.lastY - low) / EDGE) * STEP;
  if (d) {
    const before = s.scroller.scrollTop;
    s.scroller.scrollTop = before + d;
    if (s.scroller.scrollTop !== before) apply();
  }
  s.raf = requestAnimationFrame(() => autoScroll(s, apply));
}

function scrollParent(el) {
  let n = el?.parentElement;
  while (n) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function useDragReorder(onReorder) {
  const [drag, setDrag] = useState(null);   // { index, to }
  const st = useRef(null);

  const stop = useCallback(() => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    if (s.card) s.card.style.transform = "";
    st.current = null;
  }, []);

  useEffect(() => stop, [stop]);            // un démontage en plein geste ne laisse rien

  // Replace la carte sous le doigt et décide où elle atterrirait.
  const apply = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const ds = s.scroller.scrollTop - s.scrollTop0;
    const dy = s.lastY - s.startY;
    s.card.style.transform = `translate3d(0, ${dy + ds}px, 0)`;

    const self = s.rects[s.index];
    const mid = self.top + dy + self.height / 2;
    let to = s.index;
    for (let i = s.index + 1; i < s.rects.length; i++) {
      const r = s.rects[i];
      if (mid > r.top - ds + r.height / 2) to = i; else break;
    }
    if (to === s.index) {
      for (let i = s.index - 1; i >= 0; i--) {
        const r = s.rects[i];
        if (mid < r.top - ds + r.height / 2) to = i; else break;
      }
    }
    if (to !== s.to) {
      s.to = to;
      setDrag(d => (d && d.to !== to ? { ...d, to } : d));
    }
  }, []);

  const onDown = useCallback((index) => (e) => {
    if (e.button != null && e.button !== 0) return;
    const card = e.currentTarget.closest("[data-drag-card]");
    const list = card?.parentElement;
    if (!card || !list) return;
    const cards = [...list.children].filter(n => n.hasAttribute?.("data-drag-card"));
    const scroller = scrollParent(list);
    st.current = {
      index, to: index, card, scroller,
      rects: cards.map(n => n.getBoundingClientRect()),
      startY: e.clientY, lastY: e.clientY,
      scrollTop0: scroller.scrollTop, raf: 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    setDrag({ index, to: index });
    const s = st.current;
    s.raf = requestAnimationFrame(() => autoScroll(s, apply));
  }, [apply]);

  const onMove = useCallback((e) => {
    if (!st.current) return;
    st.current.lastY = e.clientY;
    apply();
  }, [apply]);

  const onUp = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const { index, to } = s;
    stop();
    setDrag(null);
    if (to !== index) onReorder?.(index, to);
  }, [onReorder, stop]);

  const handleProps = useCallback((index) => ({
    onPointerDown: onDown(index),
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onUp,
    style: { touchAction: "none", cursor: "grab" },
  }), [onDown, onMove, onUp]);

  return {
    dragIndex: drag ? drag.index : -1,
    dropIndex: drag ? drag.to : -1,
    handleProps,
  };
}

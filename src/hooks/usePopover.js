import { useRef, useState } from "react";

// ─── L'ÉTAT D'UNE BULLE ANCRÉE ───────────────────────────────────────────────
// Le pendant de `components/ui/Popover.jsx`, qui explique les deux pièges que
// le portail résout. Ici, seulement l'état.
//
// Tout ce dont un appelant a besoin : la référence à poser sur le bouton,
// l'état, et les gestes. Le rectangle du bouton est **capturé dans le
// gestionnaire de clic** — le seul endroit où lire une `ref` est légitime
// (pendant le rendu, React l'interdit ; depuis un effet, il faut un second
// rendu à chaque ouverture).
export function usePopover() {
  const anchorRef = useRef(null);
  const [state, setState] = useState({ open: false, rect: null });
  const snap = () => anchorRef.current?.getBoundingClientRect() ?? null;
  return {
    anchorRef,
    open: state.open,
    rect: state.rect,
    show: () => setState({ open: true, rect: snap() }),
    toggle: () => setState(s => (s.open ? { open: false, rect: null } : { open: true, rect: snap() })),
    close: () => setState({ open: false, rect: null }),
  };
}

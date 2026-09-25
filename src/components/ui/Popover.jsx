import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";

// ─── UN PANNEAU QUI SORT DE SA CARTE ─────────────────────────────────────────
// Un petit panneau ancré à un bouton — l'aide de syntaxe, le réglage de
// couleur. Deux pièges l'attendent, et les deux se ressemblent assez pour
// qu'on croie les avoir évités alors qu'il n'en reste qu'un.
//
// 1. ⚠️ **`z-index` ne franchit pas un contexte d'empilement.** Une carte de
//    mésocycle porte `position: relative; z-index: 0` — ça suffit à en créer
//    un. Un panneau rendu dedans, même en `z-index: 300`, ne se compare
//    qu'aux frères **de cette carte** : la carte suivante, peinte après, lui
//    passe dessus. À l'écran, le panneau semble **coupé net** à la limite de
//    sa carte, et on cherche un `overflow` qui n'existe pas.
//
// 2. **`position: fixed` ne protège pas de tout.** Il échappe bien au
//    défilement et aux `overflow`, mais un ancêtre porteur d'un `transform`
//    (le carrousel d'onglets en pose un pendant le geste) en redevient le
//    bloc conteneur, et on repart pour un panneau mal placé.
//
// La seule réponse qui tienne dans les deux cas : **rendre ailleurs**. Un
// portail vers `document.body` sort de l'arbre, donc d'un coup de tous les
// contextes d'empilement, de tous les `overflow` et de tous les `transform`
// des ancêtres. C'est ce que fait ce composant, et c'est pour ça qu'il est
// partagé : la prochaine bulle de l'app ne doit pas réapprendre ça.
//
// ⚠️ **Le portail change aussi qui est « dehors ».** Le panneau n'est plus un
// descendant du bouton : un clic dedans compte comme un clic à l'extérieur et
// referme tout. C'est ce qui rendait le réglage de couleur inutilisable — on
// attrapait un curseur, la bulle se fermait. La fermeture au clic extérieur
// teste donc **le bouton ET le panneau**.

// Où poser le panneau, à partir du bouton. Pure : c'est ce qui permet de
// l'appeler à l'initialisation de l'état plutôt que depuis un effet — mesurer
// dans un effet demande un second rendu à chaque ouverture (et
// `react-hooks/set-state-in-effect` le refuse, à raison).
//
// On ne mesure jamais la hauteur du panneau : on lui donne la place
// disponible du côté le plus généreux et il défile s'il n'y tient pas. Un
// panneau qu'on mesure se fait quand même couper sur une fenêtre courte.
function computePos(r, { width, minHeight, align }) {
  if (!r) return null;
  const M = 12;                                   // marge au bord de l'écran
  const w = Math.min(width, window.innerWidth - M * 2);
  const rawLeft = align === "center" ? r.left + r.width / 2 - w / 2 : r.left - 8;
  const left = Math.min(Math.max(M, rawLeft), window.innerWidth - w - M);

  const below = window.innerHeight - r.bottom - M;
  const above = r.top - M;
  const goesDown = below >= minHeight || below >= above;
  return {
    left, width: w,
    top: goesDown ? r.bottom + 8 : undefined,
    bottom: goesDown ? undefined : window.innerHeight - r.top + 8,
    maxHeight: Math.max(minHeight, (goesDown ? below : above) - 8),
  };
}

// ⚠️ **Ne se monte qu'à l'ouverture** : le parent écrit `{pop.open && <Popover…>}`.
// C'est ce qui rend la position calculable dès l'initialisation de l'état.
export function Popover({
  anchorRef,
  rect,
  onClose,
  width = 260,
  minHeight = 160,
  align = "start",       // « start » : bord gauche du bouton · « center »
  role = "dialog",
  label,
  children,
  onMouseEnter,
  onMouseLeave,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(() => computePos(rect, { width, minHeight, align }));

  const place = useCallback(() => {
    setPos(computePos(anchorRef.current?.getBoundingClientRect(), { width, minHeight, align }));
  }, [anchorRef, width, minHeight, align]);

  useEffect(() => {
    const outside = (e) => {
      if (anchorRef.current?.contains(e.target)) return;   // le bouton bascule
      if (panelRef.current?.contains(e.target)) return;    // on s'en sert !
      onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    // À la capture : un clic dans une modale qui arrête la propagation ne
    // fermerait jamais le panneau autrement.
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("touchstart", outside, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("touchstart", outside, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place, onClose, anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={label}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom,
        width: pos.width, maxHeight: pos.maxHeight, overflowY: "auto",
        zIndex: Z.popoverHi,
        background: c.modalBg, border: `1px solid ${c.borderStrong}`,
        borderRadius: RADIUS.card, padding: "12px 14px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

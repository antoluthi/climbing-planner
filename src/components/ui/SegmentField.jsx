import { Fragment, useRef, useState } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS } from "../../theme/makeStyles.js";
import { MONO } from "./Ascent.jsx";
import { splitField, joinField, normalizeField, applySegmentInput, applySegmentKey } from "../../lib/pace.js";

// ─── CHAMP À SÉPARATEURS FIXES ────────────────────────────────────────────────
// Un temps (1:45:30), une allure (5:30), une distance (8.50) : une case par
// morceau, et le séparateur **dessiné** entre elles — ni tapé, ni effaçable.
// Un clic avant le « : » va dans la case d'avant, un clic après dans celle
// d'après. Toute la décision (ce que fait une frappe, une touche) est dans
// `lib/pace.js`, pure et testée ; ici, on ne fait que la poser dans le DOM.
//
// Pourquoi des cases et pas un masque sur un seul <input> : un masque doit
// replacer le curseur à chaque frappe, par-dessus le séparateur qu'il réécrit.
// C'est exactement ce que la saisie d'Android défait — Gboard réécrit le
// champ sous lui. Des cases séparées n'ont aucun curseur à deviner.
//
// ⚠️ `value` garde ses séparateurs même vide (":", "::", ".") : c'est ce qui
// dit à quelle case appartient chaque chiffre. `onChange(next, { typed })` —
// `typed: false` pour la mise en forme à la sortie du champ (« 7 » → « 07 »),
// qui ne doit pas compter comme une saisie.

export function SegmentField({ spec, value, onChange, computed = false, ariaLabel }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const refs = useRef([]);
  const [focused, setFocused] = useState(-1);
  // Focus donné par le code (passage d'une case à l'autre) : c'est `place` qui
  // pose le curseur, `onFocus` ne doit pas tout sélectionner par-dessus.
  const steering = useRef(false);
  // Le mouseup qui suit un clic replacerait le curseur et déferait la sélection.
  const keepSelection = useRef(false);
  const segs = splitField(spec, value);

  const emit = (nextSegs) => {
    const next = joinField(spec, nextSegs);
    if (next !== value) onChange(next, { typed: true });
  };

  const place = (focus) => {
    const el = focus && refs.current[focus.i];
    if (!el) return;
    if (document.activeElement !== el) { steering.current = true; el.focus(); }
    // Après le rendu : la valeur de la case vient peut-être de changer, et
    // React replace alors le curseur à la fin.
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      const len = el.value.length;
      if (focus.where === "all") el.setSelectionRange(0, len);
      else if (focus.where === "start") el.setSelectionRange(0, 0);
      else el.setSelectionRange(len, len);
    });
  };

  const onFocus = (i, e) => {
    setFocused(i);
    if (steering.current) { steering.current = false; return; }
    // Clic ou tabulation : toute la case est sélectionnée, la frappe la
    // remplace. Taper « 2 » dans des heures qui valent « 1 » veut dire 2 h,
    // pas 12.
    e.target.select();
    keepSelection.current = true;
  };

  const onMouseUp = (e) => {
    if (keepSelection.current) { e.preventDefault(); keepSelection.current = false; }
  };

  const onBlur = (e) => {
    setFocused(-1);
    keepSelection.current = false;
    if (refs.current.includes(e.relatedTarget)) return;   // on passe à une case voisine
    // Sortie du champ : « 7 » secondes devient « 07 », « 8.5 » devient « 8.50 ».
    const norm = normalizeField(spec, value);
    if (norm !== value) onChange(norm, { typed: false });
  };

  const onInput = (i, e) => {
    const el = e.target;
    const res = applySegmentInput(spec, segs, i, el.value, el.selectionStart);
    emit(res.segs);
    place(res.focus);
  };

  const onKeyDown = (i, e) => {
    const el = e.target;
    const res = applySegmentKey(spec, segs, i, e.key, el.selectionStart, el.selectionEnd);
    if (!res) return;
    e.preventDefault();
    if (res.segs !== segs) emit(res.segs);
    place(res.focus);
  };

  // Un clic à côté des chiffres — sur un séparateur, dans la marge — va dans la
  // case la plus proche. Tout le champ est une cible, pas seulement ses
  // chiffres : au doigt, une case de deux caractères fait 20 px de large.
  const onBoxMouseDown = (e) => {
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
    let best = 0, bestD = Infinity;
    refs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      if (d < bestD) { bestD = d; best = i; }
    });
    place({ i: best, where: "all" });
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onMouseDown={onBoxMouseDown}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        background: c.control, borderRadius: RADIUS.control,
        padding: "9px 4px", cursor: "text",
        font: `700 16px ${MONO}`, color: computed ? c.accent : c.text,
        // Couleur des « 0 » d'attente, lue par la règle `.cp-seg::placeholder`.
        "--cp-seg-ph": c.textDim,
      }}
    >
      {spec.segs.map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" style={{ color: c.textMuted, userSelect: "none" }}>{spec.sep}</span>
          )}
          <input
            ref={el => { refs.current[i] = el; }}
            className="cp-seg"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label={seg.label}
            value={segs[i]}
            placeholder={seg.ph}
            onChange={e => onInput(i, e)}
            onKeyDown={e => onKeyDown(i, e)}
            onFocus={e => onFocus(i, e)}
            onBlur={onBlur}
            onMouseUp={onMouseUp}
            style={{
              // `ch` = la largeur d'un chiffre dans une police à chasse fixe :
              // la case suit exactement son contenu.
              width: `${Math.max(segs[i].length, seg.ph.length, 1) + 0.5}ch`,
              padding: "2px 0", border: "none", outline: "none", borderRadius: 6,
              background: focused === i ? c.accentBg : "transparent",
              color: "inherit", font: "inherit", textAlign: "center",
              caretColor: c.accent,
            }}
          />
        </Fragment>
      ))}
    </div>
  );
}
